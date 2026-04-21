# What we need from you (JUJO Residence)

Use this as a checklist. Send answers by email or drop them into a shared doc — we’ll plug them into the site, `.env`, and printed materials.

## 1. Legal & naming

- **Registered business name** (if different from “JUJO Residence” on the site).
- **Confirm spelling**: “JUJO Heights” (Mlolongo) and **“Blessed Haven”** (Syokimau, TPA Court, back) — any tagline you want under each name.
- **PIN / ownership** (optional on the site; only if you want it public).

## 2. Contacts (office-facing)

- **Main phone** (and whether it’s WhatsApp-enabled).
- **Secondary phone** (caretaker, after-hours — optional).
- **Admin email** for enquiries (e.g. `office@…`).
- **Per-property contact** if Mlolongo and Syokimau use different people or numbers (names + roles).
- **Office hours** (weekdays, Saturday, holidays).
- **Physical office address** (if tenants may visit), or “by appointment only.”

## 3. Property facts (for each site)

**JUJO Heights — Mlolongo**

- Approximate **number of units** (or “sold out / waitlist”).
- **Unit types** (beds, approximate sq m or “typical” description).
- **Rent range** (or “from KES …” / “contact office”) — only if you’re comfortable publishing.
- **Parking**: slots per unit, visitor rules, extra fees.
- **Security**: gated, guards, CCTV — short factual line.
- **What’s on site** (shop, borehole, generator, etc.) — **confirm** against what we already list.
- **Nearby**: schools, hospitals, matatu stage, expressway — **your** top 3 selling points.

**Blessed Haven — Syokimau, TPA Court (back)**

- Same list as above, plus anything specific to **family / play area / “back” of TPA Court** (access road, landmark for directions).
- **Directions** for first-time visitors (one paragraph: “from Mombasa Road…”, gate name, etc.).

## 4. Media

- **3–6 photos per property** (exterior, lobby, sample unit, amenities). High resolution; you must own rights or have photographer release.
- **Logo** for JUJO Residence and, if they exist, separate marks for **JUJO Heights** and **Blessed Haven** (SVG or PNG).
- If no logos yet: say so — we keep typography-only branding.

## 4b. M-Pesa (already partly configured)

- **JUJO Heights (Mlolongo):** Paybill **222111**, account **2319887** (in `.env` as `JUJO_MPESA_*`).
- **Blessed Haven (Syokimau):** Paybill **247247** — **send us the account number** when you have it; we store it as `BLESSED_MPESA_ACCOUNT` in `.env`.

## 4c. SMS (OTP at registration)

- Africa’s Talking (or similar) **username**, **API key**, and optional **sender ID** for Kenya.
- Until then, keep `SMS_MOCK=1` in `.env` for local testing (codes print in the server console and appear once in the API response).

## 5. Tenant portal & admin

- **Who is the admin** logging into the operations desk (name, email for login).
- Whether **demo accounts** should be removed before go-live.
- **Payment policy** text you want near rent lines (e.g. “Bank: … Paybill: …” — only if you want it on the public/tenant site).

## 6. Social & marketing

- **Real Facebook / Instagram / LinkedIn URLs** (or “none yet”).
- **Google Maps** link or pin for each property (for “Directions” / “Open in Maps”).

## 7. Legal pages

- Your **privacy** and **terms** preferences (short bullet: what data you collect, cookies, retention).
- If you have a lawyer-drafted **privacy policy**, paste or attach.

## 8. Anything else

- **Languages**: English only, or Kiswahili snippets later?
- **Updates** you want on the home “Updates” section (water shutdowns, gate times, etc.).
- **What you don’t want** on the site (e.g. no prices, no unit numbers).

---

**When you’re ready**, send: (1) contacts, (2) property facts, (3) photos, (4) logos or “no logos yet”. We’ll align the copy and database labels with **JUJO Heights** and **Blessed Haven** as two separate brands under JUJO Residence.
