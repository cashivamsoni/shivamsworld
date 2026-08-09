/* =========================================================
   Shivam's World — JavaScript
   ========================================================= */

/* ---------- Dark Mode Toggle ---------- */
(function () {
  const themeBtn = document.getElementById("themeToggle");
  if (!themeBtn) return;

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeBtn.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute("content", theme === "dark" ? "#2a0066" : "#6f00ff");
  }

  applyTheme(localStorage.getItem("sw-theme") || "light");

  themeBtn.addEventListener("click", function () {
    const next =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    applyTheme(next);
    localStorage.setItem("sw-theme", next);

    const nav = document.getElementById("mainNav");
    const menuBtn = document.getElementById("menuToggle");
    if (nav) nav.classList.remove("show");
    if (menuBtn) menuBtn.classList.remove("open");
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
        ? "block"
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
})();
/* =========================================================
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
  const previewClose = document.getElementById("aiPreviewClose");
  const micBtn = document.getElementById("aiMicBtn");
  if (!widget || !toggleBtn || !chatWindow) return;

  let stopListening = function () {};

  const PREVIEW_DISMISS_KEY = "sw-ai-preview-dismissed";
  const AUTOREAD_KEY = "sw-ai-autoread";
  const WELCOME_MSG =
    "Hi! I'm Shivam's AI assistant 🎨 Ask me anything about the DIYs, calligraphy, sketches, custom orders, or how to reach Shivam.";

  const previewMessages = [
    "Hi! I'm Shivam's AI assistant 👋 Ask me about DIYs, calligraphy or custom orders.",
    "Curious how to get a custom calligraphy piece made? Just ask me! ✍️",
    "Need Shivam's contact details? I can help right here. 📩",
  ];

  // Conversation lives in memory only for the current page load — nothing
  // is written to localStorage, so it starts fresh on every visit/refresh.
  let history = [];
  let isTyping = false;
  const ttsSupported = "speechSynthesis" in window;
  let autoReadEnabled = false;

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
    // Header height can change when the mobile nav wraps/opens.
    const nav = document.getElementById("mainNav");
    if (nav) {
      const obs = new MutationObserver(measure);
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

  function renderRichText(rawText) {
    let safe = escapeHtml(rawText);
    safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/\*(.+?)\*/g, '<span class="ai-em">$1</span>');
    return safe;
  }

  // Markdown markers are stripped entirely before text reaches
  // speechSynthesis, so the assistant never reads out asterisks.
  function stripMarkdown(rawText) {
    return rawText.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
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
  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function updatePlayBtn(msg, btn) {
    if (!btn) return;
    btn.classList.remove("playing", "replay");
    if (msg.ttsState === "reading") {
      btn.classList.add("playing");
      btn.innerHTML = '<i class="fa fa-pause"></i>';
      btn.setAttribute("aria-label", "Pause reading");
    } else if (msg.ttsState === "done") {
      btn.classList.add("replay");
      btn.innerHTML = '<i class="fa fa-repeat"></i>';
      btn.setAttribute("aria-label", "Replay message");
    } else {
      btn.innerHTML = '<i class="fa fa-play"></i>';
      btn.setAttribute("aria-label", "Read message aloud");
    }
  }

  function renderMessage(msg) {
    const div = document.createElement("div");
    div.className =
      "ai-msg " +
      (msg.role === "user"
        ? "ai-msg-user"
        : msg.role === "error"
        ? "ai-msg-error"
        : "ai-msg-bot");

    const textSpan = document.createElement("span");
    if (msg.role === "bot") {
      textSpan.innerHTML = renderRichText(msg.text);
    } else {
      textSpan.textContent = msg.text;
    }
    div.appendChild(textSpan);

    if (msg.role === "bot" && ttsSupported) {
      if (!msg.ttsState) msg.ttsState = "idle";
      if (typeof msg.ttsPos !== "number") msg.ttsPos = 0;

      const footer = document.createElement("div");
      footer.className = "ai-msg-footer";

      const timeSpan = document.createElement("span");
      timeSpan.className = "ai-msg-time";
      timeSpan.textContent = formatTime(msg.ts);

      const playBtn = document.createElement("button");
      playBtn.type = "button";
      playBtn.className = "ai-msg-play";
      updatePlayBtn(msg, playBtn);
      playBtn.addEventListener("click", function () {
        toggleSpeak(msg, playBtn);
      });
      msg._btn = playBtn;

      footer.appendChild(timeSpan);
      footer.appendChild(playBtn);
      div.appendChild(footer);
    } else if (msg.role !== "error") {
      const timeSpan = document.createElement("span");
      timeSpan.className = "ai-msg-time";
      timeSpan.textContent = formatTime(msg.ts);
      div.appendChild(timeSpan);
    }

    messagesEl.appendChild(div);
    return div;
  }

  function renderAll() {
    messagesEl.innerHTML = "";
    if (history.length === 0) {
      history.push({ role: "bot", text: WELCOME_MSG, ts: Date.now(), ttsState: "idle", ttsPos: 0 });
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
    hidePreview(false);
    stopPreviewCycle();
    renderAll();
    setTimeout(() => input && input.focus(), 250);
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
  document.addEventListener("click", function (e) {
    if (!widget.classList.contains("open")) return;
    if (chatWindow.contains(e.target) || toggleBtn.contains(e.target)) return;
    closeChat();
  });

  /* ----- Preview bubble teaser (recurring, rotating messages) -----
     Paused whenever the panel is open, resumed on close. The show
     transition is retriggered by forcing a DOM reflow between
     removing and re-adding the "show" class, so the fade-in fires
     reliably even if the previous cycle's transition hadn't fully
     settled. ----- */
  let previewCycleTimer = null;
  let previewDismissedForSession = false;

  function hidePreview(permanent) {
    if (!previewBubble) return;
    previewBubble.classList.remove("show");
    if (permanent) {
      previewDismissedForSession = true;
      try {
        sessionStorage.setItem(PREVIEW_DISMISS_KEY, "1");
      } catch {}
      stopPreviewCycle();
    }
  }

  function stopPreviewCycle() {
    if (previewCycleTimer) {
      clearTimeout(previewCycleTimer);
      previewCycleTimer = null;
    }
  }

  function resumePreviewCycle() {
    if (previewDismissedForSession || previewCycleTimer) return;
    previewCycleTimer = setTimeout(showNextPreview, 15000);
  }

  function showNextPreview() {
    if (!previewBubble || previewDismissedForSession || widget.classList.contains("open")) return;
    const msg = previewMessages[Math.floor(Math.random() * previewMessages.length)];
    if (previewText) previewText.textContent = msg;

    // Force a reflow between removing and re-adding "show" so the fade-in
    // transition reliably retriggers even mid-cycle.
    previewBubble.classList.remove("show");
    void previewBubble.offsetWidth;
    previewBubble.classList.add("show");

    previewCycleTimer = setTimeout(function () {
      previewBubble.classList.remove("show");
      previewCycleTimer = setTimeout(showNextPreview, 15000);
    }, 5000);
  }

  function initPreview() {
    if (!previewBubble) return;
    try {
      previewDismissedForSession =
        sessionStorage.getItem(PREVIEW_DISMISS_KEY) === "1";
    } catch {}
    if (previewDismissedForSession) return;
    previewCycleTimer = setTimeout(showNextPreview, 1500);
  }

  if (previewClose) {
    previewClose.addEventListener("click", function (e) {
      e.stopPropagation();
      hidePreview(true);
    });
  }
  if (previewBubble) {
    previewBubble.addEventListener("click", function (e) {
      e.stopPropagation();
      openChat();
    });
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

    history.push({ role: "bot", text: replyText, ts: Date.now(), ttsState: "idle", ttsPos: 0 });
    const msgEl = renderMessage(history[history.length - 1]);
    if (autoReadEnabled && ttsSupported) {
      const bot = history[history.length - 1];
      toggleSpeak(bot, bot._btn);
    }

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
     Read aloud (Web Speech Synthesis)

     Deliberately avoids native pause()/resume() — unreliable,
     especially on mobile where resume() is known to silently
     fail. Instead: pausing fully cancels the utterance (position
     is preserved), and resuming starts a brand-new utterance from
     that tracked character position.

     Position is tracked two ways: word-boundary events where the
     browser fires them, and a time-elapsed character-rate
     estimate (~15 chars/sec) as a universal fallback, since mobile
     browsers often never fire boundary events at all.

     A generation counter plus explicit handler-nulling on every
     cancel guards against stale, late-firing callbacks from an
     already-abandoned utterance corrupting another message's UI
     state.
  --------------------------------------------------------- */
  const CHARS_PER_SEC = 15;
  let ttsGen = 0;
  let activeMsg = null;
  let activeBtn = null;
  let activeTimer = null;

  function clearActiveTimer() {
    if (activeTimer) {
      clearInterval(activeTimer);
      activeTimer = null;
    }
  }

  // Cancels whatever is currently speaking. If `pausing` is true, the
  // abandoned message is left in a resumable "paused" state at its last
  // tracked position; otherwise it's just dropped (e.g. natural end, or
  // switching to read a different message).
  function haltActive(pausing) {
    ttsGen++; // invalidate any in-flight callbacks from the old utterance
    clearActiveTimer();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (activeMsg) {
      activeMsg.ttsState = pausing ? "paused" : activeMsg.ttsState;
      if (activeBtn) updatePlayBtn(activeMsg, activeBtn);
    }
    activeMsg = null;
    activeBtn = null;
  }

  function beginSpeaking(msg, btn, fromChar) {
    if (!ttsSupported) return;
    haltActive(true); // pause/abandon whatever was previously active

    const plain = stripMarkdown(msg.text);
    const startPos = Math.min(Math.max(fromChar, 0), plain.length);
    const remaining = plain.slice(startPos);
    if (!remaining) {
      msg.ttsState = "done";
      msg.ttsPos = 0;
      updatePlayBtn(msg, btn);
      return;
    }

    const myGen = ttsGen;
    const utter = new SpeechSynthesisUtterance(remaining);
    utter.rate = 1;
    utter.pitch = 1;

    let boundaryFired = false;
    const startedAt = performance.now();

    activeTimer = setInterval(function () {
      if (myGen !== ttsGen) return;
      if (boundaryFired) return; // trust real boundary events once they start firing
      const elapsed = (performance.now() - startedAt) / 1000;
      msg.ttsPos = Math.min(startPos + Math.floor(elapsed * CHARS_PER_SEC), plain.length);
    }, 200);

    utter.onboundary = function (e) {
      if (myGen !== ttsGen) return;
      boundaryFired = true;
      if (typeof e.charIndex === "number") {
        msg.ttsPos = Math.min(startPos + e.charIndex, plain.length);
      }
    };

    utter.onend = function () {
      if (myGen !== ttsGen) return; // stale callback from an abandoned utterance
      clearActiveTimer();
      msg.ttsState = "done";
      msg.ttsPos = 0;
      updatePlayBtn(msg, btn);
      activeMsg = null;
      activeBtn = null;
    };

    utter.onerror = function () {
      if (myGen !== ttsGen) return;
      clearActiveTimer();
      // Leave it paused at wherever it got to, rather than marking done,
      // since an error means it didn't finish naturally.
      msg.ttsState = "paused";
      updatePlayBtn(msg, btn);
      activeMsg = null;
      activeBtn = null;
    };

    msg.ttsState = "reading";
    updatePlayBtn(msg, btn);
    activeMsg = msg;
    activeBtn = btn;
    window.speechSynthesis.speak(utter);
  }

  function toggleSpeak(msg, btn) {
    if (!ttsSupported || !msg) return;

    if (activeMsg === msg) {
      // This message is the one currently loaded in the synth.
      if (msg.ttsState === "reading") {
        haltActive(true); // pause: cancel + keep tracked position
      }
      return;
    }

    if (msg.ttsState === "done") {
      beginSpeaking(msg, btn, 0); // replay from the start
    } else {
      beginSpeaking(msg, btn, msg.ttsPos || 0); // fresh start or resume
    }
  }

  function stopSpeaking() {
    if (!ttsSupported) return;
    haltActive(true);
  }

  (function initReadToggle() {
    const readToggle = document.getElementById("aiReadToggle");
    if (!readToggle) return;
    if (!ttsSupported) {
      readToggle.hidden = true;
      return;
    }
    try {
      autoReadEnabled = localStorage.getItem(AUTOREAD_KEY) === "1";
    } catch {}
    readToggle.setAttribute("aria-pressed", String(autoReadEnabled));
    readToggle.innerHTML = autoReadEnabled
      ? '<i class="fa fa-volume-up"></i>'
      : '<i class="fa fa-volume-off"></i>';

    readToggle.addEventListener("click", function () {
      autoReadEnabled = !autoReadEnabled;
      readToggle.setAttribute("aria-pressed", String(autoReadEnabled));
      readToggle.innerHTML = autoReadEnabled
        ? '<i class="fa fa-volume-up"></i>'
        : '<i class="fa fa-volume-off"></i>';
      try {
        localStorage.setItem(AUTOREAD_KEY, autoReadEnabled ? "1" : "0");
      } catch {}
      if (!autoReadEnabled) stopSpeaking();
    });
  })();

  /* ----- Init ----- */
  initPreview();
})();
