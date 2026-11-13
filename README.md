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

## 4. Mobile apps (Android and iPhone)

The `android/` and `ios/` folders are complete Capacitor projects that wrap the same `docs/` web app. Icons and splash screens come from `assets/` (`npm run assets` regenerates them).

Android (Windows, Mac or Linux with Android Studio):
```
npm install
npm run android          # opens Android Studio; press Run, or Build > Generate Signed Bundle for the Play Store
npm run android:apk      # or build a test APK from the command line
```

iPhone (Mac with Xcode 15+):
```
npm install
npm run ios              # opens Xcode; pick your team under Signing, then Run or Product > Archive for the App Store
```

After any change in `docs/`, `npm run sync` copies it into both apps. Links sent to subscribers and collectors always point to the public website (`publicUrl` in `docs/js/config.js`).

## Releasing a new version

```
python3 scripts/release.py 1.6.0
```
Sets the version in the web app, the offline cache (so phones pick up the update), Android and iPhone. Release notes live in `releases/`.

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

## Features

- Owner: subscribers, monthly prices, meter readings, bills, payments in USD or LBP, receipts, WhatsApp bill queue, notices, reports and Excel (CSV) export.
- Old unpaid months are tracked per subscriber and shown on the home screen, in the bills list, on each bill and in the WhatsApp message.
- Collectors: each gets a private link, sees unpaid bills and records payments. Every payment is tagged with who collected it.
- Subscribers: personal link, no email or password. They see bills, payments and notices.
- Meter readings are kept on the phone when there is no signal and sent when the connection returns.

## Database

`supabase/schema.sql` holds the full database setup (tables, functions, triggers, row level security, grants). Apply it to an empty Supabase project to rebuild the backend, then turn on anonymous sign-ins and set the Site URL and redirect URLs.

## Security

- Names, phone numbers, addresses, meter numbers, the owner's private labels and payment notes are encrypted in the browser (AES-GCM) before they reach the database. Amounts, amps and readings stay readable by the database so it can compute and guard the bills.
- The owner's key is wrapped with a key derived from the password (PBKDF2) and with a recovery code shown once at setup.
- Each subscriber has their own key. It travels only in the fragment of their personal link, which is never sent to the server.
- People who join with the shared code send their key to the owner sealed with the owner's public key (ECDH P-256).
- Row Level Security on every table. Subscribers read their data only through database functions; they never see the owner's private label.
- Bill amounts are computed in the database and can't be edited from the app. Payments can't exceed what's left.
- Subscribers sign in anonymously per device; a link works on up to 5 devices and the owner can replace it at any time.
- Collectors receive the business key wrapped inside their private link, so they can read names and phones but can only fetch what the access rules allow. Stopping or deleting a collector cuts their access.
- Auth email templates are in `supabase/email-templates/`.
- Strict Content-Security-Policy, no third-party scripts, all user text rendered with `textContent`.
