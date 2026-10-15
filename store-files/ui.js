/* =========================================================
   Shivam's World — shared UI pieces (store + admin)
   window.SWUI.customSelect(select, { label })  -> styled dropdown list
   window.SWUI.confirm({ title, message, ... })  -> styled confirm dialog
   Both replace the browser's own black pop-ups so everything
   matches the site. The original <select> stays in the page,
   so existing code that reads .value or listens for "change"
   keeps working.
   ========================================================= */
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

      function finish(answer) {
        document.removeEventListener("keydown", onKey, true);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (lockedHere) document.body.classList.remove("store-locked");
        if (previous && previous.focus) previous.focus();
        resolve(answer);
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

  /* ---------- Smooth light/dark switch ---------- */
  // Runs `change` (the function that flips the theme) with a soft cross-fade of the whole page
  function fadeTheme(change) {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { change(); return; }
    if (document.startViewTransition) { // modern browsers fade the old page into the new one
      document.startViewTransition(change);
      return;
    }
    var root = document.documentElement; // others: fade colours and borders
    root.classList.add("theme-fade");
    change();
    setTimeout(function () { root.classList.remove("theme-fade"); }, 500);
  }

  window.SWUI = { customSelect: customSelect, confirm: confirmDialog, fadeTheme: fadeTheme };
})();
