# Ishtirak — اشتراك

Generator subscription billing for Lebanon. Owners manage subscribers, meter readings, monthly tariff, bills and payments. Subscribers link with an invite code and see their bills and notices.

Static web app (`docs/`) + Supabase. The same `docs/` folder is wrapped by Capacitor for Android/iOS.

## 1. Publish on GitHub Pages

1. Create a repo `ishtirak` and push this folder.
2. Settings → Pages → Deploy from branch → `main`, folder `/docs`.
3. URL: `https://<user>.github.io/ishtirak/`

## 2. Supabase settings (once)

Dashboard → project **Ishtirak** → Authentication:

- URL Configuration → Site URL: `https://<user>.github.io/ishtirak/`
- Redirect URLs: add the same URL, plus `http://localhost:8080/` for local testing and `https://localhost/` for the Capacitor app
- Sign In / Providers → Email: keep "Confirm email" on, minimum password length 10
- Attack Protection: turn on leaked password protection (Pro plan) and CAPTCHA if you open sign-ups publicly

## 3. Local run

```
npm run serve
```
Open http://localhost:8080

## 4. Mobile app (Capacitor)

```
npm install
npx cap add android
npx cap add ios        # macOS + Xcode only
npx cap sync
npx cap open android
```
After any change in `docs/`, run `npx cap sync` again.

## How billing works

- Metered: `(this month reading − previous reading) × kWh price + amps × fixed fee per amp`
- Flat: `amps × flat price per amp`
- "Generate bills" can be re-run any time; bills that already have a payment are locked.
- Payments can't exceed what's left on a bill.

## Security

- Row Level Security on every table: owners only see their business, subscribers only their own subscription, bills and payments.
- Bill amounts are computed in the database (`generate_bills`) and can't be edited from the app.
- Column-level grants: subscribers can't be relinked by the owner, `user_id` and `invite_code` are only set by database functions.
- Invite codes are single-use and rotate on claim; "Reset app access" unlinks a phone and issues a new code.
- Strict Content-Security-Policy, no third-party scripts, all user text rendered with `textContent`.
