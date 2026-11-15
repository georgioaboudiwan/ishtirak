(() => {
  'use strict';

  const cfg = window.APP_CONFIG;
  const V = window.Vault;
  const isNative = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  const plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
  let dataVer = 0;
  const READ_RPC = /\/rpc\/(my_subscriptions|my_collector_roles|collector_subscribers|join_preview|am_i_admin|log_event|owner_home|app_context)$/;
  const trackedFetch = (input, init) => {
    const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    const url = String(typeof input === 'string' ? input : input.url).split('?')[0];
    const write = method !== 'GET' && method !== 'HEAD' && url.includes('/rest/v1/') && !READ_RPC.test(url);
    if (write) dataVer++;
    const res = fetch(input, init);
    return write ? res.finally(() => { dataVer++; }) : res;
  };
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    global: { fetch: trackedFetch },
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
    invite: null, join: null, people: [],
    cinvite: null, roles: [], role: null, ownBusiness: null, collectors: [], openBills: [], sent: {}, billFilter: null
  };

  let holdBoot = false;
  let lastUid;

  parseEntryHash();

  function parseEntryHash() {
    const hash = location.hash || '';
    let m = hash.match(/^#\/i\/([A-Z0-9]{24})\.([A-Za-z0-9_-]{43})$/);
    if (m) { state.invite = { token: m[1], sk: m[2] }; return; }
    m = hash.match(/^#\/c\/([A-Z0-9]{24})\.([A-Za-z0-9_-]{43})$/);
    if (m) { state.cinvite = { token: m[1], ck: m[2] }; return; }
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
    plus: 'M12 5v14M5 12h14',
    camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    text: 'M4 7V5h11v2M9.5 5v14M7 19h5M14 12v-1.5h7V12M17.5 10.5V19M16 19h3',
    hash: 'M5 9h14M5 15h14M10 4 8 20M16 4l-2 16'
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

  const $fab = document.getElementById('fab-slot');

  function sep() { return state.lang === 'ar' ? '، ' : ', '; }

  function render(...nodes) {
    const list = nodes.flat(3).filter((n) => n !== null && n !== undefined && n !== false);
    const fabs = list.filter((n) => n instanceof Element && n.classList.contains('fab'));
    const same = $app.dataset.route === (state.route || '') && !!$app.querySelector('.view:not(.loading)');
    const keep = $app.scrollTop;
    document.body.classList.remove('boot');
    const loading = list.some((n) => n instanceof Element && n.classList.contains('skeleton'));
    $app.replaceChildren(h('div', { class: `view${same ? ' still' : ''}${loading ? ' loading' : ''}` }, list.filter((n) => !fabs.includes(n))));
    $fab.replaceChildren(...fabs);
    $app.dataset.route = state.route || '';
    if (same) $app.scrollTop = keep; else { $app.scrollTop = 0; window.scrollTo(0, 0); }
  }

  function meter(pct) {
    const n = 24;
    const on = pct > 0 ? Math.max(1, Math.round(pct * n)) : 0;
    const el = h('div', { class: 'meter', role: 'img', 'aria-label': `${Math.round(pct * 100)}%` });
    for (let i = 0; i < n; i++) el.append(h('i', { class: i < on ? 'on' : null }));
    return el;
  }

  let toastTimer;
  function toast(msg, kind, action) {
    $toast.replaceChildren(...[h('span', null, msg), action ? h('button', { type: 'button', class: 'toast-act', onclick: () => { $toast.hidden = true; action.fn(); } }, action.label) : null].filter(Boolean));
    $toast.className = `toast ${kind || ''}`;
    $toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.hidden = true; }, action ? 6500 : 3800);
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

  function fail(e) { console.error(e); const m = errMsg(e); if (m === t('error')) logError(e, 'fail'); toast(m, 'bad'); }

  function money(n) { const v = Number(n || 0); return `${v < -0.004 ? '-' : ''}$${Math.abs(v).toFixed(2)}`; }
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
  function openExternal(url) {
    if (isNative) {
      const a = h('a', { href: url, rel: 'noopener' });
      document.body.append(a); a.click(); a.remove();
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  function appUrl() { return isNative || !/^https?:$/.test(location.protocol) ? cfg.publicUrl : `${location.origin}${location.pathname}`; }

  const memo = new Map();
  const homeFresh = {};
  async function cached(key, fn, ttl) {
    const hit = memo.get(key);
    if (hit && hit.ver === dataVer && Date.now() - hit.at < (ttl || 30000)) return hit.val;
    const entry = { ver: dataVer, at: Date.now(), val: fn() };
    memo.set(key, entry);
    try {
      const v = await entry.val;
      entry.done = true; entry.res = v;
      return v;
    } catch (e) { if (memo.get(key) === entry) memo.delete(key); throw e; }
  }
  function peek(key) { const hit = memo.get(key); return hit && hit.done && hit.ver === dataVer ? hit : null; }
  function seed(key, val, at) { memo.set(key, { ver: dataVer, at, val: Promise.resolve(val), done: true, res: val }); }
  function inviteUrl(p) { return `${appUrl()}#/i/${p.invite_code}.${p.sk}`; }
  function joinUrl() { return `${appUrl()}#/b/${state.business.join_code}`; }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast(t('copied'), 'good'); }
    catch { toast(text); }
  }

  async function shareText(text) {
    if (isNative && plugins.Share) { try { await plugins.Share.share({ text }); } catch {} return; }
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
    swipeToClose(wrap.firstChild, close);
    requestAnimationFrame(() => wrap.classList.add('open'));
    return close;
  }

  function swipeToClose(el, close) {
    let y0 = null; let t0 = 0; let dy = 0; let dragging = false; let fromHead = false;
    const reset = () => { y0 = null; dragging = false; dy = 0; };
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || window.innerWidth >= 900) return;
      y0 = e.touches[0].clientY; t0 = Date.now(); dy = 0; dragging = false;
      fromHead = !!e.target.closest('.grab, .sheet-head');
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (y0 === null) return;
      const d = e.touches[0].clientY - y0;
      if (!dragging) {
        if (d > 6 && (el.scrollTop <= 0 || fromHead)) {
          dragging = true;
          el.style.transition = 'none';
          if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
        } else if (Math.abs(d) > 6) { y0 = null; return; } else return;
      }
      dy = Math.max(0, d);
      el.style.transform = `translateY(${dy}px)`;
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const end = () => {
      if (!dragging) { reset(); return; }
      const fast = dy / Math.max(1, Date.now() - t0) > 0.5;
      el.style.transition = '';
      el.style.transform = '';
      if (dy > 110 || (fast && dy > 40)) close();
      reset();
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
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
    applyDisplayPrefs();
  }

  function switchLang() {
    state.lang = state.lang === 'ar' ? 'en' : 'ar';
    store.set('lang', state.lang);
    route();
    refreshPush();
  }

  $langs.forEach((b) => b.addEventListener('click', switchLang));

  const ownerTabs = [['home', 'tabHome', 'home'], ['people', 'tabPeople', 'people'], ['bills', 'tabBills', 'bills'], ['more', 'tabMore', 'more']];
  const subTabs = [['mybills', 'tabBills', 'bills'], ['subnotices', 'tabNotices', 'bell'], ['more', 'tabMore', 'more']];
  const collectorTabs = [['collect', 'tabCollect', 'bills'], ['today', 'tabToday', 'check'], ['more', 'tabMore', 'more']];
  const parents = { readings: 'home', notices: 'more', invite: 'more', collectors: 'more', reports: 'more', round: 'bills', late: 'home', costs: 'more', logs: 'more' };
  const PAY = 'id, bill_id, amount, method, note, paid_at, collector_id, lbp_amount, lbp_rate';

  const $lens = h('span', { class: 'lens', 'aria-hidden': 'true' });
  let navList = [];

  function drawNav(show) {
    const list = show === false || !state.user ? null : state.mode === 'owner' && state.bk ? ownerTabs : state.mode === 'collector' ? collectorTabs : state.mode === 'subscriber' ? subTabs : null;
    document.body.classList.toggle('has-nav', !!list);
    navList = list || [];
    if (!list) { $dock.replaceChildren(); $side.replaceChildren(); return; }
    const active = (state.mode === 'collector' && state.route === 'round' ? 'collect' : parents[state.route]) || state.route;
    const make = () => list.map(([r, k, ic]) => h('button', {
      type: 'button', class: active === r ? 'tab on' : 'tab', onclick: () => go(r), 'aria-current': active === r ? 'page' : null
    }, icon(ic), h('span', null, t(k))));
    $dock.style.setProperty('--n', String(list.length));
    $dock.replaceChildren($lens, ...make());
    $side.replaceChildren(...make());
    const idx = list.findIndex(([r]) => r === active);
    requestAnimationFrame(() => {
      $lens.style.opacity = idx < 0 ? '0' : '1';
      if (idx >= 0) $lens.style.transform = `translateX(${(state.lang === 'ar' ? -idx : idx) * 100}%)`;
    });
  }

  let drag = null;
  let dragEnd = 0;

  function dragStop() {
    $dock.classList.remove('dragging');
    $dock.querySelectorAll('.tab').forEach((el) => el.classList.remove('over'));
    drag = null;
  }

  function dragIndex(d) {
    const near = Math.round(d.pos / d.w);
    return state.lang === 'ar' ? d.n - 1 - near : near;
  }

  $dock.addEventListener('pointerdown', (e) => {
    if (!navList.length || window.innerWidth >= 900 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const r = $dock.getBoundingClientRect();
    drag = { id: e.pointerId, x0: e.clientX, left: r.left + 6, w: (r.width - 12) / navList.length, n: navList.length, moved: false, pos: 0 };
  });

  $dock.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x0) < 8) return;
    if (!drag.moved) {
      drag.moved = true;
      try { $dock.setPointerCapture(e.pointerId); } catch {}
      $dock.classList.add('dragging');
    }
    const max = (drag.n - 1) * drag.w;
    drag.pos = Math.max(0, Math.min(max, e.clientX - drag.left - drag.w / 2));
    $lens.style.transform = `translateX(${state.lang === 'ar' ? drag.pos - max : drag.pos}px)`;
    const idx = dragIndex(drag);
    $dock.querySelectorAll('.tab').forEach((el, i) => el.classList.toggle('over', i === idx));
  });

  function dragDone(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    dragStop();
    if (!d.moved) return;
    dragEnd = Date.now();
    const target = navList[dragIndex(d)];
    if (e.type === 'pointerup' && target && target[0] !== ((state.mode === 'collector' && state.route === 'round' ? 'collect' : parents[state.route]) || state.route)) {
      if (navigator.vibrate) navigator.vibrate(8);
      go(target[0]);
    } else drawNav();
  }

  $dock.addEventListener('pointerup', dragDone);
  $dock.addEventListener('pointercancel', dragDone);
  $dock.addEventListener('click', (e) => { if (Date.now() - dragEnd < 400) { e.stopPropagation(); e.preventDefault(); } }, true);

  function defaultRoute() { return state.mode === 'owner' ? 'home' : state.mode === 'collector' ? 'collect' : 'mybills'; }

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
      if (state.cinvite) { drawNav(false); return await handleCollectorInvite(); }
      if (state.invite) { drawNav(false); return await handleInvite(); }
      if (state.join) { drawNav(false); return await viewJoin(state.join); }
      if (!state.mode) { drawNav(false); return state.user.is_anonymous ? viewEnterCode() : viewCreateBusiness(); }
      applyMode();
      if (state.mode === 'owner' && !state.bk) { drawNav(false); if (!(await ensureKeys())) return; }
      const views = state.mode === 'owner'
        ? { home: viewHome, people: viewPeople, bills: viewBills, more: viewMore, readings: viewReadings, notices: viewNotices, invite: viewInviteAll, collectors: viewCollectors, reports: viewReports, round: viewRound, late: viewLate, costs: viewCosts, logs: viewLogs }
        : state.mode === 'collector'
          ? { collect: viewCollect, today: viewToday, more: viewMore, round: viewRound, logs: viewLogs }
          : { mybills: viewMyBills, subnotices: viewSubNotices, more: viewMore, logs: viewLogs };
      if (!views[state.route]) state.route = defaultRoute();
      drawNav();
      if (!navigator.onLine && state.route !== 'readings') return viewOffline();
      if ($app.dataset.route !== state.route || !$app.querySelector('.head')) render(head(pageTitle(state.route)), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton short' }));
      await views[state.route]();
    } catch (e) {
      if (isNetErr(e) && state.user && state.mode) return viewOffline();
      fail(e);
    }
  }

  function pageTitle(r) {
    const name = state.business ? state.business.name : t('app');
    const titles = {
      home: name, collect: name, people: t('tabPeople'), bills: t('tabBills'), mybills: t('tabBills'), more: t('tabMore'),
      readings: t('stepReadings'), notices: t('tabNotices'), subnotices: t('tabNotices'), invite: t('inviteAll'), collectors: t('collectors'),
      reports: t('reports'), round: t('round'), late: t('lateTitle'), costs: t('costsTitle'), logs: t('appLogs'), today: t('tabToday')
    };
    return titles[r] || t('app');
  }

  function viewOffline() {
    render(head(t('app')),
      h('div', { class: 'card stack center-card' },
        h('h2', null, t('offline')), h('p', { class: 'muted' }, t('offlineBody')),
        state.mode === 'owner' && state.route !== 'readings' ? h('button', { type: 'button', class: 'btn primary block', onclick: () => go('readings') }, t('stepReadings')) : null,
        h('button', { type: 'button', class: 'btn ghost block', onclick: () => route() }, t('retry'))));
  }

  async function loadContext() {
    const uid = state.user.id;
    let biz; let subs; let roles;
    try {
      if (!navigator.onLine) throw new Error('Failed to fetch');
      const ctx = await sb.rpc('app_context');
      if (ctx.error) throw ctx.error;
      biz = { data: ctx.data.business || null };
      subs = { data: ctx.data.subscriptions || [] };
      roles = { data: ctx.data.roles || [] };
      state.isAdmin = ctx.data.admin === true;
      if (biz.data) store.set(`ctx:${uid}`, JSON.stringify(biz.data));
    } catch (e) {
      const cached = isNetErr(e) ? store.get(`ctx:${uid}`) : null;
      if (!cached) throw e;
      biz = { data: JSON.parse(cached) }; subs = { data: [] }; roles = { data: [] };
    }
    state.ownBusiness = biz.data;
    state.subs = subs.data || [];
    for (const s of state.subs) {
      s.sk = store.get(`sk:${s.id}`);
      s.info = (await V.dec(s.sk, s.enc)) || {};
    }
    state.roles = [];
    for (const r of roles.data || []) {
      const bk = ((await V.dec(store.get(`ck:${r.id}`), r.wbk)) || {}).k;
      if (!bk) continue;
      r.bk = bk;
      r.name = ((await V.dec(bk, r.name_enc)) || {}).name || '';
      state.roles.push(r);
    }
    if (store.get('push') && store.get('push') !== uid) refreshPush();
    const ok = { owner: !!state.ownBusiness, collector: state.roles.length > 0, subscriber: state.subs.length > 0 };
    if (!state.mode || !ok[state.mode]) {
      state.mode = ok.owner ? 'owner' : ok.collector ? 'collector' : ok.subscriber ? 'subscriber' : null;
      state.route = defaultRoute();
    }
    applyMode();
  }

  function applyMode() {
    if (state.mode) store.set('lastMode', state.mode);
    if (state.mode === 'collector' && state.roles.length) {
      state.role = state.roles[0];
      state.business = state.role.business;
      state.bk = state.role.bk;
      state.priv = null;
      return;
    }
    if (state.role) { state.bk = null; state.role = null; }
    state.business = state.ownBusiness;
  }

  function isNetErr(e) {
    return !navigator.onLine || /failed to fetch|networkerror|load failed|fetch/i.test((e && e.message) || '');
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
      : state.user && state.ownBusiness
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
        const colLink = raw.match(/#\/c\/([A-Z0-9]{24})\.([A-Za-z0-9_-]{43})/);
        const plain = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (colLink) state.cinvite = { token: colLink[1], ck: colLink[2] };
        else if (link) state.invite = { token: link[1], sk: link[2] };
        else if (joinLink) state.join = joinLink[1];
        else if (plain.length === 8) state.join = plain;
        else return toast(t('invalidCode'), 'bad');
        busy(btn, true);
        try { await ensureSession(); await route(); }
        catch (err) { state.invite = null; state.join = null; state.cinvite = null; fail(err); }
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

  async function handleCollectorInvite() {
    const inv = state.cinvite;
    state.cinvite = null;
    const { data, error } = await sb.rpc('open_collector_invite', { p_token: inv.token });
    if (error) { fail(error); return route(); }
    store.set(`ck:${data}`, inv.ck);
    state.mode = 'collector'; state.route = 'collect';
    await loadContext();
    route();
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
    const rowCache = store.get(`bkr:${biz.id}`);
    if (cached && rowCache) {
      let saved = null;
      try { saved = JSON.parse(rowCache); } catch {}
      if (saved && (await adoptKey(saved, cached))) {
        if (navigator.onLine) verifyKeys(biz, cached);
        return true;
      }
    }
    if (cached && !navigator.onLine) { state.bk = cached; return true; }
    const { data: row, error } = await sb.from('business_keys').select('*').eq('business_id', biz.id).maybeSingle();
    if (error) {
      if (cached && isNetErr(error)) { state.bk = cached; return true; }
      throw error;
    }
    if (row) store.set(`bkr:${biz.id}`, JSON.stringify(row));
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

  async function verifyKeys(biz, bk) {
    try {
      const { data: row, error } = await sb.from('business_keys').select('*').eq('business_id', biz.id).maybeSingle();
      if (error || !row) return;
      store.set(`bkr:${biz.id}`, JSON.stringify(row));
      if (!(await adoptKey(row, bk))) {
        store.del(`bk:${biz.id}`);
        state.bk = null;
        route();
        return;
      }
      if (state.pw && !(await V.unwrap(state.pw, row.salt, row.wrapped_pw))) await rewrapPw(row, bk, state.pw);
    } catch (e) { console.error(e); }
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
    const keyRow = {
      business_id: biz.id, salt, wrapped_pw: await V.wrap(pw, salt, bk), wrapped_rc: await V.wrap(rc, salt, bk), wpriv: await V.enc(bk, { priv: pair.priv })
    };
    const ins = await sb.from('business_keys').insert(keyRow);
    if (ins.error) throw ins.error;
    store.set(`bkr:${biz.id}`, JSON.stringify(keyRow));
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
    state.people = await cached(`people:${state.mode}:${state.business.id}`, fetchPeople);
    return state.people;
  }

  async function fetchPeople() {
    const res = state.mode === 'collector'
      ? await sb.rpc('collector_subscribers', { p_business: state.business.id })
      : await sb.from('subscribers').select('*').eq('business_id', state.business.id).order('created_at');
    if (res.error) throw res.error;
    return decryptPeople(res.data || []);
  }

  async function decryptPeople(data) {
    await Promise.all(data.map(async (p) => {
      if (p.status === 'pending') {
        const o = await V.open(state.priv, p.jk);
        p.sk = o && o.k;
      } else p.sk = ((await V.dec(state.bk, p.wk)) || {}).k;
      const [info, lab] = await Promise.all([V.dec(p.sk, p.enc), V.dec(state.bk, p.oenc)]);
      p.info = info || {};
      p.label = (lab || {}).label || '';
      p.title = p.label || p.info.name || '—';
    }));
    data.sort((a, b) => a.title.localeCompare(b.title));
    return data;
  }

  async function loadOpenBills() {
    state.openBills = await cached(`open:${state.business.id}`, async () => {
      const { data, error } = await sb.from('bills').select(`*, payments(${PAY})`).eq('business_id', state.business.id).neq('status', 'paid');
      if (error) throw error;
      return data;
    });
    state.sent = sentMap();
    return state.openBills;
  }

  function owed(b) { return Math.round((Number(b.amount) - Number(b.paid_amount)) * 100) / 100; }

  function debtBefore(subId, month) {
    return state.openBills.filter((b) => b.subscriber_id === subId && b.month < month).reduce((a, b) => a + owed(b), 0);
  }

  function debtTotal(subId) {
    return state.openBills.filter((b) => b.subscriber_id === subId).reduce((a, b) => a + owed(b), 0);
  }

  async function loadCollectors() {
    if (state.mode !== 'owner') return state.collectors;
    state.collectors = await cached(`collectors:${state.business.id}`, fetchCollectors);
    return state.collectors;
  }

  async function fetchCollectors() {
    const { data, error } = await sb.from('collectors').select('*').eq('business_id', state.business.id).order('created_at');
    if (error) throw error;
    return decryptCollectors(data);
  }

  async function decryptCollectors(data) {
    await Promise.all(data.map(async (c) => {
      const [info, wck] = await Promise.all([V.dec(state.bk, c.name_enc), V.dec(state.bk, c.wck)]);
      c.name = (info || {}).name || '—';
      c.phone = (info || {}).phone || '';
      c.ck = (wck || {}).k;
    }));
    return data;
  }

  function collectorName(id) {
    if (!id) return '';
    if (state.mode === 'collector') return state.role && state.role.id === id ? state.role.name : t('collector');
    const c = state.collectors.find((x) => x.id === id);
    return c ? c.name : t('collector');
  }

  function sentMap() {
    try { return JSON.parse(store.get(`sent:${state.business.id}`) || '{}'); } catch { return {}; }
  }

  function markSent(id) {
    const m = sentMap();
    m[id] = Date.now();
    const keys = Object.keys(m);
    if (keys.length > 3000) keys.sort((a, b) => m[a] - m[b]).slice(0, keys.length - 3000).forEach((k) => delete m[k]);
    store.set(`sent:${state.business.id}`, JSON.stringify(m));
    state.sent = m;
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
    const old = debtBefore(b.subscriber_id, b.month);
    return [
      t('billMsg', {
        biz: biz.name, month: monthLabel(b.month), name: p.info.name || '', detail: billDetail(b), total: money(b.amount),
        lbp: lbp(b.amount, biz.lbp_rate), paid: money(b.paid_amount), rem: money(owed(b))
      }),
      old > 0 ? t('billMsgOld', { old: money(old), all: money(old + owed(b)) }) : '',
      p.sk && p.invite_code ? inviteUrl(p) : ''
    ].filter(Boolean).join('\n');
  }

  async function payBill(b, amount, method, note, lbpAmount) {
    const row = { bill_id: b.id, amount, method };
    if (note) row.note = await V.enc(state.bk, { t: note });
    if (lbpAmount) { row.lbp_amount = lbpAmount; row.lbp_rate = state.business.lbp_rate; }
    const { data, error } = await sb.from('payments').insert(row).select(PAY).single();
    if (error) throw error;
    return data;
  }

  function lbpText(v) { return `${Number(v).toLocaleString('en-US')} ${t('lbpUnit')}`; }

  function payText(pay) {
    return `${money(pay.amount)}${pay.lbp_amount ? ` (${lbpText(pay.lbp_amount)})` : ''}`;
  }

  function billRow(b, after) {
    const rem = owed(b);
    const name = personName(b.subscriber_id);
    const old = debtBefore(b.subscriber_id, b.month);
    const showMonth = state.mode === 'collector' || b.month !== monthDate(state.month);
    const quick = rem > 0 ? h('button', { type: 'button', class: 'btn paid-btn', onclick: async (e) => {
      e.stopPropagation();
      busy(quick, true);
      try { const pay = await payBill(b, rem, 'cash'); paymentToast(t('markedPaid', { name }), [pay], after); after(); }
      catch (err) { fail(err); busy(quick, false); }
    } }, icon('check'), t('markPaid')) : h('span', { class: 'pill paid' }, t('paid'));
    return h('div', { class: 'item', role: 'button', tabindex: '0', onclick: () => billSheet(b, after).catch(fail) },
      avatar(name),
      h('div', { class: 'grow' }, h('strong', null, name),
        h('small', { class: 'muted' }, showMonth ? `${monthLabel(b.month)}${sep()}` : '',
          rem > 0 && Number(b.paid_amount) > 0 ? t('remainingOf', { rem: ltr(money(rem)), total: ltr(money(b.amount)) }) : billDetail(b)),
        old > 0 ? h('small', { class: 'bad' }, t('plusOld', { amt: ltr(money(old)) })) : null,
        rem > 0 && state.sent[b.id] ? h('small', { class: 'ok' }, `✓ ${t('sentMark')}`) : null),
      h('div', { class: 'end-col' }, h('strong', { class: 'amount' }, money(rem > 0 ? rem : b.amount)), quick));
  }

  async function billSheet(b, after) {
    const biz = state.business;
    const p = state.people.find((x) => x.id === b.subscriber_id);
    const rem = owed(b);
    const old = debtBefore(b.subscriber_id, b.month);
    const rate = Number(biz.lbp_rate);
    const fullLbp = Math.round(rem * rate);
    const amount = input('amount', { type: 'number', step: '0.01', min: '0', value: rem > 0 ? rem.toFixed(2) : '', inputmode: 'decimal' });
    const amountLabel = h('span', null, t('amount'));
    const cur = segmented('cur', [['usd', 'USD $'], ['lbp', t('lbpUnit')]], 'usd');
    cur.addEventListener('change', () => {
      const isLbp = cur.querySelector('input:checked').value === 'lbp';
      amount.value = isLbp ? String(fullLbp) : rem.toFixed(2);
      amount.step = isLbp ? '1000' : '0.01';
      amountLabel.textContent = isLbp ? t('amountLbp') : t('amount');
    });
    const note = input('note', { maxlength: 120 });
    const save = h('button', { type: 'submit', class: 'btn primary block' }, t('recordPayment'));
    let close = () => {};
    const pays = [];
    for (const pay of b.payments || []) {
      const n = pay.note ? ((await V.dec(state.bk, pay.note)) || {}).t : '';
      const who = collectorName(pay.collector_id);
      const canUndo = state.mode !== 'collector' || pay.collector_id === state.role.id;
      pays.push(h('div', { class: 'pay' },
        h('span', null, [payText(pay), t(pay.method), dateLabel(pay.paid_at), who, n].filter(Boolean).join(sep())),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'link', onclick: () => receiptSheet(b, pay, p, rem) }, t('receipt')),
          canUndo ? h('button', { type: 'button', class: 'link bad', onclick: () => { close(); removePayment(pay, after); } }, t('undo')) : null)));
    }
    const form = rem > 0 ? h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      let a; let l = null;
      if (d.cur === 'lbp') {
        l = Math.round(num(amount.value));
        const tol = rate * 0.005;
        if (!(l > 0)) return toast(t('required'), 'bad');
        if (l > fullLbp + tol) return toast(t('overpayment'), 'bad');
        a = l >= fullLbp - tol ? rem : Math.round((l / rate) * 100) / 100;
      } else {
        a = Math.round(num(amount.value) * 100) / 100;
        if (a > rem + 0.001) return toast(t('overpayment'), 'bad');
      }
      if (!(a > 0)) return toast(t('required'), 'bad');
      busy(save, true);
      try {
        const pay = await payBill(b, a, d.method || 'cash', clean(note.value, 120), l);
        close(); paymentToast(t('paymentSaved'), [pay], after); after();
        receiptSheet(b, pay, p, rem - a);
      } catch (err) { fail(err); } finally { busy(save, false); }
    } },
      cur,
      h('label', { class: 'field' }, amountLabel, amount),
      segmented('method', [['cash', t('cash')], ['whish', 'Whish'], ['omt', 'OMT'], ['other', t('other')]], 'cash'),
      field(t('note'), note), save) : null;
    const line = (label, value, cls) => h('div', { class: 'row between' }, h('span', null, label), h('strong', { class: cls || '' }, value));
    const photoSlot = h('div', { class: 'photo-slot' });
    close = sheet(p ? p.title : t('bill'), h('div', { class: 'stack' },
      h('div', { class: 'summary' },
        h('small', { class: 'muted' }, monthLabel(b.month)), h('div', null, billDetail(b)),
        h('div', { class: 'row between' }, h('span', null, t('total')), h('strong', null, ltr(money(b.amount)), `${sep()}${lbp(b.amount, rate)} ${t('lbpUnit')}`)),
        line(t('remaining'), money(rem), `amount ${rem > 0 ? 'bad' : 'ok'}`),
        old > 0 ? line(t('oldUnpaid'), money(old), 'amount bad') : null,
        old > 0 ? line(t('totalOwed'), money(old + rem), 'amount') : null),
      pays.length ? h('div', { class: 'stack tight' }, h('small', { class: 'muted' }, t('payments')), pays) : null,
      form,
      photoSlot,
      p && p.info.phone ? h('button', { type: 'button', class: 'btn wa block', onclick: () => { openExternal(waLink(p.info.phone, billMessage(b, p))); markSent(b.id); } }, icon('chat'), t('sendBill')) : null));
    if (b.billing_type === 'metered' && p && p.sk && state.mode === 'owner') {
      sb.from('readings').select('photo').eq('subscriber_id', b.subscriber_id).eq('month', b.month).maybeSingle().then(({ data }) => {
        if (data && data.photo) photoSlot.replaceChildren(h('button', { type: 'button', class: 'btn ghost block', onclick: () => showPhoto(p.sk, biz.id, p.id, b.month, p.title) }, icon('camera'), t('meterPhoto')));
      });
    }
  }

  function receiptNo(pay) { return String(pay.id).replace(/-/g, '').slice(0, 8).toUpperCase(); }

  function receiptSheet(b, pay, p, remAfter) {
    const biz = state.business;
    const name = p ? p.info.name || p.title : '';
    const who = collectorName(pay.collector_id);
    const when = new Date(pay.paid_at).toLocaleString(state.lang === 'ar' ? 'ar-LB' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    const lines = [
      [t('date'), when], [t('customer'), name], [t('forMonth'), monthLabel(b.month)],
      [t('amountPaid'), payText(pay)], [t('method'), t(pay.method)],
      who ? [t('collectedBy'), who] : null,
      [t('remaining'), money(Math.max(remAfter, 0))]
    ].filter(Boolean);
    const title = `${t('receipt')} #${receiptNo(pay)}`;
    const text = [biz.name, title, ...lines.map(([k, v]) => `${k}: ${v}`)].join('\n');
    sheet(t('receipt'), h('div', { class: 'stack' },
      h('div', { class: 'receipt' },
        h('strong', { class: 'receipt-biz' }, biz.name), h('small', { class: 'muted' }, title),
        lines.map(([k, v]) => h('div', { class: 'row between' }, h('span', { class: 'muted' }, k), h('strong', null, v)))),
      h('div', { class: 'actions three' },
        p && p.info.phone ? h('button', { type: 'button', class: 'act wa', onclick: () => openExternal(waLink(p.info.phone, text)) }, icon('chat'), h('span', null, 'WhatsApp')) : null,
        h('button', { type: 'button', class: 'act', onclick: (e) => { const btn = e.currentTarget; busy(btn, true); receiptPdf(biz.name, title, lines, receiptNo(pay)).catch(fail).finally(() => busy(btn, false)); } }, icon('bills'), h('span', null, 'PDF')),
        h('button', { type: 'button', class: 'act', onclick: () => shareText(text) }, icon('send'), h('span', null, t('share'))))));
  }

  function sendQueue(bills) {
    const person = (b) => state.people.find((x) => x.id === b.subscriber_id);
    let queue = bills.filter((b) => { const p = person(b); return p && p.info.phone && owed(b) > 0; });
    const fresh = queue.filter((b) => !state.sent[b.id]);
    if (fresh.length) queue = fresh;
    let i = 0;
    const body = h('div', { class: 'stack' });
    const close = sheet(t('sendBills'), body);
    const draw = () => {
      if (i >= queue.length) {
        body.replaceChildren(h('div', { class: 'empty' }, h('p', null, t('allSent', { n: queue.length })),
          h('button', { type: 'button', class: 'btn primary', onclick: () => { close(); route(); } }, t('close'))));
        return;
      }
      const b = queue[i];
      const p = person(b);
      const bar = h('div', { class: 'bar dark' }, h('i'));
      bar.firstChild.style.width = `${Math.round((i / queue.length) * 100)}%`;
      body.replaceChildren(
        h('small', { class: 'muted' }, t('sendProgress', { i: i + 1, n: queue.length })), bar,
        h('div', { class: 'summary' }, h('strong', null, p.title),
          h('span', null, `${monthLabel(b.month)}${sep()}`, ltr(money(owed(b) + debtBefore(b.subscriber_id, b.month)))),
          h('span', { class: 'muted' }, ltr(p.info.phone))),
        h('button', { type: 'button', class: 'btn wa block', onclick: () => {
          openExternal(waLink(p.info.phone, billMessage(b, p)));
          markSent(b.id); i++; draw();
        } }, icon('chat'), t('openWhatsApp')),
        h('button', { type: 'button', class: 'btn ghost block', onclick: () => { i++; draw(); } }, t('skip')));
    };
    draw();
  }

  function homeKeys(biz, m) { return [`people:owner:${biz.id}`, `home:${m}:${biz.id}`, `open:${biz.id}`, `collectors:${biz.id}`]; }

  const homeRaw = {};
  function homeData(biz, m, ttl) {
    return cached(`home:${m}:${biz.id}`, async () => {
      const { data, error } = await sb.rpc('owner_home', { p_business: biz.id, p_month: m });
      if (error) throw error;
      homeRaw[`${biz.id}:${m}`] = JSON.stringify(data);
      const [people, collectors] = await Promise.all([decryptPeople(data.people || []), decryptCollectors(data.collectors || [])]);
      people.sort((a, b) => a.title.localeCompare(b.title));
      const at = Date.now();
      seed(`people:owner:${biz.id}`, people, at);
      seed(`open:${biz.id}`, data.open || [], at);
      seed(`collectors:${biz.id}`, collectors, at);
      return { tariff: data.tariff, readings: data.readings || [], bills: data.bills || [], payClaims: data.pay_claims || [], readClaims: data.read_claims || [] };
    }, ttl || 120000);
  }

  async function fetchHome(biz, m) {
    await syncDrafts();
    const hd = await homeData(biz, m);
    const [people] = await Promise.all([loadPeople(), loadOpenBills(), loadCollectors()]);
    homeFresh[`${biz.id}:${m}`] = Date.now();
    saveSnapshot(biz, m);
    return [people, hd];
  }

  async function refreshHome(biz, m) {
    const before = homeRaw[`${biz.id}:${m}`];
    for (const k of [...memo.keys()]) if (k.endsWith(`:${biz.id}`)) memo.delete(k);
    try { await fetchHome(biz, m); } catch (e) { if (!isNetErr(e)) logError(e, 'refreshHome'); return; }
    if (before && before === homeRaw[`${biz.id}:${m}`]) return;
    const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (state.route === 'home' && state.business && state.business.id === biz.id && monthDate(state.month) === m && !document.querySelector('.sheet-wrap') && !typing) viewHome(true).catch(fail);
  }

  async function saveSnapshot(biz, m) {
    try {
      if (!state.bk || state.mode !== 'owner') return;
      const [pk, hk, ok, ck] = homeKeys(biz, m).map(peek);
      if (!pk || !hk || !ok || !ck) return;
      store.set(`snap:${biz.id}`, await V.enc(state.bk, { m, at: Date.now(), people: pk.res, home: hk.res, open: ok.res, collectors: ck.res }));
    } catch {}
  }

  async function loadSnapshot(biz) {
    try {
      const snap = await V.dec(state.bk, store.get(`snap:${biz.id}`));
      if (!snap || snap.m !== monthDate(state.month) || Date.now() - snap.at > 7 * 86400000) return false;
      const keys = homeKeys(biz, snap.m);
      [snap.people, snap.home, snap.open, snap.collectors].forEach((v, i) => seed(keys[i], v, snap.at));
      return true;
    } catch { return false; }
  }

  async function viewHome(fresh) {
    const biz = state.business;
    const m = monthDate(state.month);
    const hits = homeKeys(biz, m).map(peek);
    let people; let hd;
    if (fresh !== true && hits.every(Boolean)) {
      people = state.people = hits[0].res;
      hd = hits[1].res;
      state.openBills = hits[2].res;
      state.collectors = hits[3].res;
      state.sent = sentMap();
      if (Date.now() - (homeFresh[`${biz.id}:${m}`] || 0) > 8000) { homeFresh[`${biz.id}:${m}`] = Date.now(); setTimeout(() => refreshHome(biz, m), 0); }
    } else if (fresh === true) {
      hd = await homeData(biz, m);
      [people] = await Promise.all([loadPeople(), loadOpenBills(), loadCollectors()]);
    } else {
      [people, hd] = await fetchHome(biz, m);
    }
    for (const c of hd.payClaims) {
      const p = people.find((x) => x.id === c.subscriber_id);
      c.refText = c.ref && p && p.sk ? ((await V.dec(p.sk, c.ref)) || {}).t || '' : '';
    }
    state.payClaims = hd.payClaims;
    state.readClaims = hd.readClaims;
    const tariff = { data: hd.tariff }; const readings = { data: hd.readings }; const bills = { data: hd.bills };
    const oldBills = state.openBills.filter((b) => b.month < m).sort((a, b) => owed(b) - owed(a));
    const oldTotal = oldBills.reduce((a, b) => a + owed(b), 0);
    const oldSubs = new Set(oldBills.map((b) => b.subscriber_id)).size;
    const waiting = draftCount();
    const billable = people.filter((p) => p.active && p.status !== 'pending');
    const metered = billable.filter((p) => p.billing_type === 'metered');
    const pending = people.filter((p) => p.status === 'pending');
    const readIds = new Set(readings.data.map((r) => r.subscriber_id));
    const readCount = metered.filter((p) => readIds.has(p.id)).length;
    const billed = bills.data.reduce((a, b) => a + Number(b.amount), 0);
    const paid = bills.data.reduce((a, b) => a + Number(b.paid_amount), 0);
    const unpaid = bills.data.filter((b) => Number(b.paid_amount) < Number(b.amount)).sort((a, b) => (b.amount - b.paid_amount) - (a.amount - a.paid_amount));
    const bar = meter(billed > 0 ? paid / billed : 0);
    const late = lateRows();
    const missingPeople = metered.filter((p) => !readIds.has(p.id));
    const bldCount = {};
    for (const p of missingPeople) { const k = p.info.building || ''; bldCount[k] = (bldCount[k] || 0) + 1; }
    const missingBuilding = Object.keys(bldCount).sort((a, b) => bldCount[b] - bldCount[a])[0] || '';
    const unsent = unpaid.filter((b) => !state.sent[b.id] && people.some((p) => p.id === b.subscriber_id && p.info.phone));
    const rate = Number(biz.lbp_rate);
    const official = tariff.data && tariff.data.official_kwh_lbp ? Number(tariff.data.official_kwh_lbp) : 0;
    const aboveOfficial = official > 0 && rate > 0 && Number(tariff.data.kwh_price) * rate > official * 1.005;

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
        toast(notes.join(sep()), data.missing_reading || data.invalid_reading ? 'warn' : 'good');
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
        h('button', { type: 'button', class: 'btn ghost block', onclick: importSheet }, t('importTitle')),
        h('button', { type: 'button', class: 'btn ghost block', onclick: () => go('invite') }, icon('send'), t('inviteAll'))) : null,
      people.length ? pushCard(t('pushAskOwner')) : null,
      people.length ? todayCard({
        pending: pending.length, pendingList: pending, payClaims: state.payClaims.length, readClaims: state.readClaims.length,
        tariff: !!tariff.data, setPrices: () => tariffSheet(null, viewHome), missing: missingPeople.length, missingBuilding,
        bills: bills.data.length > 0, makeBills: () => genBtn.click(), unsent: unsent.length, send: () => sendQueue(unsent),
        unpaid: unpaid.length, late: late.filter((x) => !x.p.cut_at).length
      }) : null,
      h('div', { class: 'cols' },
        h('div', { class: 'stack' },
          h('section', { class: 'hero-card' },
            h('small', null, t('collectedOf')),
            h('div', { class: 'hero-num' }, money(paid), h('span', null, ` / ${money(billed)}`)),
            bar,
            h('div', { class: 'row between' }, h('span', null, t('unpaidCount', { n: unpaid.length })), h('strong', { class: 'amount' }, money(billed - paid))),
            oldTotal > 0 ? h('button', { type: 'button', class: 'old-row', onclick: () => { state.billFilter = 'old'; go('bills'); } },
              h('span', null, `${t('oldUnpaid')}${sep()}${t('oldUnpaidSubs', { n: oldSubs })}`), h('strong', { class: 'amount' }, money(oldTotal))) : null),
          h('section', { class: 'card flush' },
            h('h3', { class: 'card-title' }, t('thisMonth')),
            step(1, !!tariff.data, t('stepPrice'), tariff.data ? t('priceSet', { kwh: ltr(money(tariff.data.kwh_price)), amp: ltr(money(tariff.data.flat_amp_price)) }) + (aboveOfficial ? `${sep()}${t('aboveOfficial')}` : '') : t('priceNotSet'), null, () => tariffSheet(tariff.data, viewHome)),
            step(2, metered.length > 0 && readCount === metered.length, t('stepReadings'), (metered.length ? t('readingsCount', { n: readCount, total: metered.length }) : t('noMeteredShort')) + (waiting ? `${sep()}${t('draftsWaiting', { n: waiting })}` : ''), null, () => go('readings')),
            step(3, bills.data.length > 0, t('stepBills'), bills.data.length ? t('billsMade', { n: bills.data.length }) : t('billsNotMade'), genBtn))),
        h('div', { class: 'stack' },
          state.payClaims.length ? h('section', { class: 'card flush', id: 'claims-card' },
            h('h3', { class: 'card-title' }, t('claimsTitle'), h('span', { class: 'badge' }, state.payClaims.length)),
            state.payClaims.map((c) => payClaimRow(c, viewHome))) : null,
          state.readClaims.length ? h('section', { class: 'card flush', id: 'rclaims-card' },
            h('h3', { class: 'card-title' }, t('readClaimsTitle'), h('span', { class: 'badge' }, state.readClaims.length)),
            state.readClaims.map((c) => readClaimRow(c, viewHome))) : null,
          pending.length ? h('section', { class: 'card flush' },
            h('h3', { class: 'card-title' }, t('requests'), h('span', { class: 'badge' }, pending.length)),
            pending.map((p) => h('div', { class: 'item', role: 'button', tabindex: '0', onclick: () => requestSheet(p, viewHome) },
              avatar(p.info.name), h('div', { class: 'grow' }, h('strong', null, p.info.name || '—'),
                h('small', { class: 'muted' }, [ltr(p.info.phone), p.info.building].filter(Boolean).join(sep()))),
              h('span', { class: 'pill partial' }, t('review'))))) : null,
          late.length ? h('button', { type: 'button', class: 'late-row card', onclick: () => go('late') },
            h('span', { class: 'row-ic bad' }, icon('bell')),
            h('div', { class: 'grow' }, h('strong', null, t('lateTitle')), h('small', { class: 'muted' }, t('lateShort', { n: late.length }))),
            h('span', { class: 'chev flip' }, '›')) : null,
          h('section', { class: 'card flush' },
            h('h3', { class: 'card-title' }, t('toCollect'), unpaid.length ? h('button', { type: 'button', class: 'link', onclick: () => go('round') }, t('round')) : null, unpaid.length > 6 ? h('button', { type: 'button', class: 'link', onclick: () => go('bills') }, t('seeAll')) : null),
            unpaid.length ? unpaid.slice(0, 6).map((b) => billRow(b, viewHome))
              : h('p', { class: 'muted pad' }, bills.data.length ? t('allPaid') : t('noBillsYet'))),
          oldBills.length ? h('section', { class: 'card flush' },
            h('h3', { class: 'card-title' }, t('oldUnpaid'), h('button', { type: 'button', class: 'link', onclick: () => { state.billFilter = 'old'; go('bills'); } }, t('seeAll'))),
            oldBills.slice(0, 5).map((b) => billRow(b, viewHome))) : null)));
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
      const offRes = await sb.from('official_prices').select('band, kwh_lbp, source').eq('month', m);
      const offMap = new Map((offRes.data || []).map((o) => [o.band, o]));
      const rate = Number(biz.lbp_rate) || 0;
      const band = segmented('band', [['low', t('bandLow')], ['high', t('bandHigh')]], biz.band || 'low');
      const officialVal = current && current.official_kwh_lbp ? current.official_kwh_lbp : offMap.has(biz.band || 'low') ? offMap.get(biz.band || 'low').kwh_lbp : '';
      const official = input('official_kwh_lbp', { type: 'number', step: '1', min: '0', inputmode: 'numeric', value: officialVal });
      const kwhInput = input('kwh_price', { type: 'number', step: '0.0001', min: '0', inputmode: 'decimal', value: seed ? seed.kwh_price : '' });
      const offNote = h('small', { class: 'muted' });
      const check = () => {
        const o = num(official.value); const k = num(kwhInput.value);
        if (!(o > 0) || !(rate > 0)) { offNote.textContent = rate > 0 ? t('officialHint') : t('officialNoRate'); offNote.className = 'muted'; return; }
        const usd = o / rate;
        const above = k > usd * 1.005;
        offNote.textContent = `${t('officialUsd', { usd: `$${usd.toFixed(3)}`, rate: rate.toLocaleString('en-US') })}${above ? `${sep()}${t('aboveOfficialBy', { pct: Math.round((k / usd - 1) * 100) })}` : ''}`;
        offNote.className = above ? 'bad' : 'ok';
      };
      band.addEventListener('change', () => {
        const v = band.querySelector('input:checked').value;
        if (offMap.has(v)) { official.value = offMap.get(v).kwh_lbp; check(); }
      });
      official.addEventListener('input', check);
      kwhInput.addEventListener('input', check);
      check();
      const close = sheet(`${t('stepPrice')}${sep()}${monthLabel(m)}`, h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        const d = formData(e.target);
        const row = { kwh_price: num(d.kwh_price || 0), fixed_fee_per_amp: num(d.fixed_fee_per_amp || 0), flat_amp_price: num(d.flat_amp_price || 0) };
        if (Object.values(row).some((v) => !(v >= 0))) return toast(t('required'), 'bad');
        row.official_kwh_lbp = num(d.official_kwh_lbp) > 0 ? Math.round(num(d.official_kwh_lbp)) : null;
        busy(save, true);
        try {
          if (d.band && d.band !== (biz.band || 'low')) {
            const b2 = await sb.from('businesses').update({ band: d.band }).eq('id', biz.id);
            if (b2.error) throw b2.error;
            biz.band = d.band;
          }
          const res = current
            ? await sb.from('tariffs').update(row).eq('id', current.id)
            : await sb.from('tariffs').insert(Object.assign({ business_id: biz.id, month: m }, row));
          if (res.error) throw res.error;
          close(); toast(t('saved'), 'good'); after();
        } catch (err) { fail(err); } finally { busy(save, false); }
      } },
        h('h4', null, t('officialTitle')),
        field(t('area'), band),
        field(t('officialKwh'), official),
        offNote,
        h('h4', null, t('meteredSubs')),
        h('div', { class: 'grid2' },
          field(t('kwhPrice'), kwhInput),
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
        h('span', null, [ltr(p.info.phone), p.info.building, p.info.floor && `${t('floor')} ${p.info.floor}`].filter(Boolean).join(sep()))),
      subscriptionFields({ billing_type: 'metered', amps: 5, initial_reading: 0, label: '' }, {}),
      h('div', { class: 'grid2' }, no, ok)));
  }

  async function viewPeople(filter) {
    const [people] = await Promise.all([loadPeople(), loadOpenBills()]);
    const q = (filter || '').toLowerCase();
    const chip = state.peopleChip || 'all';
    const bld = state.peopleBuilding || '';
    const tests = {
      all: () => true, owes: (p) => debtTotal(p.id) > 0, metered: (p) => p.billing_type === 'metered', flat: (p) => p.billing_type === 'flat',
      cut: (p) => !!p.cut_at, unlinked: (p) => p.status !== 'active'
    };
    const base = people.filter((p) => p.status !== 'pending');
    const buildings = [...new Set(base.map((p) => p.info.building).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const list = base.filter((p) => tests[chip](p) && (!bld || p.info.building === bld) && (!q || [p.title, p.info.name, p.info.phone, digits(p.info.phone), p.info.building, p.info.meter].some((v) => (v || '').toLowerCase().includes(q))));
    const setChip = (c) => { state.peopleChip = c; viewPeople(filter).catch(fail); };
    const setBld = (b) => { state.peopleBuilding = b === bld ? '' : b; viewPeople(filter).catch(fail); };
    const chipKeys = ['all', 'owes', 'metered', 'flat', 'unlinked'].concat(base.some((p) => p.cut_at) ? ['cut'] : []);
    const search = input('q', { type: 'search', placeholder: t('search'), value: filter || '', class: 'search' });
    let tmr;
    search.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => viewPeople(search.value).then(() => {
      const s = $app.querySelector('input[name=q]'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    }).catch(fail), 250); });
    const again = () => viewPeople();
    render(
      head(`${t('tabPeople')} (${people.filter((p) => p.status !== 'pending').length})`, h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn ghost small', onclick: importSheet }, t('import')),
        h('button', { type: 'button', class: 'btn primary small desk-only', onclick: () => personForm(null, again) }, icon('plus'), t('add')))),
      people.length ? search : null,
      base.length ? h('div', { class: 'chips' }, chipKeys.map((c) => h('button', { type: 'button', class: c === chip ? 'chip on' : 'chip', onclick: () => setChip(c) }, `${t(`pf_${c}`)} ${base.filter(tests[c]).length}`))) : null,
      buildings.length > 1 && buildings.length <= 30 ? h('div', { class: 'chips' }, buildings.map((b) => h('button', { type: 'button', class: b === bld ? 'chip on' : 'chip', onclick: () => setBld(b) }, b))) : null,
      list.length ? h('div', { class: 'card flush grid-list' }, list.map((p) => h('div', { class: `item ${p.active ? '' : 'dim'}`, role: 'button', tabindex: '0', onclick: () => personSheet(p) },
        avatar(p.title),
        h('div', { class: 'grow' }, h('strong', null, p.title),
          h('small', { class: 'muted' }, [p.label && p.info.name !== p.label ? p.info.name : null, p.info.building, ltr(p.info.phone)].filter(Boolean).join(sep()))),
        h('div', { class: 'end-col' },
          h('span', { class: 'row' }, h('small', { class: 'muted' }, typeLabel(p.billing_type)), h('span', { class: 'pill amps' }, `${p.amps}A`)),
          p.cut_at ? h('span', { class: 'state bad' }, t('cutState')) : debtTotal(p.id) > 0
            ? h('span', { class: 'state bad' }, t('owes', { amt: ltr(money(debtTotal(p.id))) }))
            : h('span', { class: `state ${p.status === 'active' ? 'ok' : ''}` }, p.status === 'active' ? t('linked') : t('notLinked'))))))
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
        p.info.building ? line(t('building'), [p.info.building, p.info.floor].filter(Boolean).join(sep())) : null,
        line(t('subscription'), `${p.amps}A${sep()}${typeLabel(p.billing_type)}`),
        line(t('appStatus'), p.status === 'active' ? t('linked') : t('notLinked'), p.status === 'active' ? 'ok' : ''),
        debtTotal(p.id) > 0 ? line(t('totalOwed'), money(debtTotal(p.id)), 'amount bad') : null),
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
          try {
            const dir = `${state.business.id}/${p.id}`;
            const ls = await sb.storage.from('meters').list(dir, { limit: 1000 });
            if (ls.data && ls.data.length) await sb.storage.from('meters').remove(ls.data.map((f) => `${dir}/${f.name}`));
          } catch (e) { console.warn(e); }
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

  function draftKey(month) { return `rd:${state.business.id}:${month}`; }

  function getDrafts(month) {
    try { return JSON.parse(store.get(draftKey(month)) || '{}'); } catch { return {}; }
  }

  function setDrafts(month, d) {
    if (Object.keys(d).length) store.set(draftKey(month), JSON.stringify(d)); else store.del(draftKey(month));
  }

  function draftMonths() {
    const pre = `rd:${state.business.id}:`;
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(pre)) out.push(k.slice(pre.length));
      }
    } catch {}
    return out;
  }

  function draftCount() { return draftMonths().reduce((a, m) => a + Object.keys(getDrafts(m)).length, 0); }

  async function pushReadings(month, values) {
    const ids = Object.keys(values);
    if (!ids.length) return 0;
    const ex = await sb.from('readings').select('id, subscriber_id, value').eq('month', month).in('subscriber_id', ids);
    if (ex.error) throw ex.error;
    const have = new Map(ex.data.map((r) => [r.subscriber_id, r]));
    const photos = state.business ? pendingPhotos(month) : [];
    const inserts = [];
    let n = 0;
    for (const id of ids) {
      const c = have.get(id);
      if (c && Number(c.value) === values[id] && !photos.includes(id)) continue;
      const extra = photos.includes(id) ? { photo: true } : {};
      if (c) {
        const { error } = await sb.from('readings').update(Object.assign({ value: values[id] }, extra)).eq('id', c.id);
        if (error) throw error;
      } else inserts.push(Object.assign({ subscriber_id: id, month, value: values[id] }, extra));
      n++;
    }
    if (inserts.length) {
      const { error } = await sb.from('readings').insert(inserts);
      if (error) throw error;
    }
    if (photos.length) {
      const left = photos.filter((id) => !(id in values));
      if (left.length) store.set(photoKey(month), JSON.stringify(left)); else store.del(photoKey(month));
    }
    return n;
  }

  let syncing = false;
  async function syncDrafts() {
    if (syncing || state.mode !== 'owner' || !state.business || !navigator.onLine) return 0;
    syncing = true;
    let n = 0;
    try {
      for (const month of draftMonths()) {
        const vals = {};
        for (const [id, v] of Object.entries(getDrafts(month))) { const x = num(v); if (x >= 0) vals[id] = x; }
        try {
          n += await pushReadings(month, vals);
          store.del(draftKey(month));
        } catch (e) {
          if (isNetErr(e)) break;
          console.error(e);
          store.del(draftKey(month));
          toast(t('draftsFailed'), 'bad');
        }
      }
      if (n) toast(t('draftsSent', { n }), 'good');
    } finally { syncing = false; }
    return n;
  }

  async function viewReadings() {
    const m = monthDate(state.month);
    const cacheKey = `rdc:${state.business.id}:${m}`;
    let rows; let offline = false;
    try {
      if (!navigator.onLine) throw new Error('Failed to fetch');
      const people = (await loadPeople()).filter((p) => p.active && p.status !== 'pending' && p.billing_type === 'metered');
      people.sort(byPlace);
      const ids = people.map((p) => p.id);
      const rd = ids.length ? await sb.from('readings').select('id, subscriber_id, month, value, photo').in('subscriber_id', ids).lte('month', m).order('month', { ascending: false }) : { data: [] };
      if (rd.error) throw rd.error;
      const cur = new Map(); const hist = new Map();
      for (const r of rd.data) {
        if (r.month === m) cur.set(r.subscriber_id, r);
        else {
          if (!hist.has(r.subscriber_id)) hist.set(r.subscriber_id, []);
          hist.get(r.subscriber_id).push(Number(r.value));
        }
      }
      rows = people.map((s) => {
        const hs = hist.get(s.id) || [];
        const prevVal = hs.length ? hs[0] : Number(s.initial_reading);
        const before = hs.length > 1 ? hs[1] : hs.length ? Number(s.initial_reading) : null;
        return {
        id: s.id, title: s.title, building: s.info.building || '', sub: [s.info.floor && `${t('floor')} ${s.info.floor}`, s.info.meter && `#${s.info.meter}`].filter(Boolean).join(sep()),
        prev: prevVal,
        use: before !== null && prevVal > before ? Math.round((prevVal - before) * 10) / 10 : null,
        cur: cur.has(s.id) ? Number(cur.get(s.id).value) : null,
        rid: cur.has(s.id) ? cur.get(s.id).id : null,
        photo: cur.has(s.id) ? !!cur.get(s.id).photo : false
        };
      });
      store.set(cacheKey, await V.enc(state.bk, rows));
    } catch (e) {
      const cached = isNetErr(e) ? await V.dec(state.bk, store.get(cacheKey)) : null;
      if (!cached) throw e;
      rows = cached; offline = true;
    }
    const drafts = getDrafts(m);
    const inputs = [];
    let claims = new Map();
    if (!offline) {
      const rc = await sb.from('reading_claims').select('subscriber_id, value, status').eq('business_id', state.business.id).eq('month', m).eq('status', 'pending');
      if (!rc.error) claims = new Map(rc.data.map((c) => [c.subscriber_id, Number(c.value)]));
    }
    const unusual = (r, v) => r.use !== null && r.use > 0 && v - r.prev > Math.max(r.use * 3, r.use + 200);
    const items = rows.map((r) => {
      const start = drafts[r.id] !== undefined ? drafts[r.id] : r.cur !== null ? r.cur : '';
      const inp = input(`r_${r.id}`, { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', enterkeyhint: 'next', value: start, placeholder: String(r.prev), class: 'reading-input' });
      const diff = h('small', { class: 'muted' });
      const upd = () => {
        const v = num(inp.value);
        const odd = inp.value !== '' && v >= r.prev && unusual(r, v);
        diff.textContent = inp.value === '' ? `${t('prev')}: ${r.prev}` : v < r.prev ? t('lowerThanPrev') : odd ? t('muchHigher', { n: (v - r.prev).toFixed(0), usual: r.use }) : `+${(v - r.prev).toFixed(1)} ${t('kwh')}`;
        diff.className = inp.value !== '' && (v < r.prev || odd) ? 'bad' : 'muted';
        row.classList.toggle('odd', inp.value !== '' && (v < r.prev || odd));
      };
      inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const i = inputs.findIndex((x) => x.inp === inp);
        const nextInp = inputs[i + 1];
        if (nextInp) { nextInp.inp.focus(); nextInp.inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); } else inp.blur();
      });
      inp.addEventListener('input', () => {
        upd();
        if (inp.value === '' || (r.cur !== null && num(inp.value) === r.cur)) delete drafts[r.id]; else drafts[r.id] = inp.value;
        setDrafts(m, drafts);
      });
      const row = h('div', { class: 'item static' });
      upd();
      inputs.push({ r, inp });
      const hasPhoto = r.photo || pendingPhotos(m).includes(r.id);
      const cam = offline ? null : h('button', { type: 'button', class: `cam ${hasPhoto ? 'has' : ''}`, 'aria-label': hasPhoto ? t('photoRetake') : t('photoTake'), title: t('meterPhoto') }, icon('camera'));
      if (cam) cam.addEventListener('click', () => uploadMeterPhoto(r, m, cam));
      const claimed = claims.get(r.id);
      const useClaim = claimed !== undefined && inp.value === '' ? h('button', { type: 'button', class: 'link small', onclick: () => {
        inp.value = String(claimed); inp.dispatchEvent(new Event('input')); useClaim.remove();
      } }, t('useSent', { v: claimed })) : null;
      row.append(avatar(r.title),
        h('div', { class: 'grow' }, h('strong', null, r.title), r.sub ? h('small', { class: 'muted' }, r.sub) : null, useClaim),
        cam,
        h('div', { class: 'reading' }, inp, diff));
      return row;
    });
    const grouped = [];
    let lastB = null;
    let box = null;
    rows.forEach((r, i) => {
      if (r.building !== lastB || !box) {
        const inB = rows.filter((x) => x.building === r.building);
        const done = inB.filter((x) => x.cur !== null || drafts[x.id] !== undefined).length;
        grouped.push(h('h3', { class: 'group-title' }, r.building || t('noBuilding'), h('span', { class: `badge ${done === inB.length ? 'ok' : ''}` }, `${done}/${inB.length}`)));
        box = h('div', { class: 'card flush grid-list' });
        grouped.push(box);
        lastB = r.building;
      }
      box.append(items[i]);
    });
    const save = h('button', { type: 'button', class: 'btn primary block sticky', onclick: async () => {
      const vals = {};
      for (const { r, inp } of inputs) {
        if (inp.value === '') continue;
        const v = num(inp.value);
        if (!(v >= 0) || (r.cur !== null && r.cur === v)) continue;
        vals[r.id] = v;
      }
      const odd = inputs.filter(({ r, inp }) => inp.value !== '' && (num(inp.value) < r.prev || unusual(r, num(inp.value)))).length;
      if (odd && !(await confirmBox(t('unusualConfirm', { n: odd }), t('saveAnyway')))) return;
      if (!navigator.onLine) return toast(t('savedOffline', { n: Object.keys(vals).length }), 'warn');
      busy(save, true);
      try {
        const n = await pushReadings(m, vals);
        setDrafts(m, {});
        toast(t('readingsSaved', { n }), 'good');
        go('home');
      } catch (err) {
        if (isNetErr(err)) toast(t('savedOffline', { n: Object.keys(vals).length }), 'warn'); else fail(err);
      } finally { busy(save, false); }
    } }, t('saveReadings'));
    render(head(t('stepReadings'), monthSwitch(viewReadings), 'home'),
      offline ? h('p', { class: 'notice-bar' }, t('offlineList')) : null,
      items.length ? h('div', { class: 'readings-list' }, grouped) : empty(t('noMetered')),
      items.length ? save : null);
  }

  async function viewBills(status, query) {
    status = status || state.billFilter || 'all';
    state.billFilter = null;
    const q = (query || '').toLowerCase();
    const biz = state.business;
    const m = monthDate(state.month);
    const hd = await homeData(biz, m, 20000);
    await Promise.all([loadPeople(), loadOpenBills(), loadCollectors()]);
    const data = hd.bills;
    const oldBills = state.openBills.filter((b) => b.month < m);
    const again = () => viewBills(status, query).catch(fail);
    const order = { unpaid: 0, partial: 1, paid: 2 };
    const matches = (b) => {
      if (!q) return true;
      const p = state.people.find((x) => x.id === b.subscriber_id);
      return !!p && [p.title, p.info.name, p.info.phone, digits(p.info.phone), p.info.building, p.info.meter].some((v) => (v || '').toLowerCase().includes(q));
    };
    const byName = (a, b) => personName(a.subscriber_id).localeCompare(personName(b.subscriber_id));
    const list = (status === 'old'
      ? oldBills.slice().sort((a, b) => byName(a, b) || a.month.localeCompare(b.month))
      : data.filter((b) => status === 'all' || b.status === status).sort((a, b) => order[a.status] - order[b.status] || byName(a, b))).filter(matches);
    const search = input('q', { type: 'search', placeholder: t('searchBills'), value: query || '', class: 'search' });
    let tmr;
    search.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => viewBills(status, search.value).then(() => {
      const el = $app.querySelector('input[name=q]'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }).catch(fail), 250); });
    const count = (s) => (s === 'old' ? oldBills.length : data.filter((b) => s === 'all' || b.status === s).length);
    const toSend = list.filter((b) => owed(b) > 0);
    render(head(t('tabBills'), monthSwitch(again)),
      data.length || oldBills.length ? search : null,
      h('div', { class: 'chips' }, ['all', 'unpaid', 'partial', 'paid', 'old'].map((f) => h('button', {
        type: 'button', class: `${f === status ? 'chip on' : 'chip'}${f === 'old' && oldBills.length ? ' alert' : ''}`, onclick: () => viewBills(f, query).catch(fail)
      }, `${f === 'old' ? t('oldUnpaid') : t(f)} ${count(f)}`))),
      state.openBills.some((b) => owed(b) > 0) ? h('div', { class: 'grid2' },
        toSend.length ? h('button', { type: 'button', class: 'btn wa', onclick: () => sendQueue(toSend) }, icon('chat'), t('sendAll', { n: toSend.length })) : null,
        h('button', { type: 'button', class: 'btn ghost', onclick: () => go('round') }, icon('people'), t('round'))) : null,
      list.length ? h('div', { class: 'card flush grid-list' }, list.map((b) => billRow(b, again)))
        : empty(data.length || status === 'old' ? t('noResults') : t('noBills'), !data.length && status !== 'old' ? h('button', { type: 'button', class: 'btn primary', onclick: () => go('home') }, t('goHome')) : null));
  }

  function collectorUrl(c) { return `${appUrl()}#/c/${c.invite_code}.${c.ck}`; }

  function collectorLinkButtons(c) {
    const msg = t('collectorMsg', { biz: state.business.name, name: c.name, url: collectorUrl(c) });
    return h('div', { class: 'actions three' },
      h('button', { type: 'button', class: 'act wa', onclick: () => (c.phone ? openExternal(waLink(c.phone, msg)) : shareText(msg)) }, icon('chat'), h('span', null, 'WhatsApp')),
      c.phone ? h('a', { class: 'act', href: smsLink(c.phone, msg) }, icon('send'), h('span', null, 'SMS')) : null,
      h('button', { type: 'button', class: 'act', onclick: () => copyText(collectorUrl(c)) }, icon('copy'), h('span', null, t('copyLink'))));
  }

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  async function viewCollectors() {
    const biz = state.business;
    const [list, pays] = await Promise.all([
      loadCollectors(),
      sb.from('payments').select('amount, collector_id, bills!inner(business_id)').eq('bills.business_id', biz.id).gte('paid_at', startOfToday())
    ]);
    if (pays.error) throw pays.error;
    const today = (id) => pays.data.filter((x) => x.collector_id === id).reduce((a, x) => a + Number(x.amount), 0);
    render(head(t('collectors'), h('button', { type: 'button', class: 'btn primary small', onclick: collectorForm }, icon('plus'), t('add')), 'more'),
      h('p', { class: 'muted' }, t('collectorsBody')),
      list.length ? h('div', { class: 'card flush' }, list.map((c) => h('div', { class: `item ${c.active ? '' : 'dim'}`, role: 'button', tabindex: '0', onclick: () => collectorSheet(c) },
        avatar(c.name),
        h('div', { class: 'grow' }, h('strong', null, c.name),
          c.phone ? h('small', { class: 'muted' }, ltr(c.phone)) : null,
          h('span', { class: `state ${c.active && c.devices > 0 ? 'ok' : ''}` }, !c.active ? t('collectorOff') : c.devices > 0 ? t('linked') : t('notLinked'))),
        h('div', { class: 'end-col' }, h('strong', { class: 'amount' }, money(today(c.id))), h('small', { class: 'muted' }, t('tabToday'))))))
        : empty(t('noCollectors'), h('button', { type: 'button', class: 'btn primary', onclick: collectorForm }, icon('plus'), t('addCollector'))));
  }

  function collectorForm() {
    const save = h('button', { type: 'submit', class: 'btn primary block' }, t('saveAndSend'));
    const close = sheet(t('addCollector'), h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      const name = clean(d.name, 80);
      if (!name) return toast(t('nameRequired'), 'bad');
      if (d.phone && !validPhone(d.phone)) return toast(t('phoneRequired'), 'bad');
      busy(save, true);
      try {
        const ck = V.genKey();
        const res = await sb.from('collectors').insert({
          business_id: state.business.id, name_enc: await V.enc(state.bk, { name, phone: clean(d.phone, 20) }),
          wbk: await V.enc(ck, { k: state.bk }), wck: await V.enc(state.bk, { k: ck })
        }).select().single();
        if (res.error) throw res.error;
        close();
        await viewCollectors();
        const c = Object.assign(res.data, { name, phone: clean(d.phone, 20), ck });
        sheet(t('sendLinkTitle'), h('div', { class: 'stack' }, h('p', { class: 'muted' }, t('collectorLinkBody', { name })), collectorLinkButtons(c)));
      } catch (err) { fail(err); } finally { busy(save, false); }
    } },
      field(t('collectorNameLabel'), input('name', { required: true, maxlength: 80 })),
      field(t('phone'), input('phone', { type: 'tel', maxlength: 20, inputmode: 'tel', placeholder: '03 123 456' })),
      h('p', { class: 'muted small' }, t('collectorsBody')),
      save));
  }

  function collectorSheet(c) {
    const close = sheet(c.name, h('div', { class: 'stack' },
      h('small', { class: 'muted' }, t('collectorLinkBody', { name: c.name })),
      collectorLinkButtons(c),
      h('button', { type: 'button', class: 'btn ghost block', onclick: async () => {
        const { error } = await sb.from('collectors').update({ active: !c.active }).eq('id', c.id);
        if (error) return fail(error);
        close(); viewCollectors();
      } }, c.active ? t('stopCollector') : t('allowCollector')),
      h('div', { class: 'grid2' },
        h('button', { type: 'button', class: 'btn ghost', onclick: async () => {
          if (!(await confirmBox(t('resetConfirm'), t('resetAccess')))) return;
          const { error } = await sb.rpc('reset_collector_access', { p_collector: c.id });
          if (error) return fail(error);
          close(); toast(t('resetDone'), 'good'); viewCollectors();
        } }, t('resetAccess')),
        h('button', { type: 'button', class: 'btn danger ghost', onclick: async () => {
          if (!(await confirmBox(t('deleteCollector', { name: c.name })))) return;
          const { error } = await sb.from('collectors').delete().eq('id', c.id);
          if (error) return fail(error);
          close(); viewCollectors();
        } }, t('delete')))));
  }

  async function viewCollect(filter) {
    await Promise.all([loadPeople(), loadOpenBills()]);
    const q = (filter || '').toLowerCase();
    const person = (b) => state.people.find((x) => x.id === b.subscriber_id) || { title: '', info: {} };
    const list = state.openBills.filter((b) => {
      const p = person(b);
      return !q || [p.title, p.info.name, p.info.phone, p.info.building].some((v) => (v || '').toLowerCase().includes(q));
    }).sort((a, b) => (person(a).info.building || '').localeCompare(person(b).info.building || '') || person(a).title.localeCompare(person(b).title) || a.month.localeCompare(b.month));
    const total = state.openBills.reduce((a, b) => a + owed(b), 0);
    const search = input('q', { type: 'search', placeholder: t('search'), value: filter || '', class: 'search' });
    let tmr;
    search.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => viewCollect(search.value).then(() => {
      const s = $app.querySelector('input[name=q]'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    }).catch(fail), 250); });
    const again = () => viewCollect(filter).catch(fail);
    render(head(state.business.name, h('button', { type: 'button', class: 'icon-btn', onclick: again, 'aria-label': t('refresh') }, '↻')),
      h('section', { class: 'hero-card' }, h('small', null, t('toCollect')), h('div', { class: 'hero-num' }, money(total)),
        h('div', { class: 'row between' }, h('span', null, t('unpaidCount', { n: state.openBills.length })), h('span', null, state.role.name))),
      state.openBills.length ? h('button', { type: 'button', class: 'btn primary block', onclick: () => go('round') }, icon('people'), t('roundStart')) : null,
      search,
      list.length ? h('div', { class: 'card flush grid-list' }, list.map((b) => billRow(b, again))) : empty(q ? t('noResults') : t('allPaid')));
  }

  async function viewToday() {
    const [, res] = await Promise.all([
      loadPeople(),
      sb.from('payments').select(`${PAY}, bills(subscriber_id, month)`).eq('collector_id', state.role.id).gte('paid_at', startOfToday()).order('paid_at', { ascending: false })
    ]);
    if (res.error) throw res.error;
    const pays = res.data;
    const total = pays.reduce((a, x) => a + Number(x.amount), 0);
    const usd = pays.filter((x) => !x.lbp_amount).reduce((a, x) => a + Number(x.amount), 0);
    const lbpSum = pays.reduce((a, x) => a + Number(x.lbp_amount || 0), 0);
    render(head(t('tabToday'), h('button', { type: 'button', class: 'icon-btn', onclick: () => viewToday().catch(fail), 'aria-label': t('refresh') }, '↻')),
      h('section', { class: 'hero-card clear' }, h('small', null, t('collectedToday')), h('div', { class: 'hero-num' }, money(total)),
        h('div', { class: 'row between' }, h('span', null, t('usdReceived')), h('strong', { class: 'amount' }, money(usd))),
        h('div', { class: 'row between' }, h('span', null, t('lbpReceived')), h('strong', { class: 'amount' }, lbpText(lbpSum)))),
      pays.length ? h('div', { class: 'card flush' }, pays.map((x) => h('div', { class: 'item static' },
        avatar(personName(x.bills && x.bills.subscriber_id)),
        h('div', { class: 'grow' }, h('strong', null, personName(x.bills && x.bills.subscriber_id)),
          h('small', { class: 'muted' }, [x.bills ? monthLabel(x.bills.month) : '', t(x.method), new Date(x.paid_at).toLocaleTimeString(state.lang === 'ar' ? 'ar-LB' : 'en-GB', { hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(sep()))),
        h('div', { class: 'end-col' }, h('strong', { class: 'amount' }, payText(x)),
          h('button', { type: 'button', class: 'link bad', onclick: () => removePayment(x, () => viewToday().catch(fail)) }, t('undo'))))))
        : empty(t('nothingToday')));
  }

  function csvCell(v) {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  async function downloadCsv(name, rows) {
    const text = `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}`;
    if (isNative && plugins.Filesystem && plugins.Share) {
      try {
        const res = await plugins.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
        await plugins.Share.share({ title: name, url: res.uri });
      } catch (e) { if (!/cancel/i.test((e && e.message) || '')) fail(e); }
      return;
    }
    const file = new File([text], name, { type: 'text/csv' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && window.matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ files: [file] }); } catch {}
      return;
    }
    const url = URL.createObjectURL(file);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function viewReports() {
    const biz = state.business;
    const m = monthDate(state.month);
    const [people, res] = await Promise.all([
      loadPeople(),
      sb.from('bills').select(`*, payments(${PAY})`).eq('business_id', biz.id).eq('month', m),
      loadOpenBills(),
      loadCollectors()
    ]);
    if (res.error) throw res.error;
    const bills = res.data;
    const pays = bills.flatMap((b) => (b.payments || []).map((x) => Object.assign({ bill: b }, x)));
    const sum = (list, f) => list.reduce((a, x) => a + Number(f(x) || 0), 0);
    const billed = sum(bills, (b) => b.amount);
    const collected = sum(bills, (b) => b.paid_amount);
    const oldTotal = sum(state.openBills.filter((b) => b.month < m), owed);
    const person = (id) => people.find((x) => x.id === id) || { title: '—', info: {}, label: '' };
    const stat = (label, value, cls) => h('div', { class: 'item static' }, h('div', { class: 'grow' }, h('span', null, label)), h('strong', { class: `amount ${cls || ''}` }, value));
    const methods = ['cash', 'whish', 'omt', 'other'].map((k) => [t(k), sum(pays.filter((x) => x.method === k), (x) => x.amount)]).filter(([, v]) => v > 0);
    const whoIds = [...new Set(pays.map((x) => x.collector_id || ''))];
    const who = whoIds.map((id) => [id ? collectorName(id) : t('me'), sum(pays.filter((x) => (x.collector_id || '') === id), (x) => x.amount)]);
    const exportBills = () => downloadCsv(`ishtirak-bills-${state.month}.csv`, [
      [t('subName'), t('privateNameShort'), t('phone'), t('building'), t('floor'), t('meterNumber'), t('amps'), t('billingType'), t('prev'), t('currentReading'), 'kWh', t('total'), t('paid'), t('remaining'), t('status'), t('oldUnpaid')]
    ].concat(bills.map((b) => {
      const p = person(b.subscriber_id);
      return [p.info.name, p.label, p.info.phone, p.info.building, p.info.floor, p.info.meter, b.amps, typeLabel(b.billing_type), b.prev_reading, b.curr_reading, b.kwh, b.amount, b.paid_amount, owed(b), t(b.status), debtBefore(b.subscriber_id, b.month) || ''];
    })));
    const exportPays = async () => {
      const rows = [[t('date'), t('subName'), t('forMonth'), t('amount'), t('amountLbp'), t('method'), t('collectedBy'), t('note')]];
      for (const x of pays.sort((a, b) => a.paid_at.localeCompare(b.paid_at))) {
        const n = x.note ? ((await V.dec(state.bk, x.note)) || {}).t : '';
        rows.push([x.paid_at.slice(0, 16).replace('T', ' '), person(x.bill.subscriber_id).title, state.month, x.amount, x.lbp_amount || '', t(x.method), x.collector_id ? collectorName(x.collector_id) : t('me'), n || '']);
      }
      return downloadCsv(`ishtirak-payments-${state.month}.csv`, rows);
    };
    render(head(t('reports'), monthSwitch(() => viewReports().catch(fail)), 'more'),
      h('div', { class: 'cols' },
        h('div', { class: 'stack' },
          h('section', { class: 'card flush' }, h('h3', { class: 'card-title' }, t('summary')),
            stat(t('billedTotal'), money(billed)), stat(t('collectedTotal'), money(collected), 'ok'),
            stat(t('unpaidTotal'), money(billed - collected), billed - collected > 0 ? 'bad' : ''),
            stat(t('oldUnpaid'), money(oldTotal), oldTotal > 0 ? 'bad' : ''),
            stat(t('billsCount'), String(bills.length)), stat(t('kwhTotal'), String(Math.round(sum(bills, (b) => b.kwh))))),
          h('button', { type: 'button', class: 'btn ghost block', onclick: exportBills }, icon('bills'), t('exportBills')),
          h('button', { type: 'button', class: 'btn ghost block', onclick: () => exportPays().catch(fail) }, icon('bills'), t('exportPayments')),
          h('button', { type: 'button', class: 'btn ghost block', onclick: () => go('costs') }, icon('tag'), t('costsTitle'))),
        h('div', { class: 'stack' },
          h('section', { class: 'card flush' }, h('h3', { class: 'card-title' }, t('byMethod')),
            methods.length ? methods.map(([k, v]) => stat(k, money(v))) : h('p', { class: 'muted pad' }, t('noPaymentsYet'))),
          h('section', { class: 'card flush' }, h('h3', { class: 'card-title' }, t('byCollector')),
            who.length ? who.map(([k, v]) => stat(k, money(v))) : h('p', { class: 'muted pad' }, t('noPaymentsYet'))))));
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
    const [res, ph, pc, rc] = ids.length ? await Promise.all([
      sb.from('bills').select('*, payments(amount, method, paid_at, lbp_amount)').in('subscriber_id', ids).order('month', { ascending: false }).limit(60),
      sb.from('readings').select('subscriber_id, month').in('subscriber_id', ids).eq('photo', true).order('month', { ascending: false }).limit(60),
      sb.from('payment_claims').select('bill_id, amount, method, status, created_at').in('subscriber_id', ids).eq('status', 'pending'),
      sb.from('reading_claims').select('subscriber_id, month, value, status').in('subscriber_id', ids).eq('month', monthDate(currentMonth()))
    ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
    if (res.error) throw res.error;
    const photos = new Set((ph.data || []).map((r) => `${r.subscriber_id}:${r.month}`));
    const claimOf = new Map((pc.data || []).map((c) => [c.bill_id, c]));
    const readOf = new Map((rc.data || []).map((c) => [c.subscriber_id, c]));
    const again = () => viewMyBills().catch(fail);
    render(head(t('tabBills'), h('button', { type: 'button', class: 'icon-btn', onclick: refresh, 'aria-label': t('refresh') }, '↻')),
      active.length ? pushCard(t('pushAskSub')) : null,
      waiting.map((s) => h('section', { class: 'card stack center-card' },
        h('div', { class: 'logo small' }, icon('bolt')),
        h('h2', null, t('waitingTitle')), h('p', { class: 'muted' }, t('waitingBody', { biz: s.business.name })))),
      active.map((s) => {
        const biz = s.business;
        const mine = res.data.filter((b) => b.subscriber_id === s.id);
        const due = mine.reduce((a, b) => a + Number(b.amount) - Number(b.paid_amount), 0);
        const latest = mine.length ? mine[0].month : '';
        const oldDue = mine.filter((b) => b.month < latest).reduce((a, b) => a + Number(b.amount) - Number(b.paid_amount), 0);
        return h('div', { class: 'cols' },
          h('section', { class: `hero-card ${due > 0 ? '' : 'clear'}` },
            h('small', null, biz.name),
            h('div', { class: 'hero-num' }, money(due)),
            h('div', { class: 'row between' },
              h('span', null, due > 0 ? `≈ ${lbp(due, biz.lbp_rate)} ${t('lbpUnit')}` : t('nothingDue')),
              h('span', null, `${s.amps}A${sep()}${typeLabel(s.billing_type)}`)),
            oldDue > 0 ? h('div', { class: 'old-row' }, h('span', null, t('includesOld', { amt: ltr(money(oldDue)) }))) : null,
            s.cut_at ? h('div', { class: 'old-row' }, h('strong', null, t('youAreCut'))) : null,
            s.billing_type === 'metered' ? (() => {
              const rcl = readOf.get(s.id);
              if (rcl && rcl.status === 'pending') return h('div', { class: 'old-row' }, h('span', null, t('readingWaiting', { v: Number(rcl.value) })));
              if (rcl && rcl.status === 'accepted') return h('div', { class: 'old-row' }, h('span', null, t('readingAccepted', { v: Number(rcl.value) })));
              return h('button', { type: 'button', class: 'btn glass block', onclick: () => readingSheet(s, again) }, icon('camera'), t('sendReading'));
            })() : null,
            biz.phone ? h('a', { class: 'btn glass block', href: `tel:+${intlPhone(biz.phone)}` }, icon('phone'), t('callOwner')) : null),
          usageChart(mine),
          h('section', { class: 'card flush' },
            h('h3', { class: 'card-title' }, t('history')),
            mine.length ? mine.map((b) => h('details', { class: 'item col' },
              h('summary', { class: 'row between' }, h('span', null, monthLabel(b.month)),
                h('span', { class: 'row' }, h('strong', { class: 'amount' }, money(b.amount)), h('span', { class: `pill ${b.status}` }, t(b.status)))),
              h('div', { class: 'stack tight detail' },
                b.billing_type === 'metered' ? h('small', null, t('readingLine', { prev: Number(b.prev_reading), curr: Number(b.curr_reading) })) : null,
                h('small', null, billDetail(b)),
                h('small', { class: 'muted' }, `≈ ${lbp(b.amount, biz.lbp_rate)} ${t('lbpUnit')}`),
                (b.payments || []).map((p) => h('small', { class: 'ok' }, `✓ ${payText(p)}${sep()}${t(p.method)}${sep()}${dateLabel(p.paid_at)}`)),
                photos.has(`${s.id}:${b.month}`) && s.sk ? h('button', { type: 'button', class: 'btn ghost small', onclick: () => showPhoto(s.sk, s.business_id, s.id, b.month, biz.name) }, icon('camera'), t('meterPhoto')) : null,
                claimOf.has(b.id) ? h('small', { class: 'warn-text' }, t('claimWaiting', { amt: money(claimOf.get(b.id).amount), m: claimOf.get(b.id).method === 'omt' ? 'OMT' : claimOf.get(b.id).method === 'whish' ? 'Whish' : t('other') }))
                  : Number(b.amount) > Number(b.paid_amount) ? h('button', { type: 'button', class: 'btn ghost small', onclick: () => claimSheet(s, b, again) }, icon('check'), t('iPaid')) : null)))
              : h('p', { class: 'muted pad' }, t('noSubscriptionBills'))));
      }));
  }

  async function refresh() {
    memo.clear();
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

  // ===== Notifications =====
  const nativePush = () => isNative && cfg.nativePush && !!plugins.PushNotifications;
  function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function standalone() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } }
  function webPushOk() { return !isNative && !!cfg.vapidKey && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext && /^https?:$/.test(location.protocol); }
  function pushStatus() {
    if (nativePush()) return store.get('push') ? 'on' : 'off';
    if (!webPushOk()) return isIOS() && !isNative && !standalone() ? 'install' : 'none';
    if (Notification.permission === 'denied') return 'denied';
    return Notification.permission === 'granted' && store.get('push') ? 'on' : 'off';
  }
  function vapidBytes() {
    const s = cfg.vapidKey.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }
  async function savePush(kind, endpoint, p256dh, auth) {
    const { error } = await sb.rpc('save_push', { p_kind: kind, p_endpoint: endpoint, p_p256dh: p256dh || null, p_auth: auth || null, p_lang: state.lang });
    if (error) throw error;
    store.set('push', state.user.id);
  }
  async function enablePush() {
    if (nativePush()) {
      const P = plugins.PushNotifications;
      const perm = await P.requestPermissions();
      if (perm.receive !== 'granted') { toast(t('pushDenied'), 'bad'); return false; }
      await new Promise((resolve, reject) => {
        P.addListener('registration', (tok) => savePush('fcm', tok.value).then(resolve, reject));
        P.addListener('registrationError', reject);
        P.register();
      });
      return true;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast(t('pushDenied'), 'bad'); return false; }
    const reg = await navigator.serviceWorker.ready;
    let s = await reg.pushManager.getSubscription();
    if (!s) s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes() });
    const j = s.toJSON();
    await savePush('web', j.endpoint, j.keys.p256dh, j.keys.auth);
    return true;
  }
  async function disablePush() {
    store.del('push');
    if (nativePush()) { try { await plugins.PushNotifications.unregister(); } catch {} return; }
    const reg = await navigator.serviceWorker.ready;
    const s = await reg.pushManager.getSubscription();
    if (s) { await sb.rpc('drop_push', { p_endpoint: s.endpoint }); await s.unsubscribe(); }
  }
  // Keeps the server copy current (new sign-in on this device, language change).
  async function refreshPush() {
    try {
      if (!state.user || !webPushOk() || Notification.permission !== 'granted' || !store.get('push')) return;
      const reg = await navigator.serviceWorker.ready;
      const s = await reg.pushManager.getSubscription();
      if (!s) { store.del('push'); return; }
      const j = s.toJSON();
      await savePush('web', j.endpoint, j.keys.p256dh, j.keys.auth);
    } catch (e) { console.warn(e); }
  }
  function pushLabel() {
    const s = pushStatus();
    return s === 'on' ? t('pushOn') : s === 'denied' ? t('pushBlocked') : s === 'install' ? t('pushInstall') : t('pushOff');
  }
  async function togglePush(after) {
    const s = pushStatus();
    if (s === 'install') return sheet(t('notifications'), h('div', { class: 'stack' }, h('p', null, t('pushInstallBody'))));
    if (s === 'denied') return sheet(t('notifications'), h('div', { class: 'stack' }, h('p', null, t('pushBlockedBody'))));
    try {
      if (s === 'on') { await disablePush(); toast(t('pushOffDone')); } else if (await enablePush()) toast(t('pushOnDone'), 'good');
    } catch (e) { fail(e); }
    if (after) after();
  }
  function pushCard(text) {
    const s = pushStatus();
    if ((s !== 'off' && s !== 'install') || store.get(`pushAsk:${state.mode}`)) return null;
    const card = h('section', { class: 'card push-card' },
      h('span', { class: 'row-ic' }, icon('bell')),
      h('div', { class: 'grow' }, h('strong', null, t('pushAskTitle')), h('small', { class: 'muted' }, s === 'install' ? t('pushInstallBody') : text)),
      h('div', { class: 'push-btns' },
        s === 'off' ? h('button', { type: 'button', class: 'btn primary small', onclick: async () => {
          try { if (await enablePush()) { toast(t('pushOnDone'), 'good'); card.remove(); } } catch (e) { fail(e); }
        } }, t('turnOn')) : null,
        h('button', { type: 'button', class: 'link', onclick: () => { store.set(`pushAsk:${state.mode}`, '1'); card.remove(); } }, t('notNow'))));
    return card;
  }

  function reminderLabel(days) { return Number(days) > 0 ? t('remindEvery', { n: days }) : t('remindOff'); }
  function reminderSheet() {
    const biz = state.business;
    const days = [0, 3, 5, 7, 10, 14, 30];
    const cur = Number(biz.reminder_days ?? 7);
    const seg = h('div', { class: 'chips wrap' }, days.map((d) => h('label', { class: 'chip-radio' },
      h('input', { type: 'radio', name: 'reminder_days', value: String(d), checked: d === cur }), h('span', null, d ? t('daysN', { n: d }) : t('off')))));
    const save = h('button', { type: 'submit', class: 'btn primary block' }, t('save'));
    const close = sheet(t('reminders'), h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const v = Number(formData(e.target).reminder_days || 0);
      busy(save, true);
      try {
        const { data, error } = await sb.from('businesses').update({ reminder_days: v }).eq('id', biz.id).select().single();
        if (error) throw error;
        state.ownBusiness = data; state.business = data; close(); toast(t('saved'), 'good'); viewMore();
      } catch (err) { fail(err); } finally { busy(save, false); }
    } }, h('p', { class: 'muted' }, t('remindersBody')), seg, h('small', { class: 'muted' }, t('remindersHint')), save));
  }

  // ===== Meter photos =====
  function photoPath(bizId, subId, month) { return `${bizId}/${subId}/${String(month).slice(0, 7)}.bin`; }
  function photoKey(month) { return `ph:${state.business.id}:${month}`; }
  function pendingPhotos(month) { try { return JSON.parse(store.get(photoKey(month)) || '[]'); } catch { return []; } }

  async function shrinkPhoto(file) {
    let src;
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {
      src = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
        img.src = url;
      });
    }
    const w0 = src.width; const h0 = src.height;
    const k = Math.min(1, 1280 / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.72));
    if (!blob) throw new Error('image');
    return new Uint8Array(await blob.arrayBuffer());
  }

  function pickPhoto() {
    return new Promise((resolve) => {
      const inp = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden-file' });
      inp.addEventListener('change', () => { resolve(inp.files && inp.files[0]); inp.remove(); });
      document.body.append(inp);
      inp.click();
    });
  }

  async function uploadMeterPhoto(row, month, btn) {
    const p = state.people.find((x) => x.id === row.id);
    if (!p || !p.sk) return toast(t('error'), 'bad');
    if (!navigator.onLine) return toast(t('photoOnline'), 'warn');
    const file = await pickPhoto();
    if (!file) return;
    busy(btn, true);
    try {
      const data = await V.encBytes(p.sk, await shrinkPhoto(file));
      const up = await sb.storage.from('meters').upload(photoPath(state.business.id, p.id, month), data, { upsert: true, contentType: 'application/octet-stream' });
      if (up.error) throw up.error;
      if (row.rid) {
        const { error } = await sb.from('readings').update({ photo: true }).eq('id', row.rid);
        if (error) throw error;
      } else {
        const list = pendingPhotos(month);
        if (!list.includes(p.id)) list.push(p.id);
        store.set(photoKey(month), JSON.stringify(list));
      }
      row.photo = true;
      btn.classList.add('has');
      btn.setAttribute('aria-label', t('photoRetake'));
      toast(t('photoSaved'), 'good');
    } catch (e) { fail(e); } finally { busy(btn, false); }
  }

  async function showPhoto(sk, bizId, subId, month, title, path) {
    const body = h('div', { class: 'stack' }, h('div', { class: 'skeleton photo' }));
    sheet(title || t('meterPhoto'), body);
    try {
      const { data, error } = await sb.storage.from('meters').download(path || photoPath(bizId, subId, month));
      if (error) throw error;
      const bytes = await V.decBytes(sk, await data.arrayBuffer());
      if (!bytes) throw new Error('decrypt');
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
      const img = h('img', { class: 'meter-photo', alt: t('meterPhoto'), src: url });
      img.addEventListener('load', () => setTimeout(() => URL.revokeObjectURL(url), 1000));
      body.replaceChildren(img, h('small', { class: 'muted center' }, monthLabel(month)));
    } catch (e) {
      console.error(e);
      body.replaceChildren(h('p', { class: 'muted center' }, t('photoMissing')));
    }
  }

  // ===== Import from Excel / CSV =====
  async function unzip(buf) {
    const u = new Uint8Array(buf);
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    let eocd = -1;
    for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('zip');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = new Map();
    const td = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip');
      const method = dv.getUint16(p + 10, true);
      const size = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extra = dv.getUint16(p + 30, true);
      const comment = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = td.decode(u.subarray(p + 46, p + 46 + nameLen));
      files.set(name, { method, size, local });
      p += 46 + nameLen + extra + comment;
    }
    return async (name) => {
      const f = files.get(name);
      if (!f) return null;
      const start = f.local + 30 + dv.getUint16(f.local + 26, true) + dv.getUint16(f.local + 28, true);
      const raw = u.subarray(start, start + f.size);
      if (f.method === 0) return td.decode(raw);
      if (f.method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('zip');
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(stream).text();
    };
  }

  function xmlDoc(s) { return new DOMParser().parseFromString(s, 'application/xml'); }
  function byTag(node, tag) { return [...node.getElementsByTagName('*')].filter((e) => e.localName === tag); }
  function colIndex(ref) { let n = 0; for (const ch of String(ref).replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }

  async function readXlsx(buf) {
    const get = await unzip(buf);
    const shared = [];
    const ss = await get('xl/sharedStrings.xml');
    if (ss) for (const si of byTag(xmlDoc(ss), 'si')) shared.push(byTag(si, 't').map((x) => x.textContent).join(''));
    let sheetPath = 'xl/worksheets/sheet1.xml';
    const wb = await get('xl/workbook.xml');
    const rels = await get('xl/_rels/workbook.xml.rels');
    if (wb && rels) {
      const first = byTag(xmlDoc(wb), 'sheet')[0];
      const rid = first && [...first.attributes].find((a) => a.localName === 'id' && a.prefix);
      const rel = rid && byTag(xmlDoc(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid.value);
      if (rel) { const tgt = rel.getAttribute('Target'); sheetPath = tgt.startsWith('/') ? tgt.slice(1) : `xl/${tgt}`; }
    }
    const sheetXml = await get(sheetPath);
    if (!sheetXml) throw new Error('sheet');
    const rows = [];
    for (const r of byTag(xmlDoc(sheetXml), 'row')) {
      const row = [];
      for (const c of byTag(r, 'c')) {
        const type = c.getAttribute('t');
        const v = byTag(c, 'v')[0];
        let val = '';
        if (type === 's') val = shared[Number(v && v.textContent)] || '';
        else if (type === 'inlineStr') val = byTag(c, 't').map((x) => x.textContent).join('');
        else val = v ? v.textContent : '';
        row[colIndex(c.getAttribute('r'))] = val;
      }
      rows.push(Array.from(row, (x) => (x === undefined ? '' : String(x))));
    }
    return rows;
  }

  function readCsv(text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/)[0] || '';
    const delim = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
    const rows = []; let row = []; let cell = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  const IMPORT_COLS = {
    name: ['name', 'full name', 'subscriber', 'subscriber name', 'customer', 'الاسم', 'اسم', 'الإسم', 'اسم المشترك', 'المشترك'],
    phone: ['phone', 'mobile', 'phone number', 'tel', 'telephone', 'whatsapp', 'الهاتف', 'هاتف', 'رقم الهاتف', 'الموبايل', 'موبايل', 'خلوي', 'الرقم', 'رقم'],
    building: ['building', 'address', 'المبنى', 'مبنى', 'بناية', 'البناية', 'العنوان'],
    floor: ['floor', 'الطابق', 'طابق'],
    amps: ['amps', 'amp', 'ampere', 'amperes', 'a', 'أمبير', 'امبير', 'الأمبير', 'الامبير', 'أمبيرات'],
    type: ['billing', 'type', 'billing type', 'plan', 'نوع', 'النوع', 'نوع الاشتراك', 'الاشتراك'],
    reading: ['meter reading', 'reading', 'start reading', 'initial reading', 'current reading', 'القراءة', 'قراءة العداد', 'القراءة الأولى', 'قراءة'],
    meter: ['meter number', 'meter no', 'meter #', 'meter', 'رقم العداد', 'العداد', 'عداد'],
    label: ['private name', 'label', 'nickname', 'my name for them', 'الاسم الخاص', 'اسم خاص', 'لقب']
  };

  function normHead(s) { return String(s || '').toLowerCase().replace(/[ً-ْ_]/g, '').replace(/\s+/g, ' ').trim(); }

  function mapColumns(header) {
    const heads = header.map(normHead);
    const map = {};
    for (const [key, names] of Object.entries(IMPORT_COLS)) {
      let i = heads.findIndex((x, idx) => names.includes(x) && !Object.values(map).includes(idx));
      if (i < 0 && key !== 'amps') i = heads.findIndex((x, idx) => x && names.some((n) => n.length > 3 && x.includes(n)) && !Object.values(map).includes(idx));
      if (i >= 0) map[key] = i;
    }
    if (map.meter !== undefined && map.reading === map.meter) delete map.meter;
    return map;
  }

  function phoneKey(v) { return intlPhone(v); }

  function prepareImport(rows) {
    const nonEmpty = rows.filter((r) => r.some((c) => String(c).trim()));
    if (nonEmpty.length < 2) return { error: t('importEmpty') };
    const map = mapColumns(nonEmpty[0]);
    if (map.name === undefined || map.phone === undefined) return { error: t('importNoCols') };
    const seen = new Set(state.people.map((p) => phoneKey(p.info.phone)).filter(Boolean));
    const ok = []; const bad = [];
    nonEmpty.slice(1).forEach((r, i) => {
      const line = i + 2;
      const get = (k) => (map[k] === undefined ? '' : String(r[map[k]] ?? '').trim());
      const name = clean(get('name'), 80);
      let phone = get('phone').replace(/\.0+$/, '');
      if (/^\d+(\.\d+)?e\+?\d+$/i.test(phone)) phone = String(Math.round(Number(phone)));
      if (/^\d{7}$/.test(phone)) phone = `0${phone}`; // Excel drops the leading 0 of Lebanese numbers
      if (!name) return bad.push({ line, why: t('nameRequired') });
      if (!validPhone(phone)) return bad.push({ line, name, why: t('phoneRequired') });
      const key = phoneKey(phone);
      if (seen.has(key)) return bad.push({ line, name, why: t('importDup') });
      const ampsRaw = get('amps');
      const amps = ampsRaw === '' ? 5 : parseInt(String(ampsRaw).replace(/[^\d]/g, ''), 10);
      if (!(amps >= 1 && amps <= 200)) return bad.push({ line, name, why: t('importAmps') });
      const typeRaw = normHead(get('type'));
      const flat = /flat|fixed|مقطوع|ثابت/.test(typeRaw);
      const reading = get('reading') === '' ? 0 : num(get('reading'));
      if (!flat && !(reading >= 0)) return bad.push({ line, name, why: t('importReading') });
      seen.add(key);
      ok.push({
        info: { name, phone: clean(phone, 20), building: clean(get('building'), 80), floor: clean(get('floor'), 20), meter: flat ? '' : clean(get('meter'), 40) },
        label: clean(get('label'), 80), amps, billing_type: flat ? 'flat' : 'metered', initial_reading: flat ? 0 : reading
      });
    });
    return { ok, bad, map };
  }

  async function runImport(list, onProgress) {
    const made = [];
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      const rows = []; const keys = [];
      for (const x of chunk) {
        const sk = V.genKey();
        keys.push(sk);
        rows.push({
          business_id: state.business.id, enc: await V.enc(sk, x.info), wk: await V.enc(state.bk, { k: sk }),
          oenc: x.label ? await V.enc(state.bk, { label: x.label }) : null,
          amps: x.amps, billing_type: x.billing_type, initial_reading: x.initial_reading, active: true
        });
      }
      const res = await sb.from('subscribers').insert(rows).select('id, invite_code');
      if (res.error) throw res.error;
      res.data.forEach((d, j) => made.push(Object.assign({}, d, { sk: keys[j], info: chunk[j].info, label: chunk[j].label, title: chunk[j].label || chunk[j].info.name })));
      onProgress(Math.min(list.length, i + 100));
    }
    return made;
  }

  function templateRows() {
    const head = state.lang === 'ar'
      ? ['الاسم', 'الهاتف', 'المبنى', 'الطابق', 'أمبير', 'نوع الاشتراك', 'رقم العداد', 'قراءة العداد', 'الاسم الخاص']
      : ['Name', 'Phone', 'Building', 'Floor', 'Amps', 'Billing type', 'Meter number', 'Meter reading', 'Private name'];
    const ex = state.lang === 'ar'
      ? [['جورج حداد', '03 123 456', 'بناية الأمل', '2', '10', 'عداد', 'M-204', '1520', 'أبو جورج'], ['ريما خوري', '71 987 654', 'بناية الأمل', '4', '5', 'مقطوع', '', '', '']]
      : [['George Haddad', '03 123 456', 'Al Amal bldg', '2', '10', 'metered', 'M-204', '1520', 'Abu George'], ['Rima Khoury', '71 987 654', 'Al Amal bldg', '4', '5', 'flat', '', '', '']];
    return [head, ...ex];
  }

  function importSheet() {
    const body = h('div', { class: 'stack' });
    const close = sheet(t('importTitle'), body);
    const start = () => {
      const file = h('input', { type: 'file', accept: '.xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', class: 'hidden-file' });
      const pick = h('button', { type: 'button', class: 'btn primary block', onclick: () => file.click() }, t('importPick'));
      file.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        if (!f) return;
        busy(pick, true);
        try {
          const buf = await f.arrayBuffer();
          const isZip = new Uint8Array(buf.slice(0, 2)).join() === '80,75';
          if (!isZip && /\.xls$/i.test(f.name)) throw new Error('xls');
          const rows = isZip ? await readXlsx(buf) : readCsv(new TextDecoder().decode(buf));
          await loadPeople();
          preview(prepareImport(rows), f.name);
        } catch (e) {
          console.error(e);
          toast(String(e && e.message) === 'xls' ? t('importOldXls') : t('importBadFile'), 'bad');
        } finally { busy(pick, false); }
      });
      body.replaceChildren(
        h('p', null, t('importBody')),
        h('ul', { class: 'hint-list' }, h('li', null, t('importCols1')), h('li', null, t('importCols2')), h('li', null, t('importCols3'))),
        file, pick,
        h('button', { type: 'button', class: 'btn ghost block', onclick: () => downloadCsv('ishtirak-subscribers-template.csv', templateRows()) }, t('importTemplate')),
        h('small', { class: 'muted' }, t('importPrivacy')));
    };
    const preview = (res, name) => {
      if (res.error) {
        body.replaceChildren(h('p', { class: 'bad' }, res.error), h('button', { type: 'button', class: 'btn ghost block', onclick: start }, t('importAgain')));
        return;
      }
      const go1 = h('button', { type: 'button', class: 'btn primary block', disabled: !res.ok.length }, t('importGo', { n: res.ok.length }));
      go1.addEventListener('click', async () => {
        busy(go1, true);
        try {
          const made = await runImport(res.ok, (n) => { go1.textContent = t('importProgress', { n, total: res.ok.length }); });
          memo.clear();
          close();
          toast(t('importDone', { n: made.length }), 'good');
          go('people');
          if (made.length) linkQueue(made);
        } catch (e) { fail(e); go1.textContent = t('importGo', { n: res.ok.length }); } finally { busy(go1, false); }
      });
      body.replaceChildren(h('div', { class: 'stack' },
        h('div', { class: 'summary' }, h('strong', null, name),
          h('span', { class: 'ok' }, t('importReady', { n: res.ok.length })),
          res.bad.length ? h('span', { class: 'bad' }, t('importSkipped', { n: res.bad.length })) : null),
        res.ok.length ? h('div', { class: 'card flush import-list' }, res.ok.slice(0, 8).map((x) => h('div', { class: 'item static' }, avatar(x.label || x.info.name),
          h('div', { class: 'grow' }, h('strong', null, x.label || x.info.name), h('small', { class: 'muted' }, [ltr(x.info.phone), x.info.building].filter(Boolean).join(sep()))),
          h('span', { class: 'row' }, h('small', { class: 'muted' }, typeLabel(x.billing_type)), h('span', { class: 'pill amps' }, `${x.amps}A`)))),
          res.ok.length > 8 ? h('p', { class: 'muted pad small' }, t('importMore', { n: res.ok.length - 8 })) : null) : null,
        res.bad.length ? h('details', { class: 'import-bad' }, h('summary', null, t('importProblems')),
          h('div', { class: 'stack tight' }, res.bad.slice(0, 50).map((b) => h('small', null, `${t('rowN', { n: b.line })}${b.name ? ` (${b.name})` : ''}: ${b.why}`)))) : null,
        go1,
        h('button', { type: 'button', class: 'btn ghost block', onclick: start }, t('importAgain'))));
    };
    start();
  }

  function linkQueue(people) {
    let i = 0;
    const body = h('div', { class: 'stack' });
    const close = sheet(t('sendLinks'), body);
    const draw = () => {
      if (i >= people.length) {
        body.replaceChildren(h('div', { class: 'empty' }, h('p', null, t('allLinksSent', { n: people.length })),
          h('button', { type: 'button', class: 'btn primary', onclick: () => close() }, t('close'))));
        return;
      }
      const p = people[i];
      const bar = h('div', { class: 'bar dark' }, h('i'));
      bar.firstChild.style.width = `${Math.round((i / people.length) * 100)}%`;
      const msg = t('linkMsg', { biz: state.business.name, name: p.info.name || '', url: inviteUrl(p) });
      body.replaceChildren(
        h('small', { class: 'muted' }, t('sendProgress', { i: i + 1, n: people.length })), bar,
        h('div', { class: 'summary' }, h('strong', null, p.title), h('span', { class: 'muted' }, ltr(p.info.phone))),
        h('button', { type: 'button', class: 'btn wa block', onclick: () => { openExternal(waLink(p.info.phone, msg)); i++; draw(); } }, icon('chat'), t('openWhatsApp')),
        h('button', { type: 'button', class: 'btn ghost block', onclick: () => { i++; draw(); } }, t('skip')),
        h('button', { type: 'button', class: 'link', onclick: () => close() }, t('later')));
    };
    draw();
  }

  function paymentToast(msg, pays, after) {
    toast(msg, 'good', { label: t('undoAction'), fn: async () => {
      for (const x of pays) {
        const { error } = await sb.from('payments').delete().eq('id', x.id);
        if (error) return fail(error);
      }
      toast(t('paymentUndone'));
      after();
    } });
  }

  async function removePayment(pay, after) {
    const { error } = await sb.from('payments').delete().eq('id', pay.id);
    if (error) return fail(error);
    after();
    toast(t('paymentRemoved'), null, { label: t('undoAction'), fn: async () => {
      const row = { bill_id: pay.bill_id, amount: pay.amount, method: pay.method, paid_at: pay.paid_at };
      if (pay.note) row.note = pay.note;
      if (pay.lbp_amount) { row.lbp_amount = pay.lbp_amount; row.lbp_rate = pay.lbp_rate; }
      const res = await sb.from('payments').insert(row);
      if (res.error) return fail(res.error);
      after();
    } });
  }

  async function payOldestFirst(bills, amount, method) {
    const pays = [];
    let rest = Math.round(amount * 100) / 100;
    for (const b of bills.slice().sort((a, c) => a.month.localeCompare(c.month))) {
      if (rest <= 0) break;
      const a = Math.min(rest, owed(b));
      if (a <= 0) continue;
      pays.push(await payBill(b, a, method || 'cash'));
      rest = Math.round((rest - a) * 100) / 100;
    }
    return pays;
  }

  function groupOpen() {
    const by = new Map();
    for (const b of state.openBills) {
      if (owed(b) <= 0) continue;
      if (!by.has(b.subscriber_id)) by.set(b.subscriber_id, []);
      by.get(b.subscriber_id).push(b);
    }
    return by;
  }

  function floorNo(p) { return parseInt(digits(p.info.floor), 10) || 0; }
  function byPlace(a, b) {
    return (a.info.building || '').localeCompare(b.info.building || '') || floorNo(a) - floorNo(b) || a.title.localeCompare(b.title);
  }

  function awayKey() { return `away:${state.business.id}:${new Date().toISOString().slice(0, 10)}`; }
  function awaySet() { try { return new Set(JSON.parse(store.get(awayKey()) || '[]')); } catch { return new Set(); } }

  async function viewRound() {
    await Promise.all([loadPeople(), loadOpenBills()]);
    const by = groupOpen();
    const away = awaySet();
    const people = [...by.keys()].map((id) => state.people.find((p) => p.id === id)).filter(Boolean).sort(byPlace);
    const here = people.filter((p) => !away.has(p.id));
    const later = people.filter((p) => away.has(p.id));
    const dueOf = (p) => by.get(p.id).reduce((a, b) => a + owed(b), 0);
    const total = people.reduce((a, p) => a + dueOf(p), 0);
    const again = () => viewRound().catch(fail);
    const setAway = (id, on) => {
      const s = awaySet();
      if (on) s.add(id); else s.delete(id);
      store.set(awayKey(), JSON.stringify([...s]));
      again();
    };
    const card = (p) => {
      const bills = by.get(p.id).slice().sort((a, b) => a.month.localeCompare(b.month));
      const due = dueOf(p);
      const paid = h('button', { type: 'button', class: 'btn primary' }, icon('check'), t('roundPaid'));
      paid.addEventListener('click', async () => {
        busy(paid, true);
        try {
          const pays = await payOldestFirst(bills, due, 'cash');
          setAway(p.id, false);
          paymentToast(t('markedPaid', { name: p.title }), pays, again);
        } catch (e) { fail(e); busy(paid, false); }
      });
      const part = h('button', { type: 'button', class: 'btn ghost', onclick: () => partSheet(p, bills, due, again) }, t('roundPart'));
      const out = away.has(p.id)
        ? h('button', { type: 'button', class: 'btn ghost', onclick: () => setAway(p.id, false) }, t('roundBack'))
        : h('button', { type: 'button', class: 'btn ghost', onclick: () => setAway(p.id, true) }, t('roundAway'));
      return h('article', { class: 'card round-card' },
        h('div', { class: 'row between top' },
          h('div', { class: 'grow' }, h('strong', null, p.title),
            h('small', { class: 'muted' }, [p.info.floor ? `${t('floor')} ${p.info.floor}` : null, bills.length > 1 ? t('monthsN', { n: bills.length }) : monthLabel(bills[0].month)].filter(Boolean).join(sep())),
            p.cut_at ? h('span', { class: 'pill bad' }, t('cutState')) : null),
          h('strong', { class: 'amount round-due' }, money(due))),
        h('div', { class: 'round-btns' }, paid, part, out),
        p.info.phone ? h('a', { class: 'link small', href: `tel:+${intlPhone(p.info.phone)}` }, icon('phone'), ltr(p.info.phone)) : null);
    };
    const groups = [];
    let last = null;
    for (const p of here) {
      const bld = p.info.building || t('noBuilding');
      if (bld !== last) {
        const n = here.filter((x) => (x.info.building || t('noBuilding')) === bld).length;
        groups.push(h('h3', { class: 'group-title' }, bld, h('span', { class: 'badge' }, n)));
        last = bld;
      }
      groups.push(card(p));
    }
    render(head(t('round'), null, state.mode === 'collector' ? 'collect' : 'bills'),
      h('section', { class: 'hero-card' }, h('small', null, t('roundLeft', { n: here.length })),
        h('div', { class: 'hero-num' }, money(total)),
        h('div', { class: 'row between' }, h('span', null, t('roundHint')), later.length ? h('span', null, t('roundAwayN', { n: later.length })) : null)),
      people.length ? null : empty(t('allPaid')),
      groups,
      later.length ? h('h3', { class: 'group-title' }, t('roundComeBack'), h('span', { class: 'badge' }, later.length)) : null,
      later.map(card));
  }

  function partSheet(p, bills, due, after) {
    const amount = input('amount', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', value: '' });
    const save = h('button', { type: 'submit', class: 'btn primary block' }, t('recordPayment'));
    const close = sheet(p.title, h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      const a = Math.round(num(amount.value) * 100) / 100;
      if (!(a > 0)) return toast(t('required'), 'bad');
      if (a > due + 0.001) return toast(t('overpayment'), 'bad');
      busy(save, true);
      try {
        const pays = await payOldestFirst(bills, a, d.method);
        close();
        paymentToast(t('paymentSaved'), pays, after);
        after();
      } catch (err) { fail(err); } finally { busy(save, false); }
    } },
      h('div', { class: 'summary' }, h('span', { class: 'muted' }, t('totalOwed')), h('strong', { class: 'amount' }, money(due))),
      field(t('amount'), amount),
      h('div', { class: 'chips' }, [0.25, 0.5, 0.75].map((f) => h('button', { type: 'button', class: 'chip', onclick: () => { amount.value = (Math.round(due * f * 100) / 100).toFixed(2); } }, `${Math.round(f * 100)}%`))),
      segmented('method', [['cash', t('cash')], ['whish', 'Whish'], ['omt', 'OMT'], ['other', t('other')]], 'cash'),
      h('small', { class: 'muted' }, t('oldestFirst')),
      save));
    setTimeout(() => amount.focus(), 250);
  }

  function lateRows() {
    const by = groupOpen();
    return state.people.filter((p) => p.status !== 'pending').map((p) => {
      const bills = by.get(p.id) || [];
      return { p, bills, months: new Set(bills.map((b) => b.month)).size, due: bills.reduce((a, b) => a + owed(b), 0) };
    }).filter((x) => x.months >= 2 || x.p.cut_at).sort((a, b) => b.due - a.due);
  }

  function lateMsg(x) {
    return [t('lateMsg', { biz: state.business.name, name: x.p.info.name || '', amt: money(x.due), n: x.months }),
      x.p.sk && x.p.invite_code ? inviteUrl(x.p) : ''].filter(Boolean).join('\n');
  }

  async function viewLate() {
    await Promise.all([loadPeople(), loadOpenBills()]);
    const rows = lateRows();
    const again = () => viewLate().catch(fail);
    const warnBtn = h('button', { type: 'button', class: 'btn ghost block' }, icon('bell'), t('warnAllPush'));
    warnBtn.addEventListener('click', async () => {
      busy(warnBtn, true);
      try {
        const { data, error } = await sb.rpc('warn_late', { p_subs: rows.filter((x) => x.due > 0).map((x) => x.p.id) });
        if (error) throw error;
        toast(t('warnedN', { n: data }), 'good');
      } catch (e) { fail(e); } finally { busy(warnBtn, false); }
    });
    const withPhone = rows.filter((x) => x.due > 0 && x.p.info.phone);
    render(head(t('lateTitle'), null, 'home'),
      h('p', { class: 'muted' }, t('lateBody')),
      rows.length ? h('div', { class: 'stack' },
        withPhone.length ? h('button', { type: 'button', class: 'btn wa block', onclick: () => msgQueue(withPhone.map((x) => ({ p: x.p, text: lateMsg(x), sub: `${t('monthsN', { n: x.months })}${sep()}${money(x.due)}` })), t('lateTitle')) }, icon('chat'), t('warnAllWa', { n: withPhone.length })) : null,
        warnBtn,
        h('div', { class: 'card flush grid-list' }, rows.map((x) => h('div', { class: 'item static' },
          avatar(x.p.title),
          h('div', { class: 'grow' }, h('strong', null, x.p.title),
            h('small', { class: x.months >= 3 ? 'bad' : 'muted' }, [t('monthsN', { n: x.months }), x.p.info.building].filter(Boolean).join(sep())),
            x.p.cut_at ? h('span', { class: 'pill bad' }, `${t('cutState')}${sep()}${dateLabel(x.p.cut_at)}`) : null),
          h('div', { class: 'end-col' }, h('strong', { class: 'amount' }, money(x.due)),
            h('span', { class: 'row' },
              x.p.info.phone && x.due > 0 ? h('button', { type: 'button', class: 'link', onclick: () => openExternal(waLink(x.p.info.phone, lateMsg(x))) }, 'WhatsApp') : null,
              x.p.cut_at
                ? h('button', { type: 'button', class: 'link ok', onclick: () => reconnectSheet(x, again) }, t('reconnect'))
                : h('button', { type: 'button', class: 'link bad', onclick: async () => {
                  if (!(await confirmBox(t('cutConfirm', { name: x.p.title }), t('cut')))) return;
                  const { error } = await sb.from('subscribers').update({ cut_at: new Date().toISOString() }).eq('id', x.p.id);
                  if (error) return fail(error);
                  toast(t('cutDone', { name: x.p.title }), 'warn');
                  again();
                } }, t('cut'))))))))
        : empty(t('noLate')));
  }

  function reconnectSheet(x, after) {
    const fee = input('fee', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', value: store.get(`fee:${state.business.id}`) || '' });
    const save = h('button', { type: 'submit', class: 'btn primary block' }, t('reconnect'));
    const close = sheet(`${t('reconnect')}${sep()}${x.p.title}`, h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const f = fee.value === '' ? 0 : Math.round(num(fee.value) * 100) / 100;
      if (!(f >= 0) || f > 10000) return toast(t('required'), 'bad');
      busy(save, true);
      try {
        if (f > 0) {
          let target = x.bills.slice().sort((a, b) => b.month.localeCompare(a.month))[0];
          if (!target) {
            const lastBill = await sb.from('bills').select('id').eq('subscriber_id', x.p.id).order('month', { ascending: false }).limit(1).maybeSingle();
            if (lastBill.error) throw lastBill.error;
            target = lastBill.data;
          }
          if (!target) throw new Error('no_bill');
          const r = await sb.rpc('add_fee', { p_bill: target.id, p_amount: f });
          if (r.error) throw r.error;
          store.set(`fee:${state.business.id}`, String(f));
        }
        const { error } = await sb.from('subscribers').update({ cut_at: null }).eq('id', x.p.id);
        if (error) throw error;
        close(); toast(t('reconnected', { name: x.p.title }), 'good'); after();
      } catch (err) { if (String(err && err.message) === 'no_bill') toast(t('noBillForFee'), 'bad'); else fail(err); } finally { busy(save, false); }
    } },
      field(t('reconnectFee'), fee, t('reconnectFeeHint')), save));
  }

  function msgQueue(items, title) {
    let i = 0;
    const body = h('div', { class: 'stack' });
    const close = sheet(title, body);
    const draw = () => {
      if (i >= items.length) {
        body.replaceChildren(h('div', { class: 'empty' }, h('p', null, t('allLinksSent', { n: items.length })),
          h('button', { type: 'button', class: 'btn primary', onclick: () => close() }, t('close'))));
        return;
      }
      const x = items[i];
      const bar = h('div', { class: 'bar dark' }, h('i'));
      bar.firstChild.style.width = `${Math.round((i / items.length) * 100)}%`;
      body.replaceChildren(
        h('small', { class: 'muted' }, t('sendProgress', { i: i + 1, n: items.length })), bar,
        h('div', { class: 'summary' }, h('strong', null, x.p.title), x.sub ? h('span', null, x.sub) : null, h('span', { class: 'muted' }, ltr(x.p.info.phone))),
        h('button', { type: 'button', class: 'btn wa block', onclick: () => { openExternal(waLink(x.p.info.phone, x.text)); i++; draw(); } }, icon('chat'), t('openWhatsApp')),
        h('button', { type: 'button', class: 'btn ghost block', onclick: () => { i++; draw(); } }, t('skip')));
    };
    draw();
  }

  const COST_KINDS = ['diesel', 'oil', 'repair', 'salary', 'other'];

  async function viewCosts() {
    const biz = state.business;
    const m = monthDate(state.month);
    const next = monthDate(shiftMonth(state.month, 1));
    const [exp, bills] = await Promise.all([
      sb.from('expenses').select('*').eq('business_id', biz.id).gte('day', m).lt('day', next).order('day', { ascending: false }),
      sb.from('bills').select('amount, paid_amount, kwh, fixed_fee, billing_type').eq('business_id', biz.id).eq('month', m)
    ]);
    if (exp.error) throw exp.error;
    if (bills.error) throw bills.error;
    const list = exp.data;
    for (const x of list) x.text = x.note ? ((await V.dec(state.bk, x.note)) || {}).t || '' : '';
    const sum = (arr, f) => arr.reduce((a, x) => a + Number(f(x) || 0), 0);
    const costs = sum(list, (x) => x.amount);
    const billed = sum(bills.data, (b) => b.amount);
    const collected = sum(bills.data, (b) => b.paid_amount);
    const kwh = sum(bills.data, (b) => b.kwh);
    const fixedIncome = sum(bills.data, (b) => (b.billing_type === 'metered' ? b.fixed_fee : b.amount));
    const liters = sum(list.filter((x) => x.kind === 'diesel'), (x) => x.liters);
    const diesel = sum(list.filter((x) => x.kind === 'diesel'), (x) => x.amount);
    const breakEven = kwh > 0 ? Math.max(0, (costs - fixedIncome) / kwh) : null;
    const withMargin = kwh > 0 ? Math.max(0, (costs * 1.2 - fixedIncome) / kwh) : null;
    const again = () => viewCosts().catch(fail);
    const stat = (label, value, cls) => h('div', { class: 'item static' }, h('div', { class: 'grow' }, h('span', null, label)), h('strong', { class: `amount ${cls || ''}` }, value));
    const kind = segmented('kind', COST_KINDS.map((k) => [k, t(`cost_${k}`)]), 'diesel');
    const litersField = field(t('liters'), input('liters', { type: 'number', step: '0.1', min: '0', inputmode: 'decimal' }));
    kind.addEventListener('change', () => { litersField.hidden = kind.querySelector('input:checked').value !== 'diesel'; });
    const save = h('button', { type: 'submit', class: 'btn primary block' }, t('addCost'));
    const today = new Date().toISOString().slice(0, 10);
    const inMonth = today >= m && today < next;
    render(head(t('costsTitle'), monthSwitch(again), 'more'),
      h('div', { class: 'cols' },
        h('div', { class: 'stack' },
          h('section', { class: `hero-card ${collected - costs >= 0 ? 'clear' : ''}` },
            h('small', null, t('profitMonth')),
            h('div', { class: 'hero-num' }, money(collected - costs)),
            h('div', { class: 'row between' }, h('span', null, t('ifAllPay')), h('strong', { class: 'amount' }, money(billed - costs)))),
          h('section', { class: 'card flush' },
            stat(t('collectedTotal'), money(collected), 'ok'),
            stat(t('costsTotal'), money(costs), costs > 0 ? 'bad' : ''),
            liters > 0 ? stat(t('dieselLiters'), `${Math.round(liters)} L${sep()}${money(diesel / liters)}/L`) : null,
            stat(t('kwhTotal'), String(Math.round(kwh))),
            breakEven !== null ? stat(t('breakEven'), `${money(breakEven)}/kWh`) : null,
            withMargin !== null ? stat(t('withMargin'), `${money(withMargin)}/kWh`, 'ok') : null),
          kwh > 0 && costs > 0 ? h('p', { class: 'muted small' }, t('priceAdvice')) : null),
        h('div', { class: 'stack' },
          h('form', { class: 'card stack', novalidate: true, onsubmit: async (e) => {
            e.preventDefault();
            const d = formData(e.target);
            const amount = Math.round(num(d.amount) * 100) / 100;
            if (!(amount > 0)) return toast(t('required'), 'bad');
            const row = { business_id: biz.id, kind: d.kind, amount, day: d.day || (inMonth ? today : m) };
            if (d.kind === 'diesel' && num(d.liters) > 0) row.liters = num(d.liters);
            if (clean(d.note, 200)) row.note = await V.enc(state.bk, { t: clean(d.note, 200) });
            busy(save, true);
            try {
              const res = await sb.from('expenses').insert(row);
              if (res.error) throw res.error;
              toast(t('saved'), 'good'); again();
            } catch (err) { fail(err); } finally { busy(save, false); }
          } },
            h('h3', null, t('addCost')), kind,
            h('div', { class: 'grid2' },
              field(t('amount'), input('amount', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal' })),
              field(t('date'), input('day', { type: 'date', value: inMonth ? today : m, min: m, max: monthDate(shiftMonth(state.month, 1)) }))),
            litersField,
            field(t('note'), input('note', { maxlength: 200 })),
            save),
          list.length ? h('section', { class: 'card flush' }, h('h3', { class: 'card-title' }, t('costsList')),
            list.map((x) => h('div', { class: 'item static' },
              h('div', { class: 'grow' }, h('strong', null, t(`cost_${x.kind}`)),
                h('small', { class: 'muted' }, [dateLabel(x.day), x.liters ? `${Number(x.liters)} L` : null, x.text].filter(Boolean).join(sep()))),
              h('div', { class: 'end-col' }, h('strong', { class: 'amount' }, money(x.amount)),
                h('button', { type: 'button', class: 'link bad', onclick: async () => {
                  const { error } = await sb.from('expenses').delete().eq('id', x.id);
                  if (error) return fail(error);
                  again();
                  toast(t('costRemoved'), null, { label: t('undoAction'), fn: async () => {
                    const back = { business_id: x.business_id, kind: x.kind, amount: x.amount, day: x.day, liters: x.liters, note: x.note };
                    const r = await sb.from('expenses').insert(back);
                    if (r.error) return fail(r.error);
                    again();
                  } });
                } }, t('delete'))))))
            : empty(t('noCosts')))));
  }

  function payClaimRow(c, after) {
    const p = state.people.find((x) => x.id === c.subscriber_id);
    const name = p ? p.title : '—';
    const ok = h('button', { type: 'button', class: 'btn primary small' }, t('confirm'));
    ok.addEventListener('click', async () => {
      busy(ok, true);
      try {
        const left = c.bills ? owed(c.bills) : 0;
        if (left > 0) await payBill(c.bills, Math.min(Number(c.amount), left), c.method, [c.method === 'omt' ? 'OMT' : 'Whish', c.refText].filter(Boolean).join(' '));
        const { error } = await sb.from('payment_claims').update({ status: 'accepted', decided_at: new Date().toISOString() }).eq('id', c.id);
        if (error) throw error;
        toast(left > 0 ? t('claimAccepted', { name }) : t('alreadyPaidBill'), left > 0 ? 'good' : 'warn');
        after();
      } catch (e) { fail(e); busy(ok, false); }
    });
    const no = h('button', { type: 'button', class: 'link bad', onclick: async () => {
      if (!(await confirmBox(t('rejectClaim'), t('reject')))) return;
      const { error } = await sb.from('payment_claims').update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('id', c.id);
      if (error) return fail(error);
      after();
    } }, t('reject'));
    return h('div', { class: 'item static' }, avatar(name),
      h('div', { class: 'grow' }, h('strong', null, name),
        h('small', { class: 'muted' }, [c.method === 'omt' ? 'OMT' : c.method === 'whish' ? 'Whish' : t('other'), c.bills ? monthLabel(c.bills.month) : null, c.refText ? `${t('ref')}: ${c.refText}` : null].filter(Boolean).join(sep()))),
      h('div', { class: 'end-col' }, h('strong', { class: 'amount' }, money(c.amount)), h('span', { class: 'row' }, no, ok)));
  }

  function readClaimRow(c, after) {
    const p = state.people.find((x) => x.id === c.subscriber_id);
    const name = p ? p.title : '—';
    const info = h('small', { class: 'muted' }, `${monthLabel(c.month)}${sep()}${Number(c.value)}`);
    sb.from('readings').select('value').eq('subscriber_id', c.subscriber_id).lt('month', c.month).order('month', { ascending: false }).limit(1).maybeSingle().then(({ data }) => {
      const prev = data ? Number(data.value) : p ? Number(p.initial_reading) : null;
      if (prev === null) return;
      const diff = Number(c.value) - prev;
      info.textContent = `${monthLabel(c.month)}${sep()}${t('prev')}: ${prev} → ${Number(c.value)} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)} kWh)`;
      if (diff < 0) info.className = 'bad';
    });
    const ok = h('button', { type: 'button', class: 'btn primary small' }, t('approve'));
    ok.addEventListener('click', async () => {
      busy(ok, true);
      try {
        const biz = state.business.id;
        let photo = false;
        if (c.photo) {
          const src = photoPath(biz, c.subscriber_id, c.month).replace(/\.bin$/, '-sub.bin');
          const dl = await sb.storage.from('meters').download(src);
          if (!dl.error) {
            const up = await sb.storage.from('meters').upload(photoPath(biz, c.subscriber_id, c.month), new Uint8Array(await dl.data.arrayBuffer()), { upsert: true, contentType: 'application/octet-stream' });
            if (up.error) throw up.error;
            photo = true;
          }
        }
        const cur = await sb.from('readings').select('id').eq('subscriber_id', c.subscriber_id).eq('month', c.month).maybeSingle();
        if (cur.error) throw cur.error;
        const row = Object.assign({ value: Number(c.value) }, photo ? { photo: true } : {});
        const res = cur.data
          ? await sb.from('readings').update(row).eq('id', cur.data.id)
          : await sb.from('readings').insert(Object.assign({ subscriber_id: c.subscriber_id, month: c.month }, row));
        if (res.error) throw res.error;
        const { error } = await sb.from('reading_claims').update({ status: 'accepted', decided_at: new Date().toISOString() }).eq('id', c.id);
        if (error) throw error;
        toast(t('readingApproved', { name }), 'good');
        after();
      } catch (e) { fail(e); busy(ok, false); }
    });
    const no = h('button', { type: 'button', class: 'link bad', onclick: async () => {
      const { error } = await sb.from('reading_claims').update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('id', c.id);
      if (error) return fail(error);
      after();
    } }, t('reject'));
    const see = c.photo && p && p.sk ? h('button', { type: 'button', class: 'link', onclick: () => showPhoto(p.sk, state.business.id, c.subscriber_id, c.month, name, photoPath(state.business.id, c.subscriber_id, c.month).replace(/\.bin$/, '-sub.bin')) }, icon('camera')) : null;
    return h('div', { class: 'item static' }, avatar(name),
      h('div', { class: 'grow' }, h('strong', null, name), info),
      h('div', { class: 'end-col' }, h('strong', { class: 'amount' }, String(Number(c.value))), h('span', { class: 'row' }, see, no, ok)));
  }

  function todayCard(x) {
    const go2 = (label, fn, sub) => ({ label, fn, sub });
    let a = null;
    if (x.pending) a = go2(t('todayJoin', { n: x.pending }), () => requestSheet(x.pendingList[0], viewHome));
    else if (x.payClaims) a = go2(t('todayClaims', { n: x.payClaims }), () => document.getElementById('claims-card')?.scrollIntoView({ behavior: 'smooth' }));
    else if (x.readClaims) a = go2(t('todayReadClaims', { n: x.readClaims }), () => document.getElementById('rclaims-card')?.scrollIntoView({ behavior: 'smooth' }));
    else if (!x.tariff) a = go2(t('todayPrices'), x.setPrices);
    else if (x.missing) a = go2(t('todayReadings', { n: x.missing }), () => go('readings'), x.missingBuilding ? t('todayStartAt', { b: x.missingBuilding }) : null);
    else if (!x.bills) a = go2(t('todayBills'), x.makeBills);
    else if (x.unsent) a = go2(t('todaySend', { n: x.unsent }), x.send);
    else if (x.unpaid) a = go2(t('todayCollect', { n: x.unpaid }), () => go('round'));
    else if (x.late) a = go2(t('todayLate', { n: x.late }), () => go('late'));
    if (!a) return h('section', { class: 'today done' }, h('span', { class: 'row-ic' }, icon('check')), h('div', { class: 'grow' }, h('strong', null, t('todayDone')), h('small', { class: 'muted' }, t('todayDoneSub'))));
    return h('section', { class: 'today' },
      h('div', { class: 'grow' }, h('small', { class: 'muted' }, t('todayNext')), h('strong', null, a.label), a.sub ? h('small', { class: 'muted' }, a.sub) : null),
      h('button', { type: 'button', class: 'btn primary small', onclick: a.fn }, t('todayGo')));
  }

  function usageChart(bills) {
    const list = bills.slice(0, 12).reverse();
    if (list.length < 2) return null;
    const metered = list.some((b) => b.billing_type === 'metered' && b.kwh !== null);
    const val = (b) => (metered ? Number(b.kwh || 0) : Number(b.amount));
    const max = Math.max(...list.map(val), 1);
    const last3 = bills.slice(0, 3).map((b) => Number(b.amount));
    const est = last3.reduce((a, v) => a + v, 0) / last3.length;
    const short = (d) => { const [y, mo] = String(d).slice(0, 7).split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString(state.lang === 'ar' ? 'ar-LB' : 'en-GB', { month: 'short' }); };
    return h('section', { class: 'card stack' },
      h('div', { class: 'row between' }, h('h3', null, metered ? t('usageKwh') : t('usageAmount')), h('small', { class: 'muted' }, t('lastMonths', { n: list.length }))),
      h('div', { class: 'bars', role: 'img', 'aria-label': list.map((b) => `${monthLabel(b.month)}: ${val(b)}`).join(', ') },
        list.map((b, i) => {
          const bar = h('i');
          bar.style.height = `${Math.max(4, Math.round((val(b) / max) * 100))}%`;
          return h('div', { class: `bar-col ${i === list.length - 1 ? 'now' : ''}` }, h('small', null, String(Math.round(val(b)))), h('div', { class: 'bar-track' }, bar), h('small', { class: 'muted' }, short(b.month)));
        })),
      h('div', { class: 'row between' }, h('span', null, t('nextEstimate')), h('strong', { class: 'amount' }, `≈ ${money(est)}`)));
  }

  function claimSheet(s, b, after) {
    const left = Math.round((Number(b.amount) - Number(b.paid_amount)) * 100) / 100;
    const amount = input('amount', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', value: left.toFixed(2) });
    const save = h('button', { type: 'submit', class: 'btn primary block' }, t('sendToOwner'));
    const close = sheet(t('iPaid'), h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      const a = Math.round(num(amount.value) * 100) / 100;
      if (!(a > 0) || a > left + 0.001) return toast(t('overpayment'), 'bad');
      busy(save, true);
      try {
        const ref = clean(d.ref, 80);
        const { error } = await sb.rpc('claim_payment', { p_bill: b.id, p_method: d.method, p_amount: a, p_ref: ref && s.sk ? await V.enc(s.sk, { t: ref }) : null });
        if (error) throw error;
        close(); toast(t('claimSent'), 'good'); after();
      } catch (err) { fail(err); } finally { busy(save, false); }
    } },
      h('p', { class: 'muted' }, t('iPaidBody', { biz: s.business.name })),
      h('small', { class: 'muted' }, monthLabel(b.month)),
      segmented('method', [['whish', 'Whish'], ['omt', 'OMT'], ['other', t('other')]], 'whish'),
      field(t('amount'), amount),
      field(t('ref'), input('ref', { maxlength: 80, placeholder: t('refHint') })),
      save));
  }

  function readingSheet(s, after) {
    const m = monthDate(currentMonth());
    const value = input('value', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal' });
    let photoBytes = null;
    const camBtn = h('button', { type: 'button', class: 'btn ghost block' }, icon('camera'), t('photoTake'));
    camBtn.addEventListener('click', async () => {
      const file = await pickPhoto();
      if (!file) return;
      busy(camBtn, true);
      try { photoBytes = await shrinkPhoto(file); camBtn.classList.add('has'); camBtn.lastChild.textContent = t('photoReady'); } catch (e) { fail(e); } finally { busy(camBtn, false); }
    });
    const save = h('button', { type: 'submit', class: 'btn primary block' }, t('sendToOwner'));
    const close = sheet(t('sendReading'), h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const v = num(value.value);
      if (!(v >= 0) || value.value === '') return toast(t('required'), 'bad');
      busy(save, true);
      try {
        if (photoBytes && s.sk) {
          const enc = await V.encBytes(s.sk, photoBytes);
          const up = await sb.storage.from('meters').upload(photoPath(s.business_id, s.id, m).replace(/\.bin$/, '-sub.bin'), enc, { upsert: true, contentType: 'application/octet-stream' });
          if (up.error) throw up.error;
        }
        const { error } = await sb.rpc('submit_reading', { p_sub: s.id, p_month: m, p_value: v, p_photo: !!photoBytes });
        if (error) throw error;
        close(); toast(t('readingSent'), 'good'); after();
      } catch (err) {
        if (/already_read/.test((err && err.message) || '')) toast(t('alreadyRead'), 'warn'); else fail(err);
      } finally { busy(save, false); }
    } },
      h('p', { class: 'muted' }, t('sendReadingBody', { month: monthLabel(m) })),
      field(t('currentReading'), value),
      camBtn,
      save));
    setTimeout(() => value.focus(), 250);
  }

  function makePdf(jpeg, w, hgt) {
    const enc = new TextEncoder();
    const W = 420; const H = Math.round((hgt / w) * W);
    const parts = []; const offsets = []; let len = 0;
    const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n${body}\nendobj\n`); };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
    offsets[4] = len;
    push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${hgt} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg);
    push('\nendstream\nendobj\n');
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const xref = len;
    push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(offsets[n]).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  async function receiptImage(bizName, title, lines) {
    try { await document.fonts.load('700 20px "IBM Plex Sans Arabic"'); await document.fonts.load('400 20px "IBM Plex Sans Arabic"'); } catch {}
    const k = 2; const W = 600; const pad = 36; const rowH = 46;
    const H = 170 + lines.length * rowH + 90;
    const c = document.createElement('canvas');
    c.width = W * k; c.height = H * k;
    const g = c.getContext('2d');
    g.scale(k, k);
    const rtl = state.lang === 'ar';
    g.direction = rtl ? 'rtl' : 'ltr';
    const font = (wt, px) => `${wt} ${px}px "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif`;
    const start = rtl ? W - pad : pad; const end = rtl ? pad : W - pad;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#121a24'; g.fillRect(0, 0, W, 130);
    g.fillStyle = '#ffb21a'; g.fillRect(0, 126, W, 4);
    g.textAlign = rtl ? 'right' : 'left';
    g.fillStyle = '#f2f5f8'; g.font = font(700, 30); g.fillText(bizName, start, 62);
    g.fillStyle = '#93a1b2'; g.font = font(400, 18); g.fillText(title, start, 98);
    let y = 170;
    for (const [label, value] of lines) {
      g.textAlign = rtl ? 'right' : 'left'; g.fillStyle = '#5d6877'; g.font = font(400, 18); g.fillText(label, start, y);
      g.textAlign = rtl ? 'left' : 'right'; g.fillStyle = '#0f1620'; g.font = font(700, 19); g.fillText(String(value), end, y);
      g.fillStyle = '#dde3ea'; g.fillRect(pad, y + 16, W - pad * 2, 1);
      y += rowH;
    }
    g.textAlign = 'center'; g.fillStyle = '#8a95a3'; g.font = font(400, 15);
    g.fillText(t('receiptFooter'), W / 2, H - 40);
    const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.9));
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height };
  }

  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  async function shareFile(name, bytes, type) {
    if (isNative && plugins.Filesystem && plugins.Share) {
      try {
        const res = await plugins.Filesystem.writeFile({ path: name, data: b64(bytes), directory: 'CACHE' });
        await plugins.Share.share({ title: name, url: res.uri });
      } catch (e) { if (!/cancel/i.test((e && e.message) || '')) fail(e); }
      return;
    }
    const file = new File([bytes], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && window.matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ files: [file] }); } catch {}
      return;
    }
    const url = URL.createObjectURL(file);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function receiptPdf(bizName, title, lines, no) {
    const img = await receiptImage(bizName, title, lines);
    await shareFile(`receipt-${no}.pdf`, makePdf(img.jpeg, img.w, img.h), 'application/pdf');
  }

  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  let digitObs = null;
  function fixDigits(node) {
    const p = node.parentElement;
    if (!p || p.closest('input, textarea, script, style, [data-latin]')) return;
    if (/[0-9]/.test(node.nodeValue)) node.nodeValue = node.nodeValue.replace(/[0-9]/g, (d) => AR_DIGITS[d]);
  }
  function arabizeTree(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) fixDigits(n);
  }
  function applyDisplayPrefs() {
    const root = document.documentElement;
    root.classList.toggle('big', store.get('big') === '1');
    const on = state.lang === 'ar' && store.get('arnum') === '1';
    if (on && !digitObs) {
      digitObs = new MutationObserver((muts) => {
        for (const mu of muts) {
          if (mu.type === 'characterData') fixDigits(mu.target);
          mu.addedNodes.forEach((n) => { if (n.nodeType === 3) fixDigits(n); else if (n.nodeType === 1) arabizeTree(n); });
        }
      });
      digitObs.observe(document.body, { childList: true, subtree: true, characterData: true });
      arabizeTree(document.body);
    } else if (!on && digitObs) {
      digitObs.disconnect();
      digitObs = null;
    }
  }

  const recentErrors = [];
  const lastLogged = {};
  function logContext(where) {
    return {
      where: where || null, route: state.route || null, lang: state.lang, online: navigator.onLine, native: isNative,
      homeScreen: standalone(), screen: `${screen.width}x${screen.height}`, ua: navigator.userAgent.slice(0, 220), path: location.pathname
    };
  }
  function logError(e, where) {
    try {
      const msg = String((e && (e.stack || e.message)) || e || '').slice(0, 1500);
      if (!msg || /failed to fetch|networkerror|load failed|aborterror|the operation was aborted/i.test(msg)) return;
      recentErrors.unshift(`${new Date().toISOString().slice(11, 19)} ${msg.split('\n')[0].slice(0, 200)}`);
      recentErrors.length = Math.min(recentErrors.length, 5);
      const key = msg.slice(0, 200);
      if (lastLogged[key] && Date.now() - lastLogged[key] < 60000) return;
      lastLogged[key] = Date.now();
      sb.rpc('log_event', {
        p_level: 'error', p_message: msg, p_context: logContext(where), p_mode: state.mode || (state.user ? 'none' : 'guest'),
        p_version: cfg.version, p_business: state.business ? state.business.id : null
      }).then(() => {}, () => {});
    } catch {}
  }

  function reportSheet() {
    const text = h('textarea', { name: 'msg', rows: 5, maxlength: 1500, placeholder: t('reportHint') });
    const save = h('button', { type: 'submit', class: 'btn primary block' }, t('reportSend'));
    const close = sheet(t('reportProblem'), h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      const msg = clean(d.msg, 1500);
      if (msg.length < 3) return toast(t('required'), 'bad');
      busy(save, true);
      try {
        const ctx = d.details ? Object.assign(logContext('report'), { errors: recentErrors.slice() }) : null;
        const { error } = await sb.rpc('log_event', {
          p_level: 'report', p_message: msg, p_context: ctx, p_mode: state.mode || 'guest',
          p_version: cfg.version, p_business: state.business ? state.business.id : null
        });
        if (error) throw error;
        close(); toast(t('reportSent'), 'good');
      } catch (err) { fail(err); } finally { busy(save, false); }
    } },
      h('p', { class: 'muted' }, t('reportBody')),
      field(t('message'), text),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'details', checked: true }), h('span', null, t('reportDetails'))),
      save));
    setTimeout(() => text.focus(), 250);
  }

  async function viewLogs(level) {
    if (!state.isAdmin) { state.route = defaultRoute(); return route(); }
    level = level || 'all';
    let q = sb.from('app_logs').select('*').order('created_at', { ascending: false }).limit(200);
    if (level !== 'all') q = q.eq('level', level);
    const { data, error } = await q;
    if (error) throw error;
    const again = () => viewLogs(level).catch(fail);
    const when = (d) => new Date(d).toLocaleString(state.lang === 'ar' ? 'ar-LB' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    render(head(t('appLogs'), h('button', { type: 'button', class: 'icon-btn', onclick: again, 'aria-label': t('refresh') }, '↻'), 'more'),
      h('p', { class: 'muted' }, t('appLogsBody')),
      h('div', { class: 'chips' }, ['all', 'report', 'error'].map((f) => h('button', { type: 'button', class: f === level ? 'chip on' : 'chip', onclick: () => viewLogs(f).catch(fail) }, t(`log_${f}`)))),
      data.length ? h('div', { class: 'card flush' }, data.map((x) => h('details', { class: 'item col log-item' },
        h('summary', { class: 'row between' },
          h('span', { class: 'grow log-line' }, h('span', { class: `pill ${x.level === 'report' ? 'partial' : 'unpaid'}` }, t(`log_${x.level}`)), ' ', x.message.split('\n')[0].slice(0, 140)),
          h('small', { class: 'muted' }, when(x.created_at))),
        h('div', { class: 'stack tight detail' },
          h('small', { class: 'muted' }, [x.mode, x.anon ? t('linkUser') : null, x.version && `v${x.version}`, x.user_id && `#${String(x.user_id).slice(0, 8)}`].filter(Boolean).join(sep())),
          h('pre', { class: 'log-pre', 'data-latin': '' }, x.message),
          x.context ? h('pre', { class: 'log-pre', 'data-latin': '' }, JSON.stringify(x.context, null, 2)) : null,
          h('button', { type: 'button', class: 'link bad', onclick: async () => {
            const res = await sb.from('app_logs').delete().eq('id', x.id);
            if (res.error) return fail(res.error);
            again();
          } }, t('delete'))))))
        : empty(t('noLogs')));
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
        menuRow(t('collectors'), t('collectorsShort'), () => go('collectors'), 'people'),
        menuRow(t('reports'), t('reportsShort'), () => go('reports'), 'bills'),
        menuRow(t('costsTitle'), t('costsShort'), () => go('costs'), 'tag'),
        menuRow(t('lateTitle'), t('lateMenuShort'), () => go('late'), 'bell'),
        menuRow(t('inviteAll'), t('inviteAllShort'), () => go('invite'), 'send'),
        menuRow(t('importTitle'), t('importShort'), importSheet, 'people'),
        menuRow(t('tabNotices'), t('noticesShort'), () => go('notices'), 'bell'),
        menuRow(t('reminders'), reminderLabel(biz.reminder_days ?? 7), reminderSheet, 'bell'),
        menuRow(t('stepPrice'), monthLabel(monthDate(state.month)), async () => {
          const cur = await sb.from('tariffs').select('*').eq('business_id', biz.id).eq('month', monthDate(state.month)).maybeSingle();
          tariffSheet(cur.data, () => {});
        }, 'tag'),
        menuRow(t('business'), [biz.name, ltr(biz.phone)].filter(Boolean).join(sep()), bizSheet, 'bolt'),
        state.subs.length ? menuRow(t('switchToSubscriber'), null, () => { state.mode = 'subscriber'; go('mybills'); }, 'home') : null));
    } else if (state.mode === 'collector') {
      parts.push(h('section', { class: 'card flush' },
        menuRow(state.business.name, state.role.name, null, 'bolt'),
        menuRow(t('round'), t('roundShort'), () => go('round'), 'people'),
        state.subs.length ? menuRow(t('switchToSubscriber'), null, () => { state.mode = 'subscriber'; go('mybills'); }, 'home') : null));
    } else {
      parts.push(h('section', { class: 'card flush' },
        state.subs.filter((s) => s.status === 'active').map((s) => menuRow(t('myDetails'), [s.info.name, ltr(s.info.phone), s.business.name].filter(Boolean).join(sep()), () => myInfoSheet(s), 'people')),
        menuRow(t('addGenerator'), t('addGeneratorShort'), viewEnterCode, 'plus'),
        state.ownBusiness ? menuRow(t('switchToOwner'), null, () => { state.mode = 'owner'; go('home'); }, 'bolt') : null,
        state.roles.length ? menuRow(t('switchToCollector'), null, () => { state.mode = 'collector'; go('collect'); }, 'check') : null));
    }
    parts.push(h('section', { class: 'card flush' },
      pushStatus() !== 'none' ? menuRow(t('notifications'), pushLabel(), () => togglePush(viewMore), 'bell') : null,
      menuRow(t('language'), state.lang === 'ar' ? 'العربية' : 'English', switchLang, 'globe'),
      menuRow(t('textSize'), store.get('big') === '1' ? t('textLarge') : t('textNormal'), () => { if (store.get('big') === '1') store.del('big'); else store.set('big', '1'); applyDisplayPrefs(); viewMore(); }, 'text'),
      state.lang === 'ar' ? menuRow(t('numbers'), store.get('arnum') === '1' ? '١٢٣' : '123', () => {
        if (store.get('arnum') === '1') { store.del('arnum'); applyDisplayPrefs(); route(); } else { store.set('arnum', '1'); applyDisplayPrefs(); viewMore(); }
      }, 'hash') : null,
      menuRow(t('reportProblem'), t('reportShort'), reportSheet, 'chat'),
      state.isAdmin ? menuRow(t('appLogs'), t('appLogsShort'), () => go('logs'), 'bills') : null,
      menuRow(t('security'), t('securityShort'), null, 'lock')));
    parts.push(h('button', { type: 'button', class: 'btn danger ghost block', onclick: async () => {
      if (state.user.is_anonymous && !(await confirmBox(t('leaveConfirm'), t('signOut')))) return;
      signOut();
    } }, t('signOut')),
      h('p', { class: 'muted center small' }, [state.user.email, `${t('version')} ${cfg.version}`].filter(Boolean).join(sep())));
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
        state.ownBusiness = data; state.business = data; close(); toast(t('saved'), 'good'); viewMore();
      } catch (err) { fail(err); } finally { busy(save, false); }
    } },
      field(t('businessName'), input('name', { required: true, maxlength: 120, value: biz.name })),
      field(t('phone'), input('phone', { type: 'tel', required: true, maxlength: 30, value: biz.phone || '', inputmode: 'tel' })),
      field(t('area'), input('area', { maxlength: 120, value: biz.area || '' })),
      field(t('lbpRate'), input('lbp_rate', { type: 'number', step: '1', min: '1', value: biz.lbp_rate, inputmode: 'decimal' })),
      save));
  }

  async function signOut() {
    if (state.ownBusiness) { store.del(`bk:${state.ownBusiness.id}`); store.del(`snap:${state.ownBusiness.id}`); }
    memo.clear();
    store.del('lastMode');
    await sb.auth.signOut();
    Object.assign(state, {
      user: null, pw: null, business: null, ownBusiness: null, bk: null, priv: null, subs: [], roles: [], role: null, mode: null,
      people: [], collectors: [], openBills: [], invite: null, join: null, cinvite: null
    });
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    route();
  }

  async function fastStart() {
    try {
      if (state.mode || state.user.is_anonymous || state.invite || state.join || state.cinvite || state.route !== 'home') return;
      if (store.get('lastMode') !== 'owner') return;
      const ctx = JSON.parse(store.get(`ctx:${state.user.id}`) || 'null');
      const bk = ctx && store.get(`bk:${ctx.id}`);
      const row = ctx && JSON.parse(store.get(`bkr:${ctx.id}`) || 'null');
      if (!bk || !row) return;
      state.ownBusiness = ctx; state.business = ctx; state.mode = 'owner';
      if (!(await adoptKey(row, bk)) || !(await loadSnapshot(ctx))) { state.mode = null; state.bk = null; state.ownBusiness = null; state.business = null; return; }
      if (navigator.onLine) verifyKeys(ctx, bk);
      await route();
    } catch (e) { console.error(e); }
  }

  async function boot(force) {
    if (holdBoot && !force) return;
    if (!state.user && !state.mode) {
      const early = storedUser();
      if (early) { state.user = early; await fastStart(); }
    }
    const { data } = await sb.auth.getSession();
    state.user = data.session ? data.session.user : null;
    if (!state.user && !navigator.onLine) state.user = storedUser();
    if (!state.user && state.mode) Object.assign(state, { mode: null, business: null, ownBusiness: null, bk: null, priv: null });
    if (state.user) await fastStart();
    try {
      if (!state.user && (state.invite || state.join || state.cinvite)) await ensureSession();
      else if (state.user) await loadContext();
    } catch (e) { state.invite = null; state.join = null; state.cinvite = null; fail(e); }
    route();
  }

  function storedUser() {
    try {
      const ref = new URL(cfg.supabaseUrl).hostname.split('.')[0];
      const raw = JSON.parse(store.get(`sb-${ref}-auth-token`) || 'null');
      return raw && raw.user ? raw.user : null;
    } catch { return null; }
  }

  window.addEventListener('online', () => {
    memo.clear();
    syncDrafts().then((n) => { if (n && state.route === 'home') route(); }).catch(() => {});
  });

  sb.auth.onAuthStateChange((event, session) => {
    const uid = session ? session.user.id : null;
    if (uid === lastUid) return;
    lastUid = uid;
    setTimeout(boot, 0);
  });

  let lastHidden = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { lastHidden = Date.now(); return; }
    if (pendingReload && !document.querySelector('.sheet-wrap')) { location.reload(); return; }
    if (lastHidden && Date.now() - lastHidden > 120000 && state.user && state.mode && !document.querySelector('.sheet-wrap')) { memo.clear(); route(); }
  });

  let pendingReload = false;
  if ('serviceWorker' in navigator && window.isSecureContext && /^https?:$/.test(location.protocol) && !isNative) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      const busyNow = document.querySelector('.sheet-wrap') || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName));
      if (busyNow) pendingReload = true; else location.reload();
    });
    navigator.serviceWorker.register('sw.js').then((reg) => {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  }

  // iPhone Home Screen apps can start with a viewport shorter than the screen, which lifts
  // bottom-anchored bars. Anchor them to the real screen height instead.
  function fixViewport() {
    const root = document.documentElement;
    if (isNative || !isIOS() || !standalone()) return;
    const probe = h('div', { class: 'safe-probe' });
    document.body.append(probe);
    const safeTop = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    probe.remove();
    if (safeTop < 20) return;
    const portrait = matchMedia('(orientation: portrait)').matches;
    const hgt = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    if (!hgt || hgt < innerHeight) { root.classList.remove('ios-app'); return; }
    root.style.setProperty('--app-h', `${hgt}px`);
    root.classList.add('ios-app');
  }
  fixViewport();
  window.addEventListener('error', (ev) => logError(ev.error || ev.message, 'window'));
  window.addEventListener('unhandledrejection', (ev) => logError(ev.reason, 'promise'));
  window.addEventListener('orientationchange', () => setTimeout(fixViewport, 300));
  window.addEventListener('resize', fixViewport);
  setTimeout(() => document.body.classList.remove('boot'), 10000);

  applyLang();
})();
