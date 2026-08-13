/* =========================================================
   Shivam's World — JavaScript
   ========================================================= */

/* ---------- Dark Mode Toggle ---------- */
(function () {
  const themeBtn = document.getElementById("themeToggle");
  if (!themeBtn) return;
  const themeIcon = themeBtn.querySelector("i");

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute("content", theme === "dark" ? "#2a0066" : "#6f00ff");

    if (theme === "dark") {
      themeBtn.setAttribute("aria-label", "Switch to light mode");
      themeBtn.setAttribute("title", "Switch to light mode");
      if (themeIcon) themeIcon.className = "fa fa-sun-o";
    } else {
      themeBtn.setAttribute("aria-label", "Switch to dark mode");
      themeBtn.setAttribute("title", "Switch to dark mode");
      if (themeIcon) themeIcon.className = "fa fa-moon-o";
    }
  }

  applyTheme(localStorage.getItem("sw-theme") || "light");

  themeBtn.addEventListener("click", function () {
    const next =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    applyTheme(next);
    localStorage.setItem("sw-theme", next);
  });
})();

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

/* ---------- Image Lightbox ---------- */
(function () {
  const overlay = document.getElementById("imgLightboxOverlay");
  const lightboxImg = document.getElementById("imgLightboxImg");
  const closeBtn = document.getElementById("imgLightboxClose");
  if (!overlay || !lightboxImg) return;

  function openLightbox(src, alt) {
    lightboxImg.src = src;
    lightboxImg.alt = alt || "";
    overlay.classList.add("show");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    overlay.classList.remove("show");
    document.body.style.overflow = "";
  }

  document.querySelectorAll("img").forEach(function (img) {
    if (img.closest("header") || img.closest("#popupBoxUnique") || img === lightboxImg) return;
    img.style.cursor = "zoom-in";
    img.addEventListener("click", function () {
      openLightbox(img.src, img.alt);
    });
  });

  // Close when clicking outside the image (on the overlay itself)
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeLightbox();
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", closeLightbox);
  }
})();

/* ---------- Menu Toggle ---------- */
(function () {
  const toggleBtn = document.getElementById("menuToggle");
  const nav = document.getElementById("mainNav");
  if (!toggleBtn || !nav) return;

  toggleBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    nav.classList.toggle("show");
    toggleBtn.classList.toggle("open");
  });

  // Close when any nav link is clicked
  document.querySelectorAll("#mainNav a").forEach(function (link) {
    link.addEventListener("click", function () {
      nav.classList.remove("show");
      toggleBtn.classList.remove("open");
    });
  });

  // Close when clicking outside
  document.addEventListener("click", function (e) {
    if (!nav.contains(e.target) && e.target !== toggleBtn) {
      nav.classList.remove("show");
      toggleBtn.classList.remove("open");
    }
  });
})();

/* ---------- Welcome Popup ---------- */
(function () {
  const closeBtn = document.getElementById("popupCloseUnique");
  const overlay = document.getElementById("popupOverlayUnique");

  // Show popup on page load and lock scroll
  if (overlay) {
    overlay.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  // Close when clicking the X button
  if (closeBtn) {
    closeBtn.onclick = function () {
      overlay.style.display = "none";
      document.body.style.overflow = "";
    };
  }

  // Close when clicking outside the popup box (on the overlay)
  if (overlay) {
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) {
        overlay.style.display = "none";
        document.body.style.overflow = "";
      }
    });
  }
})();

/* ---------- Search Bar (Shivam's World) ---------- */
(function () {
  const input = document.getElementById("searchInput");
  if (!input) return;

  // Inject clear button into the wrapper
  const clearBtn = document.createElement("button");
  clearBtn.textContent = "×";
  clearBtn.className = "sw-search-clear";
  input.parentNode.appendChild(clearBtn);

  const listItems = document.getElementById("searchList")
    ? document.getElementById("searchList").getElementsByTagName("li")
    : [];

  function filterItems(value) {
    const keywords = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    for (let i = 0; i < listItems.length; i++) {
      const txt = listItems[i].textContent.toLowerCase();
      const matches =
        keywords.length === 0 || keywords.every((k) => txt.includes(k));
      listItems[i].style.display = matches ? "" : "none";
    }
    clearBtn.style.display = value.length > 0 ? "block" : "none";
  }

  input.addEventListener("keyup", function (e) {
    filterItems(input.value);

    // Enter: scroll to first visible result
    if (e.key === "Enter") {
      for (let i = 0; i < listItems.length; i++) {
        if (listItems[i].style.display !== "none") {
          const link = listItems[i].querySelector("a");
          if (link) {
            const href = link.getAttribute("href");
            if (href && href.startsWith("#")) {
              const target = document.getElementById(href.substring(1));
              if (target) target.scrollIntoView({ behavior: "smooth" });
            } else if (href) {
              window.open(href, link.target || "_self");
            }
          }
          break;
        }
      }
    }
  });

  clearBtn.addEventListener("click", function () {
    input.value = "";
    filterItems("");
    input.focus();
  });

  // Smooth scroll on list item click
  document.querySelectorAll("#searchList a").forEach(function (link) {
    link.addEventListener("click", function (e) {
      const href = this.getAttribute("href");
      if (href && href.startsWith("#")) {
        e.preventDefault();
        const target = document.getElementById(href.substring(1));
        if (target) target.scrollIntoView({ behavior: "smooth" });
      }
    });
  });
})();

/* ---------- Scroll-to-Top Button ---------- */
(function () {
  const topBtn = document.getElementById("topBtn");
  if (!topBtn) return;

  window.addEventListener("scroll", function () {
    topBtn.style.display =
      document.body.scrollTop > 120 || document.documentElement.scrollTop > 120
        ? "flex"
        : "none";
  });

  topBtn.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
})();

/* ----- Lifted Animation For Feature Cards ----- */
// Animate feature cards every time they scroll into view
document.addEventListener("DOMContentLoaded", () => {
  const cards = document.querySelectorAll(
    ".video-card, .shorts-item, .video-main, .shivamphoto, .qrcode, .section:not(#featured)",
  );

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
        } else {
          // remove visible when card leaves viewport
          entry.target.classList.remove("visible");
        }
      });
    },
    { threshold: 0.2 }, // trigger when 20% of card is visible
  );

  cards.forEach((card) => observer.observe(card));

  // Featured Creations cards get a lower threshold since the section
  // is tall and cards weren't triggering until scrolled further in
  const featureCards = document.querySelectorAll(".feature-card");

  const featureObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
        } else {
          entry.target.classList.remove("visible");
        }
      });
    },
    { threshold: 0.1 }, // trigger when 10% of card is visible
  );

  featureCards.forEach((card) => featureObserver.observe(card));

  // #featured is very tall (8 cards stacked), so a 20%-of-height threshold
  // never fires until deep into the section. Use rootMargin instead, so it
  // becomes visible as soon as it starts entering the lower half of the screen.
  const featuredSection = document.getElementById("featured");
  if (featuredSection) {
    const featuredSectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          } else {
            entry.target.classList.remove("visible");
          }
        });
      },
      { threshold: 0, rootMargin: "0px 0px -50% 0px" },
    );
    featuredSectionObserver.observe(featuredSection);
  }
});

/* ---------- Share Button ---------- */
(function () {
  const shareBtn = document.getElementById("shareBtn");
  if (!shareBtn) return;

  shareBtn.addEventListener("click", async function () {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Shivam's World - Home",
          text: "Check out Shivam's World - a creative brand for DIYs, Calligraphy, Sketches & much more!",
          url: window.location.href,
        });
      } catch (error) {
        console.error("Error sharing:", error);
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        alert("Link copied to clipboard!");
      } catch {
        alert(
          "Sharing not supported on this browser. Copy the URL from your address bar.",
        );
      }
    }
  });
})();

/* ---------- Smooth Scroll for anchor buttons ---------- */
(function () {
  document.querySelectorAll("a[href^='#']").forEach(function (link) {
    link.addEventListener("click", function (e) {
      const id = this.getAttribute("href").substring(1);
      const target = document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
})();/* =========================================================
   AI Assistant Widget
   Two-tier design: Gemini API (via /api/chat) as the primary
   conversational layer, with a free local rule-based fallback
   that silently takes over if the API errors, times out, or is
   rate-limited — so the assistant never fully depends on the
   external service.
   ========================================================= */
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

  const previewMessages = [
    "Ask about custom orders.",
    "Ask how to reach Shivam.",
    "Ask what's on the channel.",
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
        "For custom orders, the quickest way is to message Shivam directly on WhatsApp: https://wa.link/zvaoa9 — share what you'd like (calligraphy, sketch, DIY piece, etc.) and he'll get back to you with details.",
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
    return "I'm not fully sure about that one — the best way to get an accurate answer is to reach out to Shivam directly on WhatsApp: https://wa.link/zvaoa9";
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
