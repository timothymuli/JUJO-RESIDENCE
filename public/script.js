(function () {
  "use strict";

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  onReady(function () {
    var spinner = document.getElementById("loading-spinner");
    window.addEventListener("load", function () {
      if (spinner) spinner.style.display = "none";
    });

    var darkToggle = document.getElementById("dark-mode-toggle");
    if (darkToggle) {
      try {
        if (localStorage.getItem("jujo-theme") === "dark") {
          document.body.classList.add("dark-mode");
        }
      } catch (err) {}
      darkToggle.addEventListener("click", function () {
        document.body.classList.toggle("dark-mode");
        try {
          localStorage.setItem(
            "jujo-theme",
            document.body.classList.contains("dark-mode") ? "dark" : "light"
          );
        } catch (err) {}
      });
    }

    var backBtn = document.getElementById("back-to-top");
    if (backBtn) {
      function syncBackTop() {
        var scrolled =
          window.scrollY || document.documentElement.scrollTop || 0;
        backBtn.style.display = scrolled > 100 ? "block" : "none";
      }
      window.addEventListener("scroll", syncBackTop, { passive: true });
      syncBackTop();
      backBtn.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    var cookieBar = document.getElementById("cookie-consent-banner");
    var acceptBtn = document.getElementById("accept-cookies");
    if (cookieBar) {
      try {
        if (localStorage.getItem("jujo-cookies") === "ok") {
          cookieBar.hidden = true;
        }
      } catch (err) {}
    }
    if (cookieBar && acceptBtn) {
      acceptBtn.addEventListener("click", function () {
        cookieBar.hidden = true;
        try {
          localStorage.setItem("jujo-cookies", "ok");
        } catch (err) {}
      });
    }

    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function (e) {
        var hash = link.getAttribute("href");
        if (!hash || hash === "#") return;
        var target = document.getElementById(hash.slice(1));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth" });
        }
      });
    });

    var search = document.querySelector(".search-bar");
    if (search) {
      search.addEventListener("input", function () {
        var q = search.value.trim().toLowerCase();
        var blocks = document.querySelectorAll(
          "main .page-section, main .welcome-section, main .hero, main .section"
        );
        blocks.forEach(function (el) {
          var text = el.textContent.toLowerCase();
          el.style.display = !q || text.indexOf(q) !== -1 ? "" : "none";
        });
      });
    }

    var phoneEl = document.getElementById("contact-phone");
    var emailEl = document.getElementById("contact-email");
    if (phoneEl || emailEl) {
      fetch("/api/config")
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data.contactPhone && phoneEl) phoneEl.textContent = data.contactPhone;
          if (data.contactEmail && emailEl) emailEl.textContent = data.contactEmail;
        })
        .catch(function () {});
    }

    var contactForm = document.getElementById("contact-form");
    if (contactForm) {
      var msg = document.getElementById("contact-form-msg");
      contactForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var fd = new FormData(contactForm);
        var body = {
          name: fd.get("name"),
          email: fd.get("email"),
          message: fd.get("message"),
          property_slug: fd.get("property_slug") || "",
        };
        fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (x) {
            if (!msg) return;
            msg.className = "form-msg " + (x.ok ? "ok" : "err");
            msg.textContent = x.ok
              ? "Sent — we’ll get back to you."
              : x.j.error || "Something went wrong.";
            if (x.ok) contactForm.reset();
          })
          .catch(function () {
            if (msg) {
              msg.className = "form-msg err";
              msg.textContent = "Couldn’t reach the server — check that it’s running.";
            }
          });
      });
    }
  });
})();
