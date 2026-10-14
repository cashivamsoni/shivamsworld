/* =========================================================
   Shivam's World — Store logic
   Manual UPI flow: customer pays by QR / UPI app, enters the
   transaction ID (UTR), and the order is sent to you on WhatsApp.
   You check your UPI app, then confirm the order to the customer.
   ========================================================= */
(function () {
  "use strict";

  /* ---------- Settings: edit these ---------- */
  var CONFIG = {
    upiId: "9005325544@ibl",
    payeeName: "Shivam's World",
    whatsapp: "919005325544", // country code + number, no + or spaces
    currency: "\u20B9",
    orderPrefix: "SW"
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

  function addToCart(id) {
    cart[id] = Math.min((cart[id] || 0) + 1, 99);
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
  function renderProducts() {
    var grid = $("productGrid");
    grid.innerHTML = "";
    PRODUCTS.forEach(function (p) {
      var card = document.createElement("article");
      card.className = "product-card";
      card.innerHTML =
        '<div class="product-img"><img loading="lazy" alt=""></div>' +
        '<div class="product-body">' +
          '<h2></h2>' +
          '<p class="product-desc"></p>' +
          '<div class="product-foot">' +
            '<span class="product-price"></span>' +
            '<button type="button" class="btn-inline add-btn">Add to cart</button>' +
          '</div>' +
        '</div>';
      var img = card.querySelector("img");
      img.src = p.image;
      img.alt = p.name;
      card.querySelector("h2").textContent = p.name;
      card.querySelector(".product-desc").textContent = p.desc;
      card.querySelector(".product-price").textContent = money(p.price);
      var btn = card.querySelector(".add-btn");
      btn.setAttribute("aria-label", "Add " + p.name + " to cart");
      btn.addEventListener("click", function () { addToCart(p.id); });
      grid.appendChild(card);
    });
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
    $("cartTotal").textContent = money(cartTotal());
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
      note: o.note, items: o.items, total: o.total, utr: utr
    };
    return import("./orders-db.js")
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
    $("custName").focus();
    import("./orders-db.js").catch(function () { /* saved later, WhatsApp is the backup */ });
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
    var phone = $("custPhone").value.replace(/[\s-]/g, "").replace(/^(\+91|91)(?=\d{10}$)/, "");
    var address = $("custAddress").value.trim();

    if (name.length < 2) return showError("detailsError", "Enter your full name.");
    if (!/^[6-9]\d{9}$/.test(phone)) return showError("detailsError", "Enter a valid 10-digit mobile number.");
    if (address.length < 10) return showError("detailsError", "Enter your full delivery address.");
    showError("detailsError", "");

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
      total: cartTotal()
    };

    $("payOrderId").textContent = order.id;
    $("payAmount").textContent = money(order.total);
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
    lines.push("", "*Total: " + money(order.total) + "*", "",
      "Name: " + order.name,
      "Phone: " + order.phone,
      "Address: " + order.address);
    if (order.note) lines.push("Note: " + order.note);
    lines.push("", "UPI transaction ID (UTR): " + utr, "Payment status: Pending verification");
    return "https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(lines.join("\n"));
  }

  function onPaid() {
    var utr = $("utrInput").value.replace(/\s/g, "");
    if (!/^\d{12}$/.test(utr)) {
      return showError("payError", "Enter the 12-digit UPI transaction ID shown in your payment app.");
    }
    showError("payError", "");

    var url = buildWhatsAppUrl(utr);
    saveOrderToDb(order, utr); // background; WhatsApp opens even if this fails
    var opened = window.open(url, "_blank", "noopener");

    lastOrderId = order.id;
    rememberOrder(order);
    $("doneOrderId").textContent = order.id;
    $("waAgainBtn").setAttribute("href", url);
    showStep("done");

    // Order is handed off: empty the cart and start a fresh order ID next time.
    cart = {};
    saveCart();
    renderCart();
    order = null;

    if (!opened) toast("Tap Open WhatsApp to send your order");
  }

  /* ---------- Order tracking ---------- */
  var MY_ORDERS_KEY = "sw-my-orders";
  var TRACK_STEPS = [
    { key: "pending",   label: "Order received, payment being verified" },
    { key: "confirmed", label: "Payment confirmed" },
    { key: "packed",    label: "Packed" },
    { key: "shipped",   label: "Shipped" },
    { key: "delivered", label: "Delivered" }
  ];
  var lastOrderId = "";
  var trackRequest = 0;

  function loadMyOrders() {
    try {
      var list = JSON.parse(storeGet(MY_ORDERS_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  // Remember this customer's own orders on their device only
  function rememberOrder(o) {
    var list = loadMyOrders().filter(function (x) { return x.id !== o.id; });
    list.unshift({ id: o.id, total: o.total, at: Date.now() });
    storeSet(MY_ORDERS_KEY, JSON.stringify(list.slice(0, 10)));
    renderMyOrders();
  }

  function renderMyOrders() {
    var list = loadMyOrders();
    var ul = $("myOrdersList");
    ul.innerHTML = "";
    $("myOrders").hidden = !list.length;
    list.forEach(function (item) {
      if (!item || typeof item.id !== "string") return;
      var li = document.createElement("li");
      li.className = "my-order";
      var info = document.createElement("div");
      var idEl = document.createElement("strong");
      idEl.textContent = item.id;
      var meta = document.createElement("div");
      meta.className = "my-order-meta";
      meta.textContent = new Date(item.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
        " \u00B7 " + money(item.total);
      info.appendChild(idEl);
      info.appendChild(meta);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-inline add-btn";
      btn.textContent = "Check status";
      btn.addEventListener("click", function () { trackOrder(item.id); });
      li.appendChild(info);
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

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
        mark.textContent = i < idx ? "\u2713" : (i === idx ? "\u25CF" : "");
        var label = document.createElement("span");
        label.className = "label";
        label.textContent = s.label;
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
    if (data.updatedAt && data.updatedAt.toDate) {
      var upd = document.createElement("p");
      upd.className = "track-updated";
      upd.textContent = "Last updated " + data.updatedAt.toDate().toLocaleString("en-IN", {
        day: "numeric", month: "short", hour: "numeric", minute: "2-digit"
      });
      box.appendChild(upd);
    }
  }

  function trackOrder(rawId) {
    var id = String(rawId || "").trim().toUpperCase();
    $("trackInput").value = id;
    if (!/^SW-[A-Z0-9]{8}$/.test(id)) {
      showTrackMessage("Enter the order ID exactly as shown, like SW-7K3Q9M2X.", true);
      return;
    }
    var req = ++trackRequest;
    showTrackMessage("Checking\u2026", false);
    import("./orders-db.js")
      .then(function (m) { return m.getTracking(id); })
      .then(function (data) {
        if (req !== trackRequest) return;
        if (!data) {
          showTrackMessage("We couldn't find this order yet. If you just placed it, wait a minute and try again. Still missing? Message us on WhatsApp with your order ID.", true);
        } else {
          renderTrackResult(id, data);
        }
      })
      .catch(function (err) {
        if (req !== trackRequest) return;
        console.error(err);
        showTrackMessage("Couldn't check the status right now. Please try again in a moment, or message us on WhatsApp.", true);
      });
  }

  var trackReturnFocus = null;

  function openTrack(id) {
    trackReturnFocus = document.activeElement;
    $("trackModal").hidden = false;
    document.body.classList.add("store-locked");
    if (id) {
      trackOrder(id);
    } else {
      $("trackResult").innerHTML = "";
      $("trackInput").focus();
    }
  }

  function closeTrack() {
    $("trackModal").hidden = true;
    document.body.classList.remove("store-locked");
    if (trackReturnFocus && trackReturnFocus.focus) trackReturnFocus.focus();
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
      applyTheme(next);
      storeSet(THEME_KEY, next);
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
  }

  /* ---------- Init ---------- */
  function init() {
    loadCart();
    renderProducts();
    renderCart();
    setupThemeAndMenu();

    $("cartFab").addEventListener("click", openCart);
    $("cartClose").addEventListener("click", closeCart);
    $("cartOverlay").addEventListener("click", closeCart);
    $("checkoutBtn").addEventListener("click", openCheckout);

    $("detailsForm").addEventListener("submit", onDetailsSubmit);
    $("backToDetails").addEventListener("click", function () { showStep("details"); });
    $("paidBtn").addEventListener("click", onPaid);
    $("checkoutClose").addEventListener("click", closeCheckout);
    $("doneClose").addEventListener("click", closeCheckout);
    $("checkoutModal").addEventListener("click", function (e) {
      if (e.target === $("checkoutModal")) closeCheckout();
    });

    // Order tracking
    $("trackForm").addEventListener("submit", function (e) {
      e.preventDefault();
      trackOrder($("trackInput").value);
    });
    $("clearMyOrders").addEventListener("click", function () {
      storeSet(MY_ORDERS_KEY, "[]");
      renderMyOrders();
    });
    $("trackNowBtn").addEventListener("click", function () {
      closeCheckout();
      openTrack(lastOrderId);
    });
    $("trackClose").addEventListener("click", closeTrack);
    $("trackModal").addEventListener("click", function (e) {
      if (e.target === $("trackModal")) closeTrack();
    });
    // Every "#track" link (menu, intro text) opens the tracking window
    Array.prototype.forEach.call(document.querySelectorAll('a[href="#track"]'), function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        openTrack();
      });
    });
    renderMyOrders();
    var linked = window.location.search.match(/[?&]track=([A-Za-z0-9-]+)/);
    if (linked) openTrack(linked[1]); // link from the WhatsApp status message
    else if (window.location.hash === "#track") openTrack();

    // Keep the UTR field to digits only
    $("utrInput").addEventListener("input", function () {
      this.value = this.value.replace(/\D/g, "").slice(0, 12);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!$("checkoutModal").hidden) closeCheckout();
      else if (!$("trackModal").hidden) closeTrack();
      else if ($("cartDrawer").classList.contains("open")) closeCart();
    });

    // Keep cart in sync if the store is open in another tab
    window.addEventListener("storage", function (e) {
      if (e.key === CART_KEY) { cart = {}; loadCart(); renderCart(); }
    });
  }

  init();
})();
