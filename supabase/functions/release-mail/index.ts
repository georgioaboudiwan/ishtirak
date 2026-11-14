// Emails release notes to the app owner through Gmail SMTP.
// Needs the GMAIL_APP_PASSWORD Edge Function secret and the mail_user Vault secret.
// Callers must send the push_drain Vault secret in x-drain; the recipient is always mail_user.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.16';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false }
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const { data: cfg, error } = await db.rpc('push_config');
  if (error || !cfg?.push_drain || !cfg?.mail_user) return new Response('config', { status: 500 });
  if (req.headers.get('x-drain') !== cfg.push_drain) return new Response('forbidden', { status: 403 });
  const pass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!pass) return new Response('missing GMAIL_APP_PASSWORD', { status: 500 });

  const { subject, html, text } = await req.json().catch(() => ({}));
  if (typeof subject !== 'string' || typeof html !== 'string' || subject.length > 200 || html.length > 200000) {
    return new Response('bad request', { status: 400 });
  }

  const mail = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: cfg.mail_user, pass: pass.replace(/\s+/g, '') }
  });
  try {
    const info = await mail.sendMail({
      from: `Ishtirak <${cfg.mail_user}>`, to: cfg.mail_user,
      subject, html, text: typeof text === 'string' ? text : undefined
    });
    return new Response(JSON.stringify({ sent: true, id: info.messageId }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ sent: false, error: String((e as Error).message || e).slice(0, 300) }), { status: 502 });
  }
});
