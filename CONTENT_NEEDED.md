# Content & launch checklist (JUJO Residence)

What still needs **you** (the owner) vs what the app already handles.

## Done in code (no action needed)

- Public pages for both properties, tenant portal, staff desks
- Registration with SMS OTP (mock locally, live on Render when configured)
- Rent ledger, maintenance queue, contact inbox, document uploads
- M-Pesa STK (mock or live) and Paybill auto-match endpoints
- Scheduled rent reminders (1st of month) and caretaker nudges
- USSD / SMS webhook handlers (wire URLs in Africa's Talking dashboard)

## You must do manually

### 1. Property photos (high impact)

Add real photos so pages don’t show grey placeholders:

| Folder | Files |
|--------|--------|
| `public/images/jujo-heights/` | `exterior-01.jpg` … `exterior-03.jpg`, `interior-01.jpg` … `interior-04.jpg` |
| `public/images/blessed-haven/` | same pattern |

See **`public/images/README.md`** for shot suggestions. Compress for mobile (under ~300 KB each if possible).

### 2. Render environment (go live)

Open [Render dashboard](https://dashboard.render.com) → **jujo-residence** → **Environment**.

| Priority | Keys | Notes |
|----------|------|--------|
| Must | `ADMIN_PASSWORD`, `LANDLORD_PASSWORD`, `STAFF_PASSWORD` | Change from demo defaults |
| Must | `CONTACT_PHONE`, `CONTACT_EMAIL` | Shown on home page |
| Must | `PUBLIC_BASE_URL` | `https://jujo-residence.onrender.com` |
| SMS | `SMS_MOCK=0`, Live `AFRICASTALKING_*` credentials | Sandbox only reaches the simulator; follow **`docs/RENDER_SMS_MPESA.md`** |
| M-Pesa | `MPESA_MOCK=0`, `MPESA_*` | Daraja sandbox or production keys |
| Optional | `SITE_NOTICES` | Pipe-separated notices, e.g. `Water off Sat 9–12\|Gate hours unchanged` |
| Optional | `SOCIAL_FACEBOOK_URL`, etc. | Footer links |

After every change: **Save** and wait for redeploy.

**Data warning:** the app currently stores records in a local SQLite file. Render Free storage is temporary and can be cleared on sleep, restart, or redeploy. Choose durable storage before using this for real tenant/payment records.

Office alerts are sent by SMS to `ALERT_SMS_PHONES` using Africa's Talking Live. Full contact form messages remain in the admin inbox. Email notifications are not configured.

### 3. Africa's Talking dashboard

Paste webhook URLs from **`docs/AFRICASTALKING_CALLBACKS.md`** (inbox, delivery, USSD, etc.).  
Sandbox: test in the Africa's Talking simulator. Live credentials are needed to reach real phones.

### 4. Safaricom Daraja (optional but useful)

Register C2B validation/confirmation URLs so manual Paybill payments auto-mark rent paid.

### 5. Copy & legal (when ready)

- **`index.html`** → Updates section (or use `SITE_NOTICES` env)
- Privacy / terms text — review with your lawyer for Kenya
- Social media URLs when accounts exist

## Check progress in the app

Sign in as **admin** → **Launch checklist** panel at the top of the operations desk.  
Green = configured; amber = still todo.

## Local dev quick start

```bash
copy .env.example .env
npm install
npm start
```

A starter `.env` may already include office phone/email — edit passwords before sharing the machine.
