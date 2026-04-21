"use strict";

/** Normalise Kenyan mobile to E.164 +254712345678 */
function normalizeKePhone(input) {
  if (!input || typeof input !== "string") return null;
  let d = input.replace(/\s+/g, "").replace(/-/g, "");
  if (d.startsWith("+254")) d = d.slice(1);
  if (d.startsWith("254")) {
    if (d.length === 12) return "+" + d;
    return null;
  }
  if (d.startsWith("0") && d.length === 10) {
    return "+254" + d.slice(1);
  }
  if (d.length === 9 && /^[17]/.test(d)) {
    return "+254" + d;
  }
  return null;
}

module.exports = { normalizeKePhone };
