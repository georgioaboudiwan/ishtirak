# Auth email templates

Paste each file into Supabase: Authentication > Emails > Templates.

| File | Template | Subject |
|---|---|---|
| confirm-signup.html | Confirm sign up | Your Ishtirak code / رمز اشتراك |
| reset-password.html | Reset password | Reset your Ishtirak password / إعادة تعيين كلمة المرور |

Both show the 8-digit code (`{{ .Token }}`) that the app asks for, so they work on any device.
