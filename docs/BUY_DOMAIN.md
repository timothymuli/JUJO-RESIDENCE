# Buy a domain and point it at JUJO (Render)

The app already runs at `https://jujo-residence.onrender.com`. A custom domain is something **you purchase** — I cannot pay for it from here.

## 1. Buy a name

Pick something short, e.g. `jujoresidence.co.ke` or `jujoresidence.com`.

Kenya-friendly shops:

- [Truehost](https://truehost.co.ke)
- [Safaricom domains](https://www.safaricom.co.ke) / partners
- [Namecheap](https://www.namecheap.com)
- [GoDaddy](https://www.godaddy.com)

Pay with M-Pesa or card. Keep the receipt and the login for the domain account.

## 2. Connect it to Render (free on most Render plans)

1. Open [dashboard.render.com](https://dashboard.render.com) → **jujo-residence**
2. **Settings** → **Custom Domains** → **Add**
3. Type your domain, e.g. `jujoresidence.co.ke` and `www.jujoresidence.co.ke`
4. Render shows DNS records (usually a **CNAME** to `jujo-residence.onrender.com`, or an **A** record)

## 3. In your domain shop

Add the records Render shows. Typical pattern:

| Type | Name | Value |
|------|------|--------|
| CNAME | `www` | `jujo-residence.onrender.com` |
| CNAME or ALIAS | `@` (root) | as Render instructs |

Save DNS. Wait 10 minutes to a few hours.

## 4. After it works

On Render → **Environment** set:

```
PUBLIC_BASE_URL=https://jujoresidence.co.ke
MPESA_STK_CALLBACK_URL=https://jujoresidence.co.ke/api/mpesa/stk-callback
```

Update Africa’s Talking callback URLs to the same domain (inbox, USSD, etc.).

Then people open **your** name, not `onrender.com`.
