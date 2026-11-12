(() => {
  'use strict';

  const cfg = window.APP_CONFIG;
  const V = window.Vault;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'implicit' }
  });

  const $app = document.getElementById('app');
  const $dock = document.getElementById('dock');
  const $side = document.getElementById('side-nav');
  const $toast = document.getElementById('toast');
  const $langs = document.querySelectorAll('.lang-toggle');

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} }
  };

  const state = {
    lang: store.get('lang') === 'en' ? 'en' : 'ar',
    user: null, pw: null, business: null, bk: null, priv: null,
    subs: [], mode: null, route: 'home', month: currentMonth(),
    invite: null, join: null, people: []
  };

  let holdBoot = false;
  let lastUid;

  parseEntryHash();

  function parseEntryHash() {
    const hash = location.hash || '';
    let m = hash.match(/^#\/i\/([A-Z0-9]{24})\.([A-Za-z0-9_-]{43})$/);
    if (m) { state.invite = { token: m[1], sk: m[2] }; return; }
    m = hash.match(/^#\/b\/([A-Z0-9]{8})$/);
    if (m) { state.join = m[1]; return; }
    if (hash.includes('error=')) history.replaceState(null, '', location.pathname + location.search);
  }

  function currentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function shiftMonth(m, by) {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(y, mo - 1 + by, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function t(key, vars) {
    let s = (window.I18N[state.lang] && window.I18N[state.lang][key]) || window.I18N.en[key] || key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  }

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const kid of kids.flat(3)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const ICONS = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    people: 'M15.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM4.5 20a7.5 7.5 0 0 1 15 0',
    bills: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
    more: 'M4 7h16M4 12h16M4 17h16',
    bell: 'M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7zM10 20a2 2 0 0 0 4 0',
    bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
    tag: 'M3 12V4h8l10 10-8 8zM7.5 8h.01',
    check: 'M5 12.5 10 17l9-10',
    send: 'M21 3 10 14M21 3l-7 18-4-7-7-4z',
    phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
    lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
    globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
    plus: 'M12 5v14M5 12h14'
  };

  function icon(name, cls) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', `ic ${cls || ''}`);
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', ICONS[name]);
    svg.append(p);
    return svg;
  }

  function render(...nodes) {
    $app.replaceChildren(h('div', { class: 'view' }, nodes));
    window.scrollTo(0, 0);
  }

  let toastTimer;
  function toast(msg, kind) {
    $toast.textContent = msg;
    $toast.className = `toast ${kind || ''}`;
    $toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.hidden = true; }, 3800);
    if (kind === 'good' && navigator.vibrate) navigator.vibrate(12);
  }

  function errMsg(e) {
    const m = (e && (e.message || e.error_description)) || '';
    if (!navigator.onLine) return t('offline');
    if (m.includes('overpayment')) return t('overpayment');
    if (m.includes('tariff_missing')) return t('tariffMissing');
    if (m.includes('invalid_code')) return t('invalidCode');
    if (m.includes('already_joined')) return t('alreadyJoined');
    if (/expired|invalid.*(otp|token)|token.*invalid/i.test(m)) return t('badCode');
    if (/invalid login/i.test(m)) return t('badLogin');
    if (/email not confirmed/i.test(m)) return t('notConfirmed');
    if (/rate limit|too many/i.test(m)) return t('rateLimit');
    if (/sending .*email|smtp/i.test(m)) return t('emailFail');
    if (/already registered|user already/i.test(m)) return t('emailTaken');
    if (/password/i.test(m)) return t('pwHint');
    return t('error');
  }

  function fail(e) { console.error(e); toast(errMsg(e), 'bad'); }

  function money(n) { return `$${Number(n || 0).toFixed(2)}`; }
  function lbp(n, rate) { return Math.round(Number(n || 0) * Number(rate || 0)).toLocaleString('en-US'); }
  function monthDate(m) { return `${m}-01`; }
  function monthLabel(d) {
    const [y, mo] = String(d).slice(0, 7).split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString(state.lang === 'ar' ? 'ar-LB' : 'en-GB', { month: 'long', year: 'numeric' });
  }
  function dateLabel(d) { return new Date(d).toLocaleDateString(state.lang === 'ar' ? 'ar-LB' : 'en-GB', { day: 'numeric', month: 'short' }); }
  function num(v) { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; }
  function clean(v, max) { return String(v || '').trim().slice(0, max); }
  function digits(v) { return String(v || '').replace(/\D/g, ''); }
  function ltr(v) { return v ? `\u2066${v}\u2069` : v; }
  function validPhone(v) { const d = digits(v); return d.length >= 7 && d.length <= 15; }

  function intlPhone(phone) {
    let d = digits(phone);
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = d.slice(1);
    if (d && d.length <= 8) d = `961${d}`;
    return d;
  }

  function waLink(phone, text) {
    const d = intlPhone(phone);
    return `${d ? `https://wa.me/${d}` : 'https://wa.me/'}?text=${encodeURIComponent(text)}`;
  }

  function smsLink(phone, text) { return `sms:+${intlPhone(phone)}?&body=${encodeURIComponent(text)}`; }
  function openExternal(url) { window.open(url, '_blank', 'noopener,noreferrer'); }
  function appUrl() { return `${location.origin}${location.pathname}`; }
  function inviteUrl(p) { return `${appUrl()}#/i/${p.invite_code}.${p.sk}`; }
  function joinUrl() { return `${appUrl()}#/b/${state.business.join_code}`; }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast(t('copied'), 'good'); }
    catch { toast(text); }
  }

  async function shareText(text) {
    if (navigator.share) { try { await navigator.share({ text }); } catch {} return; }
    openExternal(waLink('', text));
  }

  function busy(btn, on) { if (btn) { btn.disabled = on; btn.classList.toggle('loading', on); } }

  function field(label, control, hint) {
    return h('label', { class: 'field' }, h('span', null, label), control, hint ? h('small', null, hint) : null);
  }

  function input(name, props) { return h('input', Object.assign({ name, autocomplete: 'off' }, props || {})); }

  function formData(form) {
    const o = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; } else o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    return o;
  }

  function segmented(name, options, value) {
    return h('div', { class: 'seg' }, options.map(([val, label]) => h('label', null,
      h('input', { type: 'radio', name, value: val, checked: val === value }), h('span', null, label))));
  }

  function sheet(title, body) {
    const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 240); };
    const wrap = h('div', { class: 'sheet-wrap', onclick: (e) => { if (e.target === wrap) close(); } },
      h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
        h('div', { class: 'grab' }),
        h('div', { class: 'sheet-head' }, h('h3', null, title),
          h('button', { class: 'icon-btn', type: 'button', onclick: close, 'aria-label': t('close') }, '✕')),
        body));
    document.body.append(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    return close;
  }

  function closeSheets() {
    const open = document.querySelectorAll('.sheet-wrap');
    open.forEach((w) => w.remove());
    return open.length > 0;
  }

  function confirmBox(msg, yesLabel) {
    return new Promise((resolve) => {
      let close;
      const yes = h('button', { class: 'btn danger', type: 'button', onclick: () => { close(); resolve(true); } }, yesLabel || t('delete'));
      const no = h('button', { class: 'btn ghost', type: 'button', onclick: () => { close(); resolve(false); } }, t('cancel'));
      close = sheet(t('sure'), h('div', { class: 'stack' }, h('p', null, msg), h('div', { class: 'grid2' }, no, yes)));
    });
  }

  function monthSwitch(onChange) {
    const step = (by) => () => { state.month = shiftMonth(state.month, by); onChange(); };
    return h('div', { class: 'month' },
      h('button', { type: 'button', class: 'icon-btn flip', onclick: step(-1), 'aria-label': t('prevMonth') }, '‹'),
      h('strong', null, monthLabel(monthDate(state.month))),
      h('button', { type: 'button', class: 'icon-btn flip', onclick: step(1), 'aria-label': t('nextMonth') }, '›'));
  }

  function head(title, right, back) {
    return h('div', { class: 'head' },
      back ? h('button', { type: 'button', class: 'icon-btn flip', onclick: () => go(back), 'aria-label': t('back') }, '‹') : null,
      h('h1', null, title), h('div', { class: 'head-right' }, right || null));
  }

  function avatar(name) {
    const s = String(name || '?').trim() || '?';
    let hue = 0;
    for (let i = 0; i < s.length; i++) hue = (hue * 31 + s.charCodeAt(i)) % 360;
    const el = h('span', { class: 'avatar' }, s.slice(0, 1).toUpperCase());
    el.style.setProperty('--hue', String(hue));
    return el;
  }

  function empty(text, action) { return h('div', { class: 'empty' }, h('p', null, text), action || null); }

  function applyLang() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    $langs.forEach((b) => { b.textContent = state.lang === 'ar' ? 'English' : 'عربي'; });
    document.querySelectorAll('.brand-name').forEach((b) => { b.textContent = t('app'); });
    document.title = t('app');
  }

  function switchLang() {
    state.lang = state.lang === 'ar' ? 'en' : 'ar';
    store.set('lang', state.lang);
    route();
  }

  $langs.forEach((b) => b.addEventListener('click', switchLang));

  const ownerTabs = [['home', 'tabHome', 'home'], ['people', 'tabPeople', 'people'], ['bills', 'tabBills', 'bills'], ['more', 'tabMore', 'more']];
  const subTabs = [['mybills', 'tabBills', 'bills'], ['subnotices', 'tabNotices', 'bell'], ['more', 'tabMore', 'more']];
  const parents = { readings: 'home', notices: 'more', invite: 'more' };

  function drawNav(show) {
    const list = show === false || !state.user ? null : state.mode === 'owner' && state.bk ? ownerTabs : state.mode === 'subscriber' ? subTabs : null;
    document.body.classList.toggle('has-nav', !!list);
    if (!list) { $dock.replaceChildren(); $side.replaceChildren(); return; }
    const active = parents[state.route] || state.route;
    const make = () => list.map(([r, k, ic]) => h('button', {
      type: 'button', class: active === r ? 'tab on' : 'tab', onclick: () => go(r), 'aria-current': active === r ? 'page' : null
    }, icon(ic), h('span', null, t(k))));
    $dock.replaceChildren(...make());
    $side.replaceChildren(...make());
  }

  function defaultRoute() { return state.mode === 'owner' ? 'home' : 'mybills'; }

  function go(r) {
    if (r !== state.route) history.pushState({ r }, '');
    state.route = r;
    route();
  }

  window.addEventListener('popstate', (e) => {
    if (closeSheets()) { history.pushState({ r: state.route }, ''); return; }
    state.route = (e.state && e.state.r) || defaultRoute();
    route();
  });

  async function route() {
    applyLang();
    try {
      if (!state.user) { drawNav(false); return viewWelcome(); }
      if (state.invite) { drawNav(false); return await handleInvite(); }
      if (state.join) { drawNav(false); return await viewJoin(state.join); }
      if (!state.mode) { drawNav(false); return state.user.is_anonymous ? viewEnterCode() : viewCreateBusiness(); }
      if (state.mode === 'owner' && !state.bk) { drawNav(false); if (!(await ensureKeys())) return; }
      const views = state.mode === 'owner'
        ? { home: viewHome, people: viewPeople, bills: viewBills, more: viewMore, readings: viewReadings, notices: viewNotices, invite: viewInviteAll }
        : { mybills: viewMyBills, subnotices: viewSubNotices, more: viewMore };
      if (!views[state.route]) state.route = defaultRoute();
      drawNav();
      if (!$app.querySelector('.head')) render(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton short' }));
      await views[state.route]();
    } catch (e) { fail(e); }
  }

  async function loadContext() {
    const uid = state.user.id;
    const [biz, subs] = await Promise.all([
      state.user.is_anonymous ? Promise.resolve({ data: null }) : sb.from('businesses').select('*').eq('owner_id', uid).maybeSingle(),
      sb.rpc('my_subscriptions')
    ]);
    if (biz.error) throw biz.error;
    if (subs.error) throw subs.error;
    state.business = biz.data;
    state.subs = subs.data || [];
    for (const s of state.subs) {
      s.sk = store.get(`sk:${s.id}`);
      s.info = (await V.dec(s.sk, s.enc)) || {};
    }
    if (!state.mode || (state.mode === 'owner' && !state.business) || (state.mode === 'subscriber' && !state.subs.length)) {
      state.mode = state.business ? 'owner' : state.subs.length ? 'subscriber' : null;
      state.route = defaultRoute();
    }
  }

  function hero(sub) {
    return h('section', { class: 'welcome' },
      h('div', { class: 'logo' }, icon('bolt')),
      h('h1', null, t('app')), sub ? h('p', { class: 'muted' }, sub) : null);
  }

  function viewWelcome() {
    render(hero(t('tagline')),
      h('button', { type: 'button', class: 'choice', onclick: () => viewEnterCode() },
        h('span', { class: 'choice-ic' }, icon('home')),
        h('span', null, h('strong', null, t('iSubscribe')), h('small', null, t('iSubscribeSub')))),
      h('button', { type: 'button', class: 'choice', onclick: () => viewAuth('signin') },
        h('span', { class: 'choice-ic' }, icon('bolt')),
        h('span', null, h('strong', null, t('iOwn')), h('small', null, t('iOwnSub')))),
      h('p', { class: 'secure-note' }, icon('lock'), t('secureNote')));
  }

  function viewEnterCode() {
    const code = input('code', { required: true, maxlength: 200, autocapitalize: 'characters', class: 'code-input', placeholder: 'ABCD2345' });
    const btn = h('button', { type: 'submit', class: 'btn primary block' }, t('continue'));
    const back = state.user && state.subs.length
      ? h('button', { type: 'button', class: 'link', onclick: () => { state.mode = 'subscriber'; route(); } }, t('back'))
      : state.user && state.business
        ? h('button', { type: 'button', class: 'link', onclick: () => { state.mode = 'owner'; route(); } }, t('back'))
        : state.user
          ? h('button', { type: 'button', class: 'link', onclick: signOut }, t('signOut'))
          : h('button', { type: 'button', class: 'link', onclick: viewWelcome }, t('back'));
    drawNav(false);
    render(hero(),
      h('form', { class: 'card stack', novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        const raw = code.value.trim();
        const link = raw.match(/#\/i\/([A-Z0-9]{24})\.([A-Za-z0-9_-]{43})/);
        const joinLink = raw.match(/#\/b\/([A-Z0-9]{8})/);
        const plain = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (link) state.invite = { token: link[1], sk: link[2] };
        else if (joinLink) state.join = joinLink[1];
        else if (plain.length === 8) state.join = plain;
        else return toast(t('invalidCode'), 'bad');
        busy(btn, true);
        try { await ensureSession(); await route(); }
        catch (err) { state.invite = null; state.join = null; fail(err); }
        finally { busy(btn, false); }
      } },
        h('h2', null, t('enterCode')), h('p', { class: 'muted' }, t('enterCodeHint')),
        code, btn),
      back);
  }

  async function ensureSession() {
    if (state.user) return;
    holdBoot = true;
    try {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) throw error;
      state.user = data.user;
      lastUid = state.user.id;
      await loadContext();
    } finally { holdBoot = false; }
  }

  function personFields(info, forOwner) {
    return [
      field(forOwner ? t('subName') : t('yourName'), input('name', { required: true, maxlength: 80, value: info.name || '', autocomplete: forOwner ? 'off' : 'name' }), forOwner ? t('subNameHint') : null),
      field(t('phone'), input('phone', { type: 'tel', required: true, maxlength: 20, inputmode: 'tel', value: info.phone || '', placeholder: '03 123 456', autocomplete: forOwner ? 'off' : 'tel' }), forOwner ? t('phoneHintOwner') : t('phoneHint')),
      h('div', { class: 'grid2' },
        field(t('building'), input('building', { maxlength: 80, value: info.building || '' })),
        field(t('floor'), input('floor', { maxlength: 20, value: info.floor || '' })))
    ];
  }

  function readPerson(d, base) {
    if (!clean(d.name, 80)) { toast(t('nameRequired'), 'bad'); return null; }
    if (!validPhone(d.phone)) { toast(t('phoneRequired'), 'bad'); return null; }
    return Object.assign({}, base || {}, {
      name: clean(d.name, 80), phone: clean(d.phone, 20), building: clean(d.building, 80), floor: clean(d.floor, 20)
    });
  }

  async function handleInvite() {
    const inv = state.invite;
    const { data, error } = await sb.rpc('open_invite', { p_token: inv.token });
    if (error) { state.invite = null; fail(error); return route(); }
    store.set(`sk:${data.id}`, inv.sk);
    if (data.state === 'linked') {
      state.invite = null; state.mode = 'subscriber'; state.route = 'mybills';
      await loadContext();
      return route();
    }
    const info = (await V.dec(inv.sk, data.enc)) || {};
    const btn = h('button', { type: 'submit', class: 'btn primary block' }, t('acceptContinue'));
    render(hero(),
      h('form', { class: 'card stack', novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        const next = readPerson(formData(e.target), info);
        if (!next) return;
        busy(btn, true);
        try {
          const res = await sb.rpc('accept_invite', { p_token: inv.token, p_enc: await V.enc(inv.sk, next) });
          if (res.error) throw res.error;
          state.invite = null; state.mode = 'subscriber'; state.route = 'mybills';
          await loadContext();
          toast(t('welcomeIn'), 'good');
          route();
        } catch (err) { fail(err); } finally { busy(btn, false); }
      } },
        h('h2', null, t('invitedBy', { biz: data.business.name })),
        h('p', { class: 'muted' }, t('confirmDetails')),
        personFields(info), btn));
  }

  async function viewJoin(code) {
    const { data, error } = await sb.rpc('join_preview', { p_code: code });
    if (error || !data || !data.pub) { state.join = null; toast(t('invalidCode'), 'bad'); return route(); }
    const btn = h('button', { type: 'submit', class: 'btn primary block' }, t('sendRequest'));
    render(hero(),
      h('form', { class: 'card stack', novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        const info = readPerson(formData(e.target));
        if (!info) return;
        busy(btn, true);
        try {
          const sk = V.genKey();
          const res = await sb.rpc('request_join', { p_code: code, p_enc: await V.enc(sk, info), p_jk: await V.seal(data.pub, { k: sk }) });
          if (res.error) throw res.error;
          store.set(`sk:${res.data}`, sk);
          state.join = null; state.mode = 'subscriber'; state.route = 'mybills';
          await loadContext();
          route();
        } catch (err) {
          fail(err);
          if (/already_joined/.test(err.message || '')) { state.join = null; route(); }
        } finally { busy(btn, false); }
      } },
        h('h2', null, t('joinBiz', { biz: data.name })),
        h('p', { class: 'muted' }, t('joinHint')),
        personFields({}), btn),
      h('button', { type: 'button', class: 'link', onclick: () => { state.join = null; route(); } }, t('cancel')));
  }

  function viewAuth(mode) {
    const isUp = mode === 'signup';
    const isReset = mode === 'reset';
    const email = input('email', { type: 'email', required: true, autocomplete: 'email', inputmode: 'email' });
    const pw = isReset ? null : input('password', { type: 'password', required: true, minlength: 10, autocomplete: isUp ? 'new-password' : 'current-password' });
    const btn = h('button', { type: 'submit', class: 'btn primary block' }, isReset ? t('sendCode') : isUp ? t('signUp') : t('signIn'));
    render(hero(t('ownerArea')),
      h('form', { class: 'card stack', novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        const em = clean(email.value, 254).toLowerCase();
        if (!email.checkValidity()) return toast(t('emailInvalid'), 'bad');
        if (pw && pw.value.length < 10) return toast(t('pwHint'), 'bad');
        busy(btn, true);
        try {
          if (isReset) {
            const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: appUrl() });
            if (error) throw error;
            toast(t('codeSent'), 'good');
            viewVerify(em, 'recovery');
          } else if (isUp) {
            state.pw = pw.value;
            const { data, error } = await sb.auth.signUp({ email: em, password: pw.value, options: { emailRedirectTo: appUrl() } });
            if (error) throw error;
            if (!data.session) { toast(t('codeSent'), 'good'); viewVerify(em, 'signup'); }
          } else {
            state.pw = pw.value;
            const { error } = await sb.auth.signInWithPassword({ email: em, password: pw.value });
            if (error && /email not confirmed/i.test(error.message || '')) {
              await sb.auth.resend({ type: 'signup', email: em });
              toast(t('codeSent'), 'good');
              return viewVerify(em, 'signup');
            }
            if (error) throw error;
          }
        } catch (err) { fail(err); } finally { busy(btn, false); }
      } },
        h('h2', null, isReset ? t('forgot') : isUp ? t('signUp') : t('signIn')),
        field(t('email'), email),
        pw ? field(t('password'), pw, isUp ? t('pwHint') : null) : null,
        btn,
        h('div', { class: 'row between' },
          h('button', { type: 'button', class: 'link', onclick: () => viewAuth(isUp || isReset ? 'signin' : 'signup') }, isUp || isReset ? t('haveAccount') : t('noAccount')),
          !isUp && !isReset ? h('button', { type: 'button', class: 'link', onclick: () => viewAuth('reset') }, t('forgot')) : null)),
      h('button', { type: 'button', class: 'link', onclick: viewWelcome }, t('back')));
  }

  function viewVerify(em, kind) {
    const isRec = kind === 'recovery';
    const code = input('code', { required: true, maxlength: 10, inputmode: 'numeric', autocomplete: 'one-time-code', class: 'code-input' });
    const pw = isRec ? input('password', { type: 'password', required: true, minlength: 10, autocomplete: 'new-password' }) : null;
    const btn = h('button', { type: 'submit', class: 'btn primary block' }, isRec ? t('save') : t('verify'));
    const resend = h('button', { type: 'button', class: 'link', onclick: async () => {
      busy(resend, true);
      try {
        const { error } = isRec ? await sb.auth.resetPasswordForEmail(em, { redirectTo: appUrl() }) : await sb.auth.resend({ type: 'signup', email: em });
        if (error) throw error;
        toast(t('codeSent'), 'good');
      } catch (err) { fail(err); } finally { busy(resend, false); }
    } }, t('resendCode'));
    render(hero(),
      h('form', { class: 'card stack', novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        const c = digits(code.value);
        if (c.length < 6) return toast(t('badCode'), 'bad');
        if (pw && pw.value.length < 10) return toast(t('pwHint'), 'bad');
        busy(btn, true);
        try {
          if (isRec) { holdBoot = true; state.pw = pw.value; }
          const { error } = await sb.auth.verifyOtp({ email: em, token: c, type: isRec ? 'recovery' : 'email' });
          if (error) throw error;
          if (isRec) {
            const { error: upErr } = await sb.auth.updateUser({ password: pw.value });
            if (upErr) throw upErr;
            toast(t('passwordUpdated'), 'good');
            await boot(true);
          }
        } catch (err) { fail(err); } finally { holdBoot = false; busy(btn, false); }
      } },
        h('h2', null, isRec ? t('newPassword') : t('verifyEmail')),
        h('p', { class: 'muted' }, t('codeHint', { email: em })),
        field(t('code'), code),
        pw ? field(t('newPassword'), pw, t('pwHint')) : null,
        btn,
        h('div', { class: 'row between' }, resend, h('button', { type: 'button', class: 'link', onclick: () => viewAuth('signin') }, t('back')))));
  }

  function viewCreateBusiness() {
    const btn = h('button', { type: 'submit', class: 'btn primary block' }, t('create'));
    render(hero(),
      h('form', { class: 'card stack', novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        const d = formData(e.target);
        const rate = num(d.lbp_rate);
        if (!clean(d.name, 120)) return toast(t('nameRequired'), 'bad');
        if (!validPhone(d.phone)) return toast(t('phoneRequired'), 'bad');
        if (!(rate > 0)) return toast(t('required'), 'bad');
        busy(btn, true);
        try {
          const { error } = await sb.from('businesses').insert({ name: clean(d.name, 120), phone: clean(d.phone, 30), area: clean(d.area, 120) || null, lbp_rate: rate });
          if (error) throw error;
          state.mode = 'owner'; state.route = 'home';
          await loadContext();
          route();
        } catch (err) { fail(err); } finally { busy(btn, false); }
      } },
        h('h2', null, t('setupBiz')),
        field(t('businessName'), input('name', { required: true, maxlength: 120 })),
        field(t('phone'), input('phone', { type: 'tel', required: true, maxlength: 30, inputmode: 'tel', placeholder: '03 123 456' })),
        field(t('area'), input('area', { maxlength: 120 })),
        field(t('lbpRate'), input('lbp_rate', { type: 'number', step: '1', min: '1', value: '89500', inputmode: 'decimal' })),
        btn),
      h('button', { type: 'button', class: 'link', onclick: signOut }, t('signOut')));
  }

  async function ensureKeys() {
    const biz = state.business;
    const cached = store.get(`bk:${biz.id}`);
    const { data: row, error } = await sb.from('business_keys').select('*').eq('business_id', biz.id).maybeSingle();
    if (error) throw error;
    if (!row) {
      if (!state.pw) { viewUnlock('setup'); return false; }
      await setupKeys(state.pw);
      return false;
    }
    if (cached && (await adoptKey(row, cached))) {
      if (state.pw && !(await V.unwrap(state.pw, row.salt, row.wrapped_pw))) await rewrapPw(row, cached, state.pw);
      return true;
    }
    if (state.pw) {
      const bk = await V.unwrap(state.pw, row.salt, row.wrapped_pw);
      if (bk && (await adoptKey(row, bk))) return true;
      viewUnlock('rc', row);
      return false;
    }
    viewUnlock('pw', row);
    return false;
  }

  async function adoptKey(row, bk) {
    const p = await V.dec(bk, row.wpriv);
    if (!p || !p.priv) return false;
    store.set(`bk:${state.business.id}`, bk);
    state.bk = bk; state.priv = p.priv;
    return true;
  }

  async function rewrapPw(row, bk, pw) {
    const { error } = await sb.from('business_keys')
      .update({ wrapped_pw: await V.wrap(pw, row.salt, bk), updated_at: new Date().toISOString() })
      .eq('business_id', row.business_id);
    if (error) throw error;
  }

  async function setupKeys(pw) {
    const biz = state.business;
    const bk = V.genKey();
    const pair = await V.genPair();
    const salt = V.genSalt();
    const rc = V.code(20);
    const ins = await sb.from('business_keys').insert({
      business_id: biz.id, salt, wrapped_pw: await V.wrap(pw, salt, bk), wrapped_rc: await V.wrap(rc, salt, bk), wpriv: await V.enc(bk, { priv: pair.priv })
    });
    if (ins.error) throw ins.error;
    const up = await sb.from('businesses').update({ pub: pair.pub }).eq('id', biz.id);
    if (up.error) throw up.error;
    biz.pub = pair.pub;
    store.set(`bk:${biz.id}`, bk);
    state.bk = bk; state.priv = pair.priv;
    viewRecoveryCode(rc);
  }

  function fmtRc(rc) { return rc.match(/.{1,4}/g).join('-'); }

  function viewRecoveryCode(rc) {
    const ok = input('ok', { type: 'checkbox' });
    render(hero(),
      h('div', { class: 'card stack' },
        h('h2', null, t('rcTitle')), h('p', { class: 'muted' }, t('rcBody')),
        h('div', { class: 'rc mono' }, fmtRc(rc)),
        h('button', { type: 'button', class: 'btn ghost block', onclick: () => copyText(fmtRc(rc)) }, icon('copy'), t('copy')),
        h('label', { class: 'check' }, ok, t('rcSaved')),
        h('button', { type: 'button', class: 'btn primary block', onclick: () => {
          if (!ok.checked) return toast(t('rcConfirm'), 'bad');
          route();
        } }, t('continue'))));
  }

  function viewUnlock(mode, row) {
    const pw = input('password', { type: 'password', required: true, minlength: 10, autocomplete: 'current-password' });
    const rc = mode === 'rc' ? input('rc', { required: true, maxlength: 30, autocapitalize: 'characters', class: 'code-input small' }) : null;
    const btn = h('button', { type: 'submit', class: 'btn primary block' }, t('unlock'));
    render(hero(),
      h('form', { class: 'card stack', novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        if (pw.value.length < 10) return toast(t('pwHint'), 'bad');
        busy(btn, true);
        try {
          if (mode === 'pw') {
            const bk = await V.unwrap(pw.value, row.salt, row.wrapped_pw);
            if (!bk || !(await adoptKey(row, bk))) return toast(t('wrongPassword'), 'bad');
            state.pw = pw.value;
            return route();
          }
          const check = await sb.auth.signInWithPassword({ email: state.user.email, password: pw.value });
          if (check.error) return toast(t('wrongPassword'), 'bad');
          state.pw = pw.value;
          if (mode === 'setup') return await setupKeys(pw.value);
          const code = rc.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
          const bk = await V.unwrap(code, row.salt, row.wrapped_rc);
          if (!bk || !(await adoptKey(row, bk))) return toast(t('wrongRc'), 'bad');
          await rewrapPw(row, bk, pw.value);
          route();
        } catch (err) { fail(err); } finally { busy(btn, false); }
      } },
        h('h2', null, mode === 'setup' ? t('secureTitle') : t('unlockTitle')),
        h('p', { class: 'muted' }, mode === 'rc' ? t('unlockRcBody') : mode === 'setup' ? t('secureBody') : t('unlockBody')),
        rc ? field(t('rcLabel'), rc) : null,
        field(t('password'), pw),
        btn,
        mode === 'pw' ? h('button', { type: 'button', class: 'link', onclick: () => viewUnlock('rc', row) }, t('useRc')) : null),
      h('button', { type: 'button', class: 'link', onclick: signOut }, t('signOut')));
  }

  async function loadPeople() {
    const { data, error } = await sb.from('subscribers').select('*').eq('business_id', state.business.id).order('created_at');
    if (error) throw error;
    for (const p of data) {
      if (p.status === 'pending') {
        const o = await V.open(state.priv, p.jk);
        p.sk = o && o.k;
      } else p.sk = ((await V.dec(state.bk, p.wk)) || {}).k;
      p.info = (await V.dec(p.sk, p.enc)) || {};
      p.label = ((await V.dec(state.bk, p.oenc)) || {}).label || '';
      p.title = p.label || p.info.name || '—';
    }
    data.sort((a, b) => a.title.localeCompare(b.title));
    state.people = data;
    return data;
  }

  function personName(id) {
    const p = state.people.find((x) => x.id === id);
    return p ? p.title : '—';
  }

  function typeLabel(v) { return v === 'metered' ? t('metered') : t('flat'); }

  function billDetail(b) {
    return ltr(b.billing_type === 'metered'
      ? `${Number(b.kwh)} kWh × ${money(b.kwh_price)} + ${money(b.fixed_fee)}`
      : `${b.amps}A × ${money(b.fixed_fee)}`);
  }

  function billMessage(b, p) {
    const biz = state.business;
    return t('billMsg', {
      biz: biz.name, month: monthLabel(b.month), name: p.info.name || '', detail: billDetail(b), total: money(b.amount),
      lbp: lbp(b.amount, biz.lbp_rate), paid: money(b.paid_amount), rem: money(b.amount - b.paid_amount),
      url: p.sk ? inviteUrl(p) : ''
    });
  }

  async function payBill(b, amount, method, note) {
    const row = { bill_id: b.id, amount, method };
    if (note) row.note = await V.enc(state.bk, { t: note });
    const { error } = await sb.from('payments').insert(row);
    if (error) throw error;
  }

  function billRow(b, after) {
    const rem = Number(b.amount) - Number(b.paid_amount);
    const name = personName(b.subscriber_id);
    const quick = rem > 0 ? h('button', { type: 'button', class: 'btn paid-btn', onclick: async (e) => {
      e.stopPropagation();
      busy(quick, true);
      try { await payBill(b, Math.round(rem * 100) / 100, 'cash'); toast(t('markedPaid', { name }), 'good'); after(); }
      catch (err) { fail(err); busy(quick, false); }
    } }, icon('check'), t('markPaid')) : h('span', { class: 'pill paid' }, t('paid'));
    return h('div', { class: 'item', role: 'button', tabindex: '0', onclick: () => billSheet(b, after).catch(fail) },
      avatar(name),
      h('div', { class: 'grow' }, h('strong', null, name),
        h('small', { class: 'muted' }, rem > 0 && Number(b.paid_amount) > 0 ? t('remainingOf', { rem: ltr(money(rem)), total: ltr(money(b.amount)) }) : billDetail(b))),
      h('div', { class: 'end-col' }, h('strong', { class: 'amount' }, money(rem > 0 ? rem : b.amount)), quick));
  }

  async function billSheet(b, after) {
    const biz = state.business;
    const p = state.people.find((x) => x.id === b.subscriber_id);
    const rem = Number(b.amount) - Number(b.paid_amount);
    const amount = input('amount', { type: 'number', step: '0.01', min: '0.01', max: rem.toFixed(2), value: rem > 0 ? rem.toFixed(2) : '', inputmode: 'decimal' });
    const note = input('note', { maxlength: 120 });
    const save = h('button', { type: 'submit', class: 'btn primary block' }, t('recordPayment'));
    let close = () => {};
    const pays = [];
    for (const pay of b.payments || []) {
      const n = pay.note ? ((await V.dec(state.bk, pay.note)) || {}).t : '';
      pays.push(h('div', { class: 'row between pay' },
        h('span', null, `${money(pay.amount)} · ${t(pay.method)} · ${dateLabel(pay.paid_at)}`, n ? ` · ${n}` : ''),
        h('button', { type: 'button', class: 'link bad', onclick: async () => {
          const { error } = await sb.from('payments').delete().eq('id', pay.id);
          if (error) return fail(error);
          close(); after();
        } }, t('undo'))));
    }
    const form = rem > 0 ? h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      const a = Math.round(num(amount.value) * 100) / 100;
      if (!(a > 0)) return toast(t('required'), 'bad');
      if (a > rem + 0.001) return toast(t('overpayment'), 'bad');
      busy(save, true);
      try { await payBill(b, a, d.method || 'cash', clean(note.value, 120)); close(); toast(t('paymentSaved'), 'good'); after(); }
      catch (err) { fail(err); } finally { busy(save, false); }
    } },
      field(t('amount'), amount),
      segmented('method', [['cash', t('cash')], ['whish', 'Whish'], ['omt', 'OMT'], ['other', t('other')]], 'cash'),
      field(t('note'), note), save) : null;
    close = sheet(p ? p.title : t('bill'), h('div', { class: 'stack' },
      h('div', { class: 'summary' },
        h('small', { class: 'muted' }, monthLabel(b.month)), h('div', null, billDetail(b)),
        h('div', { class: 'row between' }, h('span', null, t('total')), h('strong', null, ltr(money(b.amount)), ` · ${lbp(b.amount, biz.lbp_rate)} ${t('lbpUnit')}`)),
        h('div', { class: 'row between' }, h('span', null, t('remaining')), h('strong', { class: `amount ${rem > 0 ? 'bad' : 'ok'}` }, money(rem)))),
      pays.length ? h('div', { class: 'stack tight' }, h('small', { class: 'muted' }, t('payments')), pays) : null,
      form,
      p && p.info.phone ? h('button', { type: 'button', class: 'btn wa block', onclick: () => openExternal(waLink(p.info.phone, billMessage(b, p))) }, icon('chat'), t('sendBill')) : null));
  }

  async function viewHome() {
    const biz = state.business;
    const m = monthDate(state.month);
    const [people, tariff, readings, bills] = await Promise.all([
      loadPeople(),
      sb.from('tariffs').select('*').eq('business_id', biz.id).eq('month', m).maybeSingle(),
      sb.from('readings').select('subscriber_id, subscribers!inner(business_id)').eq('month', m).eq('subscribers.business_id', biz.id),
      sb.from('bills').select('*, payments(id, amount, method, note, paid_at)').eq('business_id', biz.id).eq('month', m)
    ]);
    for (const r of [tariff, readings, bills]) if (r.error) throw r.error;
    const billable = people.filter((p) => p.active && p.status !== 'pending');
    const metered = billable.filter((p) => p.billing_type === 'metered');
    const pending = people.filter((p) => p.status === 'pending');
    const readIds = new Set(readings.data.map((r) => r.subscriber_id));
    const readCount = metered.filter((p) => readIds.has(p.id)).length;
    const billed = bills.data.reduce((a, b) => a + Number(b.amount), 0);
    const paid = bills.data.reduce((a, b) => a + Number(b.paid_amount), 0);
    const unpaid = bills.data.filter((b) => Number(b.paid_amount) < Number(b.amount)).sort((a, b) => (b.amount - b.paid_amount) - (a.amount - a.paid_amount));
    const bar = h('div', { class: 'bar' }, h('i'));
    bar.firstChild.style.width = `${billed > 0 ? Math.round((paid / billed) * 100) : 0}%`;

    const genBtn = h('button', { type: 'button', class: 'btn primary small', onclick: async (e) => {
      e.stopPropagation();
      if (!tariff.data) return tariffSheet(null, viewHome);
      busy(genBtn, true);
      try {
        const { data, error } = await sb.rpc('generate_bills', { p_business: biz.id, p_month: m });
        if (error) throw error;
        const notes = [t('generated', { n: data.created + data.updated })];
        if (data.missing_reading) notes.push(t('missingReadings', { n: data.missing_reading }));
        if (data.invalid_reading) notes.push(t('invalidReadings', { n: data.invalid_reading }));
        toast(notes.join(' · '), data.missing_reading || data.invalid_reading ? 'warn' : 'good');
        viewHome();
      } catch (err) { fail(err); } finally { busy(genBtn, false); }
    } }, bills.data.length ? t('updateBills') : t('createBills'));

    const step = (n, done, title, sub, action, onclick) => h('div', { class: `step ${done ? 'done' : ''}`, role: onclick ? 'button' : null, tabindex: onclick ? '0' : null, onclick },
      h('span', { class: 'step-n' }, done ? icon('check') : String(n)),
      h('div', { class: 'grow' }, h('strong', null, title), h('small', { class: 'muted' }, sub)),
      action || h('span', { class: 'chev flip' }, '›'));

    render(
      head(biz.name, monthSwitch(viewHome)),
      !people.length ? h('div', { class: 'card stack center-card' },
        h('h2', null, t('startTitle')), h('p', { class: 'muted' }, t('startBody')),
        h('button', { type: 'button', class: 'btn primary block', onclick: () => personForm(null, () => go('people')) }, icon('plus'), t('addSubscriber')),
        h('button', { type: 'button', class: 'btn ghost block', onclick: () => go('invite') }, icon('send'), t('inviteAll'))) : null,
      h('div', { class: 'cols' },
        h('div', { class: 'stack' },
          h('section', { class: 'hero-card' },
            h('small', null, t('collectedOf')),
            h('div', { class: 'hero-num' }, money(paid), h('span', null, ` / ${money(billed)}`)),
            bar,
            h('div', { class: 'row between' }, h('span', null, t('unpaidCount', { n: unpaid.length })), h('strong', { class: 'amount' }, money(billed - paid)))),
          h('section', { class: 'card flush' },
            h('h3', { class: 'card-title' }, t('thisMonth')),
            step(1, !!tariff.data, t('stepPrice'), tariff.data ? t('priceSet', { kwh: ltr(money(tariff.data.kwh_price)), amp: ltr(money(tariff.data.flat_amp_price)) }) : t('priceNotSet'), null, () => tariffSheet(tariff.data, viewHome)),
            step(2, metered.length > 0 && readCount === metered.length, t('stepReadings'), metered.length ? t('readingsCount', { n: readCount, total: metered.length }) : t('noMeteredShort'), null, () => go('readings')),
            step(3, bills.data.length > 0, t('stepBills'), bills.data.length ? t('billsMade', { n: bills.data.length }) : t('billsNotMade'), genBtn))),
        h('div', { class: 'stack' },
          pending.length ? h('section', { class: 'card flush' },
            h('h3', { class: 'card-title' }, t('requests'), h('span', { class: 'badge' }, pending.length)),
            pending.map((p) => h('div', { class: 'item', role: 'button', tabindex: '0', onclick: () => requestSheet(p, viewHome) },
              avatar(p.info.name), h('div', { class: 'grow' }, h('strong', null, p.info.name || '—'),
                h('small', { class: 'muted' }, [ltr(p.info.phone), p.info.building].filter(Boolean).join(' · '))),
              h('span', { class: 'pill partial' }, t('review'))))) : null,
          h('section', { class: 'card flush' },
            h('h3', { class: 'card-title' }, t('toCollect'), unpaid.length > 6 ? h('button', { type: 'button', class: 'link', onclick: () => go('bills') }, t('seeAll')) : null),
            unpaid.length ? unpaid.slice(0, 6).map((b) => billRow(b, viewHome))
              : h('p', { class: 'muted pad' }, bills.data.length ? t('allPaid') : t('noBillsYet'))))));
  }

  function tariffSheet(current, after) {
    const biz = state.business;
    const m = monthDate(state.month);
    const save = h('button', { type: 'submit', class: 'btn primary block' }, t('save'));
    (async () => {
      let seed = current;
      if (!seed) {
        const last = await sb.from('tariffs').select('*').eq('business_id', biz.id).lt('month', m).order('month', { ascending: false }).limit(1).maybeSingle();
        seed = last.data;
      }
      const close = sheet(`${t('stepPrice')} · ${monthLabel(m)}`, h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        const d = formData(e.target);
        const row = { kwh_price: num(d.kwh_price || 0), fixed_fee_per_amp: num(d.fixed_fee_per_amp || 0), flat_amp_price: num(d.flat_amp_price || 0) };
        if (Object.values(row).some((v) => !(v >= 0))) return toast(t('required'), 'bad');
        busy(save, true);
        try {
          const res = current
            ? await sb.from('tariffs').update(row).eq('id', current.id)
            : await sb.from('tariffs').insert(Object.assign({ business_id: biz.id, month: m }, row));
          if (res.error) throw res.error;
          close(); toast(t('saved'), 'good'); after();
        } catch (err) { fail(err); } finally { busy(save, false); }
      } },
        h('h4', null, t('meteredSubs')),
        h('div', { class: 'grid2' },
          field(t('kwhPrice'), input('kwh_price', { type: 'number', step: '0.0001', min: '0', inputmode: 'decimal', value: seed ? seed.kwh_price : '' })),
          field(t('fixedFee'), input('fixed_fee_per_amp', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', value: seed ? seed.fixed_fee_per_amp : '' }))),
        h('h4', null, t('flatSubs')),
        field(t('flatAmp'), input('flat_amp_price', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', value: seed ? seed.flat_amp_price : '' })),
        h('p', { class: 'muted small' }, t('tariffHint')), save));
    })().catch(fail);
  }

  function subscriptionFields(base, info) {
    const type = segmented('billing_type', [['metered', t('metered')], ['flat', t('flat')]], base.billing_type);
    const meterRow = h('div', { class: 'grid2' },
      field(t('meterNumber'), input('meter', { maxlength: 40, value: info.meter || '' })),
      field(t('initialReading'), input('initial_reading', { type: 'number', step: '0.01', min: '0', value: base.initial_reading, inputmode: 'decimal' })));
    const sync = () => { meterRow.hidden = type.querySelector('input:checked').value !== 'metered'; };
    type.addEventListener('change', sync);
    sync();
    const amps = input('amps', { type: 'number', min: '1', max: '200', step: '1', value: base.amps, inputmode: 'numeric' });
    return [
      field(t('privateName'), input('label', { maxlength: 80, value: base.label || '' }), t('privateNameHint')),
      field(t('amps'), amps),
      h('div', { class: 'chips' }, [5, 10, 15, 20, 30].map((a) => h('button', { type: 'button', class: 'chip', onclick: () => { amps.value = a; } }, `${a}A`))),
      field(t('billingType'), type),
      meterRow
    ];
  }

  function readSubscription(d) {
    const a = parseInt(d.amps, 10);
    const metered = d.billing_type !== 'flat';
    const init = metered ? num(d.initial_reading || 0) : 0;
    if (!(a >= 1 && a <= 200) || !(init >= 0)) { toast(t('required'), 'bad'); return null; }
    return { amps: a, metered, init, meter: metered ? clean(d.meter, 40) : '', label: clean(d.label, 80) };
  }

  function requestSheet(p, after) {
    const ok = h('button', { type: 'submit', class: 'btn primary' }, t('accept'));
    const no = h('button', { type: 'button', class: 'btn danger ghost', onclick: async () => {
      const { error } = await sb.from('subscribers').delete().eq('id', p.id);
      if (error) return fail(error);
      close(); after();
    } }, t('reject'));
    const close = sheet(t('joinRequest'), h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      if (!p.sk) return toast(t('error'), 'bad');
      const s = readSubscription(formData(e.target));
      if (!s) return;
      busy(ok, true);
      try {
        const up = await sb.rpc('approve_request', {
          p_sub: p.id, p_wk: await V.enc(state.bk, { k: p.sk }), p_oenc: s.label ? await V.enc(state.bk, { label: s.label }) : null,
          p_amps: s.amps, p_type: s.metered ? 'metered' : 'flat', p_initial: s.init
        });
        if (up.error) throw up.error;
        if (s.meter) {
          const res = await sb.from('subscribers').update({ enc: await V.enc(p.sk, Object.assign({}, p.info, { meter: s.meter })) }).eq('id', p.id);
          if (res.error) throw res.error;
        }
        close(); toast(t('accepted'), 'good'); after();
      } catch (err) { fail(err); } finally { busy(ok, false); }
    } },
      h('div', { class: 'summary' }, h('strong', null, p.info.name || '—'),
        h('span', null, [ltr(p.info.phone), p.info.building, p.info.floor && `${t('floor')} ${p.info.floor}`].filter(Boolean).join(' · '))),
      subscriptionFields({ billing_type: 'metered', amps: 5, initial_reading: 0, label: '' }, {}),
      h('div', { class: 'grid2' }, no, ok)));
  }

  async function viewPeople(filter) {
    const people = await loadPeople();
    const q = (filter || '').toLowerCase();
    const list = people.filter((p) => p.status !== 'pending' && (!q || [p.title, p.info.name, p.info.phone, p.info.building, p.info.meter].some((v) => (v || '').toLowerCase().includes(q))));
    const search = input('q', { type: 'search', placeholder: t('search'), value: filter || '', class: 'search' });
    let tmr;
    search.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => viewPeople(search.value).then(() => {
      const s = $app.querySelector('input[name=q]'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    }).catch(fail), 250); });
    const again = () => viewPeople();
    render(
      head(`${t('tabPeople')} (${people.filter((p) => p.status !== 'pending').length})`, h('button', { type: 'button', class: 'btn primary small desk-only', onclick: () => personForm(null, again) }, icon('plus'), t('add'))),
      people.length ? search : null,
      list.length ? h('div', { class: 'card flush grid-list' }, list.map((p) => h('div', { class: `item ${p.active ? '' : 'dim'}`, role: 'button', tabindex: '0', onclick: () => personSheet(p) },
        avatar(p.title),
        h('div', { class: 'grow' }, h('strong', null, p.title),
          h('small', { class: 'muted' }, [p.label && p.info.name !== p.label ? p.info.name : null, p.info.building, ltr(p.info.phone)].filter(Boolean).join(' · '))),
        h('div', { class: 'end-col' },
          h('span', { class: 'pill' }, `${p.amps}A · ${typeLabel(p.billing_type)}`),
          h('small', { class: p.status === 'active' ? 'ok' : 'muted' }, p.status === 'active' ? t('linked') : t('notLinked'))))))
        : empty(people.length ? t('noResults') : t('noPeople'), h('button', { type: 'button', class: 'btn primary', onclick: () => personForm(null, again) }, icon('plus'), t('addSubscriber'))),
      h('button', { type: 'button', class: 'fab', onclick: () => personForm(null, again), 'aria-label': t('addSubscriber') }, icon('plus')));
  }

  function linkButtons(p) {
    const msg = t('linkMsg', { biz: state.business.name, name: p.info.name || '', url: inviteUrl(p) });
    return h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'act wa', onclick: () => openExternal(waLink(p.info.phone, msg)) }, icon('chat'), h('span', null, 'WhatsApp')),
      h('a', { class: 'act', href: smsLink(p.info.phone, msg) }, icon('send'), h('span', null, 'SMS')),
      h('button', { type: 'button', class: 'act', onclick: () => copyText(inviteUrl(p)) }, icon('copy'), h('span', null, t('copyLink'))),
      h('a', { class: 'act', href: `tel:+${intlPhone(p.info.phone)}` }, icon('phone'), h('span', null, t('call'))));
  }

  function personSheet(p) {
    const line = (label, value, cls) => h('div', { class: 'row between' }, h('span', { class: 'muted' }, label), h('strong', { class: cls || '' }, value));
    const close = sheet(p.title, h('div', { class: 'stack' },
      h('div', { class: 'summary' },
        p.label ? line(t('theirName'), p.info.name || '—') : null,
        line(t('phone'), p.info.phone || '—', 'ltr'),
        p.info.building ? line(t('building'), [p.info.building, p.info.floor].filter(Boolean).join(' · ')) : null,
        line(t('subscription'), `${p.amps}A · ${typeLabel(p.billing_type)}`),
        line(t('appStatus'), p.status === 'active' ? t('linked') : t('notLinked'), p.status === 'active' ? 'ok' : '')),
      h('small', { class: 'muted' }, t('sendLinkHint')),
      linkButtons(p),
      h('button', { type: 'button', class: 'btn ghost block', onclick: () => { close(); personForm(p, () => viewPeople()); } }, t('edit')),
      h('div', { class: 'grid2' },
        h('button', { type: 'button', class: 'btn ghost', onclick: async () => {
          if (!(await confirmBox(t('resetConfirm'), t('resetAccess')))) return;
          const { error } = await sb.rpc('reset_subscriber_access', { p_sub: p.id });
          if (error) return fail(error);
          close(); toast(t('resetDone'), 'good'); viewPeople();
        } }, t('resetAccess')),
        h('button', { type: 'button', class: 'btn danger ghost', onclick: async () => {
          if (!(await confirmBox(t('deletePerson', { name: p.title })))) return;
          const { error } = await sb.from('subscribers').delete().eq('id', p.id);
          if (error) return fail(error);
          close(); viewPeople();
        } }, t('delete')))));
  }

  function personForm(p, after) {
    const isNew = !p;
    const info = p ? p.info : {};
    const base = p || { billing_type: 'metered', amps: 5, initial_reading: 0, active: true, label: '' };
    const save = h('button', { type: 'submit', class: 'btn primary block' }, isNew ? t('saveAndSend') : t('save'));
    const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const d = formData(form);
      const next = readPerson(d, info);
      if (!next) return;
      const s = readSubscription(d);
      if (!s) return;
      next.meter = s.meter;
      busy(save, true);
      try {
        const sk = isNew ? V.genKey() : p.sk;
        const row = {
          enc: await V.enc(sk, next), oenc: s.label ? await V.enc(state.bk, { label: s.label }) : null,
          amps: s.amps, billing_type: s.metered ? 'metered' : 'flat', initial_reading: s.init, active: isNew ? true : !!d.active
        };
        if (isNew) {
          const res = await sb.from('subscribers').insert(Object.assign({ business_id: state.business.id, wk: await V.enc(state.bk, { k: sk }) }, row)).select().single();
          if (res.error) throw res.error;
          close();
          await after();
          sendLinkSheet(Object.assign(res.data, { sk, info: next, label: s.label, title: s.label || next.name }));
        } else {
          const res = await sb.from('subscribers').update(row).eq('id', p.id);
          if (res.error) throw res.error;
          close(); toast(t('saved'), 'good'); after();
        }
      } catch (err) { fail(err); } finally { busy(save, false); }
    } },
      personFields(info, true),
      subscriptionFields(base, info),
      !isNew ? h('label', { class: 'check' }, input('active', { type: 'checkbox', checked: base.active }), t('activeSub')) : null,
      save);
    const close = sheet(isNew ? t('addSubscriber') : t('editSubscriber'), form);
  }

  function sendLinkSheet(p) {
    const close = sheet(t('sendLinkTitle'), h('div', { class: 'stack' },
      h('p', { class: 'muted' }, t('sendLinkBody', { name: p.info.name })),
      linkButtons(p),
      h('button', { type: 'button', class: 'btn ghost block', onclick: () => close() }, t('later'))));
  }

  async function viewReadings() {
    const m = monthDate(state.month);
    const people = (await loadPeople()).filter((p) => p.active && p.status !== 'pending' && p.billing_type === 'metered');
    people.sort((a, b) => (a.info.building || '').localeCompare(b.info.building || '') || a.title.localeCompare(b.title));
    const ids = people.map((p) => p.id);
    const rd = ids.length ? await sb.from('readings').select('id, subscriber_id, month, value').in('subscriber_id', ids).lte('month', m).order('month', { ascending: false }) : { data: [] };
    if (rd.error) throw rd.error;
    const cur = new Map(); const prev = new Map();
    for (const r of rd.data) {
      if (r.month === m) cur.set(r.subscriber_id, r);
      else if (!prev.has(r.subscriber_id)) prev.set(r.subscriber_id, r.value);
    }
    const inputs = [];
    const rows = people.map((s) => {
      const p = prev.has(s.id) ? Number(prev.get(s.id)) : Number(s.initial_reading);
      const c = cur.get(s.id);
      const inp = input(`r_${s.id}`, { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', enterkeyhint: 'next', value: c ? c.value : '', placeholder: String(p), class: 'reading-input' });
      const diff = h('small', { class: 'muted' });
      const upd = () => {
        const v = num(inp.value);
        diff.textContent = inp.value === '' ? `${t('prev')}: ${p}` : v < p ? t('lowerThanPrev') : `+${(v - p).toFixed(1)} ${t('kwh')}`;
        diff.className = inp.value !== '' && v < p ? 'bad' : 'muted';
      };
      inp.addEventListener('input', upd); upd();
      inputs.push({ s, inp, c });
      return h('div', { class: 'item static' }, avatar(s.title),
        h('div', { class: 'grow' }, h('strong', null, s.title), h('small', { class: 'muted' }, [s.info.building, s.info.meter && `#${s.info.meter}`].filter(Boolean).join(' · '))),
        h('div', { class: 'reading' }, inp, diff));
    });
    const save = h('button', { type: 'button', class: 'btn primary block sticky', onclick: async () => {
      busy(save, true);
      let n = 0;
      try {
        const inserts = [];
        for (const { s, inp, c } of inputs) {
          if (inp.value === '') continue;
          const v = num(inp.value);
          if (!(v >= 0) || (c && Number(c.value) === v)) continue;
          if (c) { const { error } = await sb.from('readings').update({ value: v }).eq('id', c.id); if (error) throw error; }
          else inserts.push({ subscriber_id: s.id, month: m, value: v });
          n++;
        }
        if (inserts.length) { const { error } = await sb.from('readings').insert(inserts); if (error) throw error; }
        toast(t('readingsSaved', { n }), 'good');
        go('home');
      } catch (err) { fail(err); } finally { busy(save, false); }
    } }, t('saveReadings'));
    render(head(t('stepReadings'), monthSwitch(viewReadings), 'home'),
      rows.length ? h('div', { class: 'card flush grid-list' }, rows) : empty(t('noMetered')),
      rows.length ? save : null);
  }

  async function viewBills(status) {
    status = status || 'all';
    const biz = state.business;
    const m = monthDate(state.month);
    await loadPeople();
    const { data, error } = await sb.from('bills').select('*, payments(id, amount, method, note, paid_at)').eq('business_id', biz.id).eq('month', m);
    if (error) throw error;
    const again = () => viewBills(status).catch(fail);
    const order = { unpaid: 0, partial: 1, paid: 2 };
    const list = data.filter((b) => status === 'all' || b.status === status)
      .sort((a, b) => order[a.status] - order[b.status] || personName(a.subscriber_id).localeCompare(personName(b.subscriber_id)));
    const count = (s) => data.filter((b) => s === 'all' || b.status === s).length;
    render(head(t('tabBills'), monthSwitch(again)),
      h('div', { class: 'chips' }, ['all', 'unpaid', 'partial', 'paid'].map((f) => h('button', { type: 'button', class: f === status ? 'chip on' : 'chip', onclick: () => viewBills(f).catch(fail) }, `${t(f)} ${count(f)}`))),
      list.length ? h('div', { class: 'card flush grid-list' }, list.map((b) => billRow(b, again)))
        : empty(data.length ? t('noResults') : t('noBills'), !data.length ? h('button', { type: 'button', class: 'btn primary', onclick: () => go('home') }, t('goHome')) : null));
  }

  function viewInviteAll() {
    const biz = state.business;
    const msg = () => t('joinMsg', { biz: biz.name, url: joinUrl(), code: biz.join_code });
    render(head(t('inviteAll'), null, 'more'),
      h('div', { class: 'card stack' },
        h('p', { class: 'muted' }, t('inviteAllBody')),
        h('div', { class: 'rc mono' }, biz.join_code),
        h('div', { class: 'actions two' },
          h('button', { type: 'button', class: 'act wa', onclick: () => shareText(msg()) }, icon('send'), h('span', null, t('share'))),
          h('button', { type: 'button', class: 'act', onclick: () => copyText(msg()) }, icon('copy'), h('span', null, t('copy')))),
        h('button', { type: 'button', class: 'link', onclick: async () => {
          if (!(await confirmBox(t('newCodeConfirm'), t('newCode')))) return;
          const { data, error } = await sb.rpc('rotate_join_code', { p_business: biz.id });
          if (error) return fail(error);
          biz.join_code = data; viewInviteAll();
        } }, t('newCode'))));
  }

  async function viewNotices() {
    const biz = state.business;
    const { data, error } = await sb.from('notices').select('*').eq('business_id', biz.id).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    const btn = h('button', { type: 'submit', class: 'btn primary block' }, t('postNotice'));
    render(head(t('tabNotices'), null, 'more'),
      h('form', { class: 'card stack', novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        const d = formData(e.target);
        if (!clean(d.title, 120)) return toast(t('required'), 'bad');
        busy(btn, true);
        try {
          const res = await sb.from('notices').insert({ business_id: biz.id, title: clean(d.title, 120), body: clean(d.body, 1000) || null });
          if (res.error) throw res.error;
          viewNotices();
        } catch (err) { fail(err); } finally { busy(btn, false); }
      } },
        field(t('title'), input('title', { required: true, maxlength: 120, placeholder: t('noticeExample') })),
        field(t('message'), h('textarea', { name: 'body', maxlength: 1000, rows: 3 })),
        btn),
      noticeList(data, true));
  }

  function noticeList(data, canDelete) {
    if (!data.length) return empty(t('noNotices'));
    const bizName = (id) => { const s = state.subs.find((x) => x.business_id === id); return s ? s.business.name : ''; };
    return h('div', { class: 'stack' }, data.map((n) => h('article', { class: 'card stack tight' },
      h('div', { class: 'row between' }, h('strong', null, n.title), h('small', { class: 'muted' }, dateLabel(n.created_at))),
      n.body ? h('p', { class: 'pre' }, n.body) : null,
      !canDelete ? h('small', { class: 'muted' }, bizName(n.business_id)) : null,
      canDelete ? h('button', { type: 'button', class: 'link bad', onclick: async () => {
        const { error } = await sb.from('notices').delete().eq('id', n.id);
        if (error) return fail(error);
        viewNotices();
      } }, t('delete')) : null)));
  }

  async function viewMyBills() {
    const active = state.subs.filter((s) => s.status === 'active');
    const waiting = state.subs.filter((s) => s.status === 'pending');
    const ids = active.map((s) => s.id);
    const res = ids.length ? await sb.from('bills').select('*, payments(amount, method, paid_at)').in('subscriber_id', ids).order('month', { ascending: false }).limit(60) : { data: [] };
    if (res.error) throw res.error;
    render(head(t('tabBills'), h('button', { type: 'button', class: 'icon-btn', onclick: refresh, 'aria-label': t('refresh') }, '↻')),
      waiting.map((s) => h('section', { class: 'card stack center-card' },
        h('div', { class: 'logo small' }, icon('bolt')),
        h('h2', null, t('waitingTitle')), h('p', { class: 'muted' }, t('waitingBody', { biz: s.business.name })))),
      active.map((s) => {
        const biz = s.business;
        const mine = res.data.filter((b) => b.subscriber_id === s.id);
        const due = mine.reduce((a, b) => a + Number(b.amount) - Number(b.paid_amount), 0);
        return h('div', { class: 'cols' },
          h('section', { class: `hero-card ${due > 0 ? '' : 'clear'}` },
            h('small', null, biz.name),
            h('div', { class: 'hero-num' }, money(due)),
            h('div', { class: 'row between' },
              h('span', null, due > 0 ? `≈ ${lbp(due, biz.lbp_rate)} ${t('lbpUnit')}` : t('nothingDue')),
              h('span', null, `${s.amps}A · ${typeLabel(s.billing_type)}`)),
            biz.phone ? h('a', { class: 'btn glass block', href: `tel:+${intlPhone(biz.phone)}` }, icon('phone'), t('callOwner')) : null),
          h('section', { class: 'card flush' },
            h('h3', { class: 'card-title' }, t('history')),
            mine.length ? mine.map((b) => h('details', { class: 'item col' },
              h('summary', { class: 'row between' }, h('span', null, monthLabel(b.month)),
                h('span', { class: 'row' }, h('strong', { class: 'amount' }, money(b.amount)), h('span', { class: `pill ${b.status}` }, t(b.status)))),
              h('div', { class: 'stack tight detail' },
                b.billing_type === 'metered' ? h('small', null, t('readingLine', { prev: Number(b.prev_reading), curr: Number(b.curr_reading) })) : null,
                h('small', null, billDetail(b)),
                h('small', { class: 'muted' }, `≈ ${lbp(b.amount, biz.lbp_rate)} ${t('lbpUnit')}`),
                (b.payments || []).map((p) => h('small', { class: 'ok' }, `✓ ${money(p.amount)} · ${t(p.method)} · ${dateLabel(p.paid_at)}`)))))
              : h('p', { class: 'muted pad' }, t('noSubscriptionBills'))));
      }));
  }

  async function refresh() {
    try { await loadContext(); await route(); } catch (e) { fail(e); }
  }

  async function viewSubNotices() {
    const bizIds = [...new Set(state.subs.filter((s) => s.status === 'active').map((s) => s.business_id))];
    const res = bizIds.length ? await sb.from('notices').select('*').in('business_id', bizIds).order('created_at', { ascending: false }).limit(50) : { data: [] };
    if (res.error) throw res.error;
    render(head(t('tabNotices')), noticeList(res.data, false));
  }

  function myInfoSheet(s) {
    if (!s.sk) return toast(t('openLinkAgain'), 'bad');
    const save = h('button', { type: 'submit', class: 'btn primary block' }, t('save'));
    const close = sheet(t('myDetails'), h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const next = readPerson(formData(e.target), s.info);
      if (!next) return;
      busy(save, true);
      try {
        const { error } = await sb.rpc('update_my_info', { p_sub: s.id, p_enc: await V.enc(s.sk, next) });
        if (error) throw error;
        s.info = next;
        close(); toast(t('saved'), 'good'); viewMore();
      } catch (err) { fail(err); } finally { busy(save, false); }
    } }, personFields(s.info), save));
  }

  function menuRow(label, value, onclick, ic) {
    return h(onclick ? 'button' : 'div', { class: 'item', type: onclick ? 'button' : null, onclick },
      h('span', { class: 'row-ic' }, icon(ic)),
      h('div', { class: 'grow' }, h('strong', null, label), value ? h('small', { class: 'muted' }, value) : null),
      onclick ? h('span', { class: 'chev flip' }, '›') : null);
  }

  function viewMore() {
    const parts = [];
    if (state.mode === 'owner') {
      const biz = state.business;
      parts.push(h('section', { class: 'card flush' },
        menuRow(t('inviteAll'), t('inviteAllShort'), () => go('invite'), 'send'),
        menuRow(t('tabNotices'), t('noticesShort'), () => go('notices'), 'bell'),
        menuRow(t('stepPrice'), monthLabel(monthDate(state.month)), async () => {
          const cur = await sb.from('tariffs').select('*').eq('business_id', biz.id).eq('month', monthDate(state.month)).maybeSingle();
          tariffSheet(cur.data, () => {});
        }, 'tag'),
        menuRow(t('business'), [biz.name, ltr(biz.phone)].filter(Boolean).join(' · '), bizSheet, 'bolt'),
        state.subs.length ? menuRow(t('switchToSubscriber'), null, () => { state.mode = 'subscriber'; go('mybills'); }, 'home') : null));
    } else {
      parts.push(h('section', { class: 'card flush' },
        state.subs.filter((s) => s.status === 'active').map((s) => menuRow(t('myDetails'), [s.info.name, ltr(s.info.phone), s.business.name].filter(Boolean).join(' · '), () => myInfoSheet(s), 'people')),
        menuRow(t('addGenerator'), t('addGeneratorShort'), viewEnterCode, 'plus'),
        state.business ? menuRow(t('switchToOwner'), null, () => { state.mode = 'owner'; go('home'); }, 'bolt') : null));
    }
    parts.push(h('section', { class: 'card flush' },
      menuRow(t('language'), state.lang === 'ar' ? 'العربية' : 'English', switchLang, 'globe'),
      menuRow(t('security'), t('securityShort'), null, 'lock')));
    parts.push(h('button', { type: 'button', class: 'btn danger ghost block', onclick: async () => {
      if (state.user.is_anonymous && !(await confirmBox(t('leaveConfirm'), t('signOut')))) return;
      signOut();
    } }, t('signOut')),
      state.user.email ? h('p', { class: 'muted center small' }, state.user.email) : null);
    render(head(t('tabMore')), parts);
  }

  function bizSheet() {
    const biz = state.business;
    const save = h('button', { type: 'submit', class: 'btn primary block' }, t('save'));
    const close = sheet(t('business'), h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      const rate = num(d.lbp_rate);
      if (!clean(d.name, 120) || !(rate > 0)) return toast(t('required'), 'bad');
      if (!validPhone(d.phone)) return toast(t('phoneRequired'), 'bad');
      busy(save, true);
      try {
        const { data, error } = await sb.from('businesses').update({ name: clean(d.name, 120), phone: clean(d.phone, 30), area: clean(d.area, 120) || null, lbp_rate: rate }).eq('id', biz.id).select().single();
        if (error) throw error;
        state.business = data; close(); toast(t('saved'), 'good'); viewMore();
      } catch (err) { fail(err); } finally { busy(save, false); }
    } },
      field(t('businessName'), input('name', { required: true, maxlength: 120, value: biz.name })),
      field(t('phone'), input('phone', { type: 'tel', required: true, maxlength: 30, value: biz.phone || '', inputmode: 'tel' })),
      field(t('area'), input('area', { maxlength: 120, value: biz.area || '' })),
      field(t('lbpRate'), input('lbp_rate', { type: 'number', step: '1', min: '1', value: biz.lbp_rate, inputmode: 'decimal' })),
      save));
  }

  async function signOut() {
    if (state.business) store.del(`bk:${state.business.id}`);
    await sb.auth.signOut();
    Object.assign(state, { user: null, pw: null, business: null, bk: null, priv: null, subs: [], mode: null, people: [], invite: null, join: null });
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    route();
  }

  async function boot(force) {
    if (holdBoot && !force) return;
    const { data } = await sb.auth.getSession();
    state.user = data.session ? data.session.user : null;
    try {
      if (!state.user && (state.invite || state.join)) await ensureSession();
      else if (state.user) await loadContext();
    } catch (e) { state.invite = null; state.join = null; fail(e); }
    route();
  }

  sb.auth.onAuthStateChange((event, session) => {
    const uid = session ? session.user.id : null;
    if (uid === lastUid) return;
    lastUid = uid;
    setTimeout(boot, 0);
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  applyLang();
})();
