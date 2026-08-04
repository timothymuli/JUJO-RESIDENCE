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
  const username = process.env.AFRICASTALKING_USERNAME;
  if (!apiKey || !username) {
    console.log(
      "[SMS no API key — set AFRICASTALKING_USERNAME + AFRICASTALKING_API_KEY, and SMS_MOCK=0]",
      toE164,
      message
    );
    return Promise.resolve({ ok: true, mock: true });
  }

  // Sandbox: omit "from" so AT uses default. Live: set AFRICASTALKING_SENDER (approved).
  const params = {
    username: username,
    to: toE164,
    message: message,
  };
  const sender = (process.env.AFRICASTALKING_SENDER || "").trim();
  if (sender) {
    params.from = sender;
  }

  const body = new URLSearchParams(params);

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
      return r.text().then(function (text) {
        var j;
        try {
          j = JSON.parse(text);
        } catch (e) {
          console.error("[SMS non-JSON]", r.status, text.slice(0, 300));
          return { ok: false, error: "SMS API returned non-JSON" };
        }
        if (!r.ok) {
          console.error("[SMS error]", j);
          return {
            ok: false,
            error: (j && (j.message || j.errorMessage)) || "SMS failed",
          };
        }
        var recipients =
          j.SMSMessageData && j.SMSMessageData.Recipients
            ? j.SMSMessageData.Recipients
            : [];
        var first = recipients[0];
        if (first && String(first.statusCode) !== "100" && String(first.statusCode) !== "101") {
          console.error("[SMS recipient]", first);
          return {
            ok: false,
            error: first.status || "SMS not accepted for this number",
          };
        }
        console.log("[SMS sent → " + toE164 + "]");
        return { ok: true, mock: false };
      });
    })
    .catch(function (err) {
      console.error("[SMS fetch]", err);
      return { ok: false, error: "SMS network error" };
    });
}

module.exports = { sendSms };
