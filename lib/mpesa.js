"use strict";

const crypto = require("crypto");

function isMock() {
  return process.env.MPESA_MOCK === "1" || !process.env.MPESA_CONSUMER_KEY;
}

function publicBaseUrl() {
  const raw =
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://localhost:3000";
  return String(raw).replace(/\/$/, "");
}

function darajaBase() {
  return process.env.MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

function stkPassword(shortcode, passkey, timestamp) {
  return Buffer.from(shortcode + passkey + timestamp).toString("base64");
}

function phone254(e164) {
  const p = String(e164 || "").replace(/\D/g, "");
  if (p.startsWith("254") && p.length === 12) return p;
  if (p.length === 9) return "254" + p;
  return p;
}

function getAccessToken() {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  if (!key || !secret) {
    return Promise.reject(new Error("M-Pesa keys not configured."));
  }
  const auth = Buffer.from(key + ":" + secret).toString("base64");
  return fetch(
    darajaBase() + "/oauth/v1/generate?grant_type=client_credentials",
    {
      headers: { Authorization: "Basic " + auth },
    }
  )
    .then(function (r) {
      return r.json();
    })
    .then(function (j) {
      if (!j.access_token) throw new Error("No M-Pesa token");
      return j.access_token;
    });
}

function stkPush(opts) {
  if (isMock()) {
    const checkoutId =
      "mock-co-" + crypto.randomBytes(6).toString("hex");
    const merchantId =
      "mock-me-" + crypto.randomBytes(6).toString("hex");
    console.log(
      "[M-Pesa mock STK]",
      opts.phone,
      "KES",
      opts.amountKes,
      "rent",
      opts.rentId
    );
    return Promise.resolve({
      ok: true,
      mock: true,
      CheckoutRequestID: checkoutId,
      MerchantRequestID: merchantId,
    });
  }

  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  if (!shortcode || !passkey) {
    return Promise.reject(new Error("MPESA_SHORTCODE and MPESA_PASSKEY required."));
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14);
  const callback =
    process.env.MPESA_STK_CALLBACK_URL ||
    publicBaseUrl() + "/api/mpesa/stk-callback";

  const body = {
    BusinessShortCode: shortcode,
    Password: stkPassword(shortcode, passkey, timestamp),
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(opts.amountKes),
    PartyA: phone254(opts.phone),
    PartyB: shortcode,
    PhoneNumber: phone254(opts.phone),
    CallBackURL: callback,
    AccountReference: "R" + opts.rentId,
    TransactionDesc: opts.description || "JUJO rent",
  };

  return getAccessToken().then(function (token) {
    return fetch(darajaBase() + "/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().then(function (j) {
        if (j.ResponseCode !== "0") {
          return {
            ok: false,
            error: j.errorMessage || j.ResponseDescription || "STK failed",
          };
        }
        return {
          ok: true,
          CheckoutRequestID: j.CheckoutRequestID,
          MerchantRequestID: j.MerchantRequestID,
        };
      });
    });
  });
}

function parseStkCallback(body) {
  const cb = body && body.Body && body.Body.stkCallback;
  if (!cb) return null;
  const result = {
    merchantRequestId: cb.MerchantRequestID,
    checkoutRequestId: cb.CheckoutRequestID,
    resultCode: Number(cb.ResultCode),
    resultDesc: cb.ResultDesc,
    amountKes: null,
    mpesaReceipt: null,
    phone: null,
  };
  const items = (cb.CallbackMetadata && cb.CallbackMetadata.Item) || [];
  items.forEach(function (item) {
    if (item.Name === "Amount") result.amountKes = Number(item.Value);
    if (item.Name === "MpesaReceiptNumber") result.mpesaReceipt = String(item.Value);
    if (item.Name === "PhoneNumber") result.phone = "+" + String(item.Value);
  });
  return result;
}

module.exports = {
  isMock,
  publicBaseUrl,
  stkPush,
  parseStkCallback,
  phone254,
};
