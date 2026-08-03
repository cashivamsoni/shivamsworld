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
   ========================================================= */
(function () {
  const widget = document.getElementById("aiWidget");
  const toggleBtn = document.getElementById("aiToggleBtn");
  const chatWindow = document.getElementById("aiChatWindow");
  const closeBtn = document.getElementById("aiCloseBtn");
  const clearBtn = document.getElementById("aiClearBtn");
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

  const STORAGE_KEY = "sw-ai-chat-history";
  const PREVIEW_DISMISS_KEY = "sw-ai-preview-dismissed";
  const WELCOME_MSG =
    "Hi! I'm Shivam's AI assistant 🎨 Ask me anything about the DIYs, calligraphy, sketches, custom orders, or how to reach Shivam.";

  const previewMessages = [
    "Hi! I'm Shivam's AI assistant 👋 Ask me about DIYs, calligraphy or custom orders.",
    "Curious how to get a custom calligraphy piece made? Just ask me! ✍️",
    "Need Shivam's contact details? I can help right here. 📩",
  ];

  let history = [];
  let isTyping = false;
  const ttsSupported = "speechSynthesis" in window;
  const AUTOREAD_KEY = "sw-ai-autoread";
  let autoReadEnabled = false;
  let currentUtterance = null;
  let currentPlayBtn = null;

  /* ----- Persistence ----- */
  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      history = raw ? JSON.parse(raw) : [];
    } catch {
      history = [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-40)));
    } catch {}
  }

  /* ----- Rendering ----- */
  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
    textSpan.textContent = msg.text;
    div.appendChild(textSpan);

    if (msg.role === "bot" && ttsSupported) {
      const footer = document.createElement("div");
      footer.className = "ai-msg-footer";

      const timeSpan = document.createElement("span");
      timeSpan.className = "ai-msg-time";
      timeSpan.textContent = formatTime(msg.ts);

      const playBtn = document.createElement("button");
      playBtn.type = "button";
      playBtn.className = "ai-msg-play";
      playBtn.innerHTML = '<i class="fa fa-play"></i>';
      playBtn.setAttribute("aria-label", "Read message aloud");
      playBtn.addEventListener("click", function () {
        toggleSpeak(msg.text, playBtn);
      });

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
      history.push({ role: "bot", text: WELCOME_MSG, ts: Date.now() });
      saveHistory();
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
    el.innerHTML = "<span></span><span></span><span></span>";
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function hideTyping() {
    const el = document.getElementById("aiTypingIndicator");
    if (el) el.remove();
  }

  /* ----- Scroll containment -----
     Rather than locking the whole page's scroll (which blocked scrolling
     the rest of the site while the chat was open), scroll is contained to
     the chat window itself via CSS `overscroll-behavior: contain` on
     #aiChatMessages/#aiChatWindow. The page behind stays scrollable. */

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

  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      stopSpeaking();
      history = [];
      saveHistory();
      renderAll();
    });
  }

  /* ----- Preview bubble teaser (recurring, rotating messages) ----- */
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
    previewBubble.classList.add("show");

    // Hide this bubble after a while, then queue the next one — so the
    // teaser resurfaces every so often instead of appearing just once.
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

  /* ----- Sending messages ----- */
  async function sendMessage(text) {
    text = (text || "").trim();
    if (!text || isTyping) return;

    history.push({ role: "user", text: text, ts: Date.now() });
    saveHistory();
    renderMessage(history[history.length - 1]);
    scrollToBottom();

    input.value = "";
    isTyping = true;
    sendBtn.disabled = true;
    showTyping();

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
      hideTyping();

      if (!res.ok || !data.reply) {
        const errMsg =
          data && data.error
            ? data.error
            : "The assistant is warming up and will be ready shortly. Meanwhile, feel free to reach Shivam directly via WhatsApp or the contact section below!";
        history.push({ role: "error", text: errMsg, ts: Date.now() });
        saveHistory();
        renderMessage(history[history.length - 1]);
      } else {
        history.push({ role: "bot", text: data.reply, ts: Date.now() });
        saveHistory();
        const msgEl = renderMessage(history[history.length - 1]);
        if (autoReadEnabled && ttsSupported) {
          const playBtn = msgEl.querySelector(".ai-msg-play");
          if (playBtn) toggleSpeak(data.reply, playBtn);
        }
      }
    } catch (err) {
      hideTyping();
      history.push({
        role: "error",
        text: "Couldn't reach the assistant right now. Please check your connection and try again.",
        ts: Date.now(),
      });
      saveHistory();
      renderMessage(history[history.length - 1]);
    } finally {
      isTyping = false;
      sendBtn.disabled = false;
      scrollToBottom();
    }
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      sendMessage(input.value);
    });
  }

  /* ----- Voice input (Web Speech API) ----- */
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
    let baseValue = "";

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
      baseValue = input.value ? input.value + " " : "";
      setListening(true);
    });

    recognition.addEventListener("result", function (e) {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      input.value = baseValue + transcript;
    });

    recognition.addEventListener("error", function (e) {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        history.push({
          role: "error",
          text: "Microphone access was blocked. Please allow mic permissions to use voice input.",
          ts: Date.now(),
        });
        saveHistory();
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

  /* ----- Read aloud (Web Speech Synthesis) ----- */
  function setPlayBtnState(btn, playing) {
    if (!btn) return;
    btn.classList.toggle("playing", playing);
    btn.innerHTML = playing
      ? '<i class="fa fa-pause"></i>'
      : '<i class="fa fa-play"></i>';
    btn.setAttribute("aria-label", playing ? "Pause reading" : "Read message aloud");
  }

  function stopSpeaking() {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    if (currentPlayBtn) setPlayBtnState(currentPlayBtn, false);
    currentUtterance = null;
    currentPlayBtn = null;
  }

  function toggleSpeak(text, btn) {
    if (!ttsSupported) return;
    const synth = window.speechSynthesis;

    // Clicking the message that's already active: pause/resume it in place.
    if (currentPlayBtn === btn && currentUtterance) {
      if (synth.speaking && !synth.paused) {
        synth.pause();
        setPlayBtnState(btn, false);
      } else if (synth.paused) {
        synth.resume();
        setPlayBtnState(btn, true);
      }
      return;
    }

    // Switching to a different message: stop whatever was playing first.
    synth.cancel();
    if (currentPlayBtn) setPlayBtnState(currentPlayBtn, false);

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    utter.onend = function () {
      setPlayBtnState(btn, false);
      if (currentUtterance === utter) {
        currentUtterance = null;
        currentPlayBtn = null;
      }
    };
    utter.onerror = utter.onend;

    currentUtterance = utter;
    currentPlayBtn = btn;
    setPlayBtnState(btn, true);
    synth.speak(utter);
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
  loadHistory();
  initPreview();
})();
