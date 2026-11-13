(() => {
  'use strict';

  const cfg = window.APP_CONFIG;
  const V = window.Vault;
  const isNative = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  const plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
  let dataVer = 0;
  const READ_RPC = /\/rpc\/(my_subscriptions|my_collector_roles|collector_subscribers|join_preview)$/;
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
    camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z'
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
    $app.replaceChildren(h('div', { class: 'view' }, list.filter((n) => !fabs.includes(n))));
    $fab.replaceChildren(...fabs);
    window.scrollTo(0, 0);
  }

  function meter(pct) {
    const n = 24;
    const on = pct > 0 ? Math.max(1, Math.round(pct * n)) : 0;
    const el = h('div', { class: 'meter', role: 'img', 'aria-label': `${Math.round(pct * 100)}%` });
    for (let i = 0; i < n; i++) el.append(h('i', { class: i < on ? 'on' : null }));
    return el;
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
  async function cached(key, fn, ttl) {
    const hit = memo.get(key);
    if (hit && hit.ver === dataVer && Date.now() - hit.at < (ttl || 30000)) return hit.val;
    const entry = { ver: dataVer, at: Date.now(), val: fn() };
    memo.set(key, entry);
    try { return await entry.val; } catch (e) { if (memo.get(key) === entry) memo.delete(key); throw e; }
  }
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
  const parents = { readings: 'home', notices: 'more', invite: 'more', collectors: 'more', reports: 'more' };
  const PAY = 'id, bill_id, amount, method, note, paid_at, collector_id, lbp_amount, lbp_rate';

  const $lens = h('span', { class: 'lens', 'aria-hidden': 'true' });
  let navList = [];

  function drawNav(show) {
    const list = show === false || !state.user ? null : state.mode === 'owner' && state.bk ? ownerTabs : state.mode === 'collector' ? collectorTabs : state.mode === 'subscriber' ? subTabs : null;
    document.body.classList.toggle('has-nav', !!list);
    navList = list || [];
    if (!list) { $dock.replaceChildren(); $side.replaceChildren(); return; }
    const active = parents[state.route] || state.route;
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
    if (e.type === 'pointerup' && target && target[0] !== (parents[state.route] || state.route)) {
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
        ? { home: viewHome, people: viewPeople, bills: viewBills, more: viewMore, readings: viewReadings, notices: viewNotices, invite: viewInviteAll, collectors: viewCollectors, reports: viewReports }
        : state.mode === 'collector'
          ? { collect: viewCollect, today: viewToday, more: viewMore }
          : { mybills: viewMyBills, subnotices: viewSubNotices, more: viewMore };
      if (!views[state.route]) state.route = defaultRoute();
      drawNav();
      if (!navigator.onLine && state.route !== 'readings') return viewOffline();
      if (!$app.querySelector('.head')) render(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton short' }));
      await views[state.route]();
    } catch (e) {
      if (isNetErr(e) && state.user && state.mode) return viewOffline();
      fail(e);
    }
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
      [biz, subs, roles] = await Promise.all([
        state.user.is_anonymous ? Promise.resolve({ data: null }) : sb.from('businesses').select('*').eq('owner_id', uid).maybeSingle(),
        sb.rpc('my_subscriptions'),
        sb.rpc('my_collector_roles')
      ]);
      for (const r of [biz, subs, roles]) if (r.error) throw r.error;
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
    const data = res.data || [];
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
    for (const c of data) {
      const info = (await V.dec(state.bk, c.name_enc)) || {};
      c.name = info.name || '—';
      c.phone = info.phone || '';
      c.ck = ((await V.dec(state.bk, c.wck)) || {}).k;
    }
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
      try { await payBill(b, rem, 'cash'); toast(t('markedPaid', { name }), 'good'); after(); }
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
          canUndo ? h('button', { type: 'button', class: 'link bad', onclick: async () => {
            const { error } = await sb.from('payments').delete().eq('id', pay.id);
            if (error) return fail(error);
            close(); after();
          } }, t('undo')) : null)));
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
        close(); toast(t('paymentSaved'), 'good'); after();
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
        h('button', { type: 'button', class: 'act', onclick: () => shareText(text) }, icon('send'), h('span', null, t('share'))),
        isNative ? null : h('button', { type: 'button', class: 'act', onclick: () => window.print() }, icon('bills'), h('span', null, t('print'))))));
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

  async function viewHome() {
    const biz = state.business;
    const m = monthDate(state.month);
    await syncDrafts();
    for (const k of [...memo.keys()]) if (k.endsWith(`:${biz.id}`)) memo.delete(k);
    const [people, tariff, readings, bills] = await Promise.all([
      loadPeople(),
      sb.from('tariffs').select('*').eq('business_id', biz.id).eq('month', m).maybeSingle(),
      sb.from('readings').select('subscriber_id, subscribers!inner(business_id)').eq('month', m).eq('subscribers.business_id', biz.id),
      sb.from('bills').select(`*, payments(${PAY})`).eq('business_id', biz.id).eq('month', m),
      loadOpenBills(),
      loadCollectors()
    ]);
    const oldBills = state.openBills.filter((b) => b.month < m).sort((a, b) => owed(b) - owed(a));
    const oldTotal = oldBills.reduce((a, b) => a + owed(b), 0);
    const oldSubs = new Set(oldBills.map((b) => b.subscriber_id)).size;
    const waiting = draftCount();
    for (const r of [tariff, readings, bills]) if (r.error) throw r.error;
    const billable = people.filter((p) => p.active && p.status !== 'pending');
    const metered = billable.filter((p) => p.billing_type === 'metered');
    const pending = people.filter((p) => p.status === 'pending');
    const readIds = new Set(readings.data.map((r) => r.subscriber_id));
    const readCount = metered.filter((p) => readIds.has(p.id)).length;
    const billed = bills.data.reduce((a, b) => a + Number(b.amount), 0);
    const paid = bills.data.reduce((a, b) => a + Number(b.paid_amount), 0);
    const unpaid = bills.data.filter((b) => Number(b.paid_amount) < Number(b.amount)).sort((a, b) => (b.amount - b.paid_amount) - (a.amount - a.paid_amount));
    const bar = meter(billed > 0 ? paid / billed : 0);

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
            step(1, !!tariff.data, t('stepPrice'), tariff.data ? t('priceSet', { kwh: ltr(money(tariff.data.kwh_price)), amp: ltr(money(tariff.data.flat_amp_price)) }) : t('priceNotSet'), null, () => tariffSheet(tariff.data, viewHome)),
            step(2, metered.length > 0 && readCount === metered.length, t('stepReadings'), (metered.length ? t('readingsCount', { n: readCount, total: metered.length }) : t('noMeteredShort')) + (waiting ? `${sep()}${t('draftsWaiting', { n: waiting })}` : ''), null, () => go('readings')),
            step(3, bills.data.length > 0, t('stepBills'), bills.data.length ? t('billsMade', { n: bills.data.length }) : t('billsNotMade'), genBtn))),
        h('div', { class: 'stack' },
          pending.length ? h('section', { class: 'card flush' },
            h('h3', { class: 'card-title' }, t('requests'), h('span', { class: 'badge' }, pending.length)),
            pending.map((p) => h('div', { class: 'item', role: 'button', tabindex: '0', onclick: () => requestSheet(p, viewHome) },
              avatar(p.info.name), h('div', { class: 'grow' }, h('strong', null, p.info.name || '—'),
                h('small', { class: 'muted' }, [ltr(p.info.phone), p.info.building].filter(Boolean).join(sep()))),
              h('span', { class: 'pill partial' }, t('review'))))) : null,
          h('section', { class: 'card flush' },
            h('h3', { class: 'card-title' }, t('toCollect'), unpaid.length > 6 ? h('button', { type: 'button', class: 'link', onclick: () => go('bills') }, t('seeAll')) : null),
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
      const close = sheet(`${t('stepPrice')}${sep()}${monthLabel(m)}`, h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
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
        h('span', null, [ltr(p.info.phone), p.info.building, p.info.floor && `${t('floor')} ${p.info.floor}`].filter(Boolean).join(sep()))),
      subscriptionFields({ billing_type: 'metered', amps: 5, initial_reading: 0, label: '' }, {}),
      h('div', { class: 'grid2' }, no, ok)));
  }

  async function viewPeople(filter) {
    const [people] = await Promise.all([loadPeople(), loadOpenBills()]);
    const q = (filter || '').toLowerCase();
    const list = people.filter((p) => p.status !== 'pending' && (!q || [p.title, p.info.name, p.info.phone, p.info.building, p.info.meter].some((v) => (v || '').toLowerCase().includes(q))));
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
      list.length ? h('div', { class: 'card flush grid-list' }, list.map((p) => h('div', { class: `item ${p.active ? '' : 'dim'}`, role: 'button', tabindex: '0', onclick: () => personSheet(p) },
        avatar(p.title),
        h('div', { class: 'grow' }, h('strong', null, p.title),
          h('small', { class: 'muted' }, [p.label && p.info.name !== p.label ? p.info.name : null, p.info.building, ltr(p.info.phone)].filter(Boolean).join(sep()))),
        h('div', { class: 'end-col' },
          h('span', { class: 'row' }, h('small', { class: 'muted' }, typeLabel(p.billing_type)), h('span', { class: 'pill amps' }, `${p.amps}A`)),
          debtTotal(p.id) > 0
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
      people.sort((a, b) => (a.info.building || '').localeCompare(b.info.building || '') || a.title.localeCompare(b.title));
      const ids = people.map((p) => p.id);
      const rd = ids.length ? await sb.from('readings').select('id, subscriber_id, month, value, photo').in('subscriber_id', ids).lte('month', m).order('month', { ascending: false }) : { data: [] };
      if (rd.error) throw rd.error;
      const cur = new Map(); const prev = new Map();
      for (const r of rd.data) {
        if (r.month === m) cur.set(r.subscriber_id, r);
        else if (!prev.has(r.subscriber_id)) prev.set(r.subscriber_id, r.value);
      }
      rows = people.map((s) => ({
        id: s.id, title: s.title, sub: [s.info.building, s.info.meter && `#${s.info.meter}`].filter(Boolean).join(sep()),
        prev: prev.has(s.id) ? Number(prev.get(s.id)) : Number(s.initial_reading),
        cur: cur.has(s.id) ? Number(cur.get(s.id).value) : null,
        rid: cur.has(s.id) ? cur.get(s.id).id : null,
        photo: cur.has(s.id) ? !!cur.get(s.id).photo : false
      }));
      store.set(cacheKey, await V.enc(state.bk, rows));
    } catch (e) {
      const cached = isNetErr(e) ? await V.dec(state.bk, store.get(cacheKey)) : null;
      if (!cached) throw e;
      rows = cached; offline = true;
    }
    const drafts = getDrafts(m);
    const inputs = [];
    const items = rows.map((r) => {
      const start = drafts[r.id] !== undefined ? drafts[r.id] : r.cur !== null ? r.cur : '';
      const inp = input(`r_${r.id}`, { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', enterkeyhint: 'next', value: start, placeholder: String(r.prev), class: 'reading-input' });
      const diff = h('small', { class: 'muted' });
      const upd = () => {
        const v = num(inp.value);
        diff.textContent = inp.value === '' ? `${t('prev')}: ${r.prev}` : v < r.prev ? t('lowerThanPrev') : `+${(v - r.prev).toFixed(1)} ${t('kwh')}`;
        diff.className = inp.value !== '' && v < r.prev ? 'bad' : 'muted';
      };
      inp.addEventListener('input', () => {
        upd();
        if (inp.value === '' || (r.cur !== null && num(inp.value) === r.cur)) delete drafts[r.id]; else drafts[r.id] = inp.value;
        setDrafts(m, drafts);
      });
      upd();
      inputs.push({ r, inp });
      const hasPhoto = r.photo || pendingPhotos(m).includes(r.id);
      const cam = offline ? null : h('button', { type: 'button', class: `cam ${hasPhoto ? 'has' : ''}`, 'aria-label': hasPhoto ? t('photoRetake') : t('photoTake'), title: t('meterPhoto') }, icon('camera'));
      if (cam) cam.addEventListener('click', () => uploadMeterPhoto(r, m, cam));
      return h('div', { class: 'item static' }, avatar(r.title),
        h('div', { class: 'grow' }, h('strong', null, r.title), h('small', { class: 'muted' }, r.sub)),
        cam,
        h('div', { class: 'reading' }, inp, diff));
    });
    const save = h('button', { type: 'button', class: 'btn primary block sticky', onclick: async () => {
      const vals = {};
      for (const { r, inp } of inputs) {
        if (inp.value === '') continue;
        const v = num(inp.value);
        if (!(v >= 0) || (r.cur !== null && r.cur === v)) continue;
        vals[r.id] = v;
      }
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
      items.length ? h('div', { class: 'card flush grid-list' }, items) : empty(t('noMetered')),
      items.length ? save : null);
  }

  async function viewBills(status) {
    status = status || state.billFilter || 'all';
    state.billFilter = null;
    const biz = state.business;
    const m = monthDate(state.month);
    const [, res] = await Promise.all([
      loadPeople(),
      sb.from('bills').select(`*, payments(${PAY})`).eq('business_id', biz.id).eq('month', m),
      loadOpenBills(),
      loadCollectors()
    ]);
    if (res.error) throw res.error;
    const data = res.data;
    const oldBills = state.openBills.filter((b) => b.month < m);
    const again = () => viewBills(status).catch(fail);
    const order = { unpaid: 0, partial: 1, paid: 2 };
    const byName = (a, b) => personName(a.subscriber_id).localeCompare(personName(b.subscriber_id));
    const list = status === 'old'
      ? oldBills.slice().sort((a, b) => byName(a, b) || a.month.localeCompare(b.month))
      : data.filter((b) => status === 'all' || b.status === status).sort((a, b) => order[a.status] - order[b.status] || byName(a, b));
    const count = (s) => (s === 'old' ? oldBills.length : data.filter((b) => s === 'all' || b.status === s).length);
    const toSend = list.filter((b) => owed(b) > 0);
    render(head(t('tabBills'), monthSwitch(again)),
      h('div', { class: 'chips' }, ['all', 'unpaid', 'partial', 'paid', 'old'].map((f) => h('button', {
        type: 'button', class: `${f === status ? 'chip on' : 'chip'}${f === 'old' && oldBills.length ? ' alert' : ''}`, onclick: () => viewBills(f).catch(fail)
      }, `${f === 'old' ? t('oldUnpaid') : t(f)} ${count(f)}`))),
      toSend.length ? h('button', { type: 'button', class: 'btn wa block', onclick: () => sendQueue(toSend) }, icon('chat'), t('sendAll', { n: toSend.length })) : null,
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
          h('button', { type: 'button', class: 'link bad', onclick: async () => {
            const { error } = await sb.from('payments').delete().eq('id', x.id);
            if (error) return fail(error);
            viewToday().catch(fail);
          } }, t('undo'))))))
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
          h('button', { type: 'button', class: 'btn ghost block', onclick: () => exportPays().catch(fail) }, icon('bills'), t('exportPayments'))),
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
    const [res, ph] = ids.length ? await Promise.all([
      sb.from('bills').select('*, payments(amount, method, paid_at, lbp_amount)').in('subscriber_id', ids).order('month', { ascending: false }).limit(60),
      sb.from('readings').select('subscriber_id, month').in('subscriber_id', ids).eq('photo', true).order('month', { ascending: false }).limit(60)
    ]) : [{ data: [] }, { data: [] }];
    if (res.error) throw res.error;
    const photos = new Set((ph.data || []).map((r) => `${r.subscriber_id}:${r.month}`));
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
                (b.payments || []).map((p) => h('small', { class: 'ok' }, `✓ ${payText(p)}${sep()}${t(p.method)}${sep()}${dateLabel(p.paid_at)}`)),
                photos.has(`${s.id}:${b.month}`) && s.sk ? h('button', { type: 'button', class: 'btn ghost small', onclick: () => showPhoto(s.sk, s.business_id, s.id, b.month, biz.name) }, icon('camera'), t('meterPhoto')) : null)))
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

  async function showPhoto(sk, bizId, subId, month, title) {
    const body = h('div', { class: 'stack' }, h('div', { class: 'skeleton photo' }));
    sheet(title || t('meterPhoto'), body);
    try {
      const { data, error } = await sb.storage.from('meters').download(photoPath(bizId, subId, month));
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
      body.replaceChildren(
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
        h('button', { type: 'button', class: 'btn ghost block', onclick: start }, t('importAgain')));
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
    if (state.ownBusiness) store.del(`bk:${state.ownBusiness.id}`);
    await sb.auth.signOut();
    Object.assign(state, {
      user: null, pw: null, business: null, ownBusiness: null, bk: null, priv: null, subs: [], roles: [], role: null, mode: null,
      people: [], collectors: [], openBills: [], invite: null, join: null, cinvite: null
    });
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    route();
  }

  async function boot(force) {
    if (holdBoot && !force) return;
    const { data } = await sb.auth.getSession();
    state.user = data.session ? data.session.user : null;
    if (!state.user && !navigator.onLine) state.user = storedUser();
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

  applyLang();
})();
