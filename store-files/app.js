/* =========================================================
   Shivam's World: all the page code in one file
   Used by store.html (the shop) and admin.html (orders admin).

   1. Data layer    Firebase sign-in/orders (loaded only when needed) + PDF invoice
   2. UI kit        styled dropdowns, confirm dialog, pop-up animations, theme fade
   3. Store page    products, cart, checkout, accounts, tracking (runs on store.html)
   4. Admin page    order list, filters, status updates (runs on admin.html)

   Settings you may want to edit: CONFIG at the top of section 3
   (UPI ID, delivery charge, coupon, banner messages) and SELLER in section 1
   (details printed on invoices).
   ========================================================= */

/* ---------- 1. Data layer: Firebase (loaded only when needed) + PDF invoice ---------- */
(function () {
  "use strict";

  const FIREBASE_VERSION = "10.12.2";
  const FIREBASE_BASE = "https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/";
  // Public by design: Firestore security rules protect the data, not this config.
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCdGZKXmbe1yGOBvxg6xIm-U3CY0Swqtyg",
    authDomain: "shivam-s-world-store.firebaseapp.com",
    projectId: "shivam-s-world-store",
    storageBucket: "shivam-s-world-store.firebasestorage.app",
    messagingSenderId: "381937022136",
    appId: "1:381937022136:web:804d8e2171978fc3dbb04d"
  };

  let S = null;          // Firebase handles once loaded
  let sdkPromise = null;

  // Loads the Firebase code on first use. If it is blocked (e.g. by an ad blocker) only the
  // account features fail; the store itself keeps working.
  function sdk() {
    if (!sdkPromise) {
      sdkPromise = Promise.all([
        import(FIREBASE_BASE + "firebase-app.js"),
        import(FIREBASE_BASE + "firebase-firestore.js"),
        import(FIREBASE_BASE + "firebase-auth.js")
      ]).then(function (m) {
        const app = m[0].initializeApp(FIREBASE_CONFIG);
        const fs = m[1], au = m[2];
        S = {
          app: app, db: fs.getFirestore(app), auth: au.getAuth(app),
          doc: fs.doc, setDoc: fs.setDoc, getDoc: fs.getDoc, updateDoc: fs.updateDoc, deleteDoc: fs.deleteDoc,
          writeBatch: fs.writeBatch, collection: fs.collection, query: fs.query, where: fs.where,
          orderBy: fs.orderBy, onSnapshot: fs.onSnapshot, serverTimestamp: fs.serverTimestamp,
          GoogleAuthProvider: au.GoogleAuthProvider, signInWithPopup: au.signInWithPopup,
          signOut: au.signOut, onAuthStateChanged: au.onAuthStateChanged
        };
        return S;
      }).catch(function (err) { sdkPromise = null; throw err; });
    }
    return sdkPromise;
  }

  // ----- accounts -----
  function watchAuth(callback) { return S.onAuthStateChanged(S.auth, callback); }
  function signInGoogle() { return S.signInWithPopup(S.auth, new S.GoogleAuthProvider()); }
  function signOutUser() { return S.signOut(S.auth); }

  // Saved name, phone, address and (optional) delivery pin
  async function loadProfile(uid) {
    const snap = await S.getDoc(S.doc(S.db, "users", uid));
    return snap.exists() ? snap.data() : null;
  }

  // Replaces the whole profile, so leaving out `location` removes the saved pin
  function saveProfile(uid, p) {
    const data = { name: p.name || "", phone: p.phone || "", address: p.address || "", updatedAt: S.serverTimestamp() };
    if (p.location) data.location = { lat: p.location.lat, lng: p.location.lng };
    return S.setDoc(S.doc(S.db, "users", uid), data);
  }

  // Live list of this customer's own orders (no index needed: sorted in the browser)
  function watchMyOrders(uid, onData, onError) {
    const q = S.query(S.collection(S.db, "orders"), S.where("uid", "==", uid));
    return S.onSnapshot(q, function (snap) {
      onData(snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }));
    }, onError);
  }

  // Live view of one order (allowed only if it belongs to the signed-in customer)
  function watchOrder(id, onData, onError) {
    return S.onSnapshot(S.doc(S.db, "orders", id), function (snap) {
      onData(snap.exists() ? Object.assign({ id: snap.id }, snap.data()) : null);
    }, onError);
  }

  // ----- orders -----
  // Saves the order (linked to the signed-in customer) and, if a coupon was used, marks it used.
  function saveOrder(o) {
    const batch = S.writeBatch(S.db);
    const order = {
      orderId: o.id, name: o.name, phone: o.phone, address: o.address, note: o.note || "",
      items: o.items.map(function (it) { return { name: it.name, qty: it.qty, price: it.price }; }),
      subtotal: o.subtotal, deliveryCharge: o.deliveryCharge, discount: o.discount || 0,
      total: o.total, utr: o.utr, status: "pending", createdAt: S.serverTimestamp()
    };
    order.uid = o.uid; // links the order to the signed-in customer
    if (o.couponCode) order.couponCode = o.couponCode;
    if (o.couponKey) order.couponKey = o.couponKey;
    if (o.location) order.location = { lat: o.location.lat, lng: o.location.lng };
    batch.set(S.doc(S.db, "orders", o.id), order);
    if (o.couponKey) {
      // Marks the coupon as used for this customer. It fails if it was already used.
      batch.set(S.doc(S.db, "couponUses", o.couponKey), { code: o.couponCode, orderId: o.id, usedAt: S.serverTimestamp() });
    }
    return batch.commit();
  }

  // True if this coupon was already used by the customer with this fingerprint.
  async function isCouponUsed(key) {
    const snap = await S.getDoc(S.doc(S.db, "couponUses", key));
    return snap.exists();
  }

  // ----- PDF invoice (the PDF libraries load from cdnjs only when an invoice is requested) -----
  // The invoice is drawn as a page and saved in the PDF as a high-resolution picture, so the
  // rupee sign and Hindi names or addresses print correctly (the text is not selectable).
// Edit these to change the seller details printed on every invoice
const SELLER = {
  brand: "Shivam's World",
  tagline: "Handmade creations with love",
  owner: "Shivam Soni",
  phone: "+91 90053 25544",
  site: "shivams-world.vercel.app"
};

const JSPDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const HTML2CANVAS_URL = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";

const STATUS_TEXT = {
  pending: "Payment being verified",
  confirmed: "Payment confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

const loaded = {};
function loadScript(src) {
  if (!loaded[src]) {
    loaded[src] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => { delete loaded[src]; reject(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
  }
  return loaded[src];
}

const money = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN");

// Older orders may lack the breakdown fields, so work them out
function normalize(o) {
  const items = (o.items || []).map((it) => ({ name: it.name, qty: it.qty, price: it.price }));
  const subtotal = o.subtotal !== undefined ? o.subtotal : items.reduce((s, it) => s + it.price * it.qty, 0);
  const discount = o.discount || 0;
  const delivery = o.deliveryCharge !== undefined ? o.deliveryCharge : Math.max(0, (o.total || 0) - subtotal + discount);
  return { items, subtotal, discount, delivery, total: o.total !== undefined ? o.total : subtotal - discount + delivery };
}

// Small helper: element with inline styles (the page's own stylesheets are not used)
function h(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.style.cssText = style;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildInvoice(o) {
  const n = normalize(o);
  const date = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate() : new Date();
  const dateText = date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const id = o.orderId || o.id;

  const page = h("div",
    "position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#1b1230;" +
    "font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.45;");

  // ---- header band ----
  const band = h("div", "display:flex;justify-content:space-between;align-items:center;padding:30px 40px;" +
    "color:#fff;background:linear-gradient(90deg,#6f00ff,#b10fc7 55%,#ff4f9a);");
  const brand = h("div");
  brand.appendChild(h("div", "font-family:'DM Serif Display',Georgia,serif;font-size:32px;line-height:1.1;", SELLER.brand));
  brand.appendChild(h("div", "margin-top:4px;font-size:13px;opacity:.9;", SELLER.tagline));
  const title = h("div", "text-align:right;");
  title.appendChild(h("div", "font-size:26px;font-weight:700;letter-spacing:.18em;", "INVOICE"));
  title.appendChild(h("div", "margin-top:4px;font-size:13px;opacity:.95;", "No. " + id));
  band.appendChild(brand);
  band.appendChild(title);
  page.appendChild(band);

  const body = h("div", "padding:30px 40px 34px;");
  page.appendChild(body);

  // ---- billed to / details ----
  const info = h("div", "display:flex;justify-content:space-between;gap:30px;");
  const left = h("div", "flex:1;min-width:0;");
  left.appendChild(h("div", "font-size:11px;font-weight:700;letter-spacing:.12em;color:#6f00ff;margin-bottom:6px;", "BILLED TO"));
  left.appendChild(h("div", "font-size:16px;font-weight:700;", o.name || ""));
  left.appendChild(h("div", "margin-top:2px;", o.phone ? "Phone: " + o.phone : ""));
  left.appendChild(h("div", "margin-top:2px;white-space:pre-wrap;overflow-wrap:anywhere;", o.address || ""));
  if (o.location && typeof o.location.lat === "number") {
    left.appendChild(h("div", "margin-top:2px;color:#555;font-size:12px;",
      "Pinned location: " + o.location.lat.toFixed(5) + ", " + o.location.lng.toFixed(5)));
  }
  const right = h("div", "width:280px;flex:none;");
  const detail = (label, value) => {
    const row = h("div", "display:flex;justify-content:space-between;gap:12px;margin-bottom:5px;");
    row.appendChild(h("span", "color:#6b5f80;white-space:nowrap;", label));
    row.appendChild(h("span", "font-weight:600;text-align:right;overflow-wrap:anywhere;", value));
    right.appendChild(row);
  };
  right.appendChild(h("div", "font-size:11px;font-weight:700;letter-spacing:.12em;color:#6f00ff;margin-bottom:6px;", "DETAILS"));
  detail("Invoice date", dateText);
  detail("Order status", STATUS_TEXT[o.status] || STATUS_TEXT.pending);
  detail("Payment", "UPI");
  if (o.utr) detail("UPI ref (UTR)", o.utr);
  info.appendChild(left);
  info.appendChild(right);
  body.appendChild(info);

  // ---- items ----
  const table = h("table", "width:100%;border-collapse:collapse;margin-top:28px;");
  const cols = [["#", "width:34px;text-align:left;"], ["Item", "text-align:left;"], ["Qty", "width:50px;text-align:center;"],
                ["Rate", "width:90px;text-align:right;"], ["Amount", "width:100px;text-align:right;"]];
  const headRow = h("tr", "background:#f3eaff;");
  cols.forEach(([label, style]) => headRow.appendChild(h("th", "padding:10px 10px;font-size:12px;color:#4b0091;" + style, label)));
  const thead = h("thead");
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = h("tbody");
  n.items.forEach((it, i) => {
    const tr = h("tr", "border-bottom:1px solid #eadfff;");
    tr.appendChild(h("td", "padding:11px 10px;vertical-align:top;color:#6b5f80;", String(i + 1)));
    tr.appendChild(h("td", "padding:11px 10px;vertical-align:top;overflow-wrap:anywhere;", it.name));
    tr.appendChild(h("td", "padding:11px 10px;vertical-align:top;text-align:center;", String(it.qty)));
    tr.appendChild(h("td", "padding:11px 10px;vertical-align:top;text-align:right;", money(it.price)));
    tr.appendChild(h("td", "padding:11px 10px;vertical-align:top;text-align:right;font-weight:600;", money(it.price * it.qty)));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);

  // ---- totals ----
  const totals = h("div", "width:290px;margin:18px 0 0 auto;");
  const line = (label, value, style) => {
    const row = h("div", "display:flex;justify-content:space-between;padding:5px 10px;" + (style || ""));
    row.appendChild(h("span", "", label));
    row.appendChild(h("span", "font-weight:600;", value));
    totals.appendChild(row);
  };
  line("Items subtotal", money(n.subtotal));
  if (n.discount > 0) line("Coupon" + (o.couponCode ? " (" + o.couponCode + ")" : ""), "\u2212" + money(n.discount), "color:#0b6b52;");
  line("Delivery charge", money(n.delivery));
  const grand = h("div", "display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:12px 14px;" +
    "border-radius:12px;color:#fff;background:linear-gradient(90deg,#6f00ff,#5500cc);font-size:17px;font-weight:700;");
  grand.appendChild(h("span", "", "Total"));
  grand.appendChild(h("span", "", money(n.total)));
  totals.appendChild(grand);
  body.appendChild(totals);

  // ---- footer ----
  const foot = h("div", "margin-top:40px;padding-top:16px;border-top:1px solid #eadfff;text-align:center;color:#6b5f80;font-size:12px;");
  foot.appendChild(h("div", "color:#4b0091;font-size:15px;font-weight:700;margin-bottom:4px;", "Thank you for shopping with " + SELLER.brand + "!"));
  foot.appendChild(h("div", "", SELLER.owner + " \u00B7 " + SELLER.phone + " \u00B7 " + SELLER.site));
  foot.appendChild(h("div", "margin-top:4px;", "This is a computer-generated invoice and needs no signature."));
  body.appendChild(foot);

  return page;
}

// Builds the invoice, turns it into a PDF and downloads it
async function downloadInvoice(order) {
  await Promise.all([loadScript(JSPDF_URL), loadScript(HTML2CANVAS_URL)]);
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* ignore */ } }

  const node = buildInvoice(order);
  document.body.appendChild(node);
  try {
    // Draw at up to 4x for sharp text (about 380 dpi on paper). Phones limit how big a canvas can be
    // (about 16 million pixels), so long invoices are drawn a little smaller to stay under that.
    const scale = Math.max(2, Math.min(4, Math.sqrt(14e6 / (794 * node.offsetHeight))));
    const canvas = await window.html2canvas(node, { scale, backgroundColor: "#ffffff", useCORS: true, logging: false });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const sliceH = Math.floor(canvas.width * pageH / pageW); // canvas pixels that fit on one page

    for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
      const h2 = Math.min(sliceH, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = h2;
      const ctx = slice.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, h2, 0, 0, canvas.width, h2);
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, pageW, h2 * pageW / canvas.width);
    }
    pdf.save("Invoice-" + (order.orderId || order.id) + ".pdf");
  } finally {
    node.remove();
  }
}


  const SWData = {
    sdk: sdk,
    // resolves with this object once Firebase has loaded; the account/order calls below need that
    module: function () { return sdk().then(function () { return SWData; }); },
    watchAuth: watchAuth, signInGoogle: signInGoogle, signOutUser: signOutUser,
    loadProfile: loadProfile, saveProfile: saveProfile, watchMyOrders: watchMyOrders, watchOrder: watchOrder,
    saveOrder: saveOrder, isCouponUsed: isCouponUsed, downloadInvoice: downloadInvoice
  };
  window.SWData = SWData;
})();

/* ---------- 2. UI kit ---------- */
(function () {
  "use strict";

  var counter = 0;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ---------- Styled dropdown ---------- */
  function customSelect(select, options) {
    if (select._cselect) return select._cselect;
    options = options || {};

    var labelText = options.label || select.getAttribute("aria-label") || "";
    if (!labelText && select.id) {
      var lab = document.querySelector('label[for="' + select.id + '"]');
      if (lab) labelText = lab.textContent.trim();
    }

    var id = "cselect" + (++counter);
    var wrapper = el("div", "cselect");
    var btn = el("button", "cselect-btn");
    btn.type = "button";
    btn.id = id + "-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    var valueEl = el("span", "cselect-value");
    var chev = el("i", "fa fa-chevron-down cselect-chev");
    chev.setAttribute("aria-hidden", "true");
    btn.appendChild(valueEl);
    btn.appendChild(chev);

    var list = el("ul", "cselect-list");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-labelledby", btn.id);

    var items = Array.prototype.map.call(select.options, function (opt, i) {
      var li = el("li", "cselect-opt");
      li.setAttribute("role", "option");
      li.tabIndex = -1;
      li.appendChild(el("span", "cselect-opt-text", opt.text));
      var tick = el("i", "fa fa-check cselect-tick");
      tick.setAttribute("aria-hidden", "true");
      li.appendChild(tick);
      if (opt.disabled) li.setAttribute("aria-disabled", "true");
      li.addEventListener("click", function () { if (!opt.disabled) choose(i); });
      list.appendChild(li);
      return li;
    });

    var isOpen = false;

    function sync() {
      var idx = select.selectedIndex;
      valueEl.textContent = idx >= 0 ? select.options[idx].text : "";
      items.forEach(function (li, i) { li.setAttribute("aria-selected", i === idx ? "true" : "false"); });
      btn.setAttribute("aria-label", (labelText ? labelText + ": " : "") + valueEl.textContent);
    }

    function enabledIndexes() {
      var out = [];
      for (var i = 0; i < select.options.length; i++) if (!select.options[i].disabled) out.push(i);
      return out;
    }

    function focusItem(i) {
      if (items[i]) items[i].focus({ preventScroll: true });
    }

    // The list floats over the page (position: fixed) so no card or window can clip it
    function position() {
      var r = btn.getBoundingClientRect();
      list.style.minWidth = r.width + "px";
      list.style.left = Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)) + "px";
      list.style.maxHeight = "";
      var below = window.innerHeight - r.bottom - 14;
      var above = r.top - 14;
      var useBelow = below >= Math.min(list.scrollHeight, 220) || below >= above;
      list.style.maxHeight = Math.max(120, Math.min(280, useBelow ? below : above)) + "px";
      list.style.top = (useBelow ? r.bottom + 6 : r.top - 6 - list.offsetHeight) + "px";
    }

    function onOutside(e) {
      if (list.contains(e.target) || btn.contains(e.target)) return;
      close(false);
    }
    function onScroll(e) {
      if (list.contains(e.target)) return;
      close(false);
    }
    function onResize() { close(false); }

    function open() {
      if (isOpen) return;
      isOpen = true;
      document.body.appendChild(list);
      list.style.display = "block";
      position();
      btn.setAttribute("aria-expanded", "true");
      wrapper.classList.add("open");
      var start = select.selectedIndex >= 0 ? select.selectedIndex : enabledIndexes()[0];
      focusItem(start);
      document.addEventListener("mousedown", onOutside, true);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onResize);
    }

    function close(returnFocus) {
      if (!isOpen) return;
      isOpen = false;
      list.style.display = "none";
      if (list.parentNode) list.parentNode.removeChild(list);
      btn.setAttribute("aria-expanded", "false");
      wrapper.classList.remove("open");
      document.removeEventListener("mousedown", onOutside, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      if (returnFocus) btn.focus();
    }

    function choose(i) {
      var changed = select.selectedIndex !== i;
      select.selectedIndex = i;
      sync();
      close(true);
      if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    btn.addEventListener("click", function () { if (isOpen) close(true); else open(); });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); }
    });

    list.addEventListener("keydown", function (e) {
      var enabled = enabledIndexes();
      var cur = items.indexOf(document.activeElement);
      var pos = enabled.indexOf(cur);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusItem(enabled[Math.min(pos + 1, enabled.length - 1)]);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusItem(enabled[Math.max(pos - 1, 0)]);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusItem(enabled[0]);
      } else if (e.key === "End") {
        e.preventDefault();
        focusItem(enabled[enabled.length - 1]);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (enabled.indexOf(cur) !== -1) choose(cur);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation(); // don't also close a window behind the list
        close(true);
      } else if (e.key === "Tab") {
        close(false);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        var ch = e.key.toLowerCase();
        for (var k = 1; k <= items.length; k++) {
          var j = (cur + k + items.length) % items.length;
          if (!select.options[j].disabled && select.options[j].text.toLowerCase().indexOf(ch) === 0) {
            focusItem(j);
            break;
          }
        }
      }
    });

    // Keep the original <select> in the page but out of sight and out of the tab order
    select.setAttribute("tabindex", "-1");
    select.setAttribute("aria-hidden", "true");
    select.addEventListener("focus", function () { btn.focus(); }); // e.g. clicking its <label>

    if (select.parentNode) select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    wrapper.appendChild(btn);
    sync();

    select._cselect = wrapper;
    return wrapper;
  }

  /* ---------- Styled confirm dialog ---------- */
  // Resolves true if the person confirms, false if they cancel / press Esc / click outside
  function confirmDialog(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var previous = document.activeElement;
      var uid = "confirm" + (++counter);

      var overlay = el("div", "checkout-modal ui-confirm");
      overlay.setAttribute("role", "alertdialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", uid + "-title");
      overlay.setAttribute("aria-describedby", uid + "-msg");

      var box = el("div", "checkout-box ui-confirm-box");
      var title = el("h2", "ui-confirm-title", opts.title || "Are you sure?");
      title.id = uid + "-title";
      var msg = el("p", "ui-confirm-msg", opts.message || "");
      msg.id = uid + "-msg";

      var actions = el("div", "ui-confirm-actions");
      var cancel = el("button", "loc-btn", opts.cancelText || "Cancel");
      cancel.type = "button";
      var ok = el("button", "btn-inline" + (opts.danger ? " danger" : ""), opts.confirmText || "Confirm");
      ok.type = "button";
      actions.appendChild(cancel);
      actions.appendChild(ok);

      box.appendChild(title);
      box.appendChild(msg);
      box.appendChild(actions);
      overlay.appendChild(box);

      var lockedHere = !document.body.classList.contains("store-locked");
      if (lockedHere) document.body.classList.add("store-locked");
      document.body.appendChild(overlay);

      var done = false;
      function finish(answer) {
        if (done) return;
        done = true;
        document.removeEventListener("keydown", onKey, true);
        if (lockedHere) document.body.classList.remove("store-locked");
        if (previous && previous.focus) previous.focus();
        resolve(answer);
        // let the dialog fade out before it is removed
        var remove = function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
        if (reducedMotion()) { remove(); return; }
        overlay.classList.add("closing");
        setTimeout(remove, 210);
      }

      function onKey(e) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        } else if (e.key === "Tab") { // keep focus inside the dialog
          var first = cancel;
          var last = ok;
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }

      cancel.addEventListener("click", function () { finish(false); });
      ok.addEventListener("click", function () { finish(true); });
      overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) finish(false); });
      document.addEventListener("keydown", onKey, true);

      (opts.danger ? cancel : ok).focus(); // for deletions the safe choice is focused first
    });
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* ---------- Pop-up windows: animate on open and on close ---------- */
  // Opening plays by itself (CSS) whenever `hidden` is removed. For closing, this wraps the
  // element's `hidden` property: setting it to true first plays the closing animation, then hides.
  // While it plays, `hidden` already reads as true, so the rest of the code treats it as closed.
  function animateModal(el) {
    if (!el || el._animated) return el;
    el._animated = true;
    var native = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "hidden");
    var timer = null;
    var closing = false;
    function finish() {
      closing = false;
      el.classList.remove("closing");
      native.set.call(el, true);
    }
    Object.defineProperty(el, "hidden", {
      configurable: true,
      get: function () { return closing || native.get.call(el); },
      set: function (value) {
        if (value) {
          if (closing || native.get.call(el)) return;
          if (reducedMotion()) { native.set.call(el, true); return; }
          closing = true;
          el.classList.add("closing");
          timer = setTimeout(finish, 220);
        } else {
          clearTimeout(timer);
          closing = false;
          el.classList.remove("closing");
          native.set.call(el, false);
        }
      }
    });
    return el;
  }

  /* ---------- Smooth light/dark switch ---------- */
  // Runs `change` (the function that flips the theme) with a soft cross-fade of the whole page
  function fadeTheme(change) {
    if (reducedMotion()) { change(); return; }
    if (document.startViewTransition) { // modern browsers fade the old page into the new one
      document.startViewTransition(change);
      return;
    }
    var root = document.documentElement; // others: fade colours and borders
    root.classList.add("theme-fade");
    change();
    setTimeout(function () { root.classList.remove("theme-fade"); }, 500);
  }

  window.SWUI = { customSelect: customSelect, confirm: confirmDialog, fadeTheme: fadeTheme, animateModal: animateModal };
})();


/* ---------- 3. Store page ---------- */
(function () {
  "use strict";

  /* ---------- Settings: edit these ---------- */
  var CONFIG = {
    upiId: "9005325544@ibl",
    payeeName: "Shivam Soni",
    whatsapp: "919005325544", // country code + number, no + or spaces
    currency: "\u20B9",
    orderPrefix: "SW",
    deliveryCharge: 50, // flat charge added to every order (keep in sync with firestore.rules)

    // ===== COUPON: edit the code text and the discount percentage here =====
    // The discount applies to the items only, never to the delivery charge.
    couponCode: "SHIVAM10",
    couponPercent: 10,

    // ===== SCROLLING BANNER under the search bar: edit the messages here =====
    // {delivery}, {code} and {percent} are filled in from the settings above.
    announcements: [
      "\uD83D\uDE9A Flat {delivery} delivery on every order",
      "\uD83C\uDF9F\uFE0F Use code {code} for {percent}% off your items (delivery not included)",
      "\uD83D\uDC9C Handmade with love by Shivam's World",
      "\uD83D\uDCCD Pin your exact location so we can find you easily",
      "\uD83D\uDCE6 Track every order live from My orders",
      "\u26A1 Pay easily with any UPI app"
    ]
  };

  /* ---------- Products: edit names, prices, descriptions ----------
     NOTE: prices below are placeholders. Change them before launch. */
  var PRODUCTS = [
    { id: "calligraphy",  name: "Unique Calligraphy Artworks", price: 299,
      image: "https://i.ytimg.com/vi/oMuXlOXMBoA/oardefault.jpg",
      desc: "Handmade calligraphy pieces with quotes and designs for your home, office or as a gift." },
    { id: "sketches",     name: "Pencil Sketches", price: 499,
      image: "https://i.ytimg.com/vi/8YbqfxWyotU/oardefault.jpg",
      desc: "Hand-drawn graphite portraits and character art, made as a keepsake or gift." },
    { id: "cards",        name: "Cards Handcrafted with Love", price: 149,
      image: "https://i.ytimg.com/vi/NpWb5ulgXjU/oardefault.jpg",
      desc: "Greeting cards and explosion box cards for birthdays, anniversaries and special days." },
    { id: "paracord",     name: "Paracord Bracelets", price: 99,
      image: "https://i.ytimg.com/vi/pszu8o-T5G0/oardefault.jpg",
      desc: "Durable, weather-resistant bracelets knotted by hand in different colours and patterns." },
    { id: "macrame",      name: "Macrame Keychains", price: 129,
      image: "https://i.ytimg.com/vi/sAjdy8Xtw70/oardefault.jpg",
      desc: "Handwoven boho keychains with soft, sturdy cord and neat knotting." },
    { id: "projectfiles", name: "School and College Project Files", price: 349,
      image: "https://i.ytimg.com/vi/oi7UKiZaArM/hqdefault.jpg",
      desc: "Neat, organised project files and practical records with a personal touch." },
    { id: "diy",          name: "DIY Delights", price: 199,
      image: "https://i.ytimg.com/vi/fD5gIQP-L1A/oardefault.jpg",
      desc: "Creative paper craft and DIY pieces from the channel." },
    { id: "custom",       name: "Customised Orders and Personalised Gifts", price: 499,
      image: "https://i.ytimg.com/vi/Le0p8AjfK4A/oardefault.jpg",
      desc: "One-of-a-kind gifts and artworks made around your idea. Share details in the note." }
  ];

  var CART_KEY = "sw-cart";
  var THEME_KEY = "sw-theme";

  /* ---------- Helpers ---------- */
  function $(id) { return document.getElementById(id); }

  function storeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  function money(n) {
    return CONFIG.currency + Number(n).toLocaleString("en-IN");
  }

  function findProduct(id) {
    for (var i = 0; i < PRODUCTS.length; i++) {
      if (PRODUCTS[i].id === id) return PRODUCTS[i];
    }
    return null;
  }

  /* ---------- Cart state ---------- */
  var cart = {}; // { productId: quantity }

  function loadCart() {
    try {
      var saved = JSON.parse(storeGet(CART_KEY) || "{}");
      Object.keys(saved).forEach(function (id) {
        var qty = parseInt(saved[id], 10);
        if (findProduct(id) && qty > 0) cart[id] = Math.min(qty, 99);
      });
    } catch (e) { cart = {}; }
  }

  function saveCart() { storeSet(CART_KEY, JSON.stringify(cart)); }

  function cartCount() {
    return Object.keys(cart).reduce(function (sum, id) { return sum + cart[id]; }, 0);
  }

  function cartTotal() {
    return Object.keys(cart).reduce(function (sum, id) {
      return sum + findProduct(id).price * cart[id];
    }, 0);
  }

  function addToCart(id, qty) {
    cart[id] = Math.min((cart[id] || 0) + (qty || 1), 99);
    saveCart();
    renderCart();
    bumpFab();
    toast("Added to cart");
  }

  function changeQty(id, delta) {
    var next = (cart[id] || 0) + delta;
    if (next <= 0) delete cart[id];
    else cart[id] = Math.min(next, 99);
    saveCart();
    renderCart();
  }

  function removeItem(id) {
    delete cart[id];
    saveCart();
    renderCart();
  }

  /* ---------- Rendering ---------- */
  var searchTerm = "";
  var sortMode = "featured";

  function visibleProducts() {
    var term = searchTerm.trim().toLowerCase();
    var list = PRODUCTS.filter(function (p) {
      return !term || (p.name + " " + p.desc).toLowerCase().indexOf(term) !== -1;
    });
    if (sortMode === "low") list.sort(function (x, y) { return x.price - y.price; });
    else if (sortMode === "high") list.sort(function (x, y) { return y.price - x.price; });
    else if (sortMode === "name") list.sort(function (x, y) { return x.name.localeCompare(y.name); });
    return list;
  }

  function renderProducts() {
    var grid = $("productGrid");
    var list = visibleProducts();
    grid.innerHTML = "";
    $("resultCount").textContent = list.length === PRODUCTS.length
      ? PRODUCTS.length + " products"
      : list.length + " of " + PRODUCTS.length + " products";

    if (!list.length) {
      var none = document.createElement("p");
      none.className = "no-results";
      none.textContent = "No products match your search. Try a different word.";
      grid.appendChild(none);
      return;
    }

    list.forEach(function (p) {
      var card = document.createElement("article");
      card.className = "product-card";
      card.innerHTML =
        '<div class="product-img"><img loading="lazy" alt=""></div>' +
        '<div class="product-body">' +
          '<h2><button type="button" class="product-title-btn"></button></h2>' +
          '<p class="product-desc"></p>' +
          '<div class="product-foot">' +
            '<span class="product-price"></span>' +
            '<button type="button" class="btn-inline add-btn">Add to cart</button>' +
          '</div>' +
        '</div>';
      var img = card.querySelector("img");
      img.src = p.image;
      img.alt = p.name;
      var title = card.querySelector(".product-title-btn");
      title.textContent = p.name;
      title.setAttribute("aria-label", "View details: " + p.name);
      card.querySelector(".product-desc").textContent = p.desc;
      card.querySelector(".product-price").textContent = money(p.price);
      // Clicking the picture or the name opens the product
      card.querySelector(".product-img").addEventListener("click", function () { openProduct(p.id); });
      title.addEventListener("click", function () { openProduct(p.id); });
      var btn = card.querySelector(".add-btn");
      btn.setAttribute("aria-label", "Add " + p.name + " to cart");
      btn.addEventListener("click", function () { addToCart(p.id); });
      grid.appendChild(card);
    });
  }

  /* ---------- Product details modal ---------- */
  var pmProduct = null;
  var pmQty = 1;
  var pmReturnFocus = null;

  function openProduct(id) {
    var p = findProduct(id);
    if (!p) return;
    pmProduct = p;
    pmQty = 1;
    pmReturnFocus = document.activeElement;
    $("pmImg").src = p.image;
    $("pmImg").alt = p.name;
    $("pmName").textContent = p.name;
    $("pmPrice").textContent = money(p.price);
    $("pmDesc").textContent = p.desc;
    $("pmQty").textContent = "1";
    $("productModal").hidden = false;
    document.body.classList.add("store-locked");
    $("pmAdd").focus();
  }

  function closeProduct() {
    $("productModal").hidden = true;
    document.body.classList.remove("store-locked");
    if (pmReturnFocus && pmReturnFocus.focus) pmReturnFocus.focus();
  }

  function renderCart() {
    var list = $("cartItems");
    var ids = Object.keys(cart);
    list.innerHTML = "";

    if (!ids.length) {
      var empty = document.createElement("p");
      empty.className = "cart-empty";
      empty.textContent = "Your cart is empty. Add something you like from the store.";
      list.appendChild(empty);
    }

    ids.forEach(function (id) {
      var p = findProduct(id);
      var row = document.createElement("div");
      row.className = "cart-row";
      row.innerHTML =
        '<img alt="">' +
        '<div>' +
          '<div class="cart-row-name"></div>' +
          '<div class="cart-row-price"></div>' +
          '<div class="qty">' +
            '<button type="button" data-act="minus" aria-label="Decrease quantity">&minus;</button>' +
            '<span aria-live="polite"></span>' +
            '<button type="button" data-act="plus" aria-label="Increase quantity">+</button>' +
          '</div>' +
        '</div>' +
        '<div class="cart-row-side">' +
          '<div class="cart-row-line"></div>' +
          '<button type="button" class="remove-btn">Remove</button>' +
        '</div>';
      var img = row.querySelector("img");
      img.src = p.image;
      img.alt = p.name;
      row.querySelector(".cart-row-name").textContent = p.name;
      row.querySelector(".cart-row-price").textContent = money(p.price) + " each";
      row.querySelector(".qty span").textContent = cart[id];
      row.querySelector(".cart-row-line").textContent = money(p.price * cart[id]);
      row.querySelector('[data-act="minus"]').addEventListener("click", function () { changeQty(id, -1); });
      row.querySelector('[data-act="plus"]').addEventListener("click", function () { changeQty(id, 1); });
      row.querySelector(".remove-btn").addEventListener("click", function () { removeItem(id); });
      list.appendChild(row);
    });

    var count = cartCount();
    $("cartSubtotal").textContent = money(cartTotal());
    $("cartDelivery").textContent = money(count ? CONFIG.deliveryCharge : 0);
    $("cartTotal").textContent = money(count ? cartTotal() + CONFIG.deliveryCharge : 0);
    $("checkoutBtn").disabled = count === 0;
    var badge = $("cartBadge");
    badge.textContent = count;
    badge.hidden = count === 0;
    $("cartFab").setAttribute("aria-label", "Open cart, " + count + (count === 1 ? " item" : " items"));
  }

  /* ---------- Toast & button feedback ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1600);
  }

  function bumpFab() {
    var fab = $("cartFab");
    fab.classList.remove("bump");
    void fab.offsetWidth; // restart the animation
    fab.classList.add("bump");
  }

  /* ---------- Cart drawer ---------- */
  var lastFocus = null;

  function openCart() {
    lastFocus = document.activeElement;
    $("cartOverlay").hidden = false;
    var drawer = $("cartDrawer");
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("store-locked");
    $("cartClose").focus();
  }

  function closeCart() {
    $("cartOverlay").hidden = true;
    var drawer = $("cartDrawer");
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("store-locked");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- Checkout ---------- */
  var order = null; // { id, name, phone, address, note, items, total }

  // 8 random characters (no look-alikes such as 0/O or 1/I), e.g. SW-7K3Q9M2X
  function newOrderId() {
    var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var bytes = new Uint8Array(8);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    var id = "";
    for (var j = 0; j < bytes.length; j++) id += alphabet.charAt(bytes[j] % alphabet.length);
    return CONFIG.orderPrefix + "-" + id;
  }

  // Saves the order to Firestore in the background. The WhatsApp message is
  // the backup: if this fails, the order still reaches you there.
  function saveOrderToDb(o, utr) {
    var payload = {
      id: o.id, name: o.name, phone: o.phone, address: o.address,
      note: o.note, items: o.items, subtotal: o.subtotal, deliveryCharge: o.deliveryCharge,
      discount: o.discount, couponCode: o.couponCode, couponKey: o.couponKey, uid: o.uid,
      total: o.total, location: o.location, utr: utr
    };
    return window.SWData.module()
      .then(function (m) { return m.saveOrder(payload); })
      .catch(function (err) {
        console.error("Order could not be saved online (WhatsApp message still sent):", err);
      });
  }

  function showStep(name) {
    var steps = document.querySelectorAll("#checkoutModal .step");
    for (var i = 0; i < steps.length; i++) {
      steps[i].hidden = steps[i].getAttribute("data-step") !== name;
    }
    var titles = { details: "Your details", payment: "Pay with UPI", done: "Order received" };
    $("checkoutTitle").textContent = titles[name] || "";
    var box = document.querySelector(".checkout-box");
    box.scrollTop = 0;
  }

  function showError(id, msg) {
    var el = $(id);
    el.textContent = msg;
    el.hidden = !msg;
  }

  function openCheckout() {
    if (!cartCount()) return;
    closeCart();
    $("checkoutModal").hidden = false;
    document.body.classList.add("store-locked");
    showError("detailsError", "");
    showError("payError", "");
    showStep("details");
    renderSummary();
    renderCheckoutAuth();
    prefillFromProfile();
    $("custName").focus();
    window.SWData.module().catch(function () { /* saved later, WhatsApp is the backup */ });
  }

  function closeCheckout() {
    $("checkoutModal").hidden = true;
    document.body.classList.remove("store-locked");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function upiLink(o) {
    return "upi://pay" +
      "?pa=" + encodeURIComponent(CONFIG.upiId) +
      "&pn=" + encodeURIComponent(CONFIG.payeeName) +
      "&am=" + encodeURIComponent(o.total.toFixed(2)) +
      "&cu=INR" +
      "&tn=" + encodeURIComponent("Order " + o.id);
  }

  function renderQr(text) {
    var box = $("qrBox");
    box.innerHTML = "";
    if (typeof QRCode === "undefined") {
      box.textContent = "QR code could not load. Use the Pay with UPI app button instead.";
      return;
    }
    new QRCode(box, { text: text, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
  }

  function onDetailsSubmit(e) {
    e.preventDefault();
    var name = $("custName").value.trim();
    var phone = normalizePhone($("custPhone").value);
    var address = $("custAddress").value.trim();

    if (name.length < 2) return showError("detailsError", "Enter your full name.");
    if (!/^[6-9]\d{9}$/.test(phone)) return showError("detailsError", "Enter a valid 10-digit mobile number.");
    if (address.length < 10) return showError("detailsError", "Enter your full delivery address.");
    if (!checkoutLoc.get()) {
      showError("detailsError", "");
      showError("locError", "Please pin your exact delivery location to continue.");
      $("locBox").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    showError("detailsError", "");

    // A coupon is re-checked against the final name, phone and address
    if (appliedCoupon) {
      var submitBtn = $("detailsForm").querySelector('button[type="submit"]');
      var submitLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Checking coupon\u2026";
      checkCouponUnused(name, phone, address).then(function (r) {
        if (r.used) {
          resetCoupon();
          couponMessage("This coupon has already been used for your account, so it was removed.", "bad");
          showError("detailsError", "The coupon was removed. Check your new total, then continue.");
          return;
        }
        appliedCoupon.key = r.key;
        proceedToPayment(name, phone, address);
      }).catch(function (err) {
        console.error(err);
        showError("detailsError", "Couldn't verify the coupon right now. Try again, or remove the coupon.");
      }).then(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
      });
      return;
    }
    proceedToPayment(name, phone, address);
  }

  function proceedToPayment(name, phone, address) {
    var items = Object.keys(cart).map(function (id) {
      var p = findProduct(id);
      return { name: p.name, qty: cart[id], price: p.price };
    });

    order = {
      id: order && order.id ? order.id : newOrderId(),
      name: name,
      phone: phone,
      address: address,
      note: $("custNote").value.trim(),
      items: items,
      subtotal: cartTotal(),
      deliveryCharge: CONFIG.deliveryCharge,
      discount: discountAmount(),
      couponCode: appliedCoupon ? appliedCoupon.code : "",
      couponKey: appliedCoupon && appliedCoupon.key ? appliedCoupon.key : "",
      uid: currentUser ? currentUser.uid : "",
      total: orderTotal(),
      location: checkoutLoc.get() ? { lat: checkoutLoc.get().lat, lng: checkoutLoc.get().lng } : null
    };

    $("payOrderId").textContent = order.id;
    $("payAmount").textContent = money(order.total);
    $("payBreakdown").textContent = "Items " + money(order.subtotal) +
      (order.discount ? " \u2212 coupon " + money(order.discount) : "") +
      " + delivery " + money(order.deliveryCharge);
    var link = upiLink(order);
    $("upiAppBtn").setAttribute("href", link);
    renderQr(link);
    $("utrInput").value = "";
    showError("payError", "");
    showStep("payment");
  }

  function buildWhatsAppUrl(utr) {
    var lines = ["*New order " + order.id + "*", "", "Items:"];
    order.items.forEach(function (it, i) {
      lines.push((i + 1) + ". " + it.name + " x " + it.qty + " = " + money(it.price * it.qty));
    });
    lines.push("",
      "Items subtotal: " + money(order.subtotal),
      order.discount ? "Coupon " + order.couponCode + ": -" + money(order.discount) : "Coupon: none",
      "Delivery charge: " + money(order.deliveryCharge),
      "*Total: " + money(order.total) + "*", "",
      "Name: " + order.name,
      "Phone: " + order.phone,
      "Address: " + order.address);
    if (order.location) lines.push("Pinned location: " + mapsUrl(order.location));
    if (order.note) lines.push("Note: " + order.note);
    lines.push("", "UPI transaction ID (UTR): " + utr, "Payment status: Pending verification");
    return "https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(lines.join("\n"));
  }

  function onPaid() {
    if (!currentUser) { showError("payError", "Please sign in to place your order."); return; }
    var utr = $("utrInput").value.replace(/\s/g, "");
    if (!/^\d{12}$/.test(utr)) {
      return showError("payError", "Enter the 12-digit UPI transaction ID shown in your payment app.");
    }
    showError("payError", "");

    var url = buildWhatsAppUrl(utr);
    saveOrderToDb(order, utr); // background; WhatsApp opens even if this fails
    var opened = window.open(url, "_blank", "noopener");

    lastOrderId = order.id;
    if (currentUser && $("saveDetails").checked) {
      saveProfileNow({ name: order.name, phone: order.phone, address: order.address, location: order.location }, true);
    }
    $("doneOrderId").textContent = order.id;
    $("waAgainBtn").setAttribute("href", url);
    showStep("done");

    // Order is handed off: empty the cart and start a fresh order ID next time.
    cart = {};
    saveCart();
    renderCart();
    order = null;
    checkoutLoc.clear();
    checkoutLoc.hideMap();
    resetCoupon();

    if (!opened) toast("Tap Open WhatsApp to send your order");
  }

  /* ---------- Coupon ---------- */
  var appliedCoupon = null; // { code, percent } once a valid code is applied

  function discountAmount() {
    return appliedCoupon ? Math.round(cartTotal() * appliedCoupon.percent / 100) : 0;
  }
  function orderTotal() {
    return cartTotal() - discountAmount() + CONFIG.deliveryCharge;
  }

  function renderSummary() {
    var disc = discountAmount();
    $("sumSubtotal").textContent = money(cartTotal());
    $("sumDiscountRow").hidden = !disc;
    $("sumDiscount").textContent = "\u2212" + money(disc);
    $("sumDelivery").textContent = money(CONFIG.deliveryCharge);
    $("sumTotal").textContent = money(orderTotal());
  }

  function couponMessage(text, kind) {
    var msg = $("couponMsg");
    msg.textContent = text;
    msg.className = "hint coupon-msg" + (kind ? " " + kind : "");
  }

  function resetCoupon() {
    appliedCoupon = null;
    $("couponInput").value = "";
    $("couponInput").disabled = false;
    $("couponApply").textContent = "Apply";
    couponMessage("", "");
    renderSummary();
  }

  // Same name + phone + address (ignoring case, spacing and punctuation) = same customer
  function normalizeText(v) {
    return String(v || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }
  function normalizePhone(v) {
    return String(v || "").replace(/[\s-]/g, "").replace(/^(\+91|91)(?=\d{10}$)/, "");
  }

  // A fingerprint of coupon + customer. Only this hash is stored, never the details.
  function couponIdentityKey(name, phone, address) {
    if (!(window.crypto && window.crypto.subtle && window.TextEncoder)) {
      return Promise.reject(new Error("crypto unavailable"));
    }
    var text = [String(CONFIG.couponCode).toUpperCase(), normalizeText(name), phone, normalizeText(address)].join("|");
    return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ("0" + b.toString(16)).slice(-2);
      }).join("");
    });
  }

  // Resolves { key, used }
  function checkCouponUnused(name, phone, address) {
    return couponIdentityKey(name, phone, address).then(function (key) {
      return window.SWData.module()
        .then(function (m) { return m.isCouponUsed(key); })
        .then(function (used) { return { key: key, used: used }; });
    });
  }

  function applyCoupon() {
    if (appliedCoupon) { resetCoupon(); return; } // the button reads "Remove" once applied
    var code = $("couponInput").value.trim().toUpperCase();
    if (!code) { couponMessage("Enter a coupon code first.", "bad"); return; }
    if (code !== String(CONFIG.couponCode).toUpperCase()) {
      couponMessage("That coupon code isn't valid.", "bad");
      return;
    }
    var name = $("custName").value.trim();
    var phone = normalizePhone($("custPhone").value);
    var address = $("custAddress").value.trim();
    if (name.length < 2 || !/^[6-9]\d{9}$/.test(phone) || address.length < 10) {
      couponMessage("Fill in your name, phone number and address above first. Each customer can use the coupon once.", "bad");
      return;
    }

    var btn = $("couponApply");
    btn.disabled = true;
    btn.textContent = "Checking\u2026";
    checkCouponUnused(name, phone, address).then(function (r) {
      if (r.used) {
        couponMessage("This coupon has already been used for your account.", "bad");
        btn.textContent = "Apply";
        return;
      }
      appliedCoupon = { code: CONFIG.couponCode, percent: CONFIG.couponPercent, key: r.key };
      $("couponInput").value = CONFIG.couponCode;
      $("couponInput").disabled = true;
      btn.textContent = "Remove";
      couponMessage("Coupon applied: " + CONFIG.couponPercent + "% off your items (not on delivery).", "good");
      renderSummary();
    }).catch(function (err) {
      console.error(err);
      couponMessage("Couldn't verify the coupon right now. Check your connection and try again.", "bad");
      btn.textContent = "Apply";
    }).then(function () {
      btn.disabled = false;
    });
  }

  /* ---------- Delivery location (GPS or map pin) ---------- */
  var DEFAULT_CENTER = [26.4499, 80.3319]; // Kanpur, where the map opens if there is no GPS fix
  var checkoutLoc = null; // location picker in checkout
  var acctLoc = null;     // location picker in the customer's account

  function round6(n) { return Math.round(n * 1e6) / 1e6; }
  function mapsUrl(loc) { return "https://www.google.com/maps?q=" + loc.lat + "," + loc.lng; }

  // One location picker (GPS button, map, status line); `ids` names its page elements
  function createLocationPicker(ids) {
    var picked = null;
    var map = null;
    var marker = null;

    function renderStatus(accuracy) {
      var box = $(ids.status);
      box.innerHTML = "";
      if (!picked) { box.hidden = true; return; }
      box.hidden = false;
      var text = document.createElement("span");
      text.textContent = "\uD83D\uDCCD Location pinned: " + picked.lat.toFixed(5) + ", " + picked.lng.toFixed(5) +
        (accuracy ? " (GPS accuracy about " + Math.round(accuracy) + " m, drag the pin if it's off)" : "") + " ";
      var link = document.createElement("a");
      link.href = mapsUrl(picked);
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Check in Maps";
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "link-btn inline";
      remove.textContent = "Remove";
      remove.addEventListener("click", clear);
      box.appendChild(text);
      box.appendChild(link);
      box.appendChild(document.createTextNode(" \u00B7 "));
      box.appendChild(remove);
    }

    function set(lat, lng, accuracy) {
      picked = { lat: round6(lat), lng: round6(lng) };
      showError(ids.error, "");
      renderStatus(accuracy);
    }

    function clear() {
      picked = null;
      renderStatus();
    }

    function showMap(lat, lng) {
      if (typeof L === "undefined") {
        showError(ids.error, "The map could not load. Use the current-location button instead.");
        return;
      }
      $(ids.mapBox).hidden = false;
      var at = [lat, lng];
      if (!map) {
        map = L.map(ids.map, { scrollWheelZoom: false }).setView(at, 16);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors"
        }).addTo(map);
        marker = L.marker(at, { draggable: true }).addTo(map);
        marker.on("dragend", function () {
          var p = marker.getLatLng();
          set(p.lat, p.lng);
        });
        map.on("click", function (e) {
          marker.setLatLng(e.latlng);
          set(e.latlng.lat, e.latlng.lng);
        });
      } else {
        map.setView(at, 16);
        marker.setLatLng(at);
      }
      setTimeout(function () { map.invalidateSize(); }, 60); // the map was hidden until now
    }

    function useGps() {
      if (!navigator.geolocation) {
        showError(ids.error, "This browser can't share your location. Choose your spot on the map instead.");
        return;
      }
      var btn = $(ids.gps);
      var original = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = "Locating\u2026";
      navigator.geolocation.getCurrentPosition(function (pos) {
        btn.innerHTML = original;
        btn.disabled = false;
        set(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        showMap(pos.coords.latitude, pos.coords.longitude);
      }, function (err) {
        btn.innerHTML = original;
        btn.disabled = false;
        showError(ids.error,
          err.code === 1 ? "Location access was blocked. Allow it in your browser, or choose your spot on the map." :
          err.code === 3 ? "Finding your location took too long. Try again, or choose your spot on the map." :
          "Couldn't get your location. Choose your spot on the map instead.");
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    }

    function chooseOnMap() {
      showError(ids.error, "");
      var at = picked ? [picked.lat, picked.lng] : DEFAULT_CENTER;
      showMap(at[0], at[1]);
    }

    $(ids.gps).addEventListener("click", useGps);
    $(ids.choose).addEventListener("click", chooseOnMap);

    return {
      get: function () { return picked; },
      set: set,
      clear: clear,
      hideMap: function () { $(ids.mapBox).hidden = true; }
    };
  }

  /* ---------- Customer account (Google sign-in, required to order) ---------- */
  var currentUser = null; // { uid, name, email } when signed in
  var profile = null;     // saved details from the customer's account
  var accountLoad = null;
  var stopOrders = null;
  var ordersToken = 0;
  var acctReturnFocus = null;
  var pendingTrack = null; // order ID from a WhatsApp link, opened after sign-in
  var scrollOrdersOnLoad = false; // jump to My orders once the list has loaded
  var lastOrderId = "";

  var STATUS_LABELS = {
    pending: "Payment being verified", confirmed: "Payment confirmed", packed: "Packed",
    shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled"
  };

  // Loads the sign-in code only when it's needed
  function accountModule() {
    if (!accountLoad) {
      accountLoad = window.SWData.module().catch(function (err) { accountLoad = null; throw err; });
    }
    return accountLoad;
  }

  function firstName(n) { return String(n || "").trim().split(/\s+/)[0] || ""; }

  function renderAccountButton() {
    var btn = $("accountBtn");
    var avatar = $("acctAvatar");
    if (currentUser) {
      var first = firstName(currentUser.name) || firstName(currentUser.email) || "Me";
      avatar.textContent = first.charAt(0).toUpperCase();
      $("acctText").textContent = first;
      btn.setAttribute("aria-label", "My account");
      btn.setAttribute("title", "My account");
    } else {
      avatar.innerHTML = '<i class="fa fa-user-o" aria-hidden="true"></i>';
      $("acctText").textContent = "Sign in";
      btn.setAttribute("aria-label", "Sign in");
      btn.setAttribute("title", "Sign in");
    }
    $("cartSignInNote").hidden = !!currentUser;
    renderCheckoutAuth();
  }

  function renderCheckoutAuth() {
    $("checkoutAuthNote").textContent = currentUser ? "Signed in as " + currentUser.email + "." : "";
    $("saveDetailsRow").hidden = !currentUser;
  }

  // Resolves with the signed-in user, or nothing if the pop-up was closed or failed
  function signIn() {
    return accountModule()
      .then(function (m) { return m.signInGoogle(); })
      .then(function (cred) {
        if (cred && cred.user) { onAuthChange(cred.user); return cred.user; }
      })
      .catch(function (err) {
        if (err && (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request")) return;
        console.error(err);
        toast(err && err.code === "auth/popup-blocked"
          ? "Allow pop-ups for this site to sign in"
          : "Sign-in failed. If you use an ad blocker, pause it for this site and try again.");
      });
  }

  function doSignOut() {
    closeAccount();
    accountModule().then(function (m) { return m.signOutUser(); }).catch(function (err) { console.error(err); });
    $("detailsForm").reset();
    checkoutLoc.clear();
    resetCoupon();
    toast("Signed out");
  }

  function onAuthChange(user) {
    if (!user) {
      currentUser = null;
      profile = null;
      renderAccountButton();
      if (!$("checkoutModal").hidden) { closeCheckout(); toast("Please sign in to place your order"); }
      if (!$("accountModal").hidden) closeAccount();
      if (!$("trackModal").hidden) closeTrack();
      if (pendingTrack) toast("Sign in with Google to see your order status");
      return;
    }
    currentUser = { uid: user.uid, name: user.displayName || "", email: user.email || "" };
    renderAccountButton();
    accountModule()
      .then(function (m) { return m.loadProfile(user.uid); })
      .then(function (p) {
        profile = p;
        if (!$("checkoutModal").hidden) prefillFromProfile();
      })
      .catch(function (err) { console.error(err); });
    if (pendingTrack) {
      var id = pendingTrack;
      pendingTrack = null;
      openTrack(id);
    }
  }

  function fillIfEmpty(id, value) {
    var el = $(id);
    if (value && !el.value.trim()) el.value = value;
  }

  // Fills the checkout form from the account, never overwriting what was already typed
  function prefillFromProfile() {
    if (!currentUser) return;
    fillIfEmpty("custName", (profile && profile.name) || currentUser.name);
    fillIfEmpty("custPhone", profile && profile.phone);
    fillIfEmpty("custAddress", profile && profile.address);
    if (!checkoutLoc.get() && profile && profile.location && typeof profile.location.lat === "number") {
      checkoutLoc.set(profile.location.lat, profile.location.lng);
    }
  }

  function saveProfileNow(data, silent) {
    if (!currentUser) return Promise.resolve();
    return accountModule()
      .then(function (m) { return m.saveProfile(currentUser.uid, data); })
      .then(function () {
        profile = { name: data.name, phone: data.phone, address: data.address, location: data.location || null };
        if (!silent) toast("Details saved");
      })
      .catch(function (err) {
        console.error(err);
        if (!silent) toast("Couldn't save your details. Please try again.");
      });
  }

  function downloadInvoiceFor(o, btn) {
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Preparing\u2026";
    window.SWData.module()
      .then(function (m) { return m.downloadInvoice(o); })
      .catch(function (err) {
        console.error(err);
        toast("Couldn't create the invoice. Please try again.");
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = label;
      });
  }

  // Scrolls the account window so the My orders section is in view
  function scrollToOrdersHead() {
    var head = $("acctOrdersHead");
    if (head && head.scrollIntoView) head.scrollIntoView({ block: "start" });
  }

  function renderMyOrders(list) {
    var doScroll = scrollOrdersOnLoad; // set when opened from "Track order" / My orders links
    scrollOrdersOnLoad = false;
    var box = $("acctOrders");
    box.innerHTML = "";
    if (!list.length) {
      var none = document.createElement("p");
      none.className = "acct-empty";
      none.textContent = "No orders yet. Orders you place appear here, with live status.";
      box.appendChild(none);
      if (doScroll) scrollToOrdersHead();
      return;
    }
    list.sort(function (a, b) {
      var x = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      var y = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return y - x;
    });
    list.forEach(function (o) {
      var card = document.createElement("div");
      card.className = "acct-order";
      var top = document.createElement("div");
      top.className = "acct-order-top";
      var id = document.createElement("strong");
      id.textContent = o.id;
      var status = document.createElement("span");
      status.className = "acct-status";
      status.textContent = STATUS_LABELS[o.status] || STATUS_LABELS.pending;
      top.appendChild(id);
      top.appendChild(status);
      card.appendChild(top);

      var meta = document.createElement("p");
      var when = o.createdAt && o.createdAt.toDate
        ? o.createdAt.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + " \u00B7 "
        : "";
      meta.textContent = when + money(o.total);
      card.appendChild(meta);

      var items = document.createElement("p");
      items.textContent = (o.items || []).map(function (it) { return it.name + " \u00D7 " + it.qty; }).join(", ");
      card.appendChild(items);

      if (o.adminNote) {
        var note = document.createElement("p");
        note.textContent = "Note from us: " + o.adminNote;
        card.appendChild(note);
      }
      var actions = document.createElement("div");
      actions.className = "acct-order-actions";
      var track = document.createElement("button");
      track.type = "button";
      track.className = "loc-btn";
      track.textContent = "Track order";
      track.addEventListener("click", function () { closeAccount(); openTrack(o.id); });
      actions.appendChild(track);
      // an invoice is available once the payment has been confirmed
      if (o.status && o.status !== "pending" && o.status !== "cancelled") {
        var inv = document.createElement("button");
        inv.type = "button";
        inv.className = "loc-btn";
        inv.textContent = "Download invoice";
        inv.addEventListener("click", function () { downloadInvoiceFor(o, inv); });
        actions.appendChild(inv);
      }
      card.appendChild(actions);
      box.appendChild(card);
    });
    if (doScroll) scrollToOrdersHead(); // the list has its full height now
  }

  function startMyOrders() {
    var token = ++ordersToken;
    $("acctOrders").textContent = "Loading your orders\u2026";
    accountModule().then(function (m) {
      var stop = m.watchMyOrders(currentUser.uid, renderMyOrders, function (err) {
        console.error(err);
        $("acctOrders").textContent = "Couldn't load your orders right now. Please try again later.";
      });
      if (token === ordersToken && !$("accountModal").hidden) stopOrders = stop; else stop();
    }).catch(function (err) {
      console.error(err);
      $("acctOrders").textContent = "Couldn't load your orders right now. Please try again later.";
    });
  }

  function openAccount() {
    if (!currentUser) return;
    acctReturnFocus = document.activeElement;
    $("acctEmail").textContent = currentUser.email;
    $("acctName").value = (profile && profile.name) || currentUser.name || "";
    $("acctPhone").value = (profile && profile.phone) || "";
    $("acctAddress").value = (profile && profile.address) || "";
    showError("acctError", "");
    acctLoc.clear();
    acctLoc.hideMap();
    if (profile && profile.location && typeof profile.location.lat === "number") {
      acctLoc.set(profile.location.lat, profile.location.lng);
    }
    $("accountModal").hidden = false;
    document.body.classList.add("store-locked");
    startMyOrders();
  }

  function closeAccount() {
    scrollOrdersOnLoad = false;
    ordersToken++;
    if (stopOrders) { stopOrders(); stopOrders = null; }
    $("accountModal").hidden = true;
    document.body.classList.remove("store-locked");
    if (acctReturnFocus && acctReturnFocus.focus) acctReturnFocus.focus();
  }

  // Opens the account window at the orders list; asks to sign in first if needed
  function openMyOrders() {
    if (!currentUser) {
      signIn().then(function (user) { if (user) openMyOrders(); });
      return;
    }
    scrollOrdersOnLoad = true;
    openAccount();
    scrollToOrdersHead();
  }

  // Checkout needs an account: sign in first, then carry straight on
  function startCheckout() {
    if (!cartCount()) return;
    if (currentUser) { openCheckout(); return; }
    signIn().then(function (user) { if (user && cartCount()) openCheckout(); });
  }

  function onAcctSubmit(e) {
    e.preventDefault();
    var name = $("acctName").value.trim();
    var phone = normalizePhone($("acctPhone").value);
    var address = $("acctAddress").value.trim();
    if (name.length < 2) return showError("acctError", "Enter your full name.");
    if (phone && !/^[6-9]\d{9}$/.test(phone)) return showError("acctError", "Enter a valid 10-digit mobile number, or leave it empty.");
    showError("acctError", "");
    saveProfileNow({ name: name, phone: phone, address: address, location: acctLoc.get() });
  }

  /* ---------- Order tracking (each customer sees only their own orders) ---------- */
  var TRACK_STEPS = [
    { key: "pending",   label: "Order received, payment being verified" },
    { key: "confirmed", label: "Payment confirmed" },
    { key: "packed",    label: "Packed" },
    { key: "shipped",   label: "Shipped" },
    { key: "delivered", label: "Delivered" }
  ];
  var trackStop = null;
  var trackToken = 0;
  var trackReturnFocus = null;

  function showTrackMessage(msg, isError) {
    var box = $("trackResult");
    box.innerHTML = "";
    var p = document.createElement("p");
    p.className = "track-msg" + (isError ? " error" : "");
    p.textContent = msg;
    box.appendChild(p);
  }

  function renderTrackResult(id, data) {
    var box = $("trackResult");
    box.innerHTML = "";
    var head = document.createElement("h3");
    head.textContent = "Order " + id;
    box.appendChild(head);

    var updatedText = (data.updatedAt && data.updatedAt.toDate)
      ? "Updated " + data.updatedAt.toDate().toLocaleString("en-IN", {
          day: "numeric", month: "short", hour: "numeric", minute: "2-digit"
        })
      : "";

    if (data.status === "cancelled") {
      showTrackMessage("This order was cancelled. Message us on WhatsApp if you have any questions.", true);
      box.insertBefore(head, box.firstChild);
    } else {
      var idx = 0;
      TRACK_STEPS.forEach(function (s, i) { if (s.key === data.status) idx = i; });
      var ol = document.createElement("ol");
      ol.className = "track-steps";
      TRACK_STEPS.forEach(function (s, i) {
        var li = document.createElement("li");
        li.className = "track-step" + (i < idx ? " done" : (i === idx ? " current" : ""));
        if (i === idx) li.setAttribute("aria-current", "step");
        var mark = document.createElement("span");
        mark.className = "mark";
        mark.setAttribute("aria-hidden", "true");
        if (i <= idx) {
          var tick = document.createElement("i");
          tick.className = "fa fa-check";
          tick.setAttribute("aria-hidden", "true");
          mark.appendChild(tick);
        }
        var label = document.createElement("span");
        label.className = "label";
        var title = document.createElement("span");
        title.textContent = s.label;
        label.appendChild(title);
        if (i === idx && updatedText) {
          var when = document.createElement("span");
          when.className = "step-time";
          when.textContent = updatedText;
          label.appendChild(when);
        }
        li.appendChild(mark);
        li.appendChild(label);
        ol.appendChild(li);
      });
      box.appendChild(ol);
    }

    if (data.note) {
      var note = document.createElement("p");
      note.className = "track-note";
      var strong = document.createElement("strong");
      strong.textContent = "Note from us: ";
      note.appendChild(strong);
      note.appendChild(document.createTextNode(data.note));
      box.appendChild(note);
    }
    if (data.status === "cancelled" && updatedText) {
      var upd = document.createElement("p");
      upd.className = "track-updated";
      upd.textContent = updatedText;
      box.appendChild(upd);
    }
  }

  function openTrack(id) {
    if (!id) { openMyOrders(); return; }
    if (!currentUser) {
      pendingTrack = id;
      signIn(); // onAuthChange reopens this order once signed in
      return;
    }
    trackReturnFocus = document.activeElement;
    $("trackModal").hidden = false;
    document.body.classList.add("store-locked");
    showTrackMessage("Checking\u2026", false);
    var token = ++trackToken;
    var failed = function (err) {
      if (token !== trackToken) return;
      console.error(err);
      showTrackMessage("We couldn't open this order. It may belong to a different account.", true);
    };
    accountModule().then(function (m) {
      var stop = m.watchOrder(id, function (o) {
        if (token !== trackToken) return;
        if (!o) { failed(new Error("order not found")); return; }
        renderTrackResult(id, { status: o.status, note: o.adminNote, updatedAt: o.updatedAt || o.createdAt });
      }, failed);
      if (token === trackToken && !$("trackModal").hidden) trackStop = stop; else stop();
    }).catch(failed);
  }

  function closeTrack() {
    trackToken++;
    if (trackStop) { trackStop(); trackStop = null; }
    $("trackModal").hidden = true;
    document.body.classList.remove("store-locked");
    if (trackReturnFocus && trackReturnFocus.focus) trackReturnFocus.focus();
  }

  /* ---------- Scrolling banner ---------- */
  function renderMarquee() {
    var track = $("marqueeTrack");
    var messages = (CONFIG.announcements || []).map(function (text) {
      return String(text)
        .replace(/\{delivery\}/g, money(CONFIG.deliveryCharge))
        .replace(/\{code\}/g, CONFIG.couponCode)
        .replace(/\{percent\}/g, CONFIG.couponPercent);
    });
    track.innerHTML = "";
    if (!messages.length) { track.parentNode.parentNode.hidden = true; return; }
    // Two identical groups: the second one lets the loop restart without a gap
    for (var copy = 0; copy < 2; copy++) {
      var group = document.createElement("div");
      group.className = "marquee-group";
      if (copy === 1) group.setAttribute("aria-hidden", "true");
      messages.forEach(function (text) {
        var item = document.createElement("span");
        item.className = "marquee-item";
        item.textContent = text;
        group.appendChild(item);
      });
      track.appendChild(group);
    }
  }

  /* ---------- Theme & menu (same behaviour as homepage) ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#2a0066" : "#6f00ff");
    var btn = $("storeThemeToggle");
    var icon = btn.querySelector("i");
    var dark = theme === "dark";
    btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    btn.setAttribute("title", dark ? "Switch to light mode" : "Switch to dark mode");
    icon.className = dark ? "fa fa-sun-o" : "fa fa-moon-o";
  }

  function setupThemeAndMenu() {
    applyTheme(storeGet(THEME_KEY) || "light");
    $("storeThemeToggle").addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      var change = function () { applyTheme(next); storeSet(THEME_KEY, next); };
      if (window.SWUI && window.SWUI.fadeTheme) window.SWUI.fadeTheme(change); else change();
    });

    var toggle = $("menuToggle");
    var nav = $("mainNav");
    function setMenu(open) {
      nav.classList.toggle("show", open);
      toggle.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
    toggle.addEventListener("click", function () { setMenu(!nav.classList.contains("show")); });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) setMenu(false);
    });
    // Tapping anywhere outside the open menu closes it
    document.addEventListener("click", function (e) {
      if (!nav.classList.contains("show")) return;
      if (nav.contains(e.target) || toggle.contains(e.target)) return;
      setMenu(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("show")) { setMenu(false); toggle.focus(); }
    });
  }

  /* ---------- Init ---------- */
  function init() {
    loadCart();
    checkoutLoc = createLocationPicker({ gps: "gpsBtn", choose: "mapBtn", error: "locError", mapBox: "mapBox", map: "map", status: "locStatus" });
    acctLoc = createLocationPicker({ gps: "acctGpsBtn", choose: "acctMapBtn", error: "acctLocError", mapBox: "acctMapBox", map: "acctMap", status: "acctLocStatus" });
    if (window.SWUI) {
      window.SWUI.customSelect($("sortSelect"), { label: "Sort by" });
      // every pop-up window (and the cart's backdrop) fades/pops on open and close
      ["checkoutModal", "accountModal", "trackModal", "productModal", "cartOverlay"].forEach(function (id) {
        window.SWUI.animateModal($(id));
      });
    }
    renderProducts();
    renderCart();
    setupThemeAndMenu();

    $("cartFab").addEventListener("click", openCart);
    $("cartClose").addEventListener("click", closeCart);
    $("cartOverlay").addEventListener("click", closeCart);
    $("checkoutBtn").addEventListener("click", startCheckout);

    $("detailsForm").addEventListener("submit", onDetailsSubmit);
    $("backToDetails").addEventListener("click", function () { showStep("details"); });
    $("paidBtn").addEventListener("click", onPaid);
    $("checkoutClose").addEventListener("click", closeCheckout);
    $("doneClose").addEventListener("click", closeCheckout);
    $("checkoutModal").addEventListener("click", function (e) {
      if (e.target === $("checkoutModal")) closeCheckout();
    });

    // Customer account
    $("accountBtn").addEventListener("click", function () {
      if (currentUser) openAccount(); else signIn();
    });
    $("acctClose").addEventListener("click", closeAccount);
    $("accountModal").addEventListener("click", function (e) {
      if (e.target === $("accountModal")) closeAccount();
    });
    $("acctForm").addEventListener("submit", onAcctSubmit);
    $("signOutBtn").addEventListener("click", doSignOut);
    renderAccountButton();
    accountModule().then(function (m) { m.watchAuth(onAuthChange); }).catch(function (err) {
      console.error("Accounts are unavailable right now:", err);
    });

    // Delivery charge note and location buttons
    renderMarquee();
    $("couponApply").addEventListener("click", applyCoupon);
    $("couponInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); applyCoupon(); }
    });

    // Search, sort and product details
    $("searchInput").addEventListener("input", function () { searchTerm = this.value; renderProducts(); });
    $("sortSelect").addEventListener("change", function () { sortMode = this.value; renderProducts(); });
    $("pmClose").addEventListener("click", closeProduct);
    $("productModal").addEventListener("click", function (e) {
      if (e.target === $("productModal")) closeProduct();
    });
    $("pmMinus").addEventListener("click", function () {
      pmQty = Math.max(1, pmQty - 1);
      $("pmQty").textContent = pmQty;
    });
    $("pmPlus").addEventListener("click", function () {
      pmQty = Math.min(99, pmQty + 1);
      $("pmQty").textContent = pmQty;
    });
    $("pmAdd").addEventListener("click", function () {
      if (!pmProduct) return;
      addToCart(pmProduct.id, pmQty);
      closeProduct();
    });

    // Order tracking lives under the customer's account
    $("trackNowBtn").addEventListener("click", function () {
      closeCheckout();
      openTrack(lastOrderId);
    });
    $("trackClose").addEventListener("click", closeTrack);
    $("trackModal").addEventListener("click", function (e) {
      if (e.target === $("trackModal")) closeTrack();
    });
    // Every "#track" link (menu, intro text) opens My orders
    Array.prototype.forEach.call(document.querySelectorAll('a[href="#track"]'), function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        openMyOrders();
      });
    });
    // A status link from WhatsApp (?track=ORDER-ID) opens once the customer is signed in
    var linked = window.location.search.match(/[?&]track=([A-Za-z0-9-]+)/);
    if (linked) pendingTrack = linked[1].toUpperCase();

    // Keep the UTR field to digits only
    $("utrInput").addEventListener("input", function () {
      this.value = this.value.replace(/\D/g, "").slice(0, 12);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!$("checkoutModal").hidden) closeCheckout();
      else if (!$("trackModal").hidden) closeTrack();
      else if (!$("accountModal").hidden) closeAccount();
      else if (!$("productModal").hidden) closeProduct();
      else if ($("cartDrawer").classList.contains("open")) closeCart();
    });

    // Keep cart in sync if the store is open in another tab
    window.addEventListener("storage", function (e) {
      if (e.key === CART_KEY) { cart = {}; loadCart(); renderCart(); }
    });
  }

  if (document.getElementById("productGrid")) init(); // only on the store page
})();


/* ---------- 4. Admin page ---------- */
(async function () {
"use strict";
if (!document.getElementById("ordersList")) return; // only on the admin page

// Firebase handles, filled in once the sign-in service has loaded (see the Auth section)
let auth, db, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, collection, query, orderBy,
    onSnapshot, doc, updateDoc, writeBatch, serverTimestamp;

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
    const change = () => {
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    };
    if (window.SWUI && window.SWUI.fadeTheme) window.SWUI.fadeTheme(change); else change();
  });
})();

/* ---------- State ---------- */
let orders = [];
let activeFilter = "all";
let unsubscribe = null;
let searchCursor = -1;       // which search result Enter last jumped to
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
    await updateDoc(doc(db, "orders", o.id), { status, adminNote, updatedAt: serverTimestamp() });
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
  const sure = window.SWUI
    ? await window.SWUI.confirm({
        title: "Delete this order?",
        message: `Order ${o.id} will be deleted permanently. This cannot be undone.`,
        confirmText: "Delete order",
        cancelText: "Keep it",
        danger: true
      })
    : confirm(`Delete order ${o.id} permanently? This cannot be undone.`);
  if (!sure) return;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, "orders", o.id));
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
    b.addEventListener("click", () => {
      // tapping the chip that is already active goes back to "All"
      activeFilter = (activeFilter === s.key && s.key !== "all") ? "all" : s.key;
      searchCursor = -1;
      render();
    });
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
  const invoice = el("button", "mini-btn", "Download invoice");
  invoice.type = "button";
  invoice.addEventListener("click", async () => {
    const label = invoice.textContent;
    invoice.disabled = true;
    invoice.textContent = "Preparing\u2026";
    try {
      await window.SWData.downloadInvoice(o);
    } catch (err) {
      console.error(err);
      toast("Couldn't create the invoice. Check your connection and try again.");
    } finally {
      invoice.disabled = false;
      invoice.textContent = label;
    }
  });
  actions.append(call, chat, copyUtr, invoice);
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

  const noteLabel = el("label", "", "Note shown to the customer under their order (e.g. courier name and tracking number)");
  noteLabel.htmlFor = noteId;
  const note = el("input");
  note.id = noteId;
  note.type = "text";
  note.maxLength = 300;
  note.value = draft.note !== undefined ? draft.note : (o.adminNote || "");
  note.addEventListener("input", () => {
    drafts[o.id] = Object.assign(drafts[o.id] || {}, { note: note.value });
  });

  const statusField = window.SWUI ? window.SWUI.customSelect(select, { label: "Delivery status" }) : select;
  controls.append(selLabel, statusField, noteLabel, note);

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

  const hint = $("searchHint");
  if (term) {
    hint.textContent = shown.length
      ? `${shown.length} result${shown.length === 1 ? "" : "s"}. Press Enter to jump to ${shown.length === 1 ? "it" : "each one"}.`
      : "No orders match your search.";
  } else {
    hint.textContent = "";
  }

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

showAuth("Checking your sign-in\u2026", false);
try {
  ({ auth, db, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, collection, query, orderBy,
     onSnapshot, doc, updateDoc, writeBatch, serverTimestamp } = await window.SWData.sdk());
} catch (err) {
  console.error(err);
  showAuth("Couldn't load the sign-in service. If you use an ad blocker, pause it for this page and reload.", false);
  return;
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
$("searchInput").addEventListener("input", () => { searchCursor = -1; render(); });

// Enter jumps to the next result (Shift+Enter: previous) and pulses it purple
function jumpToResult(step) {
  const cards = $("ordersList").children;
  if (!cards.length) return;
  if (searchCursor < 0 && step < 0) searchCursor = 0;
  searchCursor = (searchCursor + step + cards.length) % cards.length;
  const card = cards[searchCursor];
  card.scrollIntoView({ block: "center", behavior: "smooth" });
  Array.from(cards).forEach((c) => c.classList.remove("pulse")); // only the current result pulses
  void card.offsetWidth; // restart the animation if it is the same card
  card.classList.add("pulse");
  setTimeout(() => card.classList.remove("pulse"), 1900);
  $("searchHint").textContent = `Result ${searchCursor + 1} of ${cards.length}. Press Enter for the next one.`;
}
$("searchInput").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  jumpToResult(e.shiftKey ? -1 : 1);
});

})();
