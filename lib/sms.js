"use strict";

/**
 * Sends SMS via Africa's Talking when API key is set.
 * SMS_MOCK=1 → log only (for local dev).
 * No key → log only (same as mock).
 */
function sendSms(toE164, message) {
  if (process.env.SMS_MOCK === "1") {
    console.log("[SMS mock → " + toE164 + "]", message);
    return Promise.resolve({ ok: true, mock: true });
  }

  const apiKey = process.env.AFRICASTALKING_API_KEY;
  if (!apiKey) {
    console.log("[SMS no API key — set AFRICASTALKING_* or SMS_MOCK=1]", toE164, message);
    return Promise.resolve({ ok: true, mock: true });
  }

  const username = process.env.AFRICASTALKING_USERNAME;
  const sender = process.env.AFRICASTALKING_SENDER || "JUJO";

  const body = new URLSearchParams({
    username: username || "sandbox",
    to: toE164,
    message: message,
    from: sender,
  });

  return fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      apiKey: apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  })
    .then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) {
          console.error("[SMS error]", j);
          return { ok: false };
        }
        return { ok: true };
      });
    })
    .catch(function (err) {
      console.error("[SMS fetch]", err);
      return { ok: false };
    });
}

module.exports = { sendSms };
