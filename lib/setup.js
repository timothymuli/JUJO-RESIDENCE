"use strict";

const fs = require("fs");
const path = require("path");

function hasPropertyPhotos(subdir) {
  const dir = path.join(__dirname, "..", "public", "images", subdir);
  try {
    return fs.readdirSync(dir).some(function (f) {
      return /\.(jpe?g|webp|png)$/i.test(f);
    });
  } catch (err) {
    return false;
  }
}

function parseNotices() {
  const raw = process.env.SITE_NOTICES || "";
  if (!raw.trim()) return [];
  return raw
    .split("|")
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
}

function socialLinks() {
  return {
    facebook: (process.env.SOCIAL_FACEBOOK_URL || "").trim(),
    instagram: (process.env.SOCIAL_INSTAGRAM_URL || "").trim(),
    linkedin: (process.env.SOCIAL_LINKEDIN_URL || "").trim(),
  };
}

function buildSetupChecklist() {
  const smsLive =
    process.env.SMS_MOCK !== "1" &&
    Boolean(process.env.AFRICASTALKING_USERNAME) &&
    process.env.AFRICASTALKING_USERNAME.toLowerCase() !== "sandbox" &&
    Boolean(process.env.AFRICASTALKING_API_KEY);
  const mpesaLive =
    process.env.MPESA_MOCK !== "1" &&
    Boolean(process.env.MPESA_CONSUMER_KEY) &&
    Boolean(process.env.MPESA_CONSUMER_SECRET) &&
    Boolean(process.env.MPESA_PASSKEY) &&
    Boolean(process.env.MPESA_SHORTCODE);

  return [
    {
      id: "contact_phone",
      label: "Public contact phone",
      done: Boolean((process.env.CONTACT_PHONE || "").trim()),
      how: "Render → Environment → CONTACT_PHONE (e.g. +254758981679)",
    },
    {
      id: "contact_email",
      label: "Public contact email",
      done: Boolean((process.env.CONTACT_EMAIL || "").trim()),
      how: "Render → Environment → CONTACT_EMAIL",
    },
    {
      id: "admin_password",
      label: "Admin password changed from demo",
      done: Boolean(
        process.env.ADMIN_PASSWORD &&
          process.env.ADMIN_PASSWORD !== "muli/123"
      ),
      how: "Set ADMIN_PASSWORD on Render (not the demo muli/123)",
    },
    {
      id: "session_secret",
      label: "Session secret set",
      done: Boolean(
        process.env.SESSION_SECRET &&
          process.env.SESSION_SECRET !== "replace-with-long-random-string" &&
          process.env.SESSION_SECRET !== "dev-only-change-me-in-production"
      ),
      how: "Render auto-generates SESSION_SECRET; local: use a long random string in .env",
    },
    {
      id: "sms_live",
      label: "Live SMS account configured (OTP + reminders)",
      done: smsLive,
      how: "Use your Africa's Talking Live username/API key (not username sandbox), set SMS_MOCK=0, and add account credit. See docs/RENDER_SMS_MPESA.md",
    },
    {
      id: "mpesa_live",
      label: "Live M-Pesa STK push",
      done: mpesaLive,
      how: "MPESA_MOCK=0 + Daraja keys. See docs/RENDER_SMS_MPESA.md",
    },
    {
      id: "public_url",
      label: "PUBLIC_BASE_URL set for callbacks",
      done: Boolean((process.env.PUBLIC_BASE_URL || "").trim()),
      how: "PUBLIC_BASE_URL=https://jujo-residence.onrender.com on Render",
    },
    {
      id: "database_storage",
      label: "Tenant data survives Render restarts",
      done: false,
      manual: true,
      how: "Render Free uses temporary storage, so SQLite can reset on sleep/restart/deploy. Choose durable database storage before real tenant or payment records.",
    },
    {
      id: "photos_mlolongo",
      label: "JUJO Heights photos uploaded",
      done: hasPropertyPhotos("jujo-heights"),
      how: "Add JPGs to public/images/jujo-heights/ — see public/images/README.md",
    },
    {
      id: "photos_syokimau",
      label: "Blessed Haven photos uploaded",
      done: hasPropertyPhotos("blessed-haven"),
      how: "Add JPGs to public/images/blessed-haven/",
    },
    {
      id: "at_callbacks",
      label: "Africa's Talking webhooks configured",
      done: false,
      manual: true,
      how: "Paste URLs from docs/AFRICASTALKING_CALLBACKS.md into the AT dashboard",
    },
    {
      id: "daraja_c2b",
      label: "Safaricom C2B URLs registered (auto Paybill match)",
      done: false,
      manual: true,
      how: "Register /api/mpesa/c2b/validation and /confirmation in Daraja",
    },
    {
      id: "social_links",
      label: "Social media links on footer",
      done: Object.values(socialLinks()).some(Boolean),
      how: "Set SOCIAL_FACEBOOK_URL, SOCIAL_INSTAGRAM_URL, SOCIAL_LINKEDIN_URL in env",
    },
    {
      id: "site_notices",
      label: "Live notices on home page",
      done: parseNotices().length > 0,
      how: 'SITE_NOTICES=Notice one|Notice two (pipe-separated) in env',
    },
  ];
}

module.exports = {
  hasPropertyPhotos,
  parseNotices,
  socialLinks,
  buildSetupChecklist,
};
