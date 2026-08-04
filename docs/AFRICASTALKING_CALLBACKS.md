# Africa's Talking dashboard — what to fill

Base URL (your live app):

`https://jujo-residence.onrender.com`

Outbound OTP / rent SMS only needs **username + API key** on Render.  
The URLs below are for the AT dashboard forms you asked about.

---

## SMS callbacks

| AT field | Paste this |
|----------|------------|
| **Incoming messages** (inbox) | `https://jujo-residence.onrender.com/api/sms/inbox` |
| **Delivery reports** | `https://jujo-residence.onrender.com/api/sms/delivery` |
| **Bulk SMS opt-out callback** | `https://jujo-residence.onrender.com/api/sms/optout` |
| **Subscription callback URL** | `https://jujo-residence.onrender.com/api/sms/subscription` |
| **Subscription / unsubscription callbacks** | same: `https://jujo-residence.onrender.com/api/sms/subscription` |

### Subscription product (example for JUJO)

When creating a product, use something simple:

| Field | Suggested value |
|-------|-----------------|
| Keyword | `JUJO` |
| Shortcode | `53154` |
| Callback | `https://jujo-residence.onrender.com/api/sms/subscription` |

AT will POST things like:

- `phoneNumber` — who opted in/out  
- `shortCode` — `53154`  
- `keyword` — e.g. `JUJO`  
- `updateType` — subscribe / unsubscribe  

Our server logs these; it does not change rent yet.

---

## Sender IDs

| Field | What to do |
|-------|------------|
| **Alphanumeric** | Create/request **`JUJO`** in AT (SMS → Sender IDs / Alphanumeric). Wait for approval. |
| **Shortcode** | `53154` — for receiving / subscriptions. |

### Create alphanumeric (Africa's Talking)

1. Log in → your app (Sandbox or Live).
2. Open **SMS** → **Sender IDs** / **Alphanumeric** / **Create**.
3. Fill:

| Field | Value |
|--------|--------|
| Sender ID / Name | `JUJO` |
| Purpose | Property management OTP, rent reminders, tenant notices |
| Company / Brand | JUJO Residence |

4. Submit and wait for AT approval (sandbox may allow faster; live can take days).
5. On **Render** → Environment set:

```
AFRICASTALKING_SENDER=JUJO
```

6. Redeploy / save.

**Sandbox tip:** if SMS fails with an unapproved sender, clear `AFRICASTALKING_SENDER` (leave empty) so AT uses the default sandbox sender.

On **Render** env:

```
AFRICASTALKING_SENDER=JUJO
```

- Sandbox: if send fails, leave empty temporarily  
- Live: use only after AT approves `JUJO`  
- Do **not** put shortcode `53154` as `from` unless AT told you to
---

## USSD

| AT field | Paste this |
|----------|------------|
| **USSD callback URL** | `https://jujo-residence.onrender.com/api/ussd` |
| **USSD events URL** | `https://jujo-residence.onrender.com/api/ussd/events` |
| **Shared service code** | `*384#` |
| **Your channel** | `24145` |
| **Dial** | `*384*24145#` |

Create a USSD channel in AT and point it at that URL.  
Basic menu: rent help / contact / exit (you can grow this later).

---

## Airtime

| AT field | Paste this |
|----------|------------|
| **Airtime status callback** | `https://jujo-residence.onrender.com/api/airtime/status` |
| **Airtime validation callback** | `https://jujo-residence.onrender.com/api/airtime/validation` |

JUJO does not sell airtime yet — these just accept/log callbacks so the AT form can be saved.

---

## Render env (for real OTP)

| Key | Value |
|-----|--------|
| `SMS_MOCK` | `0` |
| `AFRICASTALKING_USERNAME` | `sandbox` (or your live username) |
| `AFRICASTALKING_API_KEY` | your API key (never commit to Git) |
| `AFRICASTALKING_SENDER` | empty until alphanumeric is approved |
| `AFRICASTALKING_SHORTCODE` | `53154` (optional reference) |

Sandbox: add test phones under AT → SMS → Sandbox numbers.

---

## What you need vs optional

| Feature | Needed for OTP/reminders? |
|---------|---------------------------|
| Username + API key + `SMS_MOCK=0` | **Yes** |
| Inbox / delivery / opt-out | No (nice to have) |
| Subscriptions + keyword | No |
| USSD channel | No |
| Airtime callbacks | No |
| Alphanumeric sender | No until live branded SMS |

After saving URLs in AT, wait for Render redeploy so the new endpoints exist, then send a test SMS from the admin desk.
