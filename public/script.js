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
    var ussdEl = document.getElementById("ussd-dial");
    var contactHint = document.getElementById("contact-hint");
    var noticesEl = document.getElementById("site-notices");
    var noticesEmpty = document.getElementById("site-notices-empty");
    var socialEl = document.getElementById("social-links");

    function setContact(el, value, kind) {
      if (!el) return;
      el.textContent = "";
      el.classList.remove("muted");
      if (!value) {
        el.textContent = "Office line coming soon";
        el.classList.add("muted");
        return;
      }
      if (kind === "phone") {
        var a = document.createElement("a");
        a.href = "tel:" + String(value).replace(/\s/g, "");
        a.textContent = value;
        el.appendChild(a);
        return;
      }
      if (kind === "email") {
        var mail = document.createElement("a");
        mail.href = "mailto:" + value;
        mail.textContent = value;
        el.appendChild(mail);
        return;
      }
      el.textContent = value;
    }

    function renderNotices(notices) {
      if (!noticesEl || !noticesEmpty) return;
      if (!notices || !notices.length) {
        noticesEl.hidden = true;
        noticesEmpty.hidden = false;
        return;
      }
      noticesEl.innerHTML = "";
      notices.forEach(function (text) {
        var li = document.createElement("li");
        li.textContent = text;
        noticesEl.appendChild(li);
      });
      noticesEl.hidden = false;
      noticesEmpty.hidden = true;
    }

    function renderSocial(social) {
      if (!socialEl || !social) return;
      var links = [];
      if (social.facebook) {
        links.push({ label: "Facebook", url: social.facebook });
      }
      if (social.instagram) {
        links.push({ label: "Instagram", url: social.instagram });
      }
      if (social.linkedin) {
        links.push({ label: "LinkedIn", url: social.linkedin });
      }
      if (!links.length) {
        socialEl.hidden = true;
        return;
      }
      socialEl.innerHTML = "";
      links.forEach(function (item, idx) {
        if (idx > 0) socialEl.appendChild(document.createTextNode(" · "));
        var a = document.createElement("a");
        a.href = item.url;
        a.textContent = item.label;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        socialEl.appendChild(a);
      });
      socialEl.hidden = false;
    }

    if (phoneEl || emailEl || ussdEl || noticesEl || socialEl) {
      fetch("/api/config")
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          setContact(phoneEl, data.contactPhone, "phone");
          setContact(emailEl, data.contactEmail, "email");
          if (data.ussdDial && ussdEl) ussdEl.textContent = data.ussdDial;
          if (contactHint && data.contactPhone && data.contactEmail) {
            contactHint.textContent =
              "Call, email, or use the form below — choose the property so the right team sees your message.";
          }
          renderNotices(data.notices);
          renderSocial(data.social);
        })
        .catch(function () {
          setContact(phoneEl, "", "phone");
          setContact(emailEl, "", "email");
        });
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
