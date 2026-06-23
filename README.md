# JUJO Residence

Full-stack app for **two separate brands** under **JUJO Residence**: **JUJO Heights** (Mlolongo) and **Blessed Haven** (Syokimau, TPA Court — back). Public pages, tenant portal (maintenance + rent lines), admin (inbox, maintenance, tenants, rent records). Stack: **Node.js**, **Express**, **SQLite** (`better-sqlite3`), **sessions**, static files in `public/`.

Content checklist for the owner: **`CONTENT_NEEDED.md`** (project root).

## Run locally

```bash
cd JUJO-RESIDENCE
copy .env.example .env
npm install
npm start
```

Open **http://localhost:3000/**

Edit `.env` for `CONTACT_PHONE`, `CONTACT_EMAIL`, and change `ADMIN_PASSWORD` and `SESSION_SECRET` before any real deployment.

## Demo logins

| Role   | Email               | Password     |
|--------|---------------------|--------------|
| Admin  | `timothymuli76@gmail.com`  | Value of `ADMIN_PASSWORD` in `.env` (default `changeme123`) |
| Tenant | `sam@mlolongo.demo` | `tenant123`  |
| Tenant | `pat@syokimau.demo` | `tenant123`  |

First run creates `data/jujo.db` and seeds demo data. Delete `data/jujo.db` to reset (you’ll lose messages and changes).

## Registration & payments

- **Tenant self-registration:** `register.html` → SMS OTP (`/api/auth/register/start` + `/verify`). With `SMS_MOCK=1`, the code is logged and returned as `devOtp` for testing. For live SMS, set [Africa’s Talking](https://africastalking.com/) env vars in `.env` and unset `SMS_MOCK`.
- **Approval:** New tenants default to **pending** until an admin clicks **Activate** on the admin dashboard (`REGISTRATION_AUTO_APPROVE=1` skips that).
- **M-Pesa Paybill** numbers are in `.env` (`JUJO_MPESA_*`, `BLESSED_MPESA_*`) and shown on property pages and the tenant portal.
- **STK push:** tenants tap **Pay now** in the portal (`MPESA_MOCK=1` for demo without Safaricom keys). Set Daraja env vars and `MPESA_MOCK=0` for live STK.
- **Auto-detect Paybill:** manual payments with account `R{rent_id}` or matching phone + amount mark rent paid via `/api/mpesa/c2b/confirmation` (register C2B URLs in Safaricom Daraja).

## Staff logins (seeded automatically)

| Role | Email | Password |
|------|-------|----------|
| Admin | `timothymuli76@gmail.com` | `ADMIN_PASSWORD` (default `changeme123`) |
| Landlord | `philipmasai95@gmail.com` | `LANDLORD_PASSWORD` (default `masai/123`) |
| Caretaker Mlolongo | `boniface.kiilu@jujo.local`, `denis.mwanzia@jujo.local` | `STAFF_PASSWORD` (default `staff123`) |
| Caretaker Syokimau | `christopher.mutisya@jujo.local`, `boniface.mubweka@jujo.local` | same |

Phones match `CARETAKER_SMS_MLOLONGO` and `CARETAKER_SMS_SYOKIMAU` in `.env`. Team records refresh on each server start.

## Deploy on Render (free — works on phone)

The whole app (pages + API + database) runs as one service on [Render](https://render.com).

1. Push this repo to GitHub (already done if you cloned from there).
2. Go to [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**.
3. Connect **JUJO-RESIDENCE** and apply. When asked, set **`ADMIN_PASSWORD`** (your admin login password).
4. Wait for the deploy to finish. Open the URL Render gives you (e.g. `https://jujo-residence.onrender.com`).

**Demo logins on Render** (first deploy seeds the database):

| Role   | Email               | Password                          |
|--------|---------------------|-----------------------------------|
| Admin  | `timothymuli76@gmail.com`  | Value you set for `ADMIN_PASSWORD` |
| Tenant | `sam@mlolongo.demo` | `tenant123`                       |

With `SMS_MOCK=1` (default on Render), registration shows the OTP on screen and in Render logs.

**Free tier notes:** the app may sleep after ~15 minutes with no visits (first load can be slow). SQLite data lives on the server disk until you redeploy.

## Vercel + Render (optional)

If you use **Vercel** for the website (`jujo-residence.vercel.app`) and **Render** for the backend:

1. Deploy the full app on Render first (steps above) and note the URL (e.g. `https://jujo-residence.onrender.com`).
2. `vercel.json` in this repo sends `/api/*` from Vercel to that Render URL.
3. If your Render URL is different, edit `destination` in `vercel.json` to match, then push to GitHub so Vercel redeploys.

**Easier option:** open your **Render URL only** — it serves both pages and API, no Vercel needed.

## What’s not included

Automatic M-Pesa STK push (Safaricom Daraja), email alerts, production session store (Redis), and HTTPS — add when you go live.
