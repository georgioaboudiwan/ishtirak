# Ishtirak — اشتراك

Generator subscription billing for Lebanon. Owners manage subscribers, meter readings, monthly prices, bills and payments. Subscribers open a personal link (no email or password) and see their bills and notices.

Static web app (`docs/`) + Supabase. The same `docs/` folder is wrapped by Capacitor for Android/iOS.

## 1. Publish on GitHub Pages

1. Create a repo `ishtirak` and push this folder.
2. Settings → Pages → Deploy from branch → `main`, folder `/docs`.
3. URL: `https://<user>.github.io/ishtirak/`

## 2. Supabase settings (once)

Dashboard → project **Ishtirak** → Authentication:

- URL Configuration → Site URL: `https://<user>.github.io/ishtirak/`
- Redirect URLs: add the same URL, plus `http://localhost:8080/` for local testing and `https://localhost/` for the Capacitor app
- Sign In / Providers: "Allow anonymous sign-ins" on, "Confirm email" on, minimum password length 10
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

## Subscribers without email

- The owner adds a subscriber with a mandatory phone number and sends their personal link by WhatsApp or SMS.
- The link signs the phone in without an account (Supabase anonymous sign-in) and works on up to 5 devices. "New link" cuts off all of them.
- One shared code/link can be sent to everyone: each person enters their details and waits for the owner to accept them.

## Encryption

- Names, phone numbers, building, floor, meter number, the owner's private label and payment notes are encrypted in the browser (AES-256-GCM) before they reach the database.
- Each subscriber has their own key. It travels in the link fragment (never sent to a server) and is stored wrapped with the owner's key.
- The owner's key is wrapped with their password (PBKDF2, 310k rounds) and with a recovery code shown once. Losing both makes the encrypted details unreadable.
- Join requests are sealed to the owner's public key (ECDH P-256).
- Amps, readings, prices and bill amounts stay as plain numbers so the database can compute and protect bills. Notices and the generator's name are not encrypted.

## Security

- Row Level Security on every table: owners only see their business, subscribers only their own bills and payments.
- Bill amounts are computed in the database (`generate_bills`) and can't be edited from the app. Payments can't exceed what's left.
- Subscribers never read the subscribers table directly; they get their own row through a function that leaves out the owner's private label and the link token.
- Anonymous sessions can't create a generator.
- Strict Content-Security-Policy, no third-party scripts, all user text rendered with `textContent`.
