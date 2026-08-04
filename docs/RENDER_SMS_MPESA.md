# Live SMS + M-Pesa on Render

Your terminal showed **SMS_MOCK is on** — that is why nothing reached the phone. Follow this checklist.

## A) Real SMS (OTP + rent reminders)

### 1. Africa's Talking account
1. Go to https://account.africastalking.com and sign up.
2. Create an app (or open the default app).
3. Copy:
   - **Username** (app username, often `sandbox` in sandbox)
   - **API Key** (Settings → API Key)
4. **Sandbox only:** add your phone under **SMS → Sandbox → Test numbers** (e.g. `+254758981679`). Sandbox will not SMS numbers that are not on that list.
5. **Live SMS:** leave sender empty at first, or use an approved **Alphanumeric sender**. Put credits on the account.

### 2. Render environment
1. Open https://dashboard.render.com → your service **jujo-residence**.
2. **Environment** → edit / add:

| Key | Value |
|-----|--------|
| `SMS_MOCK` | `0` |
| `AFRICASTALKING_USERNAME` | your AT username |
| `AFRICASTALKING_API_KEY` | your AT API key |
| `AFRICASTALKING_SENDER` | leave **empty** for sandbox |

3. **Save** → wait for redeploy (or **Manual Deploy**).

### 3. Confirm SMS works
1. Open https://jujo-residence.onrender.com/login.html  
2. Sign in as admin: `timothymuli76@gmail.com` / your `ADMIN_PASSWORD`  
3. Use **Test rent reminder SMS** → phone `254758981679`  
4. Check phone for the SMS.

**Correct if:** message arrives, and Render **Logs** show `[SMS sent → +254758981679]`  
**Wrong if:** Logs still say `[SMS mock` → `SMS_MOCK` is still `1`  
**Wrong if:** Logs say keys missing → username/API key empty on Render  
**Wrong if:** recipient error → number not on AT sandbox list, or no credit

Local check after keys are in a local `.env`:

```bash
npm run test-sms -- 254758981679
```

---

## B) Real STK Push (M-Pesa PIN prompt)

### 1. Safaricom Daraja
1. Go to https://developer.safaricom.co.ke and create an app.
2. Copy **Consumer Key** and **Consumer Secret**.
3. **Sandbox STK** (testing):
   - Shortcode: `174379`
   - Passkey: from Daraja docs (Lipa Na M-Pesa Online Passkey for sandbox)
4. **Production:** need your real Paybill / Till + production passkey from Safaricom (takes approval).

### 2. Render environment

| Key | Sandbox example | Notes |
|-----|-----------------|--------|
| `MPESA_MOCK` | `0` | Must be `0` for real STK |
| `MPESA_ENV` | `sandbox` | use `production` only when live |
| `MPESA_CONSUMER_KEY` | from Daraja | |
| `MPESA_CONSUMER_SECRET` | from Daraja | |
| `MPESA_SHORTCODE` | `174379` | sandbox |
| `MPESA_PASSKEY` | sandbox passkey | |
| `PUBLIC_BASE_URL` | `https://jujo-residence.onrender.com` | required |

Callback used by the app:

`https://jujo-residence.onrender.com/api/mpesa/stk-callback`

### 3. Confirm STK works
1. Redeploy after saving env vars.
2. Log in as a tenant (or admin → **Send M-Pesa prompt**).
3. Tap **Pay now** / send STK.
4. Sandbox: use Safaricom’s **test MSISDN** from Daraja (not always your real phone). Production: your real Safaricom number.

**Correct if:** phone gets “Enter M-Pesa PIN…” and Render logs do **not** say `[M-Pesa mock STK]`  
**Wrong if:** still mock → `MPESA_MOCK=1` or missing `MPESA_CONSUMER_KEY`  
**Wrong if:** STK HTTP error → wrong key/passkey/shortcode or `MPESA_ENV`

---

## Quick “am I configured?” checklist

On Render → **Environment**, you want:

- [ ] `SMS_MOCK` = `0`
- [ ] `AFRICASTALKING_USERNAME` filled
- [ ] `AFRICASTALKING_API_KEY` filled
- [ ] `MPESA_MOCK` = `0`
- [ ] All four `MPESA_*` keys filled
- [ ] `PUBLIC_BASE_URL` = `https://jujo-residence.onrender.com`
- [ ] Service redeployed after changes

Until those are set, OTP stays on-screen / in logs, and STK stays simulated.

---

## Africa's Talking dashboard URLs

Copy-paste table: see **`docs/AFRICASTALKING_CALLBACKS.md`**.

Quick list (base `https://jujo-residence.onrender.com`):

- Incoming / inbox → `/api/sms/inbox`
- Opt-out → `/api/sms/optout`
- Subscription → `/api/sms/subscription`
- USSD → `/api/ussd`
- Airtime status → `/api/airtime/status`
- Airtime validation → `/api/airtime/validation`
- Shortcode → `53154`
- Alphanumeric → leave empty until AT approves a brand name
