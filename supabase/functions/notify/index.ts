import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false }
});

type Row = { endpoint: string; kind: string; p256dh: string | null; auth: string | null; lang: string; biz: string; payload: any };

const T = {
  en: {
    bill: (p: any) => `Your ${month(p.month, 'en')} bill is ready: ${usd(p.amount)}`,
    paid: (p: any) => `Payment received: ${usd(p.amount)}. Thank you!` + (Number(p.left) > 0 ? ` Still owed for ${month(p.month, 'en')}: ${usd(p.left)}` : ''),
    remind: (p: any) => `Reminder: you still owe ${usd(p.amount)}` + (Number(p.bills) > 1 ? ` (${p.bills} bills)` : '') + '. Open your link to see the details.',
    join: () => 'New join request. Open the app to accept it.',
    claim: (p: any) => `A subscriber says they paid ${usd(p.amount)} by ${p.method === 'omt' ? 'OMT' : p.method === 'whish' ? 'Whish' : 'transfer'}. Open the app to confirm it.`,
    reading: () => 'A subscriber sent their meter reading. Open the app to approve it.',
    late: (p: any) => `You owe ${usd(p.amount)}` + (Number(p.months) > 1 ? ` for ${p.months} months` : '') + '. Please pay soon to avoid a cut.',
    cut: () => 'Your subscription is cut for unpaid bills. Pay to get reconnected.',
    back: () => 'Your subscription is reconnected. Thank you!',
    request: (p: any) => p.kind === 'no_power' ? 'A subscriber reports no power. Open the app to see who.' : p.kind === 'amps' ? `A subscriber asks to change to ${Number(p.amps)}A. Open the app to answer.` : 'A subscriber sent you a request. Open the app to see it.',
    reply: (p: any) => p.reply === 'onit' ? 'We got your report and we are working on it.' : p.reply === 'fixed' ? 'The problem is fixed. Power should be back.' : p.reply === 'no' ? 'Your request was declined. Call us for details.' : p.kind === 'amps' ? `Done: your subscription is now ${Number(p.amps)}A.` : 'Your request is done.',
    off: () => 'The generator is off now.',
    on: () => 'Power is back.',
    maint: (m: any) => `Maintenance: the generator will be off${m && m.from ? ` from ${String(m.from).slice(0, 10)}` : ''}${m && m.to ? ` to ${String(m.to).slice(0, 10)}` : ''}.`
  },
  ar: {
    bill: (p: any) => `فاتورة ${month(p.month, 'ar')} جاهزة: ${usd(p.amount)}`,
    paid: (p: any) => `تم استلام دفعة ${usd(p.amount)}. شكراً!` + (Number(p.left) > 0 ? ` المتبقي عن ${month(p.month, 'ar')}: ${usd(p.left)}` : ''),
    remind: (p: any) => `تذكير: عليك ${usd(p.amount)}` + (Number(p.bills) > 1 ? ` (${p.bills} فواتير)` : '') + '. افتح رابطك لرؤية التفاصيل.',
    join: () => 'طلب انضمام جديد. افتح التطبيق لقبوله.',
    claim: (p: any) => `مشترك بيقول إنو دفع ${usd(p.amount)} عبر ${p.method === 'omt' ? 'OMT' : p.method === 'whish' ? 'Whish' : 'تحويل'}. افتح التطبيق لتأكّد.`,
    reading: () => 'مشترك بعت قراءة العداد. افتح التطبيق لتوافق عليها.',
    late: (p: any) => `عليك ${usd(p.amount)}` + (Number(p.months) > 1 ? ` عن ${p.months} أشهر` : '') + '. الرجاء الدفع بأقرب وقت لتجنّب القطع.',
    cut: () => 'انقطع اشتراكك بسبب فواتير غير مدفوعة. ادفع لترجع الكهرباء.',
    back: () => 'رجع اشتراكك. شكراً!',
    request: (p: any) => p.kind === 'no_power' ? 'مشترك بيقول ما في كهرباء عندو. افتح التطبيق لتشوف مين.' : p.kind === 'amps' ? `مشترك بدّو يغيّر لـ ${Number(p.amps)} أمبير. افتح التطبيق لتردّ.` : 'مشترك بعتلك طلب. افتح التطبيق لتشوفو.',
    reply: (p: any) => p.reply === 'onit' ? 'وصلنا بلاغك وعم نشتغل عليه.' : p.reply === 'fixed' ? 'انحلّت المشكلة. لازم ترجع الكهرباء.' : p.reply === 'no' ? 'ما قدرنا نوافق على طلبك. اتصل فينا للتفاصيل.' : p.kind === 'amps' ? `تمّ: صار اشتراكك ${Number(p.amps)} أمبير.` : 'تمّ طلبك.',
    off: () => 'الموتور طافي هلّق.',
    on: () => 'رجعت الكهرباء.',
    maint: (m: any) => `صيانة: الموتور رح يطفى${m && m.from ? ` من ${String(m.from).slice(0, 10)}` : ''}${m && m.to ? ` لـ ${String(m.to).slice(0, 10)}` : ''}.`
  }
};

function usd(n: any) { const v = Number(n) || 0; return '$' + (Number.isInteger(v) ? v : v.toFixed(2)); }
function month(m: string, lang: string) {
  const d = new Date(String(m).slice(0, 10) + 'T12:00:00Z');
  try { return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d); }
  catch { return String(m).slice(0, 7); }
}

function message(r: Row) {
  const lang = r.lang === 'en' ? 'en' : 'ar';
  const p = r.payload || {};
  const t = (T as any)[lang];
  let title = r.biz, body = '';
  if (p.t === 'notice' && p.kind && t[p.kind]) { title = r.biz; body = t[p.kind](p.meta || {}); }
  else if (p.t === 'notice') { title = `${r.biz}: ${p.title}`; body = p.body || ''; }
  else if (t[p.t]) body = t[p.t](p);
  else return null;
  return { title: title.slice(0, 120), body: body.slice(0, 300), tag: p.t === 'notice' && p.kind ? 'power' : `${p.t}-${p.month || ''}`, url: './' };
}

let fcmToken: { token: string; exp: number } | null = null;
async function fcmAccess(sa: any) {
  if (fcmToken && fcmToken.exp > Date.now() + 60000) return fcmToken.token;
  const { SignJWT, importPKCS8 } = await import('npm:jose@5.9.6');
  const key = await importPKCS8(sa.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256' }).setIssuer(sa.client_email).setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  });
  const j = await res.json();
  fcmToken = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return fcmToken.token;
}

Deno.serve(async (req) => {
  const { data: cfg, error: cfgErr } = await db.rpc('push_config');
  if (cfgErr || !cfg?.push_drain) return new Response('config', { status: 500 });
  if (req.headers.get('x-drain') !== cfg.push_drain) return new Response('forbidden', { status: 403 });

  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);
  const sa = cfg.fcm_service_account ? JSON.parse(cfg.fcm_service_account) : null;

  let sent = 0, failed = 0;
  const dead: string[] = [];
  for (let round = 0; round < 5; round++) {
    const { data, error } = await db.rpc('push_take', { p_limit: 300 });
    if (error) return new Response(error.message, { status: 500 });
    const rows = (data || []) as Row[];
    if (!rows.length) break;
    await Promise.all(rows.map(async (r) => {
      const msg = message(r);
      if (!msg) return;
      try {
        if (r.kind === 'web') {
          await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh!, auth: r.auth! } },
            JSON.stringify(msg), { TTL: 86400, urgency: 'normal' });
        } else if (r.kind === 'fcm' && sa) {
          const token = await fcmAccess(sa);
          const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: { token: r.endpoint, notification: { title: msg.title, body: msg.body } } })
          });
          if (res.status === 404 || res.status === 400) dead.push(r.endpoint);
          if (!res.ok) throw new Error('fcm ' + res.status);
        } else return;
        sent++;
      } catch (e: any) {
        failed++;
        if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(r.endpoint);
      }
    }));
  }
  if (dead.length) await db.rpc('push_forget', { p_endpoints: dead });
  return new Response(JSON.stringify({ sent, failed, removed: dead.length }), { headers: { 'Content-Type': 'application/json' } });
});
