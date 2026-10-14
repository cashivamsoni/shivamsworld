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
    payeeName: "Shivam Soni",
    whatsapp: "919005325544", // country code + number, no + or spaces
    currency: "\u20B9",
    orderPrefix: "SW",
    deliveryCharge: 50, // flat charge added to every order (keep in sync with firestore.rules)

    // ===== COUPON: edit the code text and the discount percentage here =====
    // The discount applies to the items only, never to the delivery charge.
    couponCode: "SHIVAM10",
    couponPercent: 10
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
          couponMessage("This coupon has already been used for this name, phone number and address, so it was removed.", "bad");
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
      return import("./orders-db.js")
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
        couponMessage("This coupon has already been used for this name, phone number and address.", "bad");
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
  var lastOrderId = "";

  var STATUS_LABELS = {
    pending: "Payment being verified", confirmed: "Payment confirmed", packed: "Packed",
    shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled"
  };

  // Loads the sign-in code only when it's needed
  function accountModule() {
    if (!accountLoad) {
      accountLoad = import("./account.js").catch(function (err) { accountLoad = null; throw err; });
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

  function renderMyOrders(list) {
    var box = $("acctOrders");
    box.innerHTML = "";
    if (!list.length) {
      var none = document.createElement("p");
      none.className = "acct-empty";
      none.textContent = "No orders yet. Orders you place appear here, with live status.";
      box.appendChild(none);
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
      var track = document.createElement("button");
      track.type = "button";
      track.className = "loc-btn";
      track.textContent = "Track order";
      track.addEventListener("click", function () { closeAccount(); openTrack(o.id); });
      card.appendChild(track);
      box.appendChild(card);
    });
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
    openAccount();
    var head = $("acctOrdersHead");
    if (head && head.scrollIntoView) head.scrollIntoView({ block: "start" });
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
    checkoutLoc = createLocationPicker({ gps: "gpsBtn", choose: "mapBtn", error: "locError", mapBox: "mapBox", map: "map", status: "locStatus" });
    acctLoc = createLocationPicker({ gps: "acctGpsBtn", choose: "acctMapBtn", error: "acctLocError", mapBox: "acctMapBox", map: "acctMap", status: "acctLocStatus" });
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
    $("introDelivery").textContent = " A flat " + money(CONFIG.deliveryCharge) + " delivery charge is added to every order.";
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

  init();
})();
