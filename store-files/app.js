/* =========================================================
   Shivam's World: all the page code in one file
   Used by store.html (the shop) and admin.html (orders admin).

   1. Data layer    Firebase sign-in/orders (loaded only when needed) + PDF invoice
   2. UI kit        styled dropdowns, confirm dialog, pop-up animations, theme fade
   3. Store page    products, cart, checkout, accounts, tracking (runs on store.html)
   3b. Store widgets floral quick menu, scroll-to-top, share, AI assistant (store.html)
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
          orderBy: fs.orderBy, onSnapshot: fs.onSnapshot, serverTimestamp: fs.serverTimestamp, getDocs: fs.getDocs, increment: fs.increment,
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

  // ----- reward points (the balance is kept in wallets/<uid>; only you can add points) -----
  function watchWallet(uid, onData, onError) {
    return S.onSnapshot(S.doc(S.db, "wallets", uid), function (snap) {
      onData(snap.exists() ? snap.data() : null);
    }, onError);
  }

  // ----- orders -----
  // Saves the order (linked to the signed-in customer) and, if a coupon was used, marks it used.
  // If reward points were redeemed, the same batch lowers the customer's balance (all or nothing).
  function saveOrder(o) {
    const batch = S.writeBatch(S.db);
    const order = {
      orderId: o.id, name: o.name, phone: o.phone, address: o.address, note: o.note || "",
      items: o.items.map(function (it) {
        var line = { name: it.name, qty: it.qty, price: it.price };
        if (it.id) line.id = it.id;
        if (it.code) line.code = it.code;
        return line;
      }),
      subtotal: o.subtotal, deliveryCharge: o.deliveryCharge, discount: o.discount || 0,
      pointsUsed: o.pointsUsed || 0, pointsEarned: o.pointsEarned || 0,
      total: o.total, utr: o.utr, status: "pending", createdAt: S.serverTimestamp()
    };
    order.uid = o.uid; // links the order to the signed-in customer
    if (o.couponCode) order.couponCode = o.couponCode;
    if (o.couponKey) order.couponKey = o.couponKey;
    if (o.location) order.location = { lat: o.location.lat, lng: o.location.lng };
    batch.set(S.doc(S.db, "orders", o.id), order);
    if (o.pointsUsed > 0) {
      batch.update(S.doc(S.db, "wallets", o.uid), {
        balance: o.pointsBalance - o.pointsUsed, lastOrderId: o.id, updatedAt: S.serverTimestamp()
      });
    }
    if (o.couponKey) {
      // Marks the coupon as used for this customer. It fails if it was already used.
      batch.set(S.doc(S.db, "couponUses", o.couponKey), { code: o.couponCode, orderId: o.id, usedAt: S.serverTimestamp() });
    }
    return batch.commit();
  }

  // ----- product reviews (public to read; only a customer with a delivered order can write) -----
  async function loadReviews() {
    const snap = await S.getDocs(S.collection(S.db, "reviews"));
    return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
  }

  // One review per order and product. `exists` means the customer is editing their own review.
  function saveReview(r) {
    const ref = S.doc(S.db, "reviews", r.orderId + "_" + r.productId);
    if (r.exists) return S.updateDoc(ref, { rating: r.rating, text: r.text, updatedAt: S.serverTimestamp() });
    return S.setDoc(ref, {
      productId: r.productId, orderId: r.orderId, uid: r.uid, name: r.name,
      rating: r.rating, text: r.text, createdAt: S.serverTimestamp()
    });
  }

  // ----- returns and replacements (readable only by the customer who asked and by you) -----
  // One request per order (the document ID is the order ID). Bank details are only sent for refunds.
  function saveReturn(r) {
    const data = {
      orderId: r.orderId, uid: r.uid, name: r.name, phone: r.phone, type: r.type,
      reason: r.reason, details: r.details || "", refundAmount: r.refundAmount,
      status: "requested", createdAt: S.serverTimestamp()
    };
    if (r.type === "refund") { data.upi = r.upi; data.account = r.account; data.ifsc = r.ifsc; }
    return S.setDoc(S.doc(S.db, "returns", r.orderId), data);
  }

  function watchMyReturns(uid, onData, onError) {
    const q = S.query(S.collection(S.db, "returns"), S.where("uid", "==", uid));
    return S.onSnapshot(q, function (snap) {
      onData(snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }));
    }, onError);
  }

  function watchReturn(orderId, onData, onError) {
    return S.onSnapshot(S.doc(S.db, "returns", orderId), function (snap) {
      onData(snap.exists() ? Object.assign({ id: snap.id }, snap.data()) : null);
    }, onError);
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
  const items = (o.items || []).map((it) => ({ name: it.name, code: it.code || "", qty: it.qty, price: it.price }));
  const subtotal = o.subtotal !== undefined ? o.subtotal : items.reduce((s, it) => s + it.price * it.qty, 0);
  const discount = o.discount || 0;
  const points = o.pointsUsed || 0;
  const delivery = o.deliveryCharge !== undefined ? o.deliveryCharge : Math.max(0, (o.total || 0) - subtotal + discount + points);
  return { items, subtotal, discount, points, delivery, total: o.total !== undefined ? o.total : subtotal - points - discount + delivery };
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
    const nameCell = h("td", "padding:11px 10px;vertical-align:top;overflow-wrap:anywhere;", it.name);
    if (it.code) nameCell.appendChild(h("div", "font-size:11px;color:#6b5f80;margin-top:2px;", "Product ID: " + it.code));
    tr.appendChild(nameCell);
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
  if (n.points > 0) line("Reward points used (" + n.points + ")", "\u2212" + money(n.points), "color:#0b6b52;");
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
    saveOrder: saveOrder, isCouponUsed: isCouponUsed, downloadInvoice: downloadInvoice,
    loadReviews: loadReviews, saveReview: saveReview,
    saveReturn: saveReturn, watchMyReturns: watchMyReturns, watchReturn: watchReturn,
    watchWallet: watchWallet
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

    // Also follow changes made from code (e.g. a form being reset): dispatch a "change" event on the select
    select.addEventListener("change", sync);

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

    // ===== ESTIMATED DELIVERY TIME =====
    // Measured from your production place (behind Babita Classes, Baradevi: 26°26'41.7"N 80°19'30.4"E).
    productionLocation: { lat: 26.444917, lng: 80.325111 },
    productionDays: 2,   // days needed to make the order, added to every estimate

    // ===== REWARD POINTS =====
    // Earn 1 point for every Rs 100 you pay for the items (after points and coupon, delivery not counted).
    // Points are added once the order is marked delivered. 1 point = Rs 1.
    // NOTE: the earning rate, the Rs 1 value and the minimum below are also checked in firestore.rules.
    pointsMinRedeem: 20,  // fewest points a customer must hold to redeem them

    // ===== RETURNS =====
    // A delivered order can be returned (refund or replacement) for this many days after delivery.
    // Refund = what was paid for the items (after points and coupon). The delivery charge is never refunded.
    returnWindowDays: 7,
    roadFactor: 1.3,     // straight-line distance x this is roughly the road distance
    // Extra travel days by road distance. upToKm = this tier covers up to that distance.
    deliveryTiers: [
      { upToKm: 8,        minDays: 0, maxDays: 1 },
      { upToKm: 20,       minDays: 1, maxDays: 1 },
      { upToKm: 45,       minDays: 1, maxDays: 2 },
      { upToKm: Infinity, minDays: 2, maxDays: 3 }
    ],

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
      "\u2B50 Earn 1 point on every \u20B9100 you spend. 1 point = \u20B91",
      "\uD83C\uDFA8 Order here first, then customise it your way on WhatsApp",
      "\uD83D\uDCCD Pin your exact location so we can find you easily",
      "\uD83D\uDE9A Add your location to see your estimated delivery time",
      "\uD83D\uDCE6 Track every order live from My orders",
      "\u26A1 Pay easily with any UPI app"
    ]
  };

  /* ---------- Products ----------
     id      = short name used in links and reviews. Never change it once the product has orders.
     code    = the product ID shown to customers (SWP-001, ...).
     price   = selling price. mrp (optional) = the crossed-out price; the "% off" badge is worked out from it.
     minQty  = minimum order quantity (optional).
     desc    = one line shown on the product card and under the price in the product window.
     details = bullet points shown in the product window.
     When you add a product, also add its id to reviewableProduct() in firestore.rules. */
  var PRODUCTS = [
    { id: "pencil-portrait-sketches", code: "SWP-001", name: "Pencil Portrait Sketches", price: 499, mrp: 699,
      image: "https://i.ytimg.com/vi/8YbqfxWyotU/oardefault.jpg",
      desc: "Hand-drawn graphite or charcoal portraits and character art, made as a keepsake or gift.",
      details: [
        "Comes with a minimalist black frame (no glass, but with a transparent sheet).",
        "Drawn in charcoal or graphite, as per your choice.",
        "Send your loved one's photo on WhatsApp once the order is placed.",
        "The sketched face is guaranteed to look like the face in your photo."
      ] },
    { id: "paracord-bracelets", code: "SWP-002", name: "Paracord Thread Bracelets", price: 79,
      image: "https://i.ytimg.com/vi/pszu8o-T5G0/oardefault.jpg",
      desc: "Durable, weather-resistant bracelets knotted by hand in different colours and patterns.",
      details: [
        "Available in different patterns and colours.",
        "Made for both men and women.",
        "Special heart-themed and couple bracelets are also available.",
        "Send your wrist size (in cm) on WhatsApp after placing your order."
      ] },
    { id: "heart-rose-bouquet", code: "SWP-003", name: "Heart-Shaped Rose Bouquet", price: 289, mrp: 340,
      image: "https://i.ytimg.com/vi/zOri4qDm2gc/hq720.jpg",
      desc: "A perfect gift for your Valentine or someone special.",
      details: [
        "Handmade, realistic roses on a heart-shaped base.",
        "Colour can be changed as per your choice.",
        "Comes covered in a thin plastic sheet, with a hook for safety and accessibility.",
        "A photo can be added as per your choice."
      ] },
    { id: "boomf-bomb-card", code: "SWP-004", name: "Boomf Bomb Card (Pop-up Cubes Card)", price: 499,
      image: "https://i.ytimg.com/vi/A5AeIf_Qi20/hq720.jpg",
      desc: "Seven magical cubes that jump out when the card is opened.",
      details: [
        "Seven cubes with 4 photos each, so 28 photos are needed in total. Send them on WhatsApp after placing your order.",
        "A perfect surprise gift for your loved ones.",
        "One of our most loved surprise gifts."
      ] },
    { id: "file-covers", code: "SWP-005", name: "School & College File Covers", price: 249,
      image: "https://i.ytimg.com/vi/oi7UKiZaArM/hq720.jpg",
      desc: "Get subject-oriented project file and lab manual covers, designed to help you score full marks in internals.",
      details: [
        "Describe your subjects on WhatsApp after placing your order.",
        "Designs made to help you score full marks in internals.",
        "Every cover is crafted around the subject's topics and is unique.",
        "All streams covered: Science, Commerce and Arts."
      ] },
    { id: "calligraphy-name-art", code: "SWP-006", name: "Unique Calligraphy Artworks & Name Art", price: 249,
      image: "https://i.ytimg.com/vi/oMuXlOXMBoA/oardefault.jpg",
      desc: "Handmade calligraphy pieces with quotes, names and designs for your home, office or as a gift.",
      details: [
        "Available in 26 shades.",
        "Made on 120 gsm A4 paper, unframed.",
        "Customise it as per your choice on WhatsApp after placing the order here.",
        "Your name or quote, written in calligraphy.",
        "Modern bouncy capitals with flourishes; every calligraphy style is available."
      ] },
    { id: "explosive-box-card", code: "SWP-007", name: "Explosive Box Card", price: 499, mrp: 555,
      image: "https://i.ytimg.com/vi/eep1OnLZO1c/hq720.jpg",
      desc: "Big explosive box cards, perfect for gifting.",
      details: [
        "Every size is available.",
        "Available in vibrant colours and numerous patterns.",
        "Fully customisable on WhatsApp after placing your order here."
      ] },
    { id: "drawings-paintings", code: "SWP-008", name: "Drawings & Paintings", price: 499,
      image: "https://i.ytimg.com/vi/o2M7g_tuuBQ/hq720.jpg",
      desc: "Turn any image into a drawing or painting.",
      details: [
        "Made on 120 gsm A4 paper, unframed.",
        "Customise it as per your choice on WhatsApp after placing the order here.",
        "Your image is turned into a painting."
      ] },
    { id: "popup-cards", code: "SWP-009", name: "Simple Pop-up Cards", price: 129, minQty: 2,
      image: "https://i.ytimg.com/vi/IJcbflm3NgA/hq720.jpg",
      desc: "Pop-up cards, ideal for giving to kids or as add-ons to your main craft.",
      details: [
        "Every size is available.",
        "Available in vibrant colours and numerous patterns.",
        "Fully customisable on WhatsApp after placing your order here."
      ] },
    { id: "scrapbook-cards", code: "SWP-010", name: "Scrapbook Cards", price: 499,
      image: "https://i.ytimg.com/vi/Wi9ovOMgglo/hqdefault.jpg",
      desc: "Multi-page scrapbook cards, perfect for gifting.",
      details: [
        "Every size is available.",
        "Available in vibrant colours and numerous patterns.",
        "Fully customisable on WhatsApp after placing your order here."
      ] },
    { id: "realistic-rose-bouquet", code: "SWP-011", name: "Realistic Rose Bouquet", price: 349,
      image: "https://i.ytimg.com/vi/CyXEztyJl34/oardefault.jpg",
      desc: "Realistic ribbon-made rose bouquets for your loved ones.",
      details: [
        "Available in red and white.",
        "Any number of roses can be added.",
        "Your loved one's name is written on a tag attached to it.",
        "One of our most loved trending handmade gifts."
      ] },
    { id: "light-photo-frame", code: "SWP-012", name: "Light Photo Frame", price: 589,
      image: "https://i.ytimg.com/vi/SZXeyX7amMU/oardefault.jpg",
      desc: "A photo frame with golden lighting (electric, not battery-operated).",
      details: [
        "Frequently bought by our customers.",
        "Customise it on WhatsApp after placing the order here.",
        "Available for individuals, or for couples' weddings and engagements."
      ] },
    { id: "dreamcatcher-keyring", code: "SWP-013", name: "Dreamcatcher Keyring", price: 75, minQty: 2,
      image: "https://i.ytimg.com/vi/sAjdy8Xtw70/oardefault.jpg",
      desc: "A beautiful cloudy-sky-themed dreamcatcher, perfect for your special ones.",
      details: [
        "One of our most loved trending handmade gifts.",
        "Handmade with love."
      ] },
    { id: "birthday-timeline-card", code: "SWP-014", name: "1.25 Metre Long Special Birthday Timeline Card", price: 449,
      image: "https://i.ytimg.com/vi/NpWb5ulgXjU/oardefault.jpg",
      desc: "A perfect gift with lots of photos and love packed into a card.",
      details: [
        "About 125 cm long.",
        "Has 24 photos.",
        "Send your photos on WhatsApp after placing the order here.",
        "Available in vibrant colours."
      ] },
    { id: "heart-bookmark", code: "SWP-015", name: "Heart-Themed Bookmark", price: 29, minQty: 2,
      image: "https://i.ytimg.com/vi/cE9YDs3b25g/oar3.jpg",
      desc: "A perfect add-on for book lovers.",
      details: [
        "Available in many vibrant colours.",
        "Origami-based product."
      ] },
    { id: "origami-lotus", code: "SWP-016", name: "Origami Lotus", price: 129,
      image: "https://i.ytimg.com/vi/u_cvJFR0_aw/hq720.jpg",
      desc: "Add elegance to your table with this origami lotus.",
      details: [
        "Available in pink and red.",
        "Size can be customised through WhatsApp after placing your order here."
      ] }
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

  // Puts a Font Awesome icon in front of a line of text (instead of an emoji)
  function iconText(el, icon, text) {
    el.textContent = "";
    var i = document.createElement("i");
    i.className = "fa " + icon;
    i.setAttribute("aria-hidden", "true");
    el.appendChild(i);
    el.appendChild(document.createTextNode(" " + text));
  }

  function minQtyOf(p) { return (p && p.minQty) || 1; }

  // "Rs 499  Rs 699 (crossed out)  29% off" plus "each, min order 2" where it applies
  function fillPrice(el, p, withMin) {
    el.textContent = "";
    var now = document.createElement("span");
    now.className = "price-now";
    now.textContent = money(p.price);
    el.appendChild(now);
    if (p.mrp && p.mrp > p.price) {
      var old = document.createElement("s");
      old.className = "price-old";
      old.textContent = money(p.mrp);
      old.setAttribute("aria-label", "was " + money(p.mrp));
      var off = document.createElement("span");
      off.className = "price-off";
      off.textContent = Math.round((p.mrp - p.price) * 100 / p.mrp) + "% off";
      el.appendChild(old);
      el.appendChild(off);
    }
    if (withMin && minQtyOf(p) > 1) {
      var min = document.createElement("span");
      min.className = "price-min";
      min.textContent = "each \u00B7 minimum order " + minQtyOf(p);
      el.appendChild(min);
    }
  }

  // "Name (SWP-001)" for order lists, invoices and messages
  function itemLabel(it) { return it.code ? it.name + " (" + it.code + ")" : it.name; }

  /* ---------- Cart state ---------- */
  var cart = {}; // { productId: quantity }

  function loadCart() {
    try {
      var saved = JSON.parse(storeGet(CART_KEY) || "{}");
      Object.keys(saved).forEach(function (id) {
        var qty = parseInt(saved[id], 10);
        if (findProduct(id) && qty > 0) cart[id] = Math.min(Math.max(qty, minQtyOf(findProduct(id))), 99);
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
    var min = minQtyOf(findProduct(id));
    var add = qty || 1;
    if (!cart[id]) add = Math.max(add, min); // the first add always meets the minimum order
    cart[id] = Math.min((cart[id] || 0) + add, 99);
    saveCart();
    renderCart();
    bumpFab();
    toast(!qty && min > 1 && cart[id] === min ? "Added " + min + " (minimum order)" : "Added to cart");
  }

  function changeQty(id, delta) {
    var min = minQtyOf(findProduct(id));
    var next = (cart[id] || 0) + delta;
    if (delta < 0 && next < min && min > 1) {
      toast("Minimum order is " + min + ". Use Remove to delete it.");
      return;
    }
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
  var searchCursor = -1; // which search result Enter last jumped to

  function visibleProducts() {
    var term = searchTerm.trim().toLowerCase();
    var list = PRODUCTS.filter(function (p) {
      return !term || (p.name + " " + p.desc + " " + p.code).toLowerCase().indexOf(term) !== -1;
    });
    if (sortMode === "low") list.sort(function (x, y) { return x.price - y.price; });
    else if (sortMode === "high") list.sort(function (x, y) { return y.price - x.price; });
    else if (sortMode === "name") list.sort(function (x, y) { return x.name.localeCompare(y.name); });
    return list;
  }

  function renderProducts() {
    var grid = $("productGrid");
    var list = visibleProducts();
    searchCursor = -1; // the list changed, so Enter starts again from the first result
    grid.innerHTML = "";
    $("resultCount").textContent = list.length === PRODUCTS.length
      ? PRODUCTS.length + " products"
      : list.length + " of " + PRODUCTS.length + " products";
    if (searchTerm.trim() && list.length) {
      $("resultCount").textContent += ". Press Enter to jump to " + (list.length === 1 ? "it" : "each one") + ".";
    }

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
          '<div class="rating-line" hidden></div>' +
          '<p class="product-code"></p>' +
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
      card.setAttribute("data-pid", p.id);
      fillRating(card.querySelector(".rating-line"), p.id);
      card.querySelector(".product-desc").textContent = p.desc;
      card.querySelector(".product-code").textContent = "Product ID: " + p.code;
      fillPrice(card.querySelector(".product-price"), p, true);
      // Clicking anywhere on the card opens the product, except the Add to cart button.
      // (The name stays a real button so keyboard users can open it too; its click reaches the card.)
      card.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest(".add-btn")) return;
        var picked = window.getSelection ? String(window.getSelection()) : "";
        if (picked) return; // the person was selecting text, not tapping the card
        openProduct(p.id);
      });
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

  // "2 x Rs 499 = Rs 998" under the quantity, and the total on the Add to cart button
  function updatePmTotal() {
    if (!pmProduct) return;
    var total = pmProduct.price * pmQty;
    var line = $("pmTotal");
    line.hidden = pmQty <= 1;
    line.textContent = pmQty + " \u00D7 " + money(pmProduct.price) + " = " + money(total);
    $("pmAdd").textContent = pmQty > 1 ? "Add to cart \u00B7 " + money(total) : "Add to cart";
  }

  function openProduct(id) {
    var p = findProduct(id);
    if (!p) return;
    if (!pmProduct || pmProduct.id !== p.id) pmReviewsShown = 5;
    pmProduct = p;
    pmQty = minQtyOf(p);
    if ($("productModal").hidden) pmReturnFocus = document.activeElement; // already open when jumping to a recommended product
    $("pmImg").src = p.image;
    $("pmImg").alt = p.name;
    $("pmName").textContent = p.name;
    $("pmCode").textContent = "Product ID: " + p.code;
    fillPrice($("pmPrice"), p, true);
    $("pmDesc").textContent = p.desc;
    $("pmQty").textContent = String(pmQty);
    updatePmTotal();
    refreshEta();
    renderProductExtras();
    $("productModal").hidden = false;
    document.body.classList.add("store-locked");
    document.querySelector("#productModal .checkout-box").scrollTop = 0;
    setProductInUrl(p.id);
    $("pmAdd").focus({ preventScroll: true });
    ensureReviews().catch(function () { /* the product still opens without reviews */ });
  }


  /* ---------- Sharing a product (link opens that product) ---------- */
  function productUrl(id) {
    return location.origin + location.pathname + "?product=" + encodeURIComponent(id);
  }

  // Keeps the address bar in step with the open product, so copying it from the browser also works
  function setProductInUrl(id) {
    try {
      var u = new URL(location.href);
      if (id) u.searchParams.set("product", id); else u.searchParams.delete("product");
      history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch (e) { /* not important */ }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      if (ok) resolve(); else reject(new Error("copy failed"));
    });
  }

  function shareProduct() {
    if (!pmProduct) return;
    var url = productUrl(pmProduct.id);
    var data = { title: pmProduct.name, text: pmProduct.name + " at Shivam's World, " + money(pmProduct.price), url: url };
    if (navigator.share) {
      navigator.share(data).catch(function (err) {
        if (err && err.name === "AbortError") return; // the person closed the share sheet
        copyText(url).then(function () { toast("Link copied"); }, function () { toast("Couldn't share. Copy the link from the address bar."); });
      });
    } else {
      copyText(url).then(function () { toast("Link copied"); }, function () { toast("Couldn't copy. Copy the link from the address bar."); });
    }
  }


  /* ---------- Returns and replacements ---------- */
  var myReturns = {}; // orderId -> the customer's return request
  var RETURN_REASONS = [
    "Product arrived damaged", "Received the wrong item", "Quality is not as expected",
    "Not as described or shown", "Other"
  ];
  var RETURN_LABELS = {
    requested: "Return requested", approved: "Return approved", received: "Item received back",
    refunded: "Refund sent", replaced: "Replacement sent", rejected: "Return not approved"
  };
  var rtOrder = null, rtType = "refund", rtBusy = false, rtReturnFocus = null;
  var trackKind = "order"; // what the tracking window is showing: "order" or "return"

  function returnSteps(type) {
    return [
      { key: "requested", label: "Return requested" },
      { key: "approved", label: "Return approved" },
      { key: "received", label: "Item received back" },
      type === "replacement" ? { key: "replaced", label: "Replacement sent" } : { key: "refunded", label: "Refund sent" }
    ];
  }

  // Items total after any coupon. The delivery charge is not included.
  function netRefund(o) { return Math.max(0, Number(o.subtotal || 0) - Number(o.pointsUsed || 0) - Number(o.discount || 0)); }

  function inReturnWindow(o) {
    var t = o.updatedAt && o.updatedAt.toMillis ? o.updatedAt.toMillis() : (o.createdAt && o.createdAt.toMillis ? o.createdAt.toMillis() : Date.now());
    return Date.now() - t <= CONFIG.returnWindowDays * 86400000;
  }

  // Under a delivered order in My orders: ask for a return, or follow the one already made
  function returnPrompt(o) {
    var r = myReturns[o.id];
    var wrap = document.createElement("div");
    wrap.className = "review-prompt";
    var q = document.createElement("p");
    q.className = "review-q";
    var b = document.createElement("button");
    b.type = "button";
    b.className = "loc-btn";
    if (r) {
      q.textContent = (r.type === "replacement" ? "Replacement" : "Refund") + " request: " + (RETURN_LABELS[r.status] || RETURN_LABELS.requested);
      b.innerHTML = '<i class="fa fa-undo" aria-hidden="true"></i> Track return';
      b.addEventListener("click", function () { closeAccount(); openReturnTrack(o.id); });
    } else if (inReturnWindow(o)) {
      q.textContent = "Not happy with your order?";
      b.innerHTML = '<i class="fa fa-undo" aria-hidden="true"></i> Return or replace';
      b.addEventListener("click", function () { openReturn(o); });
    } else {
      q.textContent = "The " + CONFIG.returnWindowDays + "-day return period for this order has ended.";
      wrap.appendChild(q);
      return wrap;
    }
    wrap.appendChild(q);
    var row = document.createElement("div");
    row.className = "acct-order-actions";
    row.appendChild(b);
    wrap.appendChild(row);
    return wrap;
  }

  function setReturnType(t) {
    rtType = t;
    var btns = document.querySelectorAll("#returnModal .rt-opt");
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute("aria-pressed", String(btns[i].getAttribute("data-type") === t));
    }
    $("rtRefundBox").hidden = t !== "refund";
    $("rtAmountNote").textContent = t === "refund"
      ? "You will get " + money(netRefund(rtOrder)) + " back: what you paid for the items, after any points and coupon. The delivery charge is not refunded. Points you used come back to your balance."
      : "We will make and send you a replacement at no extra cost.";
    showError("rtError", "");
  }

  function openReturn(o) {
    if (!currentUser) return;
    rtOrder = o;
    $("rtOrderId").textContent = o.id;
    $("rtItems").textContent = (o.items || []).map(function (it) { return itemLabel(it) + " \u00D7 " + it.qty; }).join(", ");
    $("rtReason").selectedIndex = 0;
    $("rtReason").dispatchEvent(new Event("change")); // refreshes the styled dropdown
    $("rtDetails").value = "";
    ["rtUpi", "rtAccount", "rtAccount2", "rtIfsc"].forEach(function (id) { $(id).value = ""; });
    setReturnType("refund");
    rtReturnFocus = document.activeElement;
    $("returnModal").hidden = false;
    document.body.classList.add("store-locked");
    $("rtReason").focus();
  }

  function closeReturn() {
    if ($("returnModal").hidden) return;
    $("returnModal").hidden = true;
    var stillOpen = ["checkoutModal", "accountModal", "trackModal", "productModal", "reviewModal"].some(function (id) { return !$(id).hidden; }) ||
      $("cartDrawer").classList.contains("open");
    if (!stillOpen) document.body.classList.remove("store-locked");
    if (rtReturnFocus && rtReturnFocus.focus) rtReturnFocus.focus();
  }

  function submitReturn() {
    if (rtBusy || !rtOrder || !currentUser) return;
    var reason = $("rtReason").value;
    var details = $("rtDetails").value.trim().slice(0, 500);
    if (!reason) { showError("rtError", "Please choose a reason for the return."); return; }
    if (reason === "Other" && details.length < 5) { showError("rtError", "Please tell us a little more about the problem."); return; }
    var r = {
      orderId: rtOrder.id, uid: currentUser.uid, name: rtOrder.name, phone: rtOrder.phone, type: rtType,
      reason: reason, details: details, refundAmount: rtType === "refund" ? netRefund(rtOrder) : 0
    };
    if (rtType === "refund") {
      var upi = $("rtUpi").value.trim();
      var acc = $("rtAccount").value.replace(/\s+/g, "");
      var acc2 = $("rtAccount2").value.replace(/\s+/g, "");
      var ifsc = $("rtIfsc").value.trim().toUpperCase();
      if (!/^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9]{2,64}$/.test(upi)) { showError("rtError", "Enter a valid UPI ID, like name@bank."); return; }
      if (!/^[0-9]{9,18}$/.test(acc)) { showError("rtError", "Enter your bank account number (9 to 18 digits)."); return; }
      if (acc !== acc2) { showError("rtError", "The two account numbers don't match."); return; }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) { showError("rtError", "Enter a valid IFSC code, like SBIN0001234."); return; }
      r.upi = upi; r.account = acc; r.ifsc = ifsc;
    }
    var btn = $("rtSubmit");
    var label = btn.textContent;
    rtBusy = true;
    btn.disabled = true;
    btn.textContent = "Sending\u2026";
    showError("rtError", "");
    window.SWData.module().then(function (m) { return m.saveReturn(r); }).then(function () {
      myReturns[r.orderId] = { id: r.orderId, orderId: r.orderId, type: r.type, reason: r.reason, refundAmount: r.refundAmount, status: "requested" };
      closeReturn();
      toast("Return request sent");
      if (myOrdersList && !$("accountModal").hidden) renderMyOrders(myOrdersList);
    }).catch(function (err) {
      console.error(err);
      showError("rtError", "Couldn't send your request. Please try again. (A return can be made once, only for a delivered order.)");
    }).then(function () {
      rtBusy = false;
      btn.disabled = false;
      btn.textContent = label;
    });
  }

  // Return tracking uses the same window as order tracking
  function renderReturnTrack(orderId, r) {
    var box = $("trackResult");
    box.innerHTML = "";
    var head = document.createElement("h3");
    head.textContent = "Return for order " + orderId;
    box.appendChild(head);
    var updatedText = (r.updatedAt && r.updatedAt.toDate)
      ? "Updated " + r.updatedAt.toDate().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
      : "";

    var sum = document.createElement("p");
    sum.className = "track-note";
    sum.textContent = (r.type === "replacement" ? "Replacement" : "Refund of " + money(r.refundAmount)) + " \u00B7 Reason: " + (r.reason || "");
    box.appendChild(sum);

    if (r.status === "rejected") {
      var msg = document.createElement("p");
      msg.className = "track-msg error";
      msg.textContent = "This return was not approved. Message us on WhatsApp if you have any questions.";
      box.appendChild(msg);
    } else {
      var steps = returnSteps(r.type);
      var idx = 0;
      steps.forEach(function (s, i) { if (s.key === r.status) idx = i; });
      var ol = document.createElement("ol");
      ol.className = "track-steps";
      steps.forEach(function (s, i) {
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
    if (r.adminNote) {
      var note = document.createElement("p");
      note.className = "track-note";
      var strong = document.createElement("strong");
      strong.textContent = "Note from us: ";
      note.appendChild(strong);
      note.appendChild(document.createTextNode(r.adminNote));
      box.appendChild(note);
    }
    if (r.status === "rejected" && updatedText) {
      var upd = document.createElement("p");
      upd.className = "track-updated";
      upd.textContent = updatedText;
      box.appendChild(upd);
    }
  }

  function openReturnTrack(orderId) {
    if (!currentUser) return;
    trackKind = "return";
    lastTrack = null;
    trackReturnFocus = document.activeElement;
    $("trackTitle").textContent = "Return tracking";
    $("trackModal").hidden = false;
    document.body.classList.add("store-locked");
    showTrackMessage("Checking\u2026", false);
    var token = ++trackToken;
    var failed = function (err) {
      if (token !== trackToken) return;
      console.error(err);
      showTrackMessage("We couldn't open this return request.", true);
    };
    accountModule().then(function (m) {
      var stop = m.watchReturn(orderId, function (r) {
        if (token !== trackToken) return;
        if (!r) { failed(new Error("return not found")); return; }
        myReturns[orderId] = r;
        renderReturnTrack(orderId, r);
      }, failed);
      if (token === trackToken && !$("trackModal").hidden) trackStop = stop; else stop();
    }).catch(failed);
  }

  /* ---------- Reviews and ratings ---------- */
  var reviews = [];          // every review, loaded once from Firestore
  var reviewStats = {};      // productId -> { count, sum, avg, stars: [0, n1..n5], list: [...] }
  var reviewsPromise = null;
  var pmReviewsShown = 5;

  function productByName(name) {
    for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].name === name) return PRODUCTS[i];
    return null;
  }

  function tsMs(t) { return t && t.toMillis ? t.toMillis() : Date.now(); }

  function starsHtml(avg) {
    var h = '<span class="stars" aria-hidden="true">';
    for (var i = 1; i <= 5; i++) {
      h += '<i class="fa ' + (avg >= i ? "fa-star" : (avg >= i - 0.5 ? "fa-star-half-o" : "fa-star-o")) + '"></i>';
    }
    return h + "</span>";
  }

  // "★★★★☆ 4.5 (12)" for a product, hidden until it has at least one review
  function fillRating(el, pid) {
    var st = reviewStats[pid];
    if (!st) { el.hidden = true; el.innerHTML = ""; el.removeAttribute("aria-label"); return; }
    el.hidden = false;
    el.setAttribute("aria-label", "Rated " + st.avg.toFixed(1) + " out of 5 from " + st.count + (st.count === 1 ? " review" : " reviews"));
    el.innerHTML = starsHtml(st.avg) + '<span class="rating-num">' + st.avg.toFixed(1) + '</span><span class="rating-count">(' + st.count + ')</span>';
  }

  function buildReviewStats() {
    reviewStats = {};
    reviews.forEach(function (r) {
      var rating = Number(r.rating);
      if (!r.productId || !(rating >= 1 && rating <= 5)) return;
      var st = reviewStats[r.productId] || (reviewStats[r.productId] = { count: 0, sum: 0, avg: 0, stars: [0, 0, 0, 0, 0, 0], list: [] });
      st.count++;
      st.sum += rating;
      st.stars[Math.round(rating)]++;
      st.list.push(r);
    });
    Object.keys(reviewStats).forEach(function (pid) {
      var st = reviewStats[pid];
      st.avg = st.sum / st.count;
      st.list.sort(function (a, b) { return tsMs(b.createdAt) - tsMs(a.createdAt); });
    });
  }

  function myReview(orderId, pid) {
    for (var i = 0; i < reviews.length; i++) {
      if (reviews[i].orderId === orderId && reviews[i].productId === pid && currentUser && reviews[i].uid === currentUser.uid) return reviews[i];
    }
    return null;
  }

  // Redraws every place that shows ratings after the reviews change
  function onReviewsChanged() {
    buildReviewStats();
    var cards = document.querySelectorAll(".product-card[data-pid]");
    for (var i = 0; i < cards.length; i++) fillRating(cards[i].querySelector(".rating-line"), cards[i].getAttribute("data-pid"));
    if (!$("productModal").hidden) renderProductExtras();
    if (!$("accountModal").hidden && myOrdersList) renderMyOrders(myOrdersList);
    if (!$("trackModal").hidden && trackKind === "order" && lastTrack) renderTrackResult(lastTrack.id, lastTrack.data);
  }

  // Loads all reviews once (and again later if the first try failed)
  function ensureReviews() {
    if (!reviewsPromise) {
      reviewsPromise = window.SWData.module()
        .then(function (m) { return m.loadReviews(); })
        .then(function (list) { reviews = list; onReviewsChanged(); return list; })
        .catch(function (err) { reviewsPromise = null; console.error("Reviews could not load:", err); throw err; });
    }
    return reviewsPromise;
  }

  function reviewDate(t) {
    return new Date(tsMs(t)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  function makeProductRec(p) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "rec-card";
    b.innerHTML = '<img alt="" loading="lazy"><span class="rec-body"><span class="rec-name"></span><span class="rating-line" hidden></span><span class="rec-price"></span></span>';
    b.querySelector("img").src = p.image;
    b.querySelector(".rec-name").textContent = p.name;
    fillPrice(b.querySelector(".rec-price"), p, false);
    fillRating(b.querySelector(".rating-line"), p.id);
    b.addEventListener("click", function () { openProduct(p.id); });
    return b;
  }

  // Details, reviews and recommended products at the bottom of the product window
  function renderProductExtras() {
    var p = pmProduct;
    if (!p) return;
    fillRating($("pmRating"), p.id);

    // Details
    var facts = [];
    if (minQtyOf(p) > 1) facts.push("Minimum order: " + minQtyOf(p) + " pieces.");
    facts = facts.concat(p.details || []);
    facts.push("Made to order: takes about " + CONFIG.productionDays + " days to make before it is delivered.");
    facts.push("Flat " + money(CONFIG.deliveryCharge) + " delivery on every order.");
    var ul = $("pmDetails");
    ul.innerHTML = "";
    facts.forEach(function (f) {
      var li = document.createElement("li");
      li.textContent = f;
      ul.appendChild(li);
    });

    // Reviews
    var st = reviewStats[p.id];
    var sum = $("pmReviewSummary");
    var list = $("pmReviews");
    var more = $("pmMoreReviews");
    sum.innerHTML = "";
    list.innerHTML = "";
    more.hidden = true;
    if (!st) {
      var none = document.createElement("p");
      none.className = "rv-empty";
      none.textContent = "No reviews yet. After an order is delivered, customers can rate it from My orders.";
      list.appendChild(none);
    } else {
      var big = document.createElement("div");
      big.className = "rv-big";
      big.innerHTML = "<strong>" + st.avg.toFixed(1) + "</strong>" + starsHtml(st.avg) + '<span class="rating-count">' + st.count + (st.count === 1 ? " review" : " reviews") + "</span>";
      var bars = document.createElement("div");
      bars.className = "rv-bars";
      for (var n = 5; n >= 1; n--) {
        var row = document.createElement("div");
        row.className = "rv-bar";
        row.innerHTML = "<span>" + n + '</span><span class="track"><span class="fill"></span></span><span></span>';
        row.querySelector(".fill").style.width = Math.round(st.stars[n] * 100 / st.count) + "%";
        row.lastChild.textContent = st.stars[n];
        bars.appendChild(row);
      }
      sum.appendChild(big);
      sum.appendChild(bars);
      st.list.slice(0, pmReviewsShown).forEach(function (r) {
        var item = document.createElement("div");
        item.className = "rv-item";
        item.innerHTML = '<div class="rv-head">' + starsHtml(Number(r.rating)) + '<span class="rv-name"></span><span class="rv-date"></span></div>';
        item.querySelector(".rv-name").textContent = r.name || "Customer";
        item.querySelector(".rv-date").textContent = reviewDate(r.createdAt);
        if (r.text) {
          var t = document.createElement("p");
          t.className = "rv-text";
          t.textContent = r.text;
          item.appendChild(t);
        }
        list.appendChild(item);
      });
      if (st.list.length > pmReviewsShown) {
        more.hidden = false;
        more.textContent = "Show more reviews (" + (st.list.length - pmReviewsShown) + " more)";
      }
    }

    // Recommended products: best rated first, then the rest in store order
    var recs = PRODUCTS.filter(function (x) { return x.id !== p.id; });
    recs.sort(function (a, b) {
      var ra = reviewStats[a.id] ? reviewStats[a.id].avg : 0;
      var rb = reviewStats[b.id] ? reviewStats[b.id].avg : 0;
      return rb - ra;
    });
    var box = $("pmRecs");
    box.innerHTML = "";
    recs.slice(0, 4).forEach(function (x) { box.appendChild(makeProductRec(x)); });
    $("pmRecsSec").hidden = !recs.length;
  }

  /* ----- Writing a review (only for items in a delivered order) ----- */
  var rvOrder = null, rvProduct = null, rvRating = 0, rvReturnFocus = null, rvBusy = false;

  function paintReviewStars() {
    var btns = $("rvStars").querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      var on = i + 1 <= rvRating;
      btns[i].classList.toggle("on", on);
      btns[i].setAttribute("aria-pressed", String(i + 1 === rvRating));
      btns[i].firstChild.className = "fa " + (on ? "fa-star" : "fa-star-o");
    }
    $("rvRatingText").textContent = rvRating ? ["", "Poor", "Fair", "Good", "Very good", "Excellent"][rvRating] : "Tap a star to rate";
  }

  function openReview(orderId, pid) {
    var p = findProduct(pid);
    if (!p || !currentUser) return;
    ensureReviews().then(function () {
      var mine = myReview(orderId, pid);
      rvOrder = orderId;
      rvProduct = p;
      rvRating = mine ? Number(mine.rating) : 0;
      $("rvImg").src = p.image;
      $("rvName").textContent = p.name;
      $("rvText").value = mine ? (mine.text || "") : "";
      $("rvSubmit").textContent = mine ? "Update review" : "Submit review";
      showError("rvError", "");
      paintReviewStars();
      rvReturnFocus = document.activeElement;
      $("reviewModal").hidden = false;
      document.body.classList.add("store-locked");
      $("rvStars").querySelector("button").focus();
    }).catch(function () {
      toast("Reviews aren't available right now. Please try again later.");
    });
  }

  function closeReview() {
    if ($("reviewModal").hidden) return;
    $("reviewModal").hidden = true;
    var stillOpen = ["checkoutModal", "accountModal", "trackModal", "productModal", "returnModal"].some(function (id) { return !$(id).hidden; }) ||
      $("cartDrawer").classList.contains("open");
    if (!stillOpen) document.body.classList.remove("store-locked");
    if (rvReturnFocus && rvReturnFocus.focus) rvReturnFocus.focus();
  }

  function submitReview() {
    if (rvBusy || !rvProduct || !currentUser) return;
    if (!rvRating) { showError("rvError", "Please tap a star to rate this product."); return; }
    var text = $("rvText").value.trim().slice(0, 500);
    var full = ((profile && profile.name) || currentUser.name || "").trim().split(/\s+/);
    var name = full[0] ? (full.length > 1 ? full[0] + " " + full[full.length - 1].charAt(0).toUpperCase() + "." : full[0]) : "Customer";
    var mine = myReview(rvOrder, rvProduct.id);
    var btn = $("rvSubmit");
    var label = btn.textContent;
    rvBusy = true;
    btn.disabled = true;
    btn.textContent = "Saving\u2026";
    showError("rvError", "");
    window.SWData.module().then(function (m) {
      return m.saveReview({ orderId: rvOrder, productId: rvProduct.id, uid: currentUser.uid, name: name, rating: rvRating, text: text, exists: !!mine });
    }).then(function () {
      var now = { toMillis: function () { return Date.now(); } };
      if (mine) { mine.rating = rvRating; mine.text = text; }
      else reviews.push({ id: rvOrder + "_" + rvProduct.id, productId: rvProduct.id, orderId: rvOrder, uid: currentUser.uid, name: name, rating: rvRating, text: text, createdAt: now });
      toast(mine ? "Review updated" : "Thanks for your review!");
      closeReview();
      onReviewsChanged();
    }).catch(function (err) {
      console.error(err);
      showError("rvError", "Couldn't save your review. Please try again. (Reviews open once the order is marked delivered.)");
    }).then(function () {
      rvBusy = false;
      btn.disabled = false;
      btn.textContent = label;
    });
  }

  // "Rate & review" buttons for the items of a delivered order (null if nothing can be reviewed)
  function reviewPrompt(orderId, items) {
    var seen = {};
    var prods = [];
    (items || []).forEach(function (it) {
      var p = (it.id && findProduct(it.id)) || productByName(it.name);
      if (p && !seen[p.id]) { seen[p.id] = true; prods.push(p); }
    });
    if (!prods.length) return null;
    var wrap = document.createElement("div");
    wrap.className = "review-prompt";
    var q = document.createElement("p");
    q.className = "review-q";
    q.textContent = "Delivered. How was it? Share your review:";
    wrap.appendChild(q);
    var row = document.createElement("div");
    row.className = "acct-order-actions";
    prods.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "loc-btn";
      var mine = myReview(orderId, p.id);
      b.innerHTML = '<i class="fa ' + (mine ? "fa-pencil" : "fa-star") + '" aria-hidden="true"></i> ';
      b.appendChild(document.createTextNode((mine ? "Edit your review: " : "Rate & review: ") + p.name));
      b.addEventListener("click", function () { openReview(orderId, p.id); });
      row.appendChild(b);
    });
    wrap.appendChild(row);
    return wrap;
  }

  function closeProduct() {
    $("productModal").hidden = true;
    setProductInUrl(null);
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
          '<div class="cart-row-code"></div>' +
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
      row.querySelector(".cart-row-code").textContent = p.code;
      row.querySelector(".cart-row-price").textContent = money(p.price) + " each" + (minQtyOf(p) > 1 ? " \u00B7 minimum order " + minQtyOf(p) : "");
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
    refreshEta();
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
      pointsUsed: o.pointsUsed, pointsEarned: o.pointsEarned, pointsBalance: o.pointsBalance,
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
      return { id: p.id, code: p.code, name: p.name, qty: cart[id], price: p.price };
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
      pointsUsed: pointsUsed(),
      pointsEarned: pointsEarnedNow(),
      pointsBalance: pointsBalance,
      couponCode: appliedCoupon ? appliedCoupon.code : "",
      couponKey: appliedCoupon && appliedCoupon.key ? appliedCoupon.key : "",
      uid: currentUser ? currentUser.uid : "",
      total: orderTotal(),
      location: checkoutLoc.get() ? { lat: checkoutLoc.get().lat, lng: checkoutLoc.get().lng } : null
    };

    $("payOrderId").textContent = order.id;
    $("payAmount").textContent = money(order.total);
    $("payBreakdown").textContent = "Items " + money(order.subtotal) +
      (order.pointsUsed ? " \u2212 points " + money(order.pointsUsed) : "") +
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
      lines.push((i + 1) + ". " + itemLabel(it) + " x " + it.qty + " = " + money(it.price * it.qty));
    });
    lines.push("",
      "Items subtotal: " + money(order.subtotal),
      order.pointsUsed ? "Reward points used: " + order.pointsUsed + " (-" + money(order.pointsUsed) + ")" : "Reward points used: none",
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
    if (order.pointsEarned > 0) {
      iconText($("doneEarn"), "fa-star", "You'll earn " + order.pointsEarned + " point" + (order.pointsEarned === 1 ? "" : "s") + " once this order is delivered.");
    } else {
      $("doneEarn").textContent = "";
    }
    $("waAgainBtn").setAttribute("href", url);
    showStep("done");

    // Order is handed off: empty the cart and start a fresh order ID next time.
    cart = {};
    saveCart();
    renderCart();
    order = null;
    usePoints = false;
    checkoutLoc.clear();
    checkoutLoc.hideMap();
    resetCoupon();

    if (!opened) toast("Tap Open WhatsApp to send your order");
  }

  /* ---------- Reward points ---------- */
  var pointsBalance = 0;   // live balance from the customer's wallet
  var usePoints = false;   // the "use my points" tick box
  var walletStop = null;

  // The most points that can be used on this cart: the whole balance, but never more than the items cost
  function pointsUsable() {
    var max = Math.min(pointsBalance, cartTotal());
    return pointsBalance >= CONFIG.pointsMinRedeem && max >= CONFIG.pointsMinRedeem ? max : 0;
  }
  // 1 point = Rs 1. Points come off the items price first, then any coupon is worked out on what is left.
  function pointsUsed() { return usePoints && currentUser ? pointsUsable() : 0; }

  /* ---------- Coupon ---------- */
  var appliedCoupon = null; // { code, percent } once a valid code is applied

  function discountAmount() {
    return appliedCoupon ? Math.round((cartTotal() - pointsUsed()) * appliedCoupon.percent / 100) : 0;
  }
  function orderTotal() {
    return cartTotal() - pointsUsed() - discountAmount() + CONFIG.deliveryCharge;
  }
  // 1 point for every full Rs 100 paid for the items
  function pointsEarnedNow() {
    return Math.floor((cartTotal() - pointsUsed() - discountAmount()) / 100);
  }

  function renderPointsBox() {
    var box = $("pointsBox");
    var usable = pointsUsable();
    var min = CONFIG.pointsMinRedeem;
    if (!usable) usePoints = false;
    $("usePointsRow").hidden = !usable;
    $("usePoints").checked = usePoints && !!usable;
    if (usable) {
      $("pointsLabel").textContent = "Use my points: " + usable + " point" + (usable === 1 ? "" : "s") + " = \u2212" + money(usable);
      $("pointsHint").textContent = "Points are taken off first, then any coupon applies to what is left.";
    } else if (pointsBalance > 0 && pointsBalance < min) {
      $("pointsHint").textContent = "You have " + pointsBalance + " point" + (pointsBalance === 1 ? "" : "s") + ". Collect " + min + " to use them (" + (min - pointsBalance) + " more).";
    } else if (pointsBalance >= min) {
      $("pointsHint").textContent = "Points can be used on orders of " + money(min) + " or more.";
    } else {
      $("pointsHint").textContent = "Earn 1 point for every \u20B9100 you spend. 1 point = \u20B91. Use them once you have " + min + ".";
    }
    box.hidden = !currentUser;
  }

  function renderSummary() {
    var disc = discountAmount();
    var pts = pointsUsed();
    renderPointsBox();
    $("sumSubtotal").textContent = money(cartTotal());
    $("sumPointsRow").hidden = !pts;
    $("sumPointsLabel").textContent = "Points used (" + pts + ")";
    $("sumPoints").textContent = "\u2212" + money(pts);
    $("sumDiscountRow").hidden = !disc;
    $("sumDiscount").textContent = "\u2212" + money(disc);
    $("sumDelivery").textContent = money(CONFIG.deliveryCharge);
    $("sumTotal").textContent = money(orderTotal());
    var earn = pointsEarnedNow();
    iconText($("pointsEarnNote"), "fa-star", earn > 0
      ? "You'll earn " + earn + " point" + (earn === 1 ? "" : "s") + " when this order is delivered."
      : "Spend \u20B9100 or more on items to earn points.");
  }

  // Shows the balance in My account and refreshes anything that depends on it
  function renderPoints() {
    $("acctPoints").textContent = pointsBalance + (pointsBalance === 1 ? " point" : " points");
    $("acctPointsValue").textContent = "Worth " + money(pointsBalance) + (pointsBalance >= CONFIG.pointsMinRedeem ? ". Ready to use at checkout." : ". Use them once you have " + CONFIG.pointsMinRedeem + ".");
    renderSummary();
  }

  function startWallet(uid) {
    stopWallet();
    accountModule().then(function (m) {
      var stop = m.watchWallet(uid, function (w) {
        pointsBalance = w && Number(w.balance) > 0 ? Math.floor(Number(w.balance)) : 0;
        renderPoints();
      }, function (err) { console.error("Points could not load:", err); });
      if (currentUser && currentUser.uid === uid) walletStop = stop; else stop();
    }).catch(function (err) { console.error(err); });
  }
  function stopWallet() {
    if (walletStop) walletStop();
    walletStop = null;
    pointsBalance = 0;
    usePoints = false;
    if ($("acctPoints")) renderPoints();
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
      iconText(text, "fa-map-marker", "Location pinned: " + picked.lat.toFixed(5) + ", " + picked.lng.toFixed(5) +
        (accuracy ? " (GPS accuracy about " + Math.round(accuracy) + " m, drag the pin if it's off)" : "") + " ");
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
      if (ids.onChange) ids.onChange();
    }

    function clear() {
      picked = null;
      renderStatus();
      if (ids.onChange) ids.onChange();
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

  /* ---------- Estimated delivery time (from the production place) ---------- */
  function distanceKm(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function etaDay(daysFromNow) {
    var d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  }

  // "Sat, 17 Oct to Sun, 18 Oct" for a pinned location, or "" when there is no usable location
  function etaFor(loc) {
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return "";
    var road = distanceKm(CONFIG.productionLocation, loc) * CONFIG.roadFactor;
    var tier = CONFIG.deliveryTiers[CONFIG.deliveryTiers.length - 1];
    for (var i = 0; i < CONFIG.deliveryTiers.length; i++) {
      if (road <= CONFIG.deliveryTiers[i].upToKm) { tier = CONFIG.deliveryTiers[i]; break; }
    }
    var from = etaDay(CONFIG.productionDays + tier.minDays);
    var to = etaDay(CONFIG.productionDays + tier.maxDays);
    return from === to ? from : from + " to " + to;
  }

  // The most recently chosen location: checkout pin, account pin, then the saved account location
  function knownLocation() {
    return (checkoutLoc && checkoutLoc.get()) || (acctLoc && acctLoc.get()) ||
      (profile && profile.location && typeof profile.location.lat === "number" ? profile.location : null);
  }

  var ETA_HINTS = {
    pmEta: "Add your location at checkout to see the estimated delivery time.",
    cartEta: "Add your location at checkout to see the estimated delivery time.",
    locEta: "Add your location above to see the estimated delivery time.",
    acctEta: "Save your location to see the estimated delivery time on every order."
  };

  // Fills every estimate line on the page: the date range if a location is known, else the hint
  function refreshEta() {
    var loc = knownLocation();
    var when = etaFor(loc);
    Object.keys(ETA_HINTS).forEach(function (id) {
      var el = $(id);
      if (!el) return;
      if (when) {
        iconText(el, "fa-truck", "Estimated delivery: " + when + " (includes " + CONFIG.productionDays + " days to make your order)");
        el.classList.remove("eta-hint");
      } else {
        iconText(el, "fa-map-marker", ETA_HINTS[id]);
        el.classList.add("eta-hint");
      }
    });
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
    refreshEta();
  }

  function renderCheckoutAuth() {
    $("checkoutAuthNote").textContent = currentUser ? "Signed in as " + currentUser.email + "." : "";
    $("saveDetailsRow").hidden = !currentUser;
  }

  /* ----- Agree to the Terms and Privacy Policy before signing in ----- */
  var consentResolve = null, consentReturnFocus = null;

  function updateConsentButton() {
    var ok = $("csCheck").checked;
    $("csContinue").setAttribute("aria-disabled", String(!ok));
    $("csContinue").classList.toggle("is-disabled", !ok);
    if (ok) showError("csError", "");
  }

  // Resolves true once the person ticks the box and continues, false if they close the window
  function askConsent() {
    return new Promise(function (resolve) {
      if (!$("consentModal").hidden) { resolve(false); return; }
      consentResolve = resolve;
      $("csCheck").checked = false;
      updateConsentButton();
      showError("csError", "");
      consentReturnFocus = document.activeElement;
      $("consentModal").hidden = false;
      document.body.classList.add("store-locked");
      $("csCheck").focus();
    });
  }

  function closeConsent(agreed) {
    if ($("consentModal").hidden) return;
    $("consentModal").hidden = true;
    var stillOpen = ["checkoutModal", "accountModal", "trackModal", "productModal", "reviewModal", "returnModal"].some(function (id) { return !$(id).hidden; }) ||
      $("cartDrawer").classList.contains("open");
    if (!stillOpen) document.body.classList.remove("store-locked");
    if (consentReturnFocus && consentReturnFocus.focus) consentReturnFocus.focus();
    var done = consentResolve;
    consentResolve = null;
    if (done) done(!!agreed);
  }

  // Resolves with the signed-in user, or nothing if they did not agree, closed the pop-up or it failed
  function signIn() {
    return askConsent().then(function (agreed) {
      if (!agreed) return;
      return googleSignIn();
    });
  }

  function googleSignIn() {
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
      myReturns = {};
      stopWallet();
      renderAccountButton();
      if (!$("checkoutModal").hidden) { closeCheckout(); toast("Please sign in to place your order"); }
      if (!$("reviewModal").hidden) closeReview();
      if (!$("returnModal").hidden) closeReturn();
      if (!$("accountModal").hidden) closeAccount();
      if (!$("trackModal").hidden) closeTrack();
      if (pendingTrack) toast("Sign in with Google to see your order status");
      return;
    }
    currentUser = { uid: user.uid, name: user.displayName || "", email: user.email || "" };
    renderAccountButton();
    startWallet(user.uid);
    accountModule()
      .then(function (m) { return m.loadProfile(user.uid); })
      .then(function (p) {
        profile = p;
        refreshEta();
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
        refreshEta();
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

  var myOrdersList = null; // last list shown, so it can be redrawn when reviews change
  var lastTrack = null;    // last tracked order, same reason

  function renderMyOrders(list) {
    myOrdersList = list;
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
      items.textContent = (o.items || []).map(function (it) { return itemLabel(it) + " \u00D7 " + it.qty; }).join(", ");
      card.appendChild(items);

      var pts = [];
      if (o.pointsUsed > 0) pts.push("Points used: " + o.pointsUsed + " (\u2212" + money(o.pointsUsed) + ")");
      if (o.pointsEarned > 0 && o.status !== "cancelled") {
        pts.push(o.pointsCredited ? "Points earned: " + o.pointsEarned + " (added to your balance)" : "Points to earn: " + o.pointsEarned + " (added after delivery)");
      }
      if (pts.length) {
        var ptsLine = document.createElement("p");
        ptsLine.className = "acct-points-line";
        iconText(ptsLine, "fa-star", pts.join(" \u00B7 "));
        card.appendChild(ptsLine);
      }

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
      if (o.status === "delivered") {
        var rp = reviewPrompt(o.id, o.items);
        if (rp) card.appendChild(rp);
        card.appendChild(returnPrompt(o));
      }
      box.appendChild(card);
    });
    if (doScroll) scrollToOrdersHead(); // the list has its full height now
  }

  function startMyOrders() {
    var token = ++ordersToken;
    $("acctOrders").textContent = "Loading your orders\u2026";
    accountModule().then(function (m) {
      var stopOrdersNow = m.watchMyOrders(currentUser.uid, renderMyOrders, function (err) {
        console.error(err);
        $("acctOrders").textContent = "Couldn't load your orders right now. Please try again later.";
      });
      var stopReturnsNow = m.watchMyReturns(currentUser.uid, function (list) {
        myReturns = {};
        list.forEach(function (r) { myReturns[r.orderId || r.id] = r; });
        if (!$("accountModal").hidden && myOrdersList) renderMyOrders(myOrdersList);
      }, function (err) { console.error("Returns could not load:", err); });
      var stop = function () { stopOrdersNow(); stopReturnsNow(); };
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
    lastTrack = { id: id, data: data };
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
    if (data.status === "delivered") {
      var rp = reviewPrompt(id, data.items);
      if (rp) box.appendChild(rp);
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
    trackKind = "order";
    $("trackTitle").textContent = "Order tracking";
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
        renderTrackResult(id, { status: o.status, note: o.adminNote, items: o.items, updatedAt: o.updatedAt || o.createdAt });
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
  // A shared link like store.html?product=cards opens that product straight away
  function openProductFromLink() {
    var id = "";
    try { id = new URLSearchParams(location.search).get("product") || ""; } catch (e) { return; }
    if (!id) return;
    if (findProduct(id)) openProduct(id); else setProductInUrl(null); // unknown product: just show the store
  }

  function init() {
    loadCart();
    checkoutLoc = createLocationPicker({ gps: "gpsBtn", choose: "mapBtn", error: "locError", mapBox: "mapBox", map: "map", status: "locStatus", onChange: refreshEta });
    acctLoc = createLocationPicker({ gps: "acctGpsBtn", choose: "acctMapBtn", error: "acctLocError", mapBox: "acctMapBox", map: "acctMap", status: "acctLocStatus", onChange: refreshEta });
    if (window.SWUI) {
      window.SWUI.customSelect($("sortSelect"), { label: "Sort by" });
      window.SWUI.customSelect($("rtReason"), { label: "Reason for return" });
      // every pop-up window (and the cart's backdrop) fades/pops on open and close
      ["checkoutModal", "accountModal", "trackModal", "productModal", "reviewModal", "returnModal", "consentModal", "cartOverlay"].forEach(function (id) {
        window.SWUI.animateModal($(id));
      });
    }
    renderProducts();
    renderCart();
    setupThemeAndMenu();
    openProductFromLink();

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
    // Enter jumps to the next matching product (Shift+Enter: previous) and pulses it purple
    var lastJumpAt = 0;
    function jumpToResult(step) {
      if (!searchTerm.trim()) return;
      var cards = $("productGrid").querySelectorAll(".product-card");
      if (!cards.length) return;
      if (searchCursor >= cards.length) searchCursor = -1;
      if (searchCursor < 0 && step < 0) searchCursor = 0;
      searchCursor = (searchCursor + step + cards.length) % cards.length;
      var card = cards[searchCursor];
      card.scrollIntoView({ block: "center", behavior: "smooth" });
      Array.prototype.forEach.call(cards, function (c) { c.classList.remove("pulse"); });
      void card.offsetWidth; // restart the animation if it is the same card
      card.classList.add("pulse");
      setTimeout(function () { card.classList.remove("pulse"); }, 1900);
      $("resultCount").textContent = "Result " + (searchCursor + 1) + " of " + cards.length + ". Press Enter for the next one.";
    }
    function handleEnter(shift) {
      var now = Date.now();
      if (now - lastJumpAt < 150) return; // keydown and submit can both fire for one press
      lastJumpAt = now;
      jumpToResult(shift ? -1 : 1);
    }
    $("searchInput").addEventListener("keydown", function (e) {
      if (e.isComposing) return;
      if (e.key !== "Enter" && e.keyCode !== 13) return;
      e.preventDefault();
      handleEnter(e.shiftKey);
    });
    // Fallback for mobile keyboards that submit the form instead of sending a normal Enter key
    $("searchForm").addEventListener("submit", function (e) {
      e.preventDefault();
      handleEnter(false);
    });
    $("sortSelect").addEventListener("change", function () { sortMode = this.value; renderProducts(); });
    $("pmClose").addEventListener("click", closeProduct);
    $("pmShare").addEventListener("click", shareProduct);
    $("pmMoreReviews").addEventListener("click", function () { pmReviewsShown += 5; renderProductExtras(); });
    // review window
    $("rvClose").addEventListener("click", closeReview);
    $("reviewModal").addEventListener("click", function (e) { if (e.target === $("reviewModal")) closeReview(); });
    $("rvStars").addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("button[data-v]") : null;
      if (!b) return;
      rvRating = Number(b.getAttribute("data-v"));
      paintReviewStars();
      showError("rvError", "");
    });
    $("rvSubmit").addEventListener("click", submitReview);
    // reward points tick box
    $("usePoints").addEventListener("change", function () { usePoints = this.checked; renderSummary(); });
    // sign-in agreement window
    $("csCheck").addEventListener("change", updateConsentButton);
    $("csClose").addEventListener("click", function () { closeConsent(false); });
    $("consentModal").addEventListener("click", function (e) { if (e.target === $("consentModal")) closeConsent(false); });
    $("csContinue").addEventListener("click", function () {
      if (!$("csCheck").checked) {
        showError("csError", "Please tick the box to agree before you continue.");
        $("csCheck").focus();
        return;
      }
      closeConsent(true);
    });
    // return window
    $("rtClose").addEventListener("click", closeReturn);
    $("returnModal").addEventListener("click", function (e) { if (e.target === $("returnModal")) closeReturn(); });
    $("rtSubmit").addEventListener("click", submitReturn);
    $("returnModal").querySelector(".rt-options").addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("button[data-type]") : null;
      if (b) setReturnType(b.getAttribute("data-type"));
    });
    $("rtAccount").addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 18); });
    $("rtAccount2").addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 18); });
    $("rtIfsc").addEventListener("input", function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11); });
    // ratings load quietly after the page is ready; the store works without them
    setTimeout(function () { ensureReviews().catch(function () {}); }, 1200);
    $("productModal").addEventListener("click", function (e) {
      if (e.target === $("productModal")) closeProduct();
    });
    $("pmMinus").addEventListener("click", function () {
      var min = minQtyOf(pmProduct);
      if (pmQty <= min && min > 1) toast("Minimum order is " + min);
      pmQty = Math.max(min, pmQty - 1);
      $("pmQty").textContent = pmQty;
      updatePmTotal();
    });
    $("pmPlus").addEventListener("click", function () {
      pmQty = Math.min(99, pmQty + 1);
      $("pmQty").textContent = pmQty;
      updatePmTotal();
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
      if (!$("consentModal").hidden) closeConsent(false);
      else if (!$("returnModal").hidden) closeReturn();
      else if (!$("reviewModal").hidden) closeReview();
      else if (!$("checkoutModal").hidden) closeCheckout();
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


/* ---------- 3b. Store widgets shared with the homepage ----------
   Floral quick menu (dark mode, subscribe, call, share), scroll-to-top button, share button and the
   AI assistant. Each block does nothing when its buttons are not on the page, so admin.html is not affected.
   (Dark mode itself is wired up in section 3, from the floral menu's first petal.) */

/* ---------- Floral Quick Menu ---------- */
(function () {
  const menu = document.getElementById("floralMenu");
  const mainBtn = document.getElementById("floralMain");
  if (!menu || !mainBtn) return;
  const mainIcon = mainBtn.querySelector("i");

  function closeMenu() {
    menu.classList.remove("open");
    mainBtn.setAttribute("aria-expanded", "false");
    if (mainIcon) mainIcon.className = "fa fa-plus";
  }

  mainBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    const isOpen = menu.classList.toggle("open");
    mainBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (mainIcon) mainIcon.className = "fa fa-plus";
  });

  // Close after tapping any petal (its own click handler still fires first)
  menu.querySelectorAll(".petal").forEach(function (petal) {
    petal.addEventListener("click", closeMenu);
  });

  // Close when tapping anywhere outside the menu
  document.addEventListener("click", function (e) {
    if (!menu.contains(e.target)) closeMenu();
  });
})();

/* ---------- Scroll-to-Top Button ---------- */
(function () {
  const topBtn = document.getElementById("topBtn");
  if (!topBtn) return;

  // The "show" class (not display:none) lets the button fade and slide in and out
  function updateTopBtn() {
    topBtn.classList.toggle("show", document.body.scrollTop > 120 || document.documentElement.scrollTop > 120);
  }
  window.addEventListener("scroll", updateTopBtn);
  updateTopBtn(); // the page may already be scrolled when it loads

  topBtn.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
})();

/* ---------- Share Button (store version: shares the page you are on, e.g. an open product link) ---------- */
(function () {
  const shareBtn = document.getElementById("shareBtn");
  if (!shareBtn) return;

  // Small message at the bottom of the store (falls back to an alert on pages without the toast)
  function note(msg) {
    const t = document.getElementById("toast");
    if (!t) { alert(msg); return; }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(note._timer);
    note._timer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  shareBtn.addEventListener("click", async function () {
    const data = {
      title: "Store - Shivam's World",
      text: "Check out the Shivam's World store - handmade gifts, cards, calligraphy & much more!",
      url: window.location.href,
    };
    if (navigator.share) {
      try {
        await navigator.share(data);
      } catch (error) {
        if (error && error.name !== "AbortError") console.error("Error sharing:", error);
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        note("Link copied to clipboard");
      } catch {
        note("Sharing isn't supported here. Copy the link from the address bar.");
      }
    }
  });
})();

(function () {
  const widget = document.getElementById("aiWidget");
  const toggleBtn = document.getElementById("aiToggleBtn");
  const chatWindow = document.getElementById("aiChatWindow");
  const closeBtn = document.getElementById("aiCloseBtn");
  const messagesEl = document.getElementById("aiChatMessages");
  const form = document.getElementById("aiChatForm");
  const input = document.getElementById("aiChatInput");
  const sendBtn = document.getElementById("aiSendBtn");
  const previewBubble = document.getElementById("aiPreviewBubble");
  const previewText = document.getElementById("aiPreviewText");
  const micBtn = document.getElementById("aiMicBtn");
  if (!widget || !toggleBtn || !chatWindow) return;

  let stopListening = function () {};

  const WELCOME_MSG =
    "Hi! Ask me about the DIYs, calligraphy, sketches, custom orders — or anything else.";

  // Speech-bubble teasers next to the assistant button (store page version)
  const previewMessages = [
    "Need help choosing a gift?",
    "Ask how to customise your order.",
    "Ask about delivery time.",
    "Ask about offers and coupons.",
    "Ask how to track your order.",
    "Ask about returns and refunds.",
  ];

  // Conversation lives in memory only for the current page load — nothing
  // is written to localStorage, so it starts fresh on every visit/refresh.
  let history = [];
  let isTyping = false;
  const ttsSupported = "speechSynthesis" in window;

  /* ---------------------------------------------------------
     Header height sync — keeps --header-h current so the chat
     panel's max-height (set in CSS) can never grow tall enough
     to sit behind the sticky header.
  --------------------------------------------------------- */
  (function syncHeaderHeight() {
    const header = document.querySelector("header");
    if (!header) return;
    function measure() {
      const h = header.getBoundingClientRect().height;
      if (h > 0) {
        document.documentElement.style.setProperty("--header-h", h + "px");
      }
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    // Header height can change when the mobile nav wraps/opens. The same
    // observer also closes the assistant the moment the nav opens, so the
    // panel never sits half-visible behind the full-screen nav overlay.
    const nav = document.getElementById("mainNav");
    if (nav) {
      const obs = new MutationObserver(function () {
        measure();
        if (nav.classList.contains("show") && widget.classList.contains("open")) {
          closeChat();
        }
      });
      obs.observe(nav, { attributes: true, attributeFilter: ["class"] });
    }
    setTimeout(measure, 400); // catch late font/layout shifts
  })();

  /* ---------------------------------------------------------
     Markdown-lite rendering: escape HTML first for safety, then
     convert **bold** to <strong>, then any remaining single
     *emphasis* to a semi-bold span. Order matters — bold must be
     processed first so double-asterisk pairs aren't mistaken for
     two single-asterisk emphasis markers.
  --------------------------------------------------------- */
  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Matches domain-like text even without a protocol (e.g.
  // "youtube.com/c/ShivamsWorld"), restricted to a known-TLD allowlist to
  // keep false positives (version numbers, "e.g.", etc.) rare. The
  // negative lookbehind keeps it from grabbing the domain half of an
  // email address.
  const BARE_DOMAIN_RE =
    /(?<!@)\b((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|app|in|co|io|link|me)(?:\/[^\s<>"')\]]*)?)/gi;

  const EMAIL_RE = /[\w.+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;

  // Matches "+91 9005325544", "+919005325544" (no separator), or a bare
  // 10-digit "9005325544". The two-alternative form (rather than an optional
  // country-code group) is needed because \b doesn't exist between two
  // adjacent digits, so a single pattern can't cleanly handle "no separator".
  const PHONE_RE = /\+\d{1,3}[\s-]?\d{10}\b|\b\d{10}\b/g;

  function renderRichText(rawText) {
    let safe = escapeHtml(rawText);

    // Links are converted first and swapped out for placeholder tokens, so
    // the bold/emphasis passes below can never match text inside a URL or
    // inside an already-built <a> tag. Generic web links render uniformly
    // as "Click here" for a clean, consistent read-aloud experience; phone
    // numbers and email addresses instead keep their own text as the label,
    // since the actual number/address is the useful part there.
    const links = [];
    function stashLink(url, label) {
      const token = "\u0000LINK" + links.length + "\u0000";
      links.push({ url: url, label: label || "Click here" });
      return token;
    }

    // Markdown-style links: [label](https://example.com)
    safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (m, label, url) {
      return stashLink(url);
    });

    // Bare URLs with an explicit protocol
    safe = safe.replace(/https?:\/\/[^\s<]+/g, function (url) {
      const trimmed = url.replace(/[.,;:!?)\]]+$/, ""); // drop trailing punctuation
      const trailing = url.slice(trimmed.length);
      return stashLink(trimmed) + trailing;
    });

    // Email addresses — converted (and stashed) before the bare-domain pass
    // below, so "gmail.com" isn't left behind as a separate, broken link.
    safe = safe.replace(EMAIL_RE, function (email) {
      return stashLink("mailto:" + email, email);
    });

    // Bare domains with no protocol at all
    safe = safe.replace(BARE_DOMAIN_RE, function (m, domain) {
      const trimmed = domain.replace(/[.,;:!?)\]]+$/, "");
      const trailing = domain.slice(trimmed.length);
      const url = /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed;
      return stashLink(url) + trailing;
    });

    // Phone numbers
    safe = safe.replace(PHONE_RE, function (phone) {
      const digits = phone.replace(/[^\d+]/g, "");
      return stashLink("tel:" + digits, phone);
    });

    safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/\*(.+?)\*/g, '<span class="ai-em">$1</span>');

    safe = safe.replace(/\u0000LINK(\d+)\u0000/g, function (m, i) {
      const link = links[Number(i)];
      const isWebLink = /^https?:\/\//i.test(link.url);
      const attrs = isWebLink ? ' target="_blank" rel="noopener noreferrer"' : "";
      return '<a href="' + link.url + '"' + attrs + ">" + link.label + "</a>";
    });

    return safe;
  }

  // Markdown markers and links are stripped/normalized before text reaches
  // speechSynthesis — links are read as "Click here" rather than a raw URL.
  function stripMarkdown(rawText) {
    return rawText
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "Click here")
      .replace(/https?:\/\/[^\s<]+/g, "Click here")
      .replace(BARE_DOMAIN_RE, "Click here")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1");
  }

  /* ---------------------------------------------------------
     Local rule-based fallback — free, fully offline, pattern-
     matches against the site's own known details. Used whenever
     the Gemini-backed API errors, times out, or is rate-limited,
     so the assistant is never fully dependent on the external
     service.
  --------------------------------------------------------- */
  const LOCAL_INTENTS = [
    {
      test: /\b(hi|hello|hey|namaste|yo)\b/i,
      reply:
        "Hey there! 👋 I'm Shivam's AI assistant. Ask me about the DIYs, calligraphy, sketches, custom orders, or how to reach Shivam.",
    },
    {
      test: /\b(custom order|commission|order|buy|purchase|price|cost|rate)\b/i,
      reply:
        "For custom orders, the quickest way is to message Shivam directly on WhatsApp: https://wa.me/919005325544 — share what you'd like (calligraphy, sketch, DIY piece, etc.) and he'll get back to you with details.",
    },
    {
      test: /\b(contact|reach|email|phone|number|whatsapp|call)\b/i,
      reply:
        "You can reach Shivam by phone/WhatsApp at +91 9005325544, or email babitavrm60@gmail.com. There's also a Call button on this page for a quick tap-to-call.",
    },
    {
      test: /\b(channel|content|video|diy|calligraphy|sketch|craft|creation)\b/i,
      reply:
        "Shivam's World features DIY crafts, calligraphy, sketches/drawings, and handcrafted cards. You can browse it all on the YouTube channel (youtube.com/c/ShivamsWorld) or right here on the site.",
    },
    {
      test: /\b(dark mode|light mode|theme|night mode)\b/i,
      reply:
        "You can switch between light and dark mode using the theme toggle in the menu at the top — just tap it to flip the look of the whole site.",
    },
    {
      test: /\bsearch\b/i,
      reply:
        "There's a search bar you can use to quickly find content on the page — type a keyword and it filters the list live as you type.",
    },
    {
      test: /\bshare\b/i,
      reply:
        "Tap the Share button (fixed near the bottom-right) to share this page — it'll open your device's share menu, or copy the link if sharing isn't supported.",
    },
    {
      test: /\b(thank|thanks|thank you)\b/i,
      reply: "You're welcome! Let me know if there's anything else you'd like to know. 🙂",
    },
  ];

  function localFallbackAnswer(userText) {
    for (const intent of LOCAL_INTENTS) {
      if (intent.test.test(userText)) return intent.reply;
    }
    return "I'm not fully sure about that one — the best way to get an accurate answer is to reach out to Shivam directly on WhatsApp: https://wa.me/919005325544";
  }

  /* ----- Rendering ----- */
  function renderMessage(msg) {
    const div = document.createElement("div");
    div.className =
      "ai-msg " +
      (msg.role === "user"
        ? "ai-msg-user"
        : msg.role === "error"
        ? "ai-msg-error"
        : "ai-msg-bot");

    if (msg.role === "bot") {
      div.innerHTML = renderRichText(msg.text);
    } else {
      div.textContent = msg.text;
    }

    messagesEl.appendChild(div);
    return div;
  }

  function renderAll() {
    messagesEl.innerHTML = "";
    if (history.length === 0) {
      history.push({ role: "bot", text: WELCOME_MSG, ts: Date.now() });
    }
    history.forEach(renderMessage);
    scrollToBottom();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showTyping() {
    if (document.getElementById("aiTypingIndicator")) return;
    const el = document.createElement("div");
    el.id = "aiTypingIndicator";
    el.textContent = "Thinking…";
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function hideTyping() {
    const el = document.getElementById("aiTypingIndicator");
    if (el) el.remove();
  }

  /* ----- Scroll containment -----
     Scroll is contained to the chat window itself via CSS
     `overscroll-behavior: contain` (see #aiChatWindow /
     #aiChatMessages) — the page behind stays freely scrollable
     the whole time the chat is open. */

  /* ----- Open / Close ----- */
  function openChat() {
    widget.classList.add("open", "seen");
    hidePreview();
    stopPreviewCycle();
    renderAll();
    if (input) input.focus();
  }

  function closeChat() {
    widget.classList.remove("open");
    stopListening();
    stopSpeaking();
    resumePreviewCycle();
  }

  toggleBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    widget.classList.contains("open") ? closeChat() : openChat();
  });
  if (closeBtn) closeBtn.addEventListener("click", closeChat);

  // Click outside the chat window (and outside the toggle button) closes it.
  // Uses composedPath() rather than chatWindow.contains(e.target): some
  // in-header buttons (e.g. the speech toggle) replace their own innerHTML
  // in response to this same click, which can detach e.target from the DOM
  // before the event finishes bubbling here. composedPath() reflects the
  // event's original path and isn't affected by that later mutation.
  document.addEventListener("click", function (e) {
    if (!widget.classList.contains("open")) return;
    const path = typeof e.composedPath === "function" ? e.composedPath() : null;
    const insideChat = path
      ? path.includes(chatWindow) || path.includes(toggleBtn)
      : chatWindow.contains(e.target) || toggleBtn.contains(e.target);
    if (insideChat) return;
    closeChat();
  });

  /* ----- Preview bubble teaser (recurring, rotating messages) -----
     Mirrors MediHome's hint cycle exactly: paused whenever the panel
     is open, resumed the moment it closes — indefinitely, no permanent
     dismissal. The show transition is retriggered by forcing a DOM
     reflow between removing and re-adding the "show" class, then
     waiting a frame before re-adding it, so the fade-in fires reliably
     even if the previous cycle's transition hadn't fully settled. ----- */
  let previewCycleTimer = null;
  let previewCycleActive = false;

  function hidePreview() {
    if (previewBubble) previewBubble.classList.remove("show");
  }

  function stopPreviewCycle() {
    previewCycleActive = false;
    clearTimeout(previewCycleTimer);
    previewCycleTimer = null;
  }

  function resumePreviewCycle() {
    if (previewCycleActive) return;
    previewCycleActive = true;
    clearTimeout(previewCycleTimer);
    previewCycleTimer = setTimeout(showNextPreview, 2000);
  }

  function showNextPreview() {
    if (!previewBubble || widget.classList.contains("open")) return;
    const msg = previewMessages[Math.floor(Math.random() * previewMessages.length)];
    if (previewText) previewText.textContent = msg;

    previewBubble.classList.remove("show");
    void previewBubble.offsetWidth; // force reflow so the browser paints the "before" state first
    requestAnimationFrame(() => previewBubble.classList.add("show"));

    previewCycleTimer = setTimeout(function () {
      previewBubble.classList.remove("show");
      previewCycleTimer = setTimeout(showNextPreview, 3000);
    }, 4000);
  }

  function initPreview() {
    if (!previewBubble) return;
    resumePreviewCycle();
  }

  /* ----- Sending messages (Gemini primary, local fallback silent) ----- */
  async function sendMessage(text) {
    text = (text || "").trim();
    if (!text || isTyping) return;

    history.push({ role: "user", text: text, ts: Date.now() });
    renderMessage(history[history.length - 1]);
    scrollToBottom();

    input.value = "";
    isTyping = true;
    sendBtn.disabled = true;
    showTyping();

    let replyText = null;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: history
            .filter((m) => m.role === "user" || m.role === "bot")
            .slice(-10)
            .map((m) => ({
              role: m.role === "user" ? "user" : "assistant",
              text: m.text,
            })),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.reply) {
        replyText = data.reply;
      }
    } catch (err) {
      // network error — fall through to local fallback
    }

    hideTyping();

    // Silent fallback: if Gemini errored, timed out, or was rate-limited,
    // answer from the local rule-based matcher instead of showing an error.
    if (!replyText) {
      replyText = localFallbackAnswer(text);
    }

    const botMsg = { role: "bot", text: replyText, ts: Date.now() };
    history.push(botMsg);
    renderMessage(botMsg);
    startReading(botMsg);

    isTyping = false;
    sendBtn.disabled = false;
    scrollToBottom();
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      sendMessage(input.value);
    });
  }

  /* ----- Voice input (Web Speech API) -----
     Feature-detected — the mic button simply never appears on
     unsupported browsers. Auto-transcribes and auto-sends once
     speech recognition reports a final result. ----- */
  (function initVoiceInput() {
    if (!micBtn || !input) return;
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      micBtn.hidden = true;
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let listening = false;
    let finalSent = false;

    function setListening(state) {
      listening = state;
      micBtn.classList.toggle("listening", state);
      micBtn.setAttribute(
        "aria-label",
        state ? "Stop voice input" : "Speak your message"
      );
    }

    function stopListeningInternal() {
      try {
        recognition.stop();
      } catch {}
    }

    recognition.addEventListener("start", function () {
      finalSent = false;
      setListening(true);
    });

    recognition.addEventListener("result", function (e) {
      let transcript = "";
      let isFinal = false;
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
        if (e.results[i].isFinal) isFinal = true;
      }
      input.value = transcript;

      if (isFinal && transcript.trim() && !finalSent) {
        finalSent = true;
        sendMessage(transcript);
      }
    });

    recognition.addEventListener("error", function (e) {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        history.push({
          role: "error",
          text: "Microphone access was blocked. Please allow mic permissions to use voice input.",
          ts: Date.now(),
        });
        renderMessage(history[history.length - 1]);
        scrollToBottom();
      }
    });

    recognition.addEventListener("end", function () {
      setListening(false);
    });

    micBtn.addEventListener("click", function () {
      if (listening) {
        stopListeningInternal();
      } else {
        try {
          recognition.start();
        } catch {}
      }
    });

    // Lets closeChat() cut the mic off if the window is dismissed mid-recording.
    stopListening = stopListeningInternal;
  })();

  /* ---------------------------------------------------------
     Read aloud (Web Speech Synthesis) — two separate header
     controls, mirroring MediHome exactly:
       - a Pause/Play TOGGLE (icon swaps in place) that's only
         ever visible while a reply is actively being read or
         sits paused mid-way through
       - a separate REPLAY button that only appears once a reply
         has finished naturally on its own (never while paused)
     These are mutually exclusive by construction: starting/
     resuming a reading hides Replay and shows the toggle as
     Pause; pausing keeps Replay hidden and flips the toggle to
     Play; finishing naturally hides the toggle and shows Replay.

     Deliberately avoids native pause()/resume() — unreliable,
     especially on mobile where resume() is known to silently
     fail. Instead: pausing fully cancels the utterance (position
     is preserved), and resuming starts a brand-new utterance from
     that tracked character position.

     Position is tracked two ways: word-boundary events where the
     browser fires them, and a time-elapsed character-rate
     estimate (~15 chars/sec) as a fallback/floor, since mobile
     browsers often never fire boundary events at all.

     A generation counter plus handler-nulling on every cancel
     guards against stale, late-firing callbacks from an already-
     abandoned utterance corrupting the UI state. The last reply's
     text persists independent of playback state, so Replay still
     works after closing and reopening the panel.
  --------------------------------------------------------- */
  const speechToggleBtn = document.getElementById("aiSpeechToggle");
  const replayBtn = document.getElementById("aiReplayBtn");
  const CHARS_PER_SEC = 15;

  let speechFullText = "";
  let speechCharIndex = 0;
  let speechPaused = false;
  let speechStartTime = 0;
  let speechStartIndex = 0;
  let speechGen = 0; // bumped on every deliberate interruption/new utterance
  let currentUtterance = null; // handlers nulled whenever we cancel deliberately
  let lastReplyPlainText = ""; // persists across stop/close, unlike the vars above

  function detachCurrentUtterance() {
    if (currentUtterance) {
      currentUtterance.onstart = null;
      currentUtterance.onend = null;
      currentUtterance.onerror = null;
      currentUtterance.onboundary = null;
      currentUtterance = null;
    }
  }

  function setSpeechToggle(visible, paused) {
    if (!speechToggleBtn) return;
    speechToggleBtn.hidden = !visible;
    speechToggleBtn.classList.toggle("active", visible && !paused);
    speechToggleBtn.innerHTML = paused
      ? '<i class="fa fa-play"></i>'
      : '<i class="fa fa-pause"></i>';
    speechToggleBtn.title = paused ? "Resume reading" : "Pause reading";
    speechToggleBtn.setAttribute("aria-label", paused ? "Resume reading" : "Pause reading");
  }

  function setReplayVisible(visible) {
    if (replayBtn) replayBtn.hidden = !visible;
  }

  function speakFrom(charIndex) {
    if (!ttsSupported) return;
    const remaining = speechFullText.slice(charIndex);
    if (!remaining) {
      setSpeechToggle(false);
      return;
    }
    const myGen = ++speechGen; // this utterance's own identity
    const utter = new SpeechSynthesisUtterance(remaining);
    currentUtterance = utter;
    utter.rate = 1;
    utter.pitch = 1;

    let boundaryFired = false;

    utter.onboundary = function (e) {
      if (myGen !== speechGen) return; // a later utterance has since taken over
      boundaryFired = true;
      if (typeof e.charIndex === "number") {
        speechCharIndex = charIndex + e.charIndex;
      }
    };

    utter.onstart = function () {
      if (myGen !== speechGen) return;
      speechStartTime = Date.now();
      speechStartIndex = charIndex;
      setSpeechToggle(true, false);
      setReplayVisible(false); // pause/play takes over while actively reading
    };

    utter.onend = function () {
      if (myGen !== speechGen) return; // stale — cancel() likely triggered this late
      if (!speechPaused) {
        setSpeechToggle(false);
        setReplayVisible(true); // finished naturally
      }
    };

    utter.onerror = function () {
      if (myGen !== speechGen) return;
      if (!speechPaused) setSpeechToggle(false);
    };

    // Fallback position tracking for browsers that never fire onboundary
    // (common on mobile) — a rough time-elapsed estimate acts as a floor.
    const startedAt = performance.now();
    const fallbackTimer = setInterval(function () {
      if (myGen !== speechGen) {
        clearInterval(fallbackTimer);
        return;
      }
      if (boundaryFired) return; // trust real boundary events once they start firing
      const elapsed = (performance.now() - startedAt) / 1000;
      speechCharIndex = Math.max(
        speechCharIndex,
        charIndex + Math.floor(elapsed * CHARS_PER_SEC)
      );
    }, 200);
    utter.addEventListener("end", () => clearInterval(fallbackTimer));
    utter.addEventListener("error", () => clearInterval(fallbackTimer));

    window.speechSynthesis.speak(utter);
  }

  function speakAssistantReply(text) {
    if (!ttsSupported) return; // not supported — silently skip
    speechGen++; // invalidate whatever utterance was previously in flight
    detachCurrentUtterance();
    window.speechSynthesis.cancel(); // don't overlap with a previous reply still speaking
    speechFullText = text;
    speechCharIndex = 0;
    speechPaused = false;
    speakFrom(0);
  }

  function startReading(msg) {
    lastReplyPlainText = stripMarkdown(msg.text);
    speakAssistantReply(lastReplyPlainText);
  }

  function toggleAssistantSpeech() {
    if (!ttsSupported) return;
    if (!speechPaused) {
      // Estimate progress from elapsed time as a floor — onboundary alone
      // isn't enough since mobile browsers frequently never fire it.
      const elapsedSec = (Date.now() - speechStartTime) / 1000;
      const estimatedIndex = speechStartIndex + Math.floor(elapsedSec * CHARS_PER_SEC);
      speechCharIndex = Math.max(speechCharIndex, estimatedIndex);
      speechPaused = true;
      speechGen++; // invalidate the utterance we're about to cancel
      detachCurrentUtterance();
      window.speechSynthesis.cancel(); // instant and reliable, unlike pause()
      setSpeechToggle(true, true); // must be last — nothing above can override it
    } else {
      speechPaused = false;
      speakFrom(speechCharIndex); // fresh utterance from where we left off
    }
  }

  function replayLastAssistantReply() {
    if (!lastReplyPlainText) return;
    speakAssistantReply(lastReplyPlainText); // resets all playback state, same as any new reply
  }

  function stopSpeaking() {
    speechGen++; // invalidate any utterance still in flight
    detachCurrentUtterance();
    if (ttsSupported) window.speechSynthesis.cancel();
    speechPaused = false;
    speechFullText = "";
    speechCharIndex = 0;
    setSpeechToggle(false);
    setReplayVisible(false);
  }

  if (speechToggleBtn) speechToggleBtn.addEventListener("click", toggleAssistantSpeech);
  if (replayBtn) replayBtn.addEventListener("click", replayLastAssistantReply);

  /* ----- Init ----- */
  initPreview();
})();

/* ---------- 4. Admin page ---------- */
(async function () {
"use strict";
if (!document.getElementById("ordersList")) return; // only on the admin page

// Firebase handles, filled in once the sign-in service has loaded (see the Auth section)
let auth, db, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, collection, query, orderBy,
    onSnapshot, doc, updateDoc, writeBatch, serverTimestamp, getDoc, increment;

const ADMIN_EMAIL = "babitavrm60@gmail.com";
// Suggests which delivery partner to book: Rapido inside the city, Porter for another city.
// PRODUCTION is your workshop; orders pinned within CITY_RADIUS_KM (by road, roughly) count as in the city.
const PRODUCTION = { lat: 26.444917, lng: 80.325111 };
const CITY_RADIUS_KM = 30;
const THEME_KEY = "sw-theme";

// Return requests (refund or replacement). The last "done" step depends on the type of request.
const RETURN_STATUSES = [
  { key: "requested", label: "Return requested" },
  { key: "approved",  label: "Return approved" },
  { key: "received",  label: "Item received back" },
  { key: "refunded",  label: "Refund sent" },
  { key: "replaced",  label: "Replacement sent" },
  { key: "rejected",  label: "Return not approved" }
];
function returnStatusesFor(type) {
  return RETURN_STATUSES.filter((s) => s.key !== (type === "replacement" ? "refunded" : "replaced"));
}
function retKey(r) {
  return RETURN_STATUSES.some((s) => s.key === r.status) ? r.status : "requested";
}
function retLabel(key) {
  return RETURN_STATUSES.find((s) => s.key === key).label;
}

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
let view = "orders";          // "orders" or "returns"
let returns = [];
let retFilter = "all";
let returnsUnsub = null;
let ordersErr = "";
let returnsErr = "";
const retDrafts = {};         // unsaved edits per return request
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

function returnMessage(r, key, note) {
  const first = (r.name || "there").split(" ")[0];
  const id = r.orderId || r.id;
  const refund = r.type !== "replacement";
  const lines = {
    requested: `Hi ${first}, we received your ${refund ? "refund" : "replacement"} request for order ${id}. We'll check it and update you soon.`,
    approved:  `Hi ${first}, your ${refund ? "refund" : "replacement"} request for order ${id} is approved.`,
    received:  `Hi ${first}, we have received the item back for order ${id}.`,
    refunded:  `Hi ${first}, your refund of ${money(r.refundAmount)} for order ${id} has been sent to your account.`,
    replaced:  `Hi ${first}, your replacement for order ${id} has been sent.`,
    rejected:  `Hi ${first}, we're sorry, your return request for order ${id} could not be approved. Please message us if you have questions.`
  };
  let text = lines[key];
  if (note) text += `\n${note}`;
  return text;
}

// "Delivery partner (suggested): Rapido (within the city, about 6 km)" or Porter, from the pinned location
function partnerHint(o) {
  const l = o.location;
  if (!l || typeof l.lat !== "number" || typeof l.lng !== "number") return "\n\nDelivery partner: no pinned location, so choose Rapido or Porter yourself";
  const rad = Math.PI / 180;
  const dLat = (l.lat - PRODUCTION.lat) * rad;
  const dLng = (l.lng - PRODUCTION.lng) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(PRODUCTION.lat * rad) * Math.cos(l.lat * rad) * Math.sin(dLng / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.sqrt(a)) * 1.3; // straight line x 1.3 is roughly the road distance
  const near = km <= CITY_RADIUS_KM;
  return `\n\nDelivery partner (suggested): ${near ? "Rapido (within the city" : "Porter (another city"}, about ${Math.round(km)} km)`;
}

/* ---------- Actions ---------- */
async function saveReturn(r, btn) {
  const d = retDrafts[r.id] || {};
  btn.disabled = true;
  try {
    const status = d.status !== undefined ? d.status : retKey(r);
    const adminNote = d.note !== undefined ? d.note : (r.adminNote || "");
    const update = { status, adminNote, updatedAt: serverTimestamp() };
    const batch = writeBatch(db);
    let pointsMsg = "";
    // When a refund is sent: the points the customer used come back, and the points this order earned are taken off.
    if (status === "refunded" && !r.pointsAdjusted) {
      const ord = orders.find((x) => x.id === (r.orderId || r.id));
      if (ord && ord.uid) {
        const give = Number(ord.pointsUsed) || 0;
        const take = ord.pointsCredited ? (Number(ord.pointsEarned) || 0) : 0;
        if (give || take) {
          const ref = doc(db, "wallets", ord.uid);
          const snap = await getDoc(ref);
          const current = snap.exists() ? Number(snap.data().balance) || 0 : 0;
          batch.set(ref, { balance: Math.max(0, current + give - take), updatedAt: serverTimestamp() }, { merge: true });
          pointsMsg = ` (points: +${give}, -${take})`;
        }
        update.pointsAdjusted = true;
      }
    }
    batch.update(doc(db, "returns", r.id), update);
    await batch.commit();
    delete retDrafts[r.id];
    toast("Saved" + pointsMsg);
  } catch (err) {
    console.error(err);
    toast("Could not save. Check your connection and try again.");
  } finally {
    btn.disabled = false;
  }
}

async function saveOrder(o, btn) {
  const d = drafts[o.id] || {};
  btn.disabled = true;
  try {
    const status = d.status !== undefined ? d.status : statusKey(o);
    const adminNote = d.note !== undefined ? d.note : (o.adminNote || "");
    const update = { status, adminNote, updatedAt: serverTimestamp() };
    const batch = writeBatch(db);
    let pointsMsg = "";
    // Reward points: earned points are added once, when the order becomes Delivered.
    if (status === "delivered" && !o.pointsCredited && Number(o.pointsEarned) > 0 && o.uid) {
      batch.set(doc(db, "wallets", o.uid), { balance: increment(Number(o.pointsEarned)), updatedAt: serverTimestamp() }, { merge: true });
      update.pointsCredited = true;
      pointsMsg = ` (+${o.pointsEarned} points added)`;
    }
    // A cancelled order gives the customer's redeemed points back, once.
    if (status === "cancelled" && !o.pointsRestored && Number(o.pointsUsed) > 0 && o.uid) {
      batch.set(doc(db, "wallets", o.uid), { balance: increment(Number(o.pointsUsed)), updatedAt: serverTimestamp() }, { merge: true });
      update.pointsRestored = true;
      pointsMsg = ` (${o.pointsUsed} points given back)`;
    }
    batch.update(doc(db, "orders", o.id), update);
    await batch.commit();
    delete drafts[o.id];
    toast("Saved" + pointsMsg);
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

// Deletes a return request. The order itself stays. The customer can send a new request for it afterwards.
async function removeReturn(r) {
  const id = r.orderId || r.id;
  const sure = window.SWUI
    ? await window.SWUI.confirm({
        title: "Delete this return request?",
        message: `The return request for order ${id} will be deleted permanently, including the customer's refund details. The order itself is not deleted. This cannot be undone.`,
        confirmText: "Delete request",
        cancelText: "Keep it",
        danger: true
      })
    : confirm(`Delete the return request for order ${id} permanently? This cannot be undone.`);
  if (!sure) return;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, "returns", r.id));
    await batch.commit();
    openIds.delete("ret-" + r.id);
    delete retDrafts[r.id];
    toast("Return request deleted");
  } catch (err) {
    console.error(err);
    toast("Could not delete the return request.");
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
    ul.appendChild(el("li", "", `${it.name}${it.code ? " (" + it.code + ")" : ""} \u00D7 ${it.qty} = ${money(it.price * it.qty)}`));
  });
  itemsBox.appendChild(ul);
  body.appendChild(itemsBox);

  const custBox = el("div");
  custBox.appendChild(el("h3", "", "Customer"));
  custBox.appendChild(el("p", "o-text", `${o.name || ""}\n${o.phone || ""}\n${o.address || ""}` + partnerHint(o)));
  if (o.note) {
    custBox.appendChild(el("h3", "", "Customer note"));
    custBox.appendChild(el("p", "o-text", o.note));
  }
  body.appendChild(custBox);

  const payBox = el("div");
  payBox.appendChild(el("h3", "", "Payment"));
  const coupon = o.discount > 0 ? ` \u2212 coupon ${o.couponCode || ""} ${money(o.discount)}` : "";
  const points = o.pointsUsed > 0 ? ` \u2212 points ${money(o.pointsUsed)}` : "";
  const breakdown = o.deliveryCharge !== undefined ? ` (items ${money(o.subtotal)}${points}${coupon} + delivery ${money(o.deliveryCharge)})` : "";
  let pointsInfo = "";
  if (o.pointsUsed > 0) pointsInfo += `\nPoints used: ${o.pointsUsed}`;
  if (o.pointsEarned > 0) pointsInfo += `\nPoints to earn: ${o.pointsEarned} (${o.pointsCredited ? "already added" : "added when you mark it Delivered"})`;
  payBox.appendChild(el("p", "o-text", `Amount to match: ${money(o.total)}${breakdown}\nUTR given by customer: ${o.utr || ""}${pointsInfo}`));
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

function renderTabs() {
  const open = returns.filter((r) => retKey(r) === "requested").length;
  const box = $("viewTabs");
  box.replaceChildren();
  [{ key: "orders", label: `Orders (${orders.length})` },
   { key: "returns", label: open ? `Returns (${returns.length}, ${open} new)` : `Returns (${returns.length})` }].forEach((t) => {
    const b = el("button", "filter-btn", t.label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(view === t.key));
    b.addEventListener("click", () => {
      if (view === t.key) return;
      view = t.key;
      searchCursor = -1;
      render();
    });
    box.appendChild(b);
  });
}

function renderReturnFilters() {
  const counts = { all: returns.length };
  RETURN_STATUSES.forEach((s) => { counts[s.key] = 0; });
  returns.forEach((r) => { counts[retKey(r)] += 1; });
  const box = $("filters");
  box.replaceChildren();
  [{ key: "all", label: "All" }, ...RETURN_STATUSES].forEach((s) => {
    const b = el("button", "filter-btn", `${s.label} (${counts[s.key]})`);
    b.type = "button";
    b.setAttribute("aria-pressed", String(retFilter === s.key));
    b.addEventListener("click", () => {
      retFilter = (retFilter === s.key && s.key !== "all") ? "all" : s.key;
      searchCursor = -1;
      render();
    });
    box.appendChild(b);
  });
}

function returnCard(r) {
  const key = retKey(r);
  const draft = retDrafts[r.id] || {};
  const openKey = "ret-" + r.id;
  const refund = r.type !== "replacement";

  const card = el("details", "order-card");
  card.open = openIds.has(openKey);
  card.addEventListener("toggle", () => {
    if (card.open) openIds.add(openKey); else openIds.delete(openKey);
  });

  const sum = el("summary");
  const left = el("div");
  const idLine = el("div", "o-id", r.orderId || r.id);
  idLine.appendChild(el("span", `pill pill-${key}`, retLabel(key)));
  left.appendChild(idLine);
  left.appendChild(el("div", "o-meta", `${refund ? "Refund" : "Replacement"} \u00B7 ${r.name || "Unknown"}`));
  const right = el("div");
  right.appendChild(el("div", "o-total", refund ? money(r.refundAmount) : "Replace"));
  right.appendChild(el("div", "o-date", formatDate(r.createdAt)));
  sum.append(left, right);
  card.appendChild(sum);

  const body = el("div", "order-body");

  const why = el("div");
  why.appendChild(el("h3", "", "Reason"));
  why.appendChild(el("p", "o-text", r.reason || ""));
  if (r.details) {
    why.appendChild(el("h3", "", "Customer's details"));
    why.appendChild(el("p", "o-text", r.details));
  }
  body.appendChild(why);

  const cust = el("div");
  cust.appendChild(el("h3", "", "Customer"));
  cust.appendChild(el("p", "o-text", `${r.name || ""}\n${r.phone || ""}`));
  body.appendChild(cust);

  const actions = el("div", "o-actions");
  if (refund) {
    const pay = el("div");
    pay.appendChild(el("h3", "", "Refund to send"));
    pay.appendChild(el("p", "o-text",
      `Amount: ${money(r.refundAmount)} (items after coupon, delivery charge not refunded)\nUPI ID: ${r.upi || ""}\nBank account: ${r.account || ""}\nIFSC: ${r.ifsc || ""}`));
    body.appendChild(pay);
    const copyUpi = el("button", "mini-btn", "Copy UPI ID");
    copyUpi.type = "button";
    copyUpi.addEventListener("click", () => copyText(r.upi || ""));
    const copyAcc = el("button", "mini-btn", "Copy account no.");
    copyAcc.type = "button";
    copyAcc.addEventListener("click", () => copyText(r.account || ""));
    const copyIfsc = el("button", "mini-btn", "Copy IFSC");
    copyIfsc.type = "button";
    copyIfsc.addEventListener("click", () => copyText(r.ifsc || ""));
    const upiPay = el("a", "mini-btn", "Pay in UPI app");
    upiPay.href = `upi://pay?pa=${encodeURIComponent(r.upi || "")}&pn=${encodeURIComponent(r.name || "Customer")}&am=${Number(r.refundAmount || 0)}&cu=INR&tn=${encodeURIComponent("Refund for " + (r.orderId || r.id))}`;
    actions.append(upiPay, copyUpi, copyAcc, copyIfsc);
  }
  const call = el("a", "mini-btn", "Call");
  call.href = `tel:+91${r.phone}`;
  const chat = el("a", "mini-btn", "WhatsApp customer");
  chat.href = `https://wa.me/91${r.phone}`;
  chat.target = "_blank";
  chat.rel = "noopener";
  actions.append(call, chat);
  body.appendChild(actions);

  const controls = el("div", "o-controls");
  const selId = `rstatus-${r.id}`;
  const noteId = `rnote-${r.id}`;
  const selLabel = el("label", "", "Return status");
  selLabel.htmlFor = selId;
  const select = el("select");
  select.id = selId;
  returnStatusesFor(r.type).forEach((s) => {
    const opt = el("option", "", s.label);
    opt.value = s.key;
    select.appendChild(opt);
  });
  select.value = draft.status !== undefined ? draft.status : key;
  select.addEventListener("change", () => {
    retDrafts[r.id] = Object.assign(retDrafts[r.id] || {}, { status: select.value });
  });
  const noteLabel = el("label", "", "Note shown to the customer under their return");
  noteLabel.htmlFor = noteId;
  const note = el("input");
  note.id = noteId;
  note.type = "text";
  note.maxLength = 300;
  note.value = draft.note !== undefined ? draft.note : (r.adminNote || "");
  note.addEventListener("input", () => {
    retDrafts[r.id] = Object.assign(retDrafts[r.id] || {}, { note: note.value });
  });
  const statusField = window.SWUI ? window.SWUI.customSelect(select, { label: "Return status" }) : select;
  controls.append(selLabel, statusField, noteLabel, note);

  const saveRow = el("div", "o-save-row");
  const save = el("button", "btn-inline", "Save changes");
  save.type = "button";
  save.addEventListener("click", () => saveReturn(r, save));
  const notify = el("button", "mini-btn", "Message status on WhatsApp");
  notify.type = "button";
  notify.addEventListener("click", () => {
    window.open(waLink(r, returnMessage(r, select.value, note.value.trim())), "_blank", "noopener");
  });
  const del = el("button", "danger-btn", "Delete request");
  del.type = "button";
  del.addEventListener("click", () => removeReturn(r));
  saveRow.append(save, notify, del);
  controls.appendChild(saveRow);
  body.appendChild(controls);
  card.appendChild(body);
  return card;
}

function renderReturns() {
  renderReturnFilters();
  const term = $("searchInput").value.trim().toLowerCase();
  const shown = returns.filter((r) => {
    if (retFilter !== "all" && retKey(r) !== retFilter) return false;
    if (!term) return true;
    return [r.orderId, r.id, r.name, r.phone, r.reason].join(" ").toLowerCase().includes(term);
  });
  $("ordersList").replaceChildren(...shown.map(returnCard));

  const hint = $("searchHint");
  if (term) {
    hint.textContent = shown.length
      ? `${shown.length} result${shown.length === 1 ? "" : "s"}. Press Enter to jump to ${shown.length === 1 ? "it" : "each one"}.`
      : "No return requests match your search.";
  } else {
    hint.textContent = "";
  }
  const empty = $("emptyMsg");
  if (!shown.length) {
    empty.textContent = returns.length
      ? "No return requests match this filter."
      : "No return requests yet. They appear here when a customer asks for a return or replacement.";
    empty.hidden = false;
  } else {
    empty.hidden = true;
  }
}

// One place decides which load error is shown, so switching tabs never hides a real problem
function syncLoadError() {
  const msg = view === "returns" ? returnsErr : ordersErr;
  showError("loadError", msg);
}

function render() {
  renderTabs();
  if (view === "returns") renderReturns(); else renderOrders();
  syncLoadError();
}

function renderOrders() {
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

/* ---------- Search: Enter jumps through the results ---------- */
// Wired up right after render() so it never depends on sign-in or the Firebase load.
// Enter = next result, Shift+Enter = previous. The pulse marks the current result.
function jumpToResult(step) {
  const cards = $("ordersList").children;
  if (!cards.length) return;
  if (searchCursor >= cards.length) searchCursor = -1; // list shrank since last jump
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

let lastJumpAt = 0;
function handleEnter(shift) {
  const now = Date.now();
  if (now - lastJumpAt < 150) return; // keydown and submit can both fire for one press
  lastJumpAt = now;
  jumpToResult(shift ? -1 : 1);
}

$("searchInput").addEventListener("input", () => { searchCursor = -1; render(); });
$("searchInput").addEventListener("keydown", (e) => {
  if (e.isComposing) return;
  if (e.key !== "Enter" && e.keyCode !== 13) return;
  e.preventDefault();
  handleEnter(e.shiftKey);
});
// Fallback for mobile keyboards that don't send a normal Enter keydown: they submit the form instead
$("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  handleEnter(false);
});

/* ---------- Live orders ---------- */
function startListening() {
  if (unsubscribe) return;
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  unsubscribe = onSnapshot(
    q,
    (snap) => {
      ordersErr = "";
      orders = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      render();
    },
    (err) => {
      console.error(err);
      ordersErr = "Could not load orders (" + err.code + "). Check that the Firestore rules are published.";
      syncLoadError();
    }
  );
  if (!returnsUnsub) {
    const rq = query(collection(db, "returns"), orderBy("createdAt", "desc"));
    returnsUnsub = onSnapshot(
      rq,
      (snap) => {
        returnsErr = "";
        returns = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
        render();
      },
      (err) => {
        console.error(err);
        returnsErr = "Could not load returns (" + err.code + "). Publish the latest Firestore rules.";
        syncLoadError();
      }
    );
  }
}

function stopListening() {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  if (returnsUnsub) returnsUnsub();
  returnsUnsub = null;
  orders = [];
  returns = [];
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
     onSnapshot, doc, updateDoc, writeBatch, serverTimestamp, getDoc, increment } = await window.SWData.sdk());
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
})();
