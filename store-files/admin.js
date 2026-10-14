/* =========================================================
   Shivam's World — Orders admin
   - Google sign-in (only ADMIN_EMAIL gets in; Firestore rules
     enforce this on the server too)
   - Live list of orders, filter + search
   - Update delivery status, add a note (e.g. courier tracking)
   - One-tap WhatsApp message to the customer
   Customer-supplied text is always inserted with textContent,
   never as HTML.
   ========================================================= */
import {
  auth, db,
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  collection, query, orderBy, onSnapshot, doc, writeBatch, serverTimestamp
} from "./firebase-init.js";

const ADMIN_EMAIL = "babitavrm60@gmail.com";
const THEME_KEY = "sw-theme";

const STATUSES = [
  { key: "pending",   label: "Pending verification" },
  { key: "confirmed", label: "Payment confirmed" },
  { key: "packed",    label: "Packed" },
  { key: "shipped",   label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" }
];

/* ---------- Small helpers ---------- */
const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function money(n) { return "\u20B9" + Number(n || 0).toLocaleString("en-IN"); }

function statusKey(o) {
  return STATUSES.some((s) => s.key === o.status) ? o.status : "pending";
}
function statusLabel(key) {
  return STATUSES.find((s) => s.key === key).label;
}

function formatDate(ts) {
  if (!ts || !ts.toDate) return "";
  return ts.toDate().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2000);
}

function showError(id, msg) {
  const node = $(id);
  node.textContent = msg || "";
  node.hidden = !msg;
}

/* ---------- Theme (same key as the rest of the site) ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#2a0066" : "#6f00ff");
  const btn = $("storeThemeToggle");
  const dark = theme === "dark";
  btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  btn.setAttribute("title", dark ? "Switch to light mode" : "Switch to dark mode");
  btn.querySelector("i").className = dark ? "fa fa-sun-o" : "fa fa-moon-o";
}
(function initTheme() {
  let saved = "light";
  try { saved = localStorage.getItem(THEME_KEY) || "light"; } catch (e) { /* ignore */ }
  applyTheme(saved);
  $("storeThemeToggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
  });
})();

/* ---------- State ---------- */
let orders = [];
let activeFilter = "all";
let unsubscribe = null;
const openIds = new Set(); // which cards are expanded
const drafts = {};         // unsaved edits per order, kept across live updates

/* ---------- WhatsApp message to the customer ---------- */
function customerMessage(o, key, note) {
  const first = (o.name || "there").split(" ")[0];
  const id = o.orderId || o.id;
  const lines = {
    pending:   `Hi ${first}, we received your order ${id} and are checking the payment. We'll confirm shortly.`,
    confirmed: `Hi ${first}, your payment for order ${id} is confirmed. We'll start preparing it now.`,
    packed:    `Hi ${first}, your order ${id} is packed and will be shipped soon.`,
    shipped:   `Hi ${first}, your order ${id} has been shipped.`,
    delivered: `Hi ${first}, your order ${id} is marked as delivered. Thank you for ordering from Shivam's World!`,
    cancelled: `Hi ${first}, your order ${id} has been cancelled. Please message us if you have any questions.`
  };
  let text = lines[key];
  if (note) text += `\n${note}`;
  if (key !== "cancelled") {
    text += `\nTrack your order: ${location.origin}/store.html?track=${id}`;
  }
  return text;
}

function waLink(o, text) {
  return `https://wa.me/91${o.phone}?text=${encodeURIComponent(text)}`;
}

/* ---------- Actions ---------- */
async function saveOrder(o, btn) {
  const d = drafts[o.id] || {};
  btn.disabled = true;
  try {
    const status = d.status !== undefined ? d.status : statusKey(o);
    const adminNote = d.note !== undefined ? d.note : (o.adminNote || "");
    // Private order + public tracking record are always updated together
    const batch = writeBatch(db);
    batch.update(doc(db, "orders", o.id), { status, adminNote, updatedAt: serverTimestamp() });
    batch.set(doc(db, "tracking", o.id), { orderId: o.id, status, note: adminNote, updatedAt: serverTimestamp() });
    await batch.commit();
    delete drafts[o.id];
    toast("Saved");
  } catch (err) {
    console.error(err);
    toast("Could not save. Check your connection and try again.");
  } finally {
    btn.disabled = false;
  }
}

async function removeOrder(o) {
  if (!confirm(`Delete order ${o.id} permanently? This cannot be undone.`)) return;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, "orders", o.id));
    batch.delete(doc(db, "tracking", o.id));
    if (o.couponKey) batch.delete(doc(db, "couponUses", o.couponKey)); // lets that customer use the coupon again
    await batch.commit();
    openIds.delete(o.id);
    delete drafts[o.id];
    toast("Order deleted");
  } catch (err) {
    console.error(err);
    toast("Could not delete the order.");
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
  } catch (e) {
    toast("Copy not available in this browser");
  }
}

/* ---------- Rendering ---------- */
function renderFilters() {
  const counts = { all: orders.length };
  STATUSES.forEach((s) => { counts[s.key] = 0; });
  orders.forEach((o) => { counts[statusKey(o)] += 1; });

  const box = $("filters");
  box.replaceChildren();
  [{ key: "all", label: "All" }, ...STATUSES].forEach((s) => {
    const b = el("button", "filter-btn", `${s.label} (${counts[s.key]})`);
    b.type = "button";
    b.setAttribute("aria-pressed", String(activeFilter === s.key));
    b.addEventListener("click", () => { activeFilter = s.key; render(); });
    box.appendChild(b);
  });
}

function orderCard(o) {
  const key = statusKey(o);
  const draft = drafts[o.id] || {};

  const card = el("details", "order-card");
  card.open = openIds.has(o.id);
  card.addEventListener("toggle", () => {
    if (card.open) openIds.add(o.id); else openIds.delete(o.id);
  });

  /* Summary row */
  const sum = el("summary");
  const left = el("div");
  const idLine = el("div", "o-id", o.id);
  idLine.appendChild(el("span", `pill pill-${key}`, statusLabel(key)));
  left.appendChild(idLine);
  left.appendChild(el("div", "o-meta", `${o.name || "Unknown"} \u00B7 ${(o.items || []).length} item(s)`));
  const right = el("div");
  right.appendChild(el("div", "o-total", money(o.total)));
  right.appendChild(el("div", "o-date", formatDate(o.createdAt)));
  sum.append(left, right);
  card.appendChild(sum);

  /* Details */
  const body = el("div", "order-body");

  const itemsBox = el("div");
  itemsBox.appendChild(el("h3", "", "Items"));
  const ul = el("ul");
  (o.items || []).forEach((it) => {
    ul.appendChild(el("li", "", `${it.name} \u00D7 ${it.qty} = ${money(it.price * it.qty)}`));
  });
  itemsBox.appendChild(ul);
  body.appendChild(itemsBox);

  const custBox = el("div");
  custBox.appendChild(el("h3", "", "Customer"));
  custBox.appendChild(el("p", "o-text", `${o.name || ""}\n${o.phone || ""}\n${o.address || ""}`));
  if (o.note) {
    custBox.appendChild(el("h3", "", "Customer note"));
    custBox.appendChild(el("p", "o-text", o.note));
  }
  body.appendChild(custBox);

  const payBox = el("div");
  payBox.appendChild(el("h3", "", "Payment"));
  const coupon = o.discount > 0 ? ` \u2212 coupon ${o.couponCode || ""} ${money(o.discount)}` : "";
  const breakdown = o.deliveryCharge !== undefined ? ` (items ${money(o.subtotal)}${coupon} + delivery ${money(o.deliveryCharge)})` : "";
  payBox.appendChild(el("p", "o-text", `Amount to match: ${money(o.total)}${breakdown}\nUTR given by customer: ${o.utr || ""}`));
  body.appendChild(payBox);

  /* Quick contact buttons */
  const actions = el("div", "o-actions");
  const call = el("a", "mini-btn", "Call");
  call.href = `tel:+91${o.phone}`;
  const chat = el("a", "mini-btn", "WhatsApp customer");
  chat.href = `https://wa.me/91${o.phone}`;
  chat.target = "_blank";
  chat.rel = "noopener";
  const copyUtr = el("button", "mini-btn", "Copy UTR");
  copyUtr.type = "button";
  copyUtr.addEventListener("click", () => copyText(o.utr || ""));
  actions.append(call, chat, copyUtr);
  if (o.location && typeof o.location.lat === "number" && typeof o.location.lng === "number") {
    const where = el("a", "mini-btn", "Open pinned location in Maps");
    where.href = `https://www.google.com/maps?q=${o.location.lat},${o.location.lng}`;
    where.target = "_blank";
    where.rel = "noopener";
    actions.appendChild(where);
  }
  body.appendChild(actions);

  /* Status + note controls */
  const controls = el("div", "o-controls");
  const selId = `status-${o.id}`;
  const noteId = `note-${o.id}`;

  const selLabel = el("label", "", "Delivery status");
  selLabel.htmlFor = selId;
  const select = el("select");
  select.id = selId;
  STATUSES.forEach((s) => {
    const opt = el("option", "", s.label);
    opt.value = s.key;
    select.appendChild(opt);
  });
  select.value = draft.status !== undefined ? draft.status : key;
  select.addEventListener("change", () => {
    drafts[o.id] = Object.assign(drafts[o.id] || {}, { status: select.value });
  });

  const noteLabel = el("label", "", "Note shown to the customer on their tracking page (e.g. courier name and tracking number)");
  noteLabel.htmlFor = noteId;
  const note = el("input");
  note.id = noteId;
  note.type = "text";
  note.maxLength = 300;
  note.value = draft.note !== undefined ? draft.note : (o.adminNote || "");
  note.addEventListener("input", () => {
    drafts[o.id] = Object.assign(drafts[o.id] || {}, { note: note.value });
  });

  controls.append(selLabel, select, noteLabel, note);

  const saveRow = el("div", "o-save-row");
  const save = el("button", "btn-inline", "Save changes");
  save.type = "button";
  save.addEventListener("click", () => saveOrder(o, save));
  const notify = el("button", "mini-btn", "Message status on WhatsApp");
  notify.type = "button";
  notify.addEventListener("click", () => {
    window.open(waLink(o, customerMessage(o, select.value, note.value.trim())), "_blank", "noopener");
  });
  const del = el("button", "danger-btn", "Delete order");
  del.type = "button";
  del.addEventListener("click", () => removeOrder(o));
  saveRow.append(save, notify, del);
  controls.appendChild(saveRow);

  body.appendChild(controls);
  card.appendChild(body);
  return card;
}

function render() {
  renderFilters();

  const term = $("searchInput").value.trim().toLowerCase();
  const shown = orders.filter((o) => {
    if (activeFilter !== "all" && statusKey(o) !== activeFilter) return false;
    if (!term) return true;
    return [o.id, o.name, o.phone, o.utr].join(" ").toLowerCase().includes(term);
  });

  const list = $("ordersList");
  list.replaceChildren(...shown.map(orderCard));

  const empty = $("emptyMsg");
  if (!shown.length) {
    empty.textContent = orders.length
      ? "No orders match this filter."
      : "No orders yet. New orders appear here as soon as customers place them.";
    empty.hidden = false;
  } else {
    empty.hidden = true;
  }
}

/* ---------- Live orders ---------- */
function startListening() {
  if (unsubscribe) return;
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  unsubscribe = onSnapshot(
    q,
    (snap) => {
      showError("loadError", "");
      orders = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      render();
    },
    (err) => {
      console.error(err);
      showError("loadError", "Could not load orders (" + err.code + "). Check that the Firestore rules are published.");
    }
  );
}

function stopListening() {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  orders = [];
}

/* ---------- Auth ---------- */
function showAuth(message, canSignIn) {
  $("authView").hidden = false;
  $("appView").hidden = true;
  $("authMsg").textContent = message;
  $("signInBtn").hidden = !canSignIn;
}

onAuthStateChanged(auth, (user) => {
  showError("authError", "");
  if (!user) {
    stopListening();
    $("signOutBtn").hidden = true;
    showAuth("Sign in with the admin Google account to see and manage store orders.", true);
    return;
  }
  $("signOutBtn").hidden = false;
  if (user.email !== ADMIN_EMAIL) {
    stopListening();
    showAuth(`You're signed in as ${user.email}, which doesn't have access. Sign out and use the admin account.`, false);
    return;
  }
  $("authView").hidden = true;
  $("appView").hidden = false;
  startListening();
});

$("signInBtn").addEventListener("click", async () => {
  showError("authError", "");
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    console.error(err);
    if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") return;
    showError(
      "authError",
      err.code === "auth/popup-blocked"
        ? "The sign-in pop-up was blocked. Allow pop-ups for this site and try again."
        : "Sign-in failed (" + err.code + "). Check that this domain is listed under Authorized domains in Firebase."
    );
  }
});

$("signOutBtn").addEventListener("click", () => signOut(auth));
$("searchInput").addEventListener("input", render);
