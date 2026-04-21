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
| Admin  | `admin@jujo.local`  | Value of `ADMIN_PASSWORD` in `.env` (default `changeme123`) |
| Tenant | `sam@mlolongo.demo` | `tenant123`  |
| Tenant | `pat@syokimau.demo` | `tenant123`  |

First run creates `data/jujo.db` and seeds demo data. Delete `data/jujo.db` to reset (you’ll lose messages and changes).

## Registration & payments

- **Tenant self-registration:** `register.html` → SMS OTP (`/api/auth/register/start` + `/verify`). With `SMS_MOCK=1`, the code is logged and returned as `devOtp` for testing. For live SMS, set [Africa’s Talking](https://africastalking.com/) env vars in `.env` and unset `SMS_MOCK`.
- **Approval:** New tenants default to **pending** until an admin clicks **Activate** on the admin dashboard (`REGISTRATION_AUTO_APPROVE=1` skips that).
- **M-Pesa Paybill** numbers are in `.env` (`JUJO_MPESA_*`, `BLESSED_MPESA_*`) and shown on property pages and the tenant portal. This is **manual Paybill** (not STK Push). Daraja STK can be added later.

## What’s not included

Automatic M-Pesa STK push (Safaricom Daraja), email alerts, production session store (Redis), and HTTPS — add when you go live.
