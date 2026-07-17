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
    ".video-card, .shorts-item, .video-main, .shivamphoto, .qrcode, .section",
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

  // Feature cards use a lower threshold on mobile (0.1) since the cards
  // stack full-width and take up more screen space; desktop keeps 0.2
  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  const featureCards = document.querySelectorAll(".feature-card");

  const featureCardObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
        } else {
          entry.target.classList.remove("visible");
        }
      });
    },
    { threshold: isMobile ? 0.1 : 0.2 },
  );

  featureCards.forEach((card) => featureCardObserver.observe(card));

  // Featured Creations section wrapper gets a lower, viewport-based trigger
  // point since it's a very tall section (especially on mobile) — using an
  // area-based threshold like the other sections meant the 10% mark was
  // never reached, so the whole section stayed invisible while scrolling.
  const featuredSection = document.getElementById("featured");
  if (featuredSection) {
    const featuredObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          } else {
            entry.target.classList.remove("visible");
          }
        });
      },
      { threshold: 0, rootMargin: "0px 0px 50% 0px" }, // fires early, while the previous section is still mostly on screen
    );

    featuredObserver.observe(featuredSection);
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
