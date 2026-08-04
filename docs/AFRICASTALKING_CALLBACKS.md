# Africa's Talking — Notifications (preferred way to receive SMS)

AT says: use **notifications** (webhooks) instead of the **Fetch Messages API**.

That means: when someone texts your shortcode, **AT POSTs to your URL**.  
You do **not** keep calling “fetch inbox” from your server.

Our app already does this.

---

## Where to fill the notification URLs (Africa's Talking)

1. Log in → your app (**Sandbox**)
2. Open **SMS** → **Callback URLs** / **Notifications** / **Inbox**
3. Paste:

| Notification type | URL |
|-------------------|-----|
| **Incoming messages** (inbox) | `https://jujo-residence.onrender.com/api/sms/inbox` |
| **Delivery reports** | `https://jujo-residence.onrender.com/api/sms/delivery` |
| **Bulk opt-out** | `https://jujo-residence.onrender.com/api/sms/optout` |

Save.

When a message arrives, Render **Logs** will show `[AT incoming SMS] from=... text=...`

---

## Where to fill YOUR phone number

**Not** in the notification URL.

### Sandbox (testing)

1. Africa's Talking → **SMS** → **Sandbox** → **Phone numbers** / **Test numbers**
2. Add your number: **`+254758981679`** (or `0758981679` if the form wants local format — prefer `+254…`)
3. Save

Without this, sandbox **will not** send OTP/reminders to your phone, and you may not receive test traffic correctly.

### Live

Your phone is whatever tenants register with. Staff phones for reminders are already in Render env:

- `CARETAKER_SMS_MLOLONGO`
- `CARETAKER_SMS_SYOKIMAU`

Admin test SMS uses the number you type in the admin form (e.g. `254758981679`).

---

## OTP / rent SMS (sending) vs notifications (receiving)

| Goal | What you need |
|------|----------------|
| **Send** OTP / reminders | `SMS_MOCK=0` + username + API key on Render |
| **Receive** replies to shortcode | Inbox notification URL above |
| **Test on your phone** | Add `+254758981679` under Sandbox test numbers |

Notifications do **not** replace the API key. You still need both.

---

## Docs link AT mentions

https://developers.africastalking.com/docs/sms/notifications  

Same idea: AT pushes events to your webhook.


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
