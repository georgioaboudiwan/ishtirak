(() => {
  'use strict';

  const cfg = window.APP_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
  });

  const $app = document.getElementById('app');
  const $tabs = document.getElementById('tabs');
  const $toast = document.getElementById('toast');
  const $lang = document.getElementById('lang-toggle');

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }
  };

  const state = {
    lang: store.get('lang') === 'en' ? 'en' : 'ar',
    user: null,
    business: null,
    subscriptions: [],
    mode: null,
    route: 'home',
    month: currentMonth(),
    recovery: false
  };

  function currentMonth() {
    const d = new Date();
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
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function render(...nodes) { $app.replaceChildren(...nodes.flat().filter((n) => n !== null && n !== undefined && n !== false)); window.scrollTo(0, 0); }

  let toastTimer;
  function toast(msg, kind) {
    $toast.textContent = msg;
    $toast.className = `toast ${kind || ''}`;
    $toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.hidden = true; }, 3500);
  }

  function errMsg(e) {
    const m = (e && (e.message || e.error_description)) || '';
    if (!navigator.onLine) return t('offline');
    if (m.includes('overpayment')) return t('overpayment');
    if (m.includes('tariff_missing')) return t('tariffMissing');
    if (m.includes('invalid_code')) return t('invalidCode');
    if (/invalid login/i.test(m)) return t('badLogin');
    if (/email not confirmed/i.test(m)) return t('notConfirmed');
    if (/rate limit|too many/i.test(m)) return t('rateLimit');
    if (/sending .*email|smtp/i.test(m)) return t('emailFail');
    if (/password|user already/i.test(m)) return m;
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
  function num(v) { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; }
  function clean(v, max) { return String(v || '').trim().slice(0, max); }

  function waLink(phone, text) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = d.slice(1);
    if (d && d.length <= 8) d = `961${d}`;
    const base = d ? `https://wa.me/${d}` : 'https://wa.me/';
    return `${base}?text=${encodeURIComponent(text)}`;
  }

  function openExternal(url) { window.open(url, '_blank', 'noopener,noreferrer'); }

  function appUrl() { return `${location.origin}${location.pathname}`; }

  function busy(btn, on) { if (btn) { btn.disabled = on; btn.classList.toggle('loading', on); } }

  function field(label, input, hint) {
    return h('label', { class: 'field' }, h('span', null, label), input, hint ? h('small', null, hint) : null);
  }

  function input(name, props) { return h('input', Object.assign({ name, autocomplete: 'off' }, props || {})); }

  function formData(form) {
    const o = {};
    for (const el of form.elements) if (el.name) o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    return o;
  }

  function modal(title, body, actions) {
    const close = () => wrap.remove();
    const wrap = h('div', { class: 'modal-wrap', onclick: (e) => { if (e.target === wrap) close(); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        h('div', { class: 'modal-head' }, h('h3', null, title), h('button', { class: 'ghost small', type: 'button', onclick: close, 'aria-label': t('cancel') }, '✕')),
        body,
        actions ? h('div', { class: 'row end' }, actions) : null));
    document.body.append(wrap);
    return close;
  }

  function confirmBox(msg) {
    return new Promise((resolve) => {
      let close;
      const yes = h('button', { class: 'danger', type: 'button', onclick: () => { close(); resolve(true); } }, t('delete'));
      const no = h('button', { class: 'ghost', type: 'button', onclick: () => { close(); resolve(false); } }, t('cancel'));
      close = modal(t('delete'), h('p', null, msg), [no, yes]);
    });
  }

  function monthPicker(onChange) {
    return h('input', { type: 'month', class: 'month', value: state.month, onchange: (e) => {
      if (/^\d{4}-\d{2}$/.test(e.target.value)) { state.month = e.target.value; onChange(); }
    } });
  }

  function applyLang() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    $lang.textContent = state.lang === 'ar' ? 'EN' : 'ع';
    document.getElementById('brand-name').textContent = t('app');
    document.title = t('app');
  }

  $lang.addEventListener('click', () => {
    state.lang = state.lang === 'ar' ? 'en' : 'ar';
    store.set('lang', state.lang);
    applyLang();
    route();
  });

  async function loadContext() {
    const uid = state.user.id;
    const [biz, subs] = await Promise.all([
      sb.from('businesses').select('*').eq('owner_id', uid).maybeSingle(),
      sb.from('subscribers').select('*, businesses(id, name, phone, area, lbp_rate)').eq('user_id', uid)
    ]);
    if (biz.error) throw biz.error;
    if (subs.error) throw subs.error;
    state.business = biz.data;
    state.subscriptions = subs.data || [];
    if (!state.mode || (state.mode === 'owner' && !state.business) || (state.mode === 'subscriber' && !state.subscriptions.length)) {
      state.mode = state.business ? 'owner' : state.subscriptions.length ? 'subscriber' : null;
      state.route = state.mode === 'owner' ? 'home' : 'mybills';
    }
  }

  const ownerTabs = [
    ['home', 'dashboard', '◉'], ['subscribers', 'subscribers', '☰'], ['readings', 'readings', '◷'],
    ['bills', 'bills', '▤'], ['more', 'settings', '⋯']
  ];
  const subTabs = [['mybills', 'myBills', '▤'], ['subnotices', 'notices', '✉'], ['more', 'settings', '⋯']];

  function drawTabs() {
    const list = state.mode === 'owner' ? ownerTabs : state.mode === 'subscriber' ? subTabs : null;
    if (!list || !state.user) { $tabs.hidden = true; $tabs.replaceChildren(); return; }
    $tabs.hidden = false;
    $tabs.replaceChildren(...list.map(([r, k, icon]) => h('button', {
      type: 'button', class: state.route === r || (r === 'more' && ['more', 'tariff', 'notices'].includes(state.route)) ? 'tab on' : 'tab',
      onclick: () => go(r)
    }, h('span', { class: 'ic' }, icon), h('span', null, t(k)))));
  }

  function go(r) { state.route = r; route(); }

  async function route() {
    applyLang();
    if (state.recovery) { drawTabs(); return viewRecovery(); }
    if (!state.user) { $tabs.hidden = true; return viewAuth('signin'); }
    if (!state.mode) { drawTabs(); return viewOnboard(); }
    drawTabs();
    const views = state.mode === 'owner'
      ? { home: viewHome, subscribers: viewSubscribers, readings: viewReadings, bills: viewBills, tariff: viewTariff, notices: viewNotices, more: viewMore }
      : { mybills: viewMyBills, subnotices: viewSubNotices, more: viewMore };
    const v = views[state.route] || views[Object.keys(views)[0]];
    render(h('div', { class: 'loader' }));
    try { await v(); } catch (e) { fail(e); }
  }

  function viewAuth(mode) {
    $tabs.hidden = true;
    const isUp = mode === 'signup';
    const isReset = mode === 'reset';
    const email = input('email', { type: 'email', required: true, autocomplete: 'email', inputmode: 'email' });
    const pw = isReset ? null : input('password', { type: 'password', required: true, minlength: 10, autocomplete: isUp ? 'new-password' : 'current-password' });
    const btn = h('button', { type: 'submit', class: 'primary block' }, isReset ? t('sendReset') : isUp ? t('signUp') : t('signIn'));
    const form = h('form', { class: 'card stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const em = clean(email.value, 254).toLowerCase();
      if (!email.checkValidity() || (pw && pw.value.length < 10)) return toast(isUp || isReset ? t('pwHint') : t('required'), 'bad');
      busy(btn, true);
      try {
        if (isReset) {
          const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: appUrl() });
          if (error) throw error;
          toast(t('resetSent'), 'good');
          viewAuth('signin');
        } else if (isUp) {
          const { data, error } = await sb.auth.signUp({ email: em, password: pw.value, options: { emailRedirectTo: appUrl() } });
          if (error) throw error;
          if (!data.session) { toast(t('checkEmail'), 'good'); viewAuth('signin'); }
        } else {
          const { error } = await sb.auth.signInWithPassword({ email: em, password: pw.value });
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
        !isUp && !isReset ? h('button', { type: 'button', class: 'link', onclick: () => viewAuth('reset') }, t('forgot')) : null));
    render(h('section', { class: 'hero' }, h('div', { class: 'hero-bolt' }, '⚡'), h('h1', null, t('app'))), form);
  }

  function viewRecovery() {
    $tabs.hidden = true;
    const pw = input('password', { type: 'password', required: true, minlength: 10, autocomplete: 'new-password' });
    const btn = h('button', { type: 'submit', class: 'primary block' }, t('save'));
    render(h('form', { class: 'card stack', onsubmit: async (e) => {
      e.preventDefault();
      if (pw.value.length < 10) return toast(t('pwHint'), 'bad');
      busy(btn, true);
      try {
        const { error } = await sb.auth.updateUser({ password: pw.value });
        if (error) throw error;
        state.recovery = false;
        toast(t('passwordUpdated'), 'good');
        await boot();
      } catch (err) { fail(err); } finally { busy(btn, false); }
    } }, h('h2', null, t('newPassword')), field(t('newPassword'), pw, t('pwHint')), btn));
  }

  function viewOnboard(choice) {
    if (choice === 'owner') return viewCreateBusiness();
    if (choice === 'subscriber') return viewJoin();
    render(
      h('h2', null, t('chooseRole')),
      h('button', { type: 'button', class: 'choice', onclick: () => viewOnboard('owner') },
        h('span', { class: 'choice-ic' }, '⚡'), h('span', null, h('strong', null, t('iOwn')), h('small', null, t('iOwnSub')))),
      h('button', { type: 'button', class: 'choice', onclick: () => viewOnboard('subscriber') },
        h('span', { class: 'choice-ic' }, '🏠'), h('span', null, h('strong', null, t('iSubscribe')), h('small', null, t('iSubscribeSub')))),
      h('button', { type: 'button', class: 'link', onclick: signOut }, t('signOut')));
  }

  function viewCreateBusiness() {
    const btn = h('button', { type: 'submit', class: 'primary block' }, t('create'));
    render(h('form', { class: 'card stack', onsubmit: async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      const rate = num(d.lbp_rate);
      if (!clean(d.name, 120) || !(rate > 0)) return toast(t('required'), 'bad');
      busy(btn, true);
      try {
        const { error } = await sb.from('businesses').insert({ name: clean(d.name, 120), phone: clean(d.phone, 30) || null, area: clean(d.area, 120) || null, lbp_rate: rate });
        if (error) throw error;
        state.mode = 'owner'; state.route = 'home';
        await loadContext(); route();
      } catch (err) { fail(err); } finally { busy(btn, false); }
    } },
      h('h2', null, t('iOwn')),
      field(t('businessName'), input('name', { required: true, maxlength: 120 })),
      field(t('phone'), input('phone', { type: 'tel', maxlength: 30, inputmode: 'tel' })),
      field(t('area'), input('area', { maxlength: 120 })),
      field(t('lbpRate'), input('lbp_rate', { type: 'number', step: '0.01', min: '1', value: '89500', inputmode: 'decimal' })),
      btn,
      h('button', { type: 'button', class: 'link', onclick: () => state.mode ? go('more') : viewOnboard() }, t('back'))));
  }

  function viewJoin() {
    const code = input('code', { required: true, maxlength: 20, autocapitalize: 'characters', class: 'code-input' });
    const btn = h('button', { type: 'submit', class: 'primary block' }, t('join'));
    render(h('form', { class: 'card stack', onsubmit: async (e) => {
      e.preventDefault();
      const c = clean(code.value, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (c.length < 6) return toast(t('invalidCode'), 'bad');
      busy(btn, true);
      try {
        const { error } = await sb.rpc('claim_subscription', { p_code: c });
        if (error) throw error;
        toast(t('joined'), 'good');
        state.mode = 'subscriber'; state.route = 'mybills';
        await loadContext(); route();
      } catch (err) { fail(err); } finally { busy(btn, false); }
    } },
      h('h2', null, t('iSubscribe')), h('p', { class: 'muted' }, t('iSubscribeSub')),
      field(t('inviteCode'), code), btn,
      h('button', { type: 'button', class: 'link', onclick: () => state.mode ? go('more') : viewOnboard() }, t('back'))));
  }

  async function viewHome() {
    const biz = state.business;
    const m = monthDate(state.month);
    const [subs, bills, tariff] = await Promise.all([
      sb.from('subscribers').select('id', { count: 'exact', head: true }).eq('business_id', biz.id).eq('active', true),
      sb.from('bills').select('amount, paid_amount').eq('business_id', biz.id).eq('month', m),
      sb.from('tariffs').select('id').eq('business_id', biz.id).eq('month', m).maybeSingle()
    ]);
    for (const r of [subs, bills, tariff]) if (r.error) throw r.error;
    const billed = bills.data.reduce((a, b) => a + Number(b.amount), 0);
    const paid = bills.data.reduce((a, b) => a + Number(b.paid_amount), 0);
    const genBtn = h('button', { type: 'button', class: 'primary block', onclick: async () => {
      busy(genBtn, true);
      try {
        const { data, error } = await sb.rpc('generate_bills', { p_business: biz.id, p_month: m });
        if (error) throw error;
        const notes = [t('generated', data)];
        if (data.missing_reading) notes.push(t('missingReadings', { n: data.missing_reading }));
        if (data.locked) notes.push(t('lockedBills', { n: data.locked }));
        if (data.invalid_reading) notes.push(t('invalidReadings', { n: data.invalid_reading }));
        toast(notes.join(' · '), data.missing_reading || data.invalid_reading ? 'warn' : 'good');
        viewHome();
      } catch (err) { fail(err); } finally { busy(genBtn, false); }
    } }, t('generateBills'));
    render(
      h('div', { class: 'row between' }, h('h2', null, biz.name), monthPicker(viewHome)),
      h('div', { class: 'stats' },
        stat(t('activeSubs'), subs.count || 0),
        stat(t('totalBilled'), money(billed), `≈ ${lbp(billed, biz.lbp_rate)} LBP`),
        stat(t('collected'), money(paid), null, 'good'),
        stat(t('outstanding'), money(billed - paid), `${bills.data.filter((b) => Number(b.paid_amount) < Number(b.amount)).length} ${t('bills')}`, 'bad')),
      !tariff.data ? h('div', { class: 'notice warn' }, t('tariffMissing'), ' ', h('button', { type: 'button', class: 'link', onclick: () => go('tariff') }, t('tariff'))) : null,
      genBtn,
      h('div', { class: 'grid2' },
        h('button', { type: 'button', class: 'tile', onclick: () => go('readings') }, '◷ ', t('readings')),
        h('button', { type: 'button', class: 'tile', onclick: () => go('tariff') }, '$ ', t('tariff')),
        h('button', { type: 'button', class: 'tile', onclick: () => go('bills') }, '▤ ', t('bills')),
        h('button', { type: 'button', class: 'tile', onclick: () => go('notices') }, '✉ ', t('notices'))));
  }

  function stat(label, value, sub, kind) {
    return h('div', { class: `stat ${kind || ''}` }, h('small', null, label), h('strong', null, value), sub ? h('span', { class: 'muted' }, sub) : null);
  }

  async function viewSubscribers(filter) {
    const { data, error } = await sb.from('subscribers').select('*').eq('business_id', state.business.id).order('full_name');
    if (error) throw error;
    const q = (filter || '').toLowerCase();
    const list = data.filter((s) => !q || [s.full_name, s.phone, s.building, s.meter_number].some((v) => (v || '').toLowerCase().includes(q)));
    const search = input('q', { type: 'search', placeholder: t('search'), value: filter || '' });
    let tmr;
    search.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => viewSubscribers(search.value).then(() => {
      const s = $app.querySelector('input[name=q]'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    }).catch(fail), 250); });
    render(
      h('div', { class: 'row between' }, h('h2', null, `${t('subscribers')} (${data.length})`),
        h('button', { type: 'button', class: 'primary', onclick: () => subscriberForm() }, `+ ${t('add')}`)),
      search,
      h('div', { class: 'list' }, list.map((s) => h('button', { type: 'button', class: `item ${s.active ? '' : 'dim'}`, onclick: () => subscriberForm(s) },
        h('div', null, h('strong', null, s.full_name),
          h('small', { class: 'muted' }, [s.building, s.floor && `${t('floor')} ${s.floor}`, s.phone].filter(Boolean).join(' · '))),
        h('div', { class: 'end-col' },
          h('span', { class: 'pill' }, `${s.amps}A · ${s.billing_type === 'metered' ? t('metered') : t('flat')}`),
          h('small', { class: s.user_id ? 'ok' : 'muted' }, s.user_id ? t('linked') : t('notLinked')))))));
  }

  function subscriberForm(s) {
    const isNew = !s;
    s = s || { billing_type: 'metered', amps: 5, initial_reading: 0, active: true };
    const type = h('select', { name: 'billing_type' },
      h('option', { value: 'metered' }, t('metered')), h('option', { value: 'flat' }, t('flat')));
    type.value = s.billing_type;
    const meterRow = h('div', { class: 'grid2' },
      field(t('meterNumber'), input('meter_number', { maxlength: 50, value: s.meter_number || '' })),
      field(t('initialReading'), input('initial_reading', { type: 'number', step: '0.01', min: '0', value: s.initial_reading, inputmode: 'decimal' })));
    const syncType = () => { meterRow.hidden = type.value !== 'metered'; };
    type.addEventListener('change', syncType);
    syncType();
    const save = h('button', { type: 'submit', class: 'primary' }, t('save'));
    const form = h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault();
      const d = formData(form);
      const amps = parseInt(d.amps, 10);
      const init = d.billing_type === 'metered' ? num(d.initial_reading || 0) : 0;
      if (!clean(d.full_name, 120) || !(amps >= 1 && amps <= 200) || !(init >= 0)) return toast(t('required'), 'bad');
      const row = {
        full_name: clean(d.full_name, 120), phone: clean(d.phone, 30) || null, building: clean(d.building, 120) || null,
        floor: clean(d.floor, 20) || null, amps, billing_type: d.billing_type === 'flat' ? 'flat' : 'metered',
        meter_number: clean(d.meter_number, 50) || null, initial_reading: init, active: !!d.active
      };
      busy(save, true);
      try {
        const res = isNew
          ? await sb.from('subscribers').insert(Object.assign({ business_id: state.business.id }, row))
          : await sb.from('subscribers').update(row).eq('id', s.id);
        if (res.error) throw res.error;
        close(); toast(t('saved'), 'good'); viewSubscribers();
      } catch (err) { fail(err); } finally { busy(save, false); }
    } },
      field(t('fullName'), input('full_name', { required: true, maxlength: 120, value: s.full_name || '' })),
      field(t('phone'), input('phone', { type: 'tel', maxlength: 30, value: s.phone || '', inputmode: 'tel' })),
      h('div', { class: 'grid2' },
        field(t('building'), input('building', { maxlength: 120, value: s.building || '' })),
        field(t('floor'), input('floor', { maxlength: 20, value: s.floor || '' }))),
      h('div', { class: 'grid2' },
        field(t('amps'), input('amps', { type: 'number', min: '1', max: '200', step: '1', value: s.amps, inputmode: 'numeric' })),
        field(t('billingType'), type)),
      meterRow,
      h('label', { class: 'check' }, input('active', { type: 'checkbox', checked: s.active }), t('active')),
      !isNew ? h('div', { class: 'invite' },
        h('div', null, h('small', { class: 'muted' }, t('inviteCode')), h('strong', { class: 'mono' }, s.user_id ? '—' : s.invite_code)),
        h('div', { class: 'row' },
          !s.user_id ? h('button', { type: 'button', class: 'ghost small', onclick: () => openExternal(waLink(s.phone, t('codeMsg', { name: s.full_name, url: appUrl(), code: s.invite_code }))) }, t('shareCode')) : null,
          h('button', { type: 'button', class: 'ghost small', onclick: async () => {
            try {
              const { data, error } = await sb.rpc('reset_subscriber_access', { p_sub: s.id });
              if (error) throw error;
              close(); toast(t('resetDone', { code: data }), 'good'); viewSubscribers();
            } catch (err) { fail(err); }
          } }, t('resetAccess')))) : null,
      h('div', { class: 'row between' },
        !isNew ? h('button', { type: 'button', class: 'danger ghost', onclick: async () => {
          if (!(await confirmBox(t('confirmDelete')))) return;
          const { error } = await sb.from('subscribers').delete().eq('id', s.id);
          if (error) return fail(error);
          close(); viewSubscribers();
        } }, t('delete')) : h('span'),
        save));
    const close = modal(isNew ? t('addSubscriber') : t('editSubscriber'), form);
  }

  async function viewReadings() {
    const biz = state.business;
    const m = monthDate(state.month);
    const subs = await sb.from('subscribers').select('id, full_name, building, meter_number, initial_reading')
      .eq('business_id', biz.id).eq('active', true).eq('billing_type', 'metered').order('building').order('full_name');
    if (subs.error) throw subs.error;
    const ids = subs.data.map((s) => s.id);
    const rd = ids.length ? await sb.from('readings').select('id, subscriber_id, month, value').in('subscriber_id', ids).lte('month', m).order('month', { ascending: false }) : { data: [] };
    if (rd.error) throw rd.error;
    const cur = new Map(); const prev = new Map();
    for (const r of rd.data) {
      if (r.month === m) cur.set(r.subscriber_id, r);
      else if (!prev.has(r.subscriber_id)) prev.set(r.subscriber_id, r.value);
    }
    const inputs = [];
    const rows = subs.data.map((s) => {
      const p = prev.has(s.id) ? Number(prev.get(s.id)) : Number(s.initial_reading);
      const c = cur.get(s.id);
      const inp = input(`r_${s.id}`, { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', value: c ? c.value : '', placeholder: String(p) });
      const diff = h('small', { class: 'muted' });
      const upd = () => {
        const v = num(inp.value);
        diff.textContent = inp.value === '' ? '' : v < p ? '⚠' : `+${(v - p).toFixed(2)} ${t('kwh')}`;
        diff.className = inp.value !== '' && v < p ? 'bad' : 'muted';
      };
      inp.addEventListener('input', upd); upd();
      inputs.push({ s, inp, c, p });
      return h('div', { class: 'item static' },
        h('div', null, h('strong', null, s.full_name), h('small', { class: 'muted' }, [s.building, s.meter_number && `#${s.meter_number}`, `${t('prev')}: ${p}`].filter(Boolean).join(' · '))),
        h('div', { class: 'reading' }, inp, diff));
    });
    const save = h('button', { type: 'button', class: 'primary block sticky', onclick: async () => {
      busy(save, true);
      let n = 0;
      try {
        const inserts = [];
        for (const { s, inp, c } of inputs) {
          if (inp.value === '') continue;
          const v = num(inp.value);
          if (!(v >= 0)) continue;
          if (c && Number(c.value) === v) continue;
          if (c) {
            const { error } = await sb.from('readings').update({ value: v }).eq('id', c.id);
            if (error) throw error;
          } else inserts.push({ subscriber_id: s.id, month: m, value: v });
          n++;
        }
        if (inserts.length) { const { error } = await sb.from('readings').insert(inserts); if (error) throw error; }
        toast(t('readingsSaved', { n }), 'good');
        viewReadings();
      } catch (err) { fail(err); } finally { busy(save, false); }
    } }, t('saveReadings'));
    render(
      h('div', { class: 'row between' }, h('h2', null, t('readings')), monthPicker(viewReadings)),
      rows.length ? h('div', { class: 'list' }, rows) : h('p', { class: 'muted center' }, t('noMetered')),
      rows.length ? save : null);
  }

  async function viewTariff() {
    const biz = state.business;
    const m = monthDate(state.month);
    let { data, error } = await sb.from('tariffs').select('*').eq('business_id', biz.id).eq('month', m).maybeSingle();
    if (error) throw error;
    let seed = data;
    if (!seed) {
      const last = await sb.from('tariffs').select('*').eq('business_id', biz.id).lt('month', m).order('month', { ascending: false }).limit(1).maybeSingle();
      if (last.error) throw last.error;
      seed = last.data;
    }
    const save = h('button', { type: 'submit', class: 'primary block' }, t('save'));
    render(
      h('div', { class: 'row between' }, h('h2', null, t('tariff')), monthPicker(viewTariff)),
      h('form', { class: 'card stack', onsubmit: async (e) => {
        e.preventDefault();
        const d = formData(e.target);
        const row = { kwh_price: num(d.kwh_price || 0), fixed_fee_per_amp: num(d.fixed_fee_per_amp || 0), flat_amp_price: num(d.flat_amp_price || 0) };
        if (Object.values(row).some((v) => !(v >= 0))) return toast(t('required'), 'bad');
        busy(save, true);
        try {
          const res = data
            ? await sb.from('tariffs').update(row).eq('id', data.id)
            : await sb.from('tariffs').insert(Object.assign({ business_id: biz.id, month: m }, row));
          if (res.error) throw res.error;
          toast(t('tariffSaved'), 'good'); viewTariff();
        } catch (err) { fail(err); } finally { busy(save, false); }
      } },
        h('p', { class: 'muted' }, t('tariffHint')),
        field(t('kwhPrice'), input('kwh_price', { type: 'number', step: '0.0001', min: '0', inputmode: 'decimal', value: seed ? seed.kwh_price : '' })),
        field(t('fixedFee'), input('fixed_fee_per_amp', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', value: seed ? seed.fixed_fee_per_amp : '' })),
        field(t('flatAmp'), input('flat_amp_price', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', value: seed ? seed.flat_amp_price : '' })),
        save));
  }

  function billDetail(b) {
    return b.billing_type === 'metered'
      ? `${b.prev_reading} → ${b.curr_reading} = ${b.kwh} ${t('kwh')} × ${money(b.kwh_price)} + ${money(b.fixed_fee)}`
      : `${b.amps}A × ${money(b.fixed_fee)}`;
  }

  function billMessage(b, name, biz) {
    return t('billMsg', {
      biz: biz.name, month: monthLabel(b.month), name, detail: billDetail(b), total: money(b.amount),
      lbp: lbp(b.amount, biz.lbp_rate), paid: money(b.paid_amount), rem: money(b.amount - b.paid_amount)
    });
  }

  async function viewBills(status) {
    status = status || 'all';
    const biz = state.business;
    const m = monthDate(state.month);
    let q = sb.from('bills').select('*, subscribers(full_name, phone, building), payments(id, amount, method, note, paid_at)').eq('business_id', biz.id).eq('month', m).order('status').order('amount', { ascending: false });
    if (status !== 'all') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    const filters = ['all', 'unpaid', 'partial', 'paid'].map((f) => h('button', { type: 'button', class: f === status ? 'chip on' : 'chip', onclick: () => viewBills(f).catch(fail) }, t(f)));
    render(
      h('div', { class: 'row between' }, h('h2', null, t('bills')), monthPicker(() => viewBills(status).catch(fail))),
      h('div', { class: 'chips' }, filters),
      data.length ? h('div', { class: 'list' }, data.map((b) => h('button', { type: 'button', class: 'item', onclick: () => billSheet(b, status) },
        h('div', null, h('strong', null, b.subscribers ? b.subscribers.full_name : '—'), h('small', { class: 'muted' }, billDetail(b))),
        h('div', { class: 'end-col' }, h('strong', null, money(b.amount)), h('span', { class: `pill ${b.status}` }, t(b.status))))))
        : h('p', { class: 'muted center' }, t('noBills')));
  }

  function billSheet(b, status) {
    const biz = state.business;
    const rem = Number(b.amount) - Number(b.paid_amount);
    const name = b.subscribers ? b.subscribers.full_name : '';
    const amount = input('amount', { type: 'number', step: '0.01', min: '0.01', max: rem.toFixed(2), value: rem > 0 ? rem.toFixed(2) : '', inputmode: 'decimal' });
    const method = h('select', { name: 'method' }, ['cash', 'whish', 'omt', 'other'].map((x) => h('option', { value: x }, t(x))));
    const note = input('note', { maxlength: 200 });
    const save = h('button', { type: 'submit', class: 'primary' }, t('recordPayment'));
    const body = h('div', { class: 'stack' },
      h('div', { class: 'summary' },
        h('div', null, h('small', { class: 'muted' }, monthLabel(b.month)), h('div', null, billDetail(b))),
        h('div', { class: 'row between' }, h('span', null, t('totalBilled')), h('strong', null, `${money(b.amount)}  ·  ${lbp(b.amount, biz.lbp_rate)} LBP`)),
        h('div', { class: 'row between' }, h('span', null, t('remaining')), h('strong', { class: rem > 0 ? 'bad' : 'ok' }, money(rem)))),
      b.payments && b.payments.length ? h('div', { class: 'stack tight' }, h('small', { class: 'muted' }, t('payments')),
        b.payments.map((p) => h('div', { class: 'row between pay' },
          h('span', null, `${money(p.amount)} · ${t(p.method)} · ${new Date(p.paid_at).toLocaleDateString()}`, p.note ? ` · ${p.note}` : ''),
          h('button', { type: 'button', class: 'link bad', onclick: async () => {
            if (!(await confirmBox(t('confirmDelete')))) return;
            const { error } = await sb.from('payments').delete().eq('id', p.id);
            if (error) return fail(error);
            close(); viewBills(status).catch(fail);
          } }, t('undo'))))) : null,
      rem > 0 ? h('form', { class: 'stack', onsubmit: async (e) => {
        e.preventDefault();
        const a = Math.round(num(amount.value) * 100) / 100;
        if (!(a > 0)) return toast(t('required'), 'bad');
        if (a > rem + 0.001) return toast(t('overpayment'), 'bad');
        busy(save, true);
        try {
          const { error } = await sb.from('payments').insert({ bill_id: b.id, amount: a, method: method.value, note: clean(note.value, 200) || null });
          if (error) throw error;
          close(); toast(t('paymentSaved'), 'good'); viewBills(status).catch(fail);
        } catch (err) { fail(err); } finally { busy(save, false); }
      } }, h('div', { class: 'grid2' }, field(t('amount'), amount), field(t('method'), method)), field(t('note'), note), save) : null,
      h('button', { type: 'button', class: 'ghost block', onclick: () => openExternal(waLink(b.subscribers && b.subscribers.phone, billMessage(b, name, biz))) }, `💬 ${t('sendBill')}`));
    const close = modal(name, body);
  }

  async function viewNotices() {
    const biz = state.business;
    const { data, error } = await sb.from('notices').select('*').eq('business_id', biz.id).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    const btn = h('button', { type: 'submit', class: 'primary' }, t('postNotice'));
    render(
      h('h2', null, t('notices')),
      h('form', { class: 'card stack', onsubmit: async (e) => {
        e.preventDefault();
        const d = formData(e.target);
        if (!clean(d.title, 120)) return toast(t('required'), 'bad');
        busy(btn, true);
        try {
          const { error: err } = await sb.from('notices').insert({ business_id: biz.id, title: clean(d.title, 120), body: clean(d.body, 1000) || null });
          if (err) throw err;
          viewNotices();
        } catch (err) { fail(err); } finally { busy(btn, false); }
      } },
        field(t('title'), input('title', { required: true, maxlength: 120 })),
        field(t('message'), h('textarea', { name: 'body', maxlength: 1000, rows: 3 })),
        btn),
      noticeList(data, true));
  }

  function noticeList(data, canDelete) {
    if (!data.length) return h('p', { class: 'muted center' }, t('noNotices'));
    return h('div', { class: 'list' }, data.map((n) => h('div', { class: 'item static col' },
      h('div', { class: 'row between' }, h('strong', null, n.title),
        h('small', { class: 'muted' }, new Date(n.created_at).toLocaleString(state.lang === 'ar' ? 'ar-LB' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }))),
      n.body ? h('p', { class: 'pre' }, n.body) : null,
      n.businesses ? h('small', { class: 'muted' }, n.businesses.name) : null,
      canDelete ? h('button', { type: 'button', class: 'link bad', onclick: async () => {
        if (!(await confirmBox(t('confirmDelete')))) return;
        const { error } = await sb.from('notices').delete().eq('id', n.id);
        if (error) return fail(error);
        viewNotices();
      } }, t('delete')) : null)));
  }

  async function viewMyBills() {
    const subs = state.subscriptions;
    const ids = subs.map((s) => s.id);
    const { data, error } = await sb.from('bills').select('*, payments(amount, method, paid_at)').in('subscriber_id', ids).order('month', { ascending: false }).limit(60);
    if (error) throw error;
    render(
      h('h2', null, t('myBills')),
      ...subs.map((s) => {
        const biz = s.businesses || {};
        const mine = data.filter((b) => b.subscriber_id === s.id);
        const due = mine.reduce((a, b) => a + Number(b.amount) - Number(b.paid_amount), 0);
        return h('section', { class: 'card stack' },
          h('div', { class: 'row between' },
            h('div', null, h('strong', null, biz.name), h('small', { class: 'muted block' }, [s.full_name, `${s.amps}A`, s.billing_type === 'metered' ? t('metered') : t('flat')].join(' · '))),
            biz.phone ? h('a', { class: 'ghost small btn', href: `tel:${String(biz.phone).replace(/[^\d+]/g, '')}` }, '☎') : null),
          h('div', { class: `stat ${due > 0 ? 'bad' : 'good'}` }, h('small', null, t('outstanding')), h('strong', null, money(due)), h('span', { class: 'muted' }, `≈ ${lbp(due, biz.lbp_rate)} LBP`)),
          mine.length ? h('div', { class: 'list' }, mine.map((b) => h('details', { class: 'item col' },
            h('summary', { class: 'row between' }, h('span', null, monthLabel(b.month)),
              h('span', { class: 'row' }, h('strong', null, money(b.amount)), h('span', { class: `pill ${b.status}` }, t(b.status)))),
            h('div', { class: 'stack tight' },
              h('small', null, billDetail(b)),
              h('small', { class: 'muted' }, `≈ ${lbp(b.amount, biz.lbp_rate)} LBP`),
              (b.payments || []).map((p) => h('small', null, `✓ ${money(p.amount)} · ${t(p.method)} · ${new Date(p.paid_at).toLocaleDateString()}`))))))
            : h('p', { class: 'muted' }, t('noSubscriptionBills')));
      }));
  }

  async function viewSubNotices() {
    const bizIds = [...new Set(state.subscriptions.map((s) => s.business_id))];
    const { data, error } = await sb.from('notices').select('*, businesses(name)').in('business_id', bizIds).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    render(h('h2', null, t('notices')), noticeList(data, false));
  }

  function viewMore() {
    const items = [];
    if (state.mode === 'owner') {
      const biz = state.business;
      const save = h('button', { type: 'submit', class: 'primary' }, t('save'));
      items.push(
        h('div', { class: 'grid2' },
          h('button', { type: 'button', class: 'tile', onclick: () => go('tariff') }, '$ ', t('tariff')),
          h('button', { type: 'button', class: 'tile', onclick: () => go('notices') }, '✉ ', t('notices'))),
        h('form', { class: 'card stack', onsubmit: async (e) => {
          e.preventDefault();
          const d = formData(e.target);
          const rate = num(d.lbp_rate);
          if (!clean(d.name, 120) || !(rate > 0)) return toast(t('required'), 'bad');
          busy(save, true);
          try {
            const { data, error } = await sb.from('businesses').update({ name: clean(d.name, 120), phone: clean(d.phone, 30) || null, area: clean(d.area, 120) || null, lbp_rate: rate }).eq('id', biz.id).select().single();
            if (error) throw error;
            state.business = data; toast(t('saved'), 'good');
          } catch (err) { fail(err); } finally { busy(save, false); }
        } },
          h('h3', null, t('business')),
          field(t('businessName'), input('name', { required: true, maxlength: 120, value: biz.name })),
          field(t('phone'), input('phone', { type: 'tel', maxlength: 30, value: biz.phone || '' })),
          field(t('area'), input('area', { maxlength: 120, value: biz.area || '' })),
          field(t('lbpRate'), input('lbp_rate', { type: 'number', step: '0.01', min: '1', value: biz.lbp_rate, inputmode: 'decimal' })),
          save),
        state.subscriptions.length
          ? h('button', { type: 'button', class: 'ghost block', onclick: () => { state.mode = 'subscriber'; go('mybills'); } }, t('switchToSubscriber'))
          : null);
    } else {
      items.push(
        h('button', { type: 'button', class: 'ghost block', onclick: viewJoin }, `+ ${t('addSubscription')}`),
        state.business
          ? h('button', { type: 'button', class: 'ghost block', onclick: () => { state.mode = 'owner'; go('home'); } }, t('switchToOwner'))
          : h('button', { type: 'button', class: 'ghost block', onclick: viewCreateBusiness }, `⚡ ${t('iOwn')}`));
    }
    render(
      h('h2', null, t('settings')),
      ...items,
      h('div', { class: 'card row between' }, h('span', { class: 'muted' }, state.user.email), h('button', { type: 'button', class: 'danger ghost', onclick: signOut }, t('signOut'))));
  }

  async function signOut() {
    await sb.auth.signOut();
    state.user = null; state.business = null; state.subscriptions = []; state.mode = null;
    route();
  }

  async function boot() {
    const { data } = await sb.auth.getSession();
    state.user = data.session ? data.session.user : null;
    if (state.user) {
      try { await loadContext(); } catch (e) { fail(e); }
    }
    route();
  }

  let lastUid;
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { state.recovery = true; state.user = session && session.user; route(); return; }
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
