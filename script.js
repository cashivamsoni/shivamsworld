/* =========================================================
   Shivam's World — JavaScript
   ========================================================= */

/* ---------- Menu Toggle ---------- */
(function () {
  const toggleBtn = document.getElementById("menuToggle");
  const nav = document.getElementById("mainNav");
  if (!toggleBtn || !nav) return;

  toggleBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    nav.classList.toggle("show");
    toggleBtn.textContent = nav.classList.contains("show")
      ? "× Close"
      : "☰ Menu";
  });

  // Close when any nav link is clicked
  document.querySelectorAll("#mainNav a").forEach(function (link) {
    link.addEventListener("click", function () {
      nav.classList.remove("show");
      toggleBtn.textContent = "☰ Menu";
    });
  });

  // Close when clicking outside
  document.addEventListener("click", function (e) {
    if (!nav.contains(e.target) && e.target !== toggleBtn) {
      nav.classList.remove("show");
      toggleBtn.textContent = "☰ Menu";
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
    ".feature-card, .video-card, .shorts-item, .video-main, .shivamphoto, .qrcode, .section",
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
          text: "Check out Shivam's World — a creative brand for DIYs, Calligraphy, Sketches & much more!",
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
