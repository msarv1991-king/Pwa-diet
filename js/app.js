(() => {
  'use strict';

  // ───────────────────────── ذخیره‌سازی ─────────────────────────
  const KEY = 'diet.v1';
  // ۱۸۰ پروتئین × ۴ + ۵۰ کربو × ۴ + ۹۸ چربی × ۹ ≈ ۱۸۰۰ کالری
  const DEFAULT_TARGETS = { kcal: 1800, range: 200, p: 180, c: 50, f: 98, fib: 30, sug: 0 };
  const DEFAULT_PROFILE = { sex: 'm', age: 30, height: 175, weight: 80, bf: '', activity: 1.55, deficit: 0.2 };

  function migrateTargets(t) {
    t = t || {};
    if (t.kcal == null && t.calMin != null) {
      t = { kcal: t.calMin, range: Math.max(0, (t.calMax || t.calMin + 200) - t.calMin), p: t.p, c: t.c, fib: t.fib, sug: t.sug };
      t.f = Math.max(0, Math.round((t.kcal - t.p * 4 - t.c * 4) / 9));
    }
    return { ...DEFAULT_TARGETS, ...t };
  }
  function fresh() {
    return { days: {}, custom: [], targets: { ...DEFAULT_TARGETS }, profile: { ...DEFAULT_PROFILE }, mealNames: {}, closed: {}, hideInstall: false };
  }
  function normalizeState(s) {
    const f = fresh();
    return {
      ...f, ...s,
      targets: migrateTargets(s.targets),
      profile: { ...DEFAULT_PROFILE, ...(s.profile || {}) },
      mealNames: s.mealNames || {}, closed: s.closed || {}, custom: s.custom || [],
    };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.days) return normalizeState(s);
    } catch (e) { /* داده خراب */ }
    return fresh();
  }
  let S = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast('ذخیره نشد! حافظه پر است'); }
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  Parser.build(S.custom);

  // ───────────────────────── ابزارها ─────────────────────────
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const nf0 = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });
  const fa = (n, d = 0) => (d ? nf1 : nf0).format(Math.abs(n) < 0.05 && d ? 0 : n);
  const round5 = n => Math.max(5, Math.round(n / 5) * 5);
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const numOf = v => { const x = parseFloat(Parser.norm(v)); return isFinite(x) ? x : NaN; };

  const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); };
  const sameDay = (a, b) => dayKey(a) === dayKey(b);

  const fmtDayLong = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtDayMonth = new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'long' });
  const fmtMonthYear = new Intl.DateTimeFormat('fa-IR', { month: 'long', year: 'numeric' });
  const fmtWeekdayNarrow = new Intl.DateTimeFormat('fa-IR', { weekday: 'narrow' });
  const fmtDayNum = new Intl.DateTimeFormat('fa-IR', { day: 'numeric' });
  const fmtTime = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtPersianNum = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' });
  function persian(d) {
    const p = {};
    for (const part of fmtPersianNum.formatToParts(d)) if (part.type !== 'literal') p[part.type] = +part.value;
    return p;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
  }

  // ───────────────────────── محاسبات ─────────────────────────
  const T = () => S.targets;
  const calMax = () => T().kcal + T().range;

  function entryN(e) {
    const k = e.grams / 100, p = e.per;
    return { kcal: p.kcal * k, p: p.p * k, c: p.c * k, f: p.f * k, fib: p.fib * k, sug: p.sug * k };
  }
  function totals(entries) {
    const t = { kcal: 0, p: 0, c: 0, f: 0, fib: 0, sug: 0 };
    for (const e of entries || []) { const n = entryN(e); for (const k in t) t[k] += n[k]; }
    return t;
  }

  // سهم هر بخش از امتیاز ۱۰۰
  const SCORE_MAX = { cal: 25, p: 30, c: 15, f: 10, fib: 10, sug: 10 };
  const SCORE_NAMES = { cal: 'کالری', p: 'پروتئین', c: 'کربوهیدرات', f: 'چربی', fib: 'فیبر', sug: 'قند' };

  function scoreOf(t) {
    const g = T();
    let cal;
    if (t.kcal < g.kcal) cal = 1 - (g.kcal - t.kcal) / 900;
    else if (t.kcal > calMax()) cal = 1 - (t.kcal - calMax()) / 600;
    else cal = 1;
    const p = g.p ? t.p / g.p : 1;
    const c = t.c <= g.c ? 1 : 1 - (t.c - g.c) / Math.max(g.c, 25);
    // چربی: ±۱۵٪ هدف کامل، تا ±۶۰٪ به صفر می‌رسد
    const fd = g.f ? Math.abs(t.f - g.f) / g.f : 0;
    const f = fd <= 0.15 ? 1 : 1 - (fd - 0.15) / 0.45;
    const fib = g.fib ? t.fib / g.fib : 1;
    const allow = g.sug + 2;
    const sug = t.sug <= allow ? 1 : 1 - (t.sug - allow) / 20;
    const r = { cal, p, c, f, fib, sug };
    const parts = {};
    let total = 0;
    for (const k in SCORE_MAX) { parts[k] = clamp01(r[k]) * SCORE_MAX[k]; total += parts[k]; }
    return { total: Math.round(total), parts };
  }
  function grade(s) {
    if (s == null) return { label: '—', cls: '', color: 'var(--line)' };
    if (s >= 90) return { label: 'عالی', cls: 'good', color: 'var(--good)', emoji: '🏆' };
    if (s >= 75) return { label: 'خوب', cls: 'good', color: 'var(--accent)', emoji: '💪' };
    if (s >= 55) return { label: 'متوسط', cls: 'warn', color: 'var(--warn)', emoji: '🙂' };
    return { label: 'ضعیف', cls: 'bad', color: 'var(--bad)', emoji: '⚠️' };
  }
  const dayEntries = d => S.days[dayKey(d)] || [];
  function dayStats(d) {
    const e = dayEntries(d);
    if (!e.length) return null;
    const t = totals(e);
    return { t, score: scoreOf(t).total, entries: e };
  }

  // ───────────────────────── وعده‌ها (تعداد آزاد) ─────────────────────────
  const LEGACY_MEALS = { breakfast: 'صبحانه', lunch: 'ناهار', snack: 'میان‌وعده', dinner: 'شام' };
  function mealsOf(entries) {
    const map = new Map();
    for (const e of entries) {
      let m = map.get(e.meal);
      if (!m) map.set(e.meal, m = { id: e.meal, ts: e.mts || e.ts, list: [] });
      m.ts = Math.min(m.ts, e.mts || e.ts);
      m.list.push(e);
    }
    const arr = [...map.values()].sort((a, b) => a.ts - b.ts);
    arr.forEach((m, i) => {
      m.n = i + 1;
      m.name = S.mealNames[m.id] || LEGACY_MEALS[m.id] || `وعده ${fa(i + 1)}`;
    });
    return arr;
  }

  // ───────────────────────── وضعیت رابط ─────────────────────────
  let cur = today();
  let selMeal = 'new';
  let lastAdd = 0;
  let view = 'today';
  let period = 'week';
  let anchor = today();
  let metric = 'score';
  let parsed = { items: [], unknown: [] };

  // ───────────────────────── تب‌ها ─────────────────────────
  $$('.tabbar button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  function setView(v) {
    view = v;
    $$('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
    $('.topbar').style.visibility = v === 'today' ? 'visible' : 'hidden';
    window.scrollTo({ top: 0 });
    if (v === 'report') { anchor = cur; renderReport(); }
    if (v === 'settings') renderSettings();
    if (v === 'today') renderToday();
  }

  // ───────────────────────── تاریخ ─────────────────────────
  $('#prevDay').addEventListener('click', () => { cur = addDays(cur, -1); selMeal = 'new'; renderToday(); });
  $('#nextDay').addEventListener('click', () => { if (!sameDay(cur, today())) { cur = addDays(cur, 1); selMeal = 'new'; renderToday(); } });
  $('#dateLabel').addEventListener('click', () => { cur = today(); renderToday(); });

  function dateTitle(d) {
    const t = today();
    if (sameDay(d, t)) return 'امروز · ' + fmtDayMonth.format(d);
    if (sameDay(d, addDays(t, -1))) return 'دیروز · ' + fmtDayMonth.format(d);
    return fmtDayLong.format(d);
  }
  const isClosed = d => !sameDay(d, today()) || !!S.closed[dayKey(d)];

  // ───────────────────────── صفحه امروز ─────────────────────────
  function renderToday() {
    $('#dateLabel').textContent = dateTitle(cur);
    $('#nextDay').disabled = sameDay(cur, today());
    const entries = dayEntries(cur);
    const t = totals(entries);
    const g = T();
    const sc = entries.length ? scoreOf(t).total : null;
    const gr = grade(sc);

    const ring = $('#scoreRing');
    ring.style.strokeDashoffset = 326.7 * (1 - (sc || 0) / 100);
    ring.style.stroke = gr.color;
    $('#scoreNum').textContent = sc == null ? '–' : fa(sc);
    $('#scoreLabel').textContent = sc == null ? 'هنوز چیزی ثبت نشده' : `از ۱۰۰ · ${gr.label}`;

    $('#calNum').textContent = fa(t.kcal);
    $('#calTarget').textContent = ` / ${fa(g.kcal)}`;
    const scale = calMax() * 1.15;
    const band = $('#calBand');
    band.style.right = (g.kcal / scale * 100) + '%';
    band.style.width = (g.range / scale * 100) + '%';
    const fill = $('#calFill');
    fill.style.width = Math.min(100, t.kcal / scale * 100) + '%';
    fill.style.background = t.kcal > calMax() ? 'var(--bad)' : '';
    let remain;
    if (t.kcal < g.kcal) remain = `<span class="muted">${fa(g.kcal - t.kcal)} کالری تا هدف</span>`;
    else if (t.kcal <= calMax()) remain = `<span style="color:var(--good)">✓ در محدوده هدف (${fa(g.kcal)}–${fa(calMax())})</span>`;
    else remain = `<span style="color:var(--bad)">${fa(t.kcal - calMax())} کالری بیش از سقف</span>`;
    $('#calRemain').innerHTML = remain;

    $('#macros').innerHTML = [
      macroRow('پروتئین', 'var(--c-protein)', t.p, g.p, 'min'),
      macroRow('کربوهیدرات', 'var(--c-carb)', t.c, g.c, 'max'),
      macroRow('چربی', 'var(--c-fat)', t.f, g.f, 'around'),
      macroRow('فیبر', 'var(--c-fiber)', t.fib, g.fib, 'min'),
      macroRow('قند', 'var(--c-sugar)', t.sug, g.sug, 'zero'),
    ].join('');

    renderMealPicker(entries);
    renderMeals(entries);
    renderDayReport(entries, t);
    renderRecent();
    renderInstallHint();
  }

  function macroRow(name, color, val, target, mode) {
    let tag = '', ratio, barColor = color;
    if (mode === 'min') {
      ratio = target ? val / target : 1;
      if (ratio >= 1) tag = `<span class="tag good">✓ کامل</span>`;
      else tag = `<span class="tag ${ratio >= .75 ? 'warn' : 'bad'}">${fa(target - val)} مانده</span>`;
    } else if (mode === 'max') {
      ratio = target ? val / target : 0;
      if (ratio <= 1) tag = `<span class="tag good">${fa(target - val)} جا داری</span>`;
      else { tag = `<span class="tag ${ratio <= 1.2 ? 'warn' : 'bad'}">${fa(val - target)} اضافه</span>`; barColor = 'var(--bad)'; }
    } else if (mode === 'around') {
      ratio = target ? val / target : 0;
      if (ratio < .85) tag = `<span class="tag warn">${fa(target - val)} مانده</span>`;
      else if (ratio <= 1.15) tag = `<span class="tag good">✓ متعادل</span>`;
      else { tag = `<span class="tag ${ratio <= 1.4 ? 'warn' : 'bad'}">${fa(val - target)} اضافه</span>`; barColor = 'var(--bad)'; }
    } else {
      ratio = val / 25;
      if (val <= target + 2) tag = `<span class="tag good">✓ عالی</span>`;
      else tag = `<span class="tag ${val <= 10 ? 'warn' : 'bad'}">باید صفر باشد</span>`;
    }
    const w = Math.min(100, ratio * 100);
    return `<div class="macro">
      <div class="macro-name"><i style="background:${color}"></i>${name}${tag}</div>
      <div class="macro-val"><b>${fa(val, 1)}</b> <span class="muted">/ ${fa(target)} گرم</span></div>
      <div class="bar"><div style="width:${w}%;background:${barColor}"></div></div>
    </div>`;
  }

  // ── انتخاب وعده
  function renderMealPicker(entries) {
    const meals = mealsOf(entries);
    if (selMeal !== 'new') {
      const m = meals.find(x => x.id === selMeal);
      // اگر وعده انتخاب‌شده دیگر وجود ندارد یا مدتی گذشته، وعده جدید
      if (!m || (sameDay(cur, today()) && Date.now() - lastAdd > 45 * 60e3)) selMeal = 'new';
    }
    const box = $('#mealTabs');
    box.innerHTML = meals.map(m => `<button data-meal="${esc(m.id)}" class="${selMeal === m.id ? 'on' : ''}">${esc(m.name)}</button>`).join('')
      + `<button data-meal="new" class="${selMeal === 'new' ? 'on' : ''}">＋ وعده ${meals.length ? 'جدید' : 'اول'}</button>`;
    $$('button', box).forEach(b => b.addEventListener('click', () => {
      selMeal = b.dataset.meal; lastAdd = Date.now();
      $$('button', box).forEach(x => x.classList.toggle('on', x === b));
    }));
    if (selMeal === 'new') box.scrollLeft = -box.scrollWidth;
  }

  function renderMeals(entries) {
    const box = $('#mealsList');
    if (!entries.length) {
      box.innerHTML = `<div class="card empty"><span class="emoji">🥗</span>هنوز چیزی برای ${sameDay(cur, today()) ? 'امروز' : 'این روز'} ثبت نکردی.<br><span class="small">هر چی خوردی را بالا بنویس، خودم حساب می‌کنم. هر چند وعده که بخواهی.</span></div>`;
      return;
    }
    let html = '';
    for (const m of mealsOf(entries)) {
      const mt = totals(m.list);
      const pTag = mt.p >= 25 ? `<span class="tag good">پروتئین ✓</span>` : '';
      html += `<div class="card meal"><div class="meal-head">
          <button class="meal-name" data-mid="${esc(m.id)}">${esc(m.name)} <span class="muted small">${fmtTime.format(m.ts)}</span> ✎</button>
          <span>${fa(mt.kcal)} کالری · ${fa(mt.p)}g پروتئین ${pTag}</span></div>`;
      for (const e of m.list) {
        const n = entryN(e);
        html += `<button class="entry" data-id="${e.id}">
          <div class="entry-main">
            <div class="entry-title">${esc(entryLabel(e))}${e.manual ? ' <span class="tag warn">دستی</span>' : ''}</div>
            <div class="entry-sub">${fa(e.grams)} گرم · پروتئین ${fa(n.p, 1)} · کربو ${fa(n.c, 1)} · چربی ${fa(n.f, 1)} · فیبر ${fa(n.fib, 1)}${n.sug > 0.5 ? ` · قند ${fa(n.sug, 1)}` : ''}</div>
            ${e.recipe ? `<div class="entry-sub">🧾 ${esc(e.recipe)}</div>` : ''}
            ${e.note ? `<div class="entry-note">📝 ${esc(e.note)}</div>` : ''}
          </div>
          <div class="entry-kcal">${fa(n.kcal)} <small>کالری</small></div>
        </button>`;
      }
      html += '</div>';
    }
    box.innerHTML = html;
    $$('.entry', box).forEach(b => b.addEventListener('click', () => openEntrySheet(b.dataset.id)));
    $$('.meal-name', box).forEach(b => b.addEventListener('click', () => openMealSheet(b.dataset.mid)));
  }

  function entryLabel(e) {
    if (e.label && Math.abs(e.grams - e.ug) < 0.01) return e.label;
    if (e.unit === 'g') return `${fa(e.grams)} گرم ${e.name}`;
    const q = e.grams / e.ug;
    const qs = Math.abs(q - 0.5) < 0.01 ? 'نیم' : fa(Math.round(q * 100) / 100, 1);
    return `${qs} ${Parser.unitLabel(e.unit)} ${e.name}`;
  }

  // ───────────────────────── ورودی متنی ─────────────────────────
  const input = $('#foodInput');
  let parseTimer;
  input.addEventListener('input', () => {
    autoGrow(input);
    clearTimeout(parseTimer); parseTimer = setTimeout(updatePreview, 120);
  });
  function autoGrow(el) { el.style.height = 'auto'; el.style.height = Math.min(220, el.scrollHeight + 2) + 'px'; }

  function previewHTML(p) {
    let html = '';
    for (const it of p.items) {
      const extra = [
        it.recipe ? `<div class="pv-sub">🧾 ${esc(it.recipe)}</div>` : '',
        it.note ? `<div class="pv-sub">ℹ️ ${esc(it.note)}</div>` : '',
        it.ignored ? `<div class="pv-sub warn">⚠️ «${esc(it.ignored)}» حساب نشد — اگر غذاست جدا بنویس یا تعریفش کن</div>` : '',
      ].join('');
      html += `<div class="pv-item"><div><div>✓ ${esc(it.label)} <span class="muted small">(${fa(it.grams)}g)</span></div>${extra}</div><span class="pv-n">${fa(it.n.kcal)} کالری · ${fa(it.n.p, 1)}g پروتئین</span></div>`;
    }
    p.unknown.forEach((u, i) => {
      html += `<div class="pv-item pv-unknown"><span>❓ «${esc(u.text)}» را نشناختم</span><button data-u="${i}">تعریف کن</button></div>`;
    });
    if (p.items.length > 1) {
      const t = p.items.reduce((a, it) => { a.k += it.n.kcal; a.p += it.n.p; a.c += it.n.c; a.f += it.n.f; return a; }, { k: 0, p: 0, c: 0, f: 0 });
      html += `<div class="pv-total">جمع: ${fa(t.k)} کالری · ${fa(t.p)}g پروتئین · ${fa(t.c)}g کربو · ${fa(t.f)}g چربی</div>`;
    }
    return html;
  }

  function updatePreview() {
    parsed = Parser.parse(input.value);
    const box = $('#preview');
    box.innerHTML = previewHTML(parsed);
    $$('[data-u]', box).forEach(b => b.addEventListener('click', () => openCustomSheet(null, parsed.unknown[+b.dataset.u].text)));
    $('#addBtn').disabled = !parsed.items.length;
  }

  $('#addBtn').addEventListener('click', addParsed);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addParsed(); }
  });

  function makeEntry(it, mealId, mts) {
    return {
      id: uid(), name: it.name, foodId: it.foodId, src: it.src,
      unit: it.unit, ug: it.qty ? it.grams / it.qty : it.grams, grams: it.grams,
      per: { ...it.food.n }, meal: mealId, mts, ts: Date.now(),
      ...(it.recipe ? { recipe: it.recipe } : {}), ...(it.label.startsWith('روغن جذب') ? { label: it.label } : {}),
    };
  }

  function addParsed() {
    updatePreview();
    if (!parsed.items.length) return;
    const k = dayKey(cur);
    const list = S.days[k] || (S.days[k] = []);
    let mealId = selMeal, mts;
    if (mealId === 'new') { mealId = 'm_' + uid(); mts = Date.now(); }
    else { const m = list.find(e => e.meal === mealId); mts = m ? (m.mts || m.ts) : Date.now(); }
    for (const it of parsed.items) list.push(makeEntry(it, mealId, mts));
    if (S.closed[k]) delete S.closed[k];
    save();
    selMeal = mealId; lastAdd = Date.now();
    const n = parsed.items.length;
    const kcal = parsed.items.reduce((a, it) => a + it.n.kcal, 0);
    input.value = ''; autoGrow(input); updatePreview();
    input.blur();
    toast(`${fa(n)} مورد ثبت شد · ${fa(kcal)} کالری`);
    renderToday();
  }

  function renderRecent() {
    const counts = new Map();
    for (let i = 0; i < 30; i++) {
      for (const e of S.days[dayKey(addDays(today(), -i))] || []) {
        const label = entryLabel(e);
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(x => x[0]);
    const box = $('#recentChips');
    box.innerHTML = top.map(l => `<button class="chip">${esc(l)}</button>`).join('');
    $$('.chip', box).forEach(b => b.addEventListener('click', () => {
      const v = input.value.trim();
      input.value = (v ? v + '، ' : '') + b.textContent;
      autoGrow(input); updatePreview();
    }));
  }

  // ───────────────────────── کارنامه و نکات روز ─────────────────────────
  function bodyWeight() { const w = +S.profile.weight; return w > 30 ? w : null; }

  function renderDayReport(entries, t) {
    const box = $('#dayInsights');
    const g = T();
    if (!entries.length) {
      box.innerHTML = `<h3>🎯 هدف روزانه</h3><div class="insights">
        <div class="ins"><span class="ic">🔥</span><span>کالری <b>${fa(g.kcal)}</b> تا <b>${fa(calMax())}</b></span></div>
        <div class="ins"><span class="ic">💪</span><span>پروتئین <b>${fa(g.p)}</b> · کربو حداکثر <b>${fa(g.c)}</b> · چربی <b>${fa(g.f)}</b> · فیبر <b>${fa(g.fib)}</b> گرم</span></div>
        <div class="ins"><span class="ic">🚫</span><span>قند <b>${g.sug ? fa(g.sug) + ' گرم' : 'صفر'}</b></span></div>
        ${tipOfDay()}
      </div>`;
      return;
    }
    const closed = isClosed(cur);
    const sc = scoreOf(t);
    const gr = grade(sc.total);
    const breakdown = Object.keys(SCORE_MAX).map(k => {
      const v = sc.parts[k], m = SCORE_MAX[k], r = v / m;
      const col = r >= .9 ? 'var(--good)' : r >= .6 ? 'var(--warn)' : 'var(--bad)';
      return `<div class="sb-row"><span>${SCORE_NAMES[k]}</span><div class="bar"><div style="width:${r * 100}%;background:${col}"></div></div><b>${fa(v)}<span class="muted">/${fa(m)}</span></b></div>`;
    }).join('');

    const head = closed
      ? `<div class="final-score" style="--c:${gr.color}"><div class="fs-num">${fa(sc.total)}<small>/۱۰۰</small></div><div><b>${gr.emoji} کارنامه پایان روز: ${gr.label}</b><div class="small muted">${fa(t.kcal)} کالری · ${fa(t.p)}g پروتئین · ${fa(mealsOf(entries).length)} وعده</div></div></div>`
      : `<div class="row-between"><h3>📋 کارنامه تا این لحظه</h3><button class="btn ghost small" id="closeDayBtn">پایان روز ✓</button></div>`;

    const tips = dayTips(entries, t, closed);
    box.innerHTML = `${head}
      <div class="score-break">${breakdown}</div>
      <h4 class="sec">${closed ? '🥗 نکات تغذیه‌ای امروز' : '💡 وضعیت و نکات'}</h4>
      <div class="insights">${tips.join('')}</div>
      ${closed ? '' : balancePlan(t)}
      ${closed && sameDay(cur, today()) ? '<button class="btn small" id="reopenDay" style="margin-top:10px">باز کردن دوباره روز</button>' : ''}`;
    const cb = $('#closeDayBtn');
    if (cb) cb.addEventListener('click', () => { S.closed[dayKey(cur)] = true; save(); renderToday(); $('#dayInsights').scrollIntoView({ behavior: 'smooth' }); });
    const rb = $('#reopenDay');
    if (rb) rb.addEventListener('click', () => { delete S.closed[dayKey(cur)]; save(); renderToday(); });
  }

  /** نکات تغذیه‌ای برای کاهش چربی و حفظ عضله */
  function dayTips(entries, t, closed) {
    const g = T(), out = [], w = bodyWeight();
    const add = (cls, ic, html) => out.push(`<div class="ins ${cls}"><span class="ic">${ic}</span><span>${html}</span></div>`);
    const tdee = tdeeOf(S.profile);

    // کالری و کسری انرژی
    if (t.kcal < g.kcal) {
      if (closed && t.kcal < g.kcal - 400) add('bad', '🔥', `فقط ${fa(t.kcal)} کالری خوردی (${fa(g.kcal - t.kcal)} کمتر از هدف). کسری خیلی زیاد خطر از دست رفتن عضله، افت انرژی تمرین و پرخوری روز بعد را بالا می‌برد.`);
      else add('', '🔥', `${fa(g.kcal - t.kcal)} کالری تا هدف ${fa(g.kcal)} مانده.`);
    } else if (t.kcal <= calMax()) add('good', '🔥', `کالری در محدوده هدف (${fa(g.kcal)}–${fa(calMax())}) است.`);
    else add('bad', '🔥', `${fa(t.kcal - calMax())} کالری بیش از سقف. هر ۷۷۰۰ کالری اضافه ≈ ۱ کیلو چربی؛ امروز حدود ${fa((t.kcal - calMax()) / 7.7)} گرم از پیشرفتت خنثی شد.`);
    if (tdee && closed) {
      const def = tdee - t.kcal;
      if (def > 0) add('good', '📉', `کسری انرژی امروز ≈ ${fa(def)} کالری؛ یعنی حدود <b>${fa(def / 7.7)} گرم</b> چربی (تخمینی بر اساس TDEE ${fa(tdee)}).`);
      else add('warn', '📈', `امروز بالاتر از کالری نگهداری (${fa(tdee)}) خوردی؛ کسری انرژی نداشتی.`);
    }

    // پروتئین
    const pk = w ? ` (${fa(t.p / w, 1)} گرم به ازای هر کیلو)` : '';
    if (t.p >= g.p * .95) add('good', '💪', `پروتئین کامل${pk}. در کسری کالری، پروتئین کافی مهم‌ترین عامل حفظ عضله است.`);
    else add(t.p >= g.p * .75 ? 'warn' : 'bad', '💪', `<b>${fa(g.p - t.p)}</b> گرم پروتئین کم${pk}. برای حفظ عضله در رژیم کاهش چربی، ۱٫۶ تا ۲٫۴ گرم به ازای هر کیلو وزن توصیه می‌شود.`);

    // پخش پروتئین بین وعده‌ها
    const meals = mealsOf(entries);
    const lowP = meals.filter(m => totals(m.list).p < 20 && totals(m.list).kcal > 150).length;
    const goodP = meals.filter(m => totals(m.list).p >= 25).length;
    if (meals.length >= 2 && lowP) add('warn', '⏱️', `${fa(lowP)} وعده پروتئین کمتر از ۲۰ گرم داشت. بهتر است پروتئین را بین ۳ تا ۵ وعده پخش کنی، هر وعده ۲۵ تا ۴۰ گرم (هر ۳–۵ ساعت).`);
    else if (goodP >= 3) add('good', '⏱️', `${fa(goodP)} وعده با ۲۵+ گرم پروتئین — پخش پروتئین عالی بود.`);

    // کربو
    if (t.c > g.c) add('bad', '🍞', `کربوهیدرات ${fa(t.c - g.c)} گرم بیش از حد.${topSources(entries, 'c')}`);
    else if (closed) add('good', '🍞', `کربو در حد مجاز ماند (${fa(t.c)} از ${fa(g.c)}). کربوی محدود را بهتر است نزدیک تمرین بخوری.`);

    // چربی
    const fatMin = Math.max(w ? 0.5 * w : 0, (t.kcal * 0.2) / 9);
    if (closed && t.f < fatMin * .9) add('warn', '🥑', `چربی خیلی کم بود (${fa(t.f)}g). چربی کمتر از ~۲۰٪ کالری یا ۰٫۵ گرم/کیلو می‌تواند روی هورمون‌ها اثر بد بگذارد.`);
    else if (t.f > g.f * 1.15) add('warn', '🥑', `چربی ${fa(t.f - g.f)} گرم بیش از هدف.${topSources(entries, 'f')}`);

    // فیبر
    if (t.fib >= g.fib * .95) add('good', '🥦', `فیبر کامل (${fa(t.fib)}g) — سیری بیشتر و گرسنگی کمتر در رژیم.`);
    else add(t.fib >= g.fib * .6 ? 'warn' : 'bad', '🥦', `${fa(g.fib - t.fib)} گرم فیبر کم. سبزیجات حجیم، تخم چیا یا کتان سیری را بالا می‌برند بدون کالری زیاد.`);

    // قند
    if (t.sug <= g.sug + 2) add('good', '🍬', `قند تقریبا صفر — آفرین!`);
    else add('bad', '🍬', `${fa(t.sug, 1)} گرم قند؛ هدف صفر است.${topSources(entries, 'sug')}`);

    if (closed) out.push(tipOfDay());
    return out;
  }

  const TIPS = [
    'تمرین مقاومتی (وزنه) ۳ تا ۴ جلسه در هفته سیگنال اصلی بدن برای نگه داشتن عضله در کسری کالری است.',
    'خواب ۷ تا ۹ ساعت؛ کم‌خوابی در رژیم باعث می‌شود سهم بیشتری از وزن کم‌شده از عضله باشد.',
    'سرعت مناسب کاهش وزن: ۰٫۵ تا ۱ درصد وزن بدن در هفته. سریع‌تر از آن، ریسک از دست رفتن عضله بالا می‌رود.',
    'وزن را هر روز صبح بگیر ولی میانگین هفتگی را مقایسه کن؛ نوسان روزانه بیشتر آب است.',
    'روزانه حدود ۳۰ تا ۳۵ میلی‌لیتر آب به ازای هر کیلو وزن بنوش.',
    'قبل از خواب یک وعده پروتئین آهسته‌جذب (پنیر کاتیج، ماست یونانی یا کازئین) به حفظ عضله کمک می‌کند.',
    'پیاده‌روی ۸ تا ۱۰ هزار قدم در روز بدون فشار به ریکاوری، کسری کالری را بیشتر می‌کند.',
    'غذای حجیم کم‌کالری (سالاد، سبزیجات، سفیده) سیری را بالا می‌برد و رژیم را قابل تحمل‌تر می‌کند.',
    'یک وعده پروتئین ۲۵–۴۰ گرمی در ۲ ساعت بعد از تمرین برای ریکاوری عضله مفید است.',
    'هر ۸ تا ۱۲ هفته رژیم، یک تا دو هفته کالری را به حد نگهداری برسان (diet break) تا خستگی رژیم کم شود.',
  ];
  function tipOfDay() {
    const k = dayKey(cur).split('-').reduce((a, x) => a + +x, 0);
    return `<div class="ins tip"><span class="ic">💡</span><span>${TIPS[k % TIPS.length]}</span></div>`;
  }

  function topSources(entries, key) {
    const m = new Map();
    for (const e of entries) { const v = entryN(e)[key]; if (v > 0.5) m.set(e.name, (m.get(e.name) || 0) + v); }
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (!top.length) return '';
    return `<br><span class="small">بیشترین سهم: ${top.map(([n, v]) => `${esc(n)} (${fa(v, 1)}g)`).join('، ')}</span>`;
  }

  /** پیشنهاد برای بستن روز و رسیدن متعادل به کالری هدف */
  function balancePlan(t) {
    const g = T();
    if (!sameDay(cur, today())) return '';
    if (t.kcal >= calMax()) {
      return `<div class="plan"><h4>🧭 بقیه امروز</h4><ul><li>کالری پر شده؛ اگر گرسنه شدی فقط سبزیجات (خیار، کاهو، کلم) و آب/چای بدون قند.</li></ul></div>`;
    }
    const items = [];
    let kcal = 0, carbs = 0, fat = 0;
    const pGap = g.p - t.p;
    if (pGap > 5) {
      const ch = round5(pGap / 0.31);
      kcal += ch * 1.65; fat += ch * 0.036;
      const whites = Math.ceil(pGap / 3.6), scoops = Math.round(pGap / 24 * 2) / 2;
      items.push(`<b>${fa(ch)} گرم سینه مرغ</b> (≈${fa(pGap)}g پروتئین) — یا ${fa(whites)} عدد سفیده${scoops >= 0.5 && scoops <= 3 ? `، یا ${fa(scoops, 1)} اسکوپ وی` : ''}`);
    }
    const fGap = g.fib - t.fib;
    if (fGap > 3) {
      let left = fGap;
      const chia = Math.min(2, Math.floor(left / 4));
      if (chia > 0) { items.push(`<b>${fa(chia)} قاشق تخم چیا</b> (≈${fa(chia * 4)}g فیبر)`); kcal += chia * 58; carbs += chia * 5; fat += chia * 3.7; left -= chia * 4.1; }
      if (left > 1) {
        const veg = Math.min(600, round5(left / 2.6 * 100));
        items.push(`<b>${fa(veg)} گرم سبزیجات</b> مثل بروکلی، گل‌کلم، کاهو و خیار (≈${fa(left)}g فیبر)`);
        kcal += veg * 0.3; carbs += veg * 0.06;
      }
    }
    const fatRoom = g.f - t.f - fat;
    const rest = g.kcal - t.kcal - kcal;
    if (rest > 60 && fatRoom > 5) {
      const fg = Math.min(fatRoom, rest / 9);
      const alm = round5(fg / 0.5);
      items.push(`<b>${fa(Math.min(alm, 60))} گرم بادام یا گردو</b>${alm > 60 ? ` + ${fa(Math.round((fg - 30) / 13.5 * 2) / 2, 1)} قاشق روغن زیتون روی سالاد` : ''} برای تکمیل چربی سالم`);
      kcal += fg * 9;
    }
    if (!items.length) return t.kcal >= g.kcal ? `<div class="plan"><h4>🧭 جمع‌بندی</h4><ul><li>روز متعادلی بود. «پایان روز» را بزن تا کارنامه نهایی را ببینی. ✨</li></ul></div>` : '';
    const total = t.kcal + kcal;
    const foot = `<li class="small muted">جمع پیش‌بینی: حدود ${fa(total)} کالری${total > calMax() ? ' — بیشتر از سقف؛ مقدار چربی را کمتر کن.' : ''}${g.c - t.c - carbs < 0 ? ' — کربو از حد گذشته، نان و برنج را حذف کن.' : ''}</li>`;
    return `<div class="plan"><h4>🧭 پیشنهاد برای تکمیل امروز</h4><ul>${items.map(i => `<li>${i}</li>`).join('')}${foot}</ul></div>`;
  }

  // ───────────────────────── برگه پایین ─────────────────────────
  function openSheet(html) {
    $('#sheetBody').innerHTML = html;
    $('#sheet').scrollTop = 0;
    $('#sheet').classList.add('on'); $('#sheetBackdrop').classList.add('on');
  }
  function closeSheet() {
    $('#sheet').classList.remove('on'); $('#sheetBackdrop').classList.remove('on');
    document.activeElement && document.activeElement.blur();
  }
  $('#sheetBackdrop').addEventListener('click', closeSheet);

  // ── ویرایش کامل یک قلم غذا
  function openEntrySheet(id) {
    const list = dayEntries(cur);
    const e = list.find(x => x.id === id);
    if (!e) return;
    const meals = mealsOf(list);
    const startText = entryLabel(e);
    const NK = [['kcal', 'کالری', 0], ['p', 'پروتئین', 1], ['c', 'کربو', 1], ['f', 'چربی', 1], ['fib', 'فیبر', 1], ['sug', 'قند', 1]];
    openSheet(`
      <h3>ویرایش: ${esc(e.name)}</h3>
      <div class="field"><label>متن غذا — می‌توانی کامل بازنویسی کنی (مثلا «۱۰ قاشق برنج»)</label>
        <textarea id="etext" rows="1">${esc(startText)}</textarea></div>
      <div class="preview" id="epreview"></div>
      <div id="eqtyBox">
        <div class="field"><label>مقدار</label>
          <div class="qty-row">
            <div class="stepper"><button data-s="-1">−</button><input type="number" inputmode="decimal" id="eqty"><button data-s="1">+</button></div>
            <span class="qty-unit">${esc(Parser.unitLabel(e.unit))}</span>
            <div class="grams-in"><input type="number" inputmode="decimal" id="egrams"><span>گرم</span></div>
          </div>
        </div>
      </div>
      <div class="row-between" style="margin-top:12px"><span class="small muted">ارزش غذایی این مقدار</span>
        <label class="switch small"><input type="checkbox" id="emanual" ${e.manual ? 'checked' : ''}> ویرایش دستی اعداد</label></div>
      <div class="nut-grid" id="enuts"></div>
      <div class="field"><label>یادداشت / توضیح (اختیاری)</label><input type="text" id="enote" placeholder="مثلا: با روغن کم، رستوران، بعد از تمرین…" value="${esc(e.note || '')}"></div>
      <div class="field"><label>وعده</label><div class="chips wrap" id="emeal">
        ${meals.map(m => `<button class="chip ${m.id === e.meal ? 'on' : ''}" data-m="${esc(m.id)}">${esc(m.name)}</button>`).join('')}
        <button class="chip" data-m="new">＋ وعده جدید</button></div></div>
      <div class="btn-row">
        <button class="btn danger" id="edel">حذف</button>
        <button class="btn" id="edup">تکرار</button>
        <button class="btn primary" id="esave">ذخیره</button>
      </div>`);

    let meal = e.meal;
    let grams = e.grams;
    const per = { ...e.per };
    const tx = $('#etext'), qi = $('#eqty'), gi = $('#egrams'), man = $('#emanual');
    autoGrow(tx);
    const isGram = e.unit === 'g';
    if (isGram) { $('.stepper').style.display = 'none'; $('.qty-unit').style.display = 'none'; }
    let reparsed = null;
    const textChanged = () => Parser.norm(tx.value) !== Parser.norm(startText);

    const syncInputs = (from) => {
      if (from !== 'q') qi.value = Math.round(grams / e.ug * 100) / 100;
      if (from !== 'g') gi.value = Math.round(grams * 10) / 10;
    };
    const renderNuts = () => {
      const k = grams / 100;
      $('#enuts').innerHTML = NK.map(([key, l, d]) => man.checked
        ? `<label class="nut"><input type="number" inputmode="decimal" data-n="${key}" value="${Math.round(per[key] * k * 10) / 10}"><span>${l}</span></label>`
        : `<div class="nut"><b>${fa(per[key] * k, d)}</b><span>${l}</span></div>`).join('');
      $$('#enuts input').forEach(i => i.addEventListener('input', () => {
        const v = numOf(i.value);
        if (v >= 0 && grams > 0) per[i.dataset.n] = v * 100 / grams;
      }));
    };
    syncInputs(); renderNuts();

    tx.addEventListener('input', () => {
      autoGrow(tx);
      if (!textChanged()) { reparsed = null; $('#epreview').innerHTML = ''; $('#eqtyBox').style.opacity = 1; return; }
      reparsed = Parser.parse(tx.value);
      $('#epreview').innerHTML = previewHTML(reparsed) || '<div class="pv-item pv-unknown"><span>چیزی تشخیص داده نشد</span></div>';
      $('#eqtyBox').style.opacity = .35;
    });
    qi.addEventListener('input', () => { const v = numOf(qi.value); if (v >= 0) { grams = v * e.ug; syncInputs('q'); renderNuts(); } });
    gi.addEventListener('input', () => { const v = numOf(gi.value); if (v >= 0) { grams = v; syncInputs('g'); renderNuts(); } });
    $$('.stepper button').forEach(b => b.addEventListener('click', () => {
      const q = grams / e.ug;
      const step = q < 2 ? 0.5 : 1;
      const nq = Math.max(step, Math.round((q + step * +b.dataset.s) / step) * step);
      grams = nq * e.ug; syncInputs(); renderNuts();
    }));
    man.addEventListener('change', renderNuts);
    $$('#emeal .chip').forEach(b => b.addEventListener('click', () => {
      meal = b.dataset.m; $$('#emeal .chip').forEach(x => x.classList.toggle('on', x === b));
    }));

    const resolveMeal = () => meal === 'new' ? { id: 'm_' + uid(), mts: Date.now() } : { id: meal, mts: (list.find(x => x.meal === meal) || e).mts || e.ts };

    $('#edel').addEventListener('click', () => {
      S.days[dayKey(cur)] = list.filter(x => x.id !== id);
      if (!S.days[dayKey(cur)].length) delete S.days[dayKey(cur)];
      save(); closeSheet(); renderToday(); toast('حذف شد');
    });
    $('#edup').addEventListener('click', () => {
      list.push({ ...e, id: uid(), ts: Date.now() });
      save(); closeSheet(); renderToday(); toast('تکرار شد');
    });
    $('#esave').addEventListener('click', () => {
      const note = $('#enote').value.trim();
      const m = resolveMeal();
      if (reparsed) {
        if (!reparsed.items.length) { toast('متن را تشخیص ندادم'); return; }
        const fresh = reparsed.items.map(it => ({ ...makeEntry(it, m.id, m.mts), note }));
        const idx = list.indexOf(e);
        list.splice(idx, 1, ...fresh);
      } else {
        if (!(grams > 0)) { toast('مقدار نامعتبر است'); return; }
        e.grams = grams; e.meal = m.id; e.mts = m.mts; e.note = note;
        if (man.checked) { e.per = per; e.manual = true; }
      }
      save(); closeSheet(); renderToday(); toast('ذخیره شد');
    });
  }

  // ── نام و حذف وعده
  function openMealSheet(mid) {
    const list = dayEntries(cur);
    const m = mealsOf(list).find(x => x.id === mid);
    if (!m) return;
    const t = totals(m.list);
    openSheet(`
      <h3>${esc(m.name)}</h3>
      <div class="field"><label>نام وعده (مثلا صبحانه، بعد از تمرین…)</label><input type="text" id="mname" value="${esc(S.mealNames[mid] || '')}" placeholder="${esc(m.name)}"></div>
      <div class="nut-grid">${[['کالری', t.kcal, 0], ['پروتئین', t.p, 1], ['کربو', t.c, 1], ['چربی', t.f, 1], ['فیبر', t.fib, 1], ['قند', t.sug, 1]].map(([l, v, d]) => `<div class="nut"><b>${fa(v, d)}</b><span>${l}</span></div>`).join('')}</div>
      <div class="btn-row">
        <button class="btn danger" id="mdel">حذف کل وعده</button>
        <button class="btn" id="mcopy">کپی به امروز</button>
        <button class="btn primary" id="msave">ذخیره</button>
      </div>`);
    if (sameDay(cur, today())) $('#mcopy').style.display = 'none';
    $('#msave').addEventListener('click', () => {
      const v = $('#mname').value.trim();
      if (v) S.mealNames[mid] = v; else delete S.mealNames[mid];
      save(); closeSheet(); renderToday();
    });
    $('#mdel').addEventListener('click', () => {
      if (!confirm('همه غذاهای این وعده حذف شود؟')) return;
      S.days[dayKey(cur)] = list.filter(e => e.meal !== mid);
      if (!S.days[dayKey(cur)].length) delete S.days[dayKey(cur)];
      save(); closeSheet(); renderToday(); toast('وعده حذف شد');
    });
    $('#mcopy').addEventListener('click', () => {
      const k = dayKey(today());
      const nid = 'm_' + uid(), now = Date.now();
      const arr = S.days[k] || (S.days[k] = []);
      for (const e of m.list) arr.push({ ...e, id: uid(), meal: nid, mts: now, ts: now });
      if (S.mealNames[mid]) S.mealNames[nid] = S.mealNames[mid];
      save(); closeSheet(); toast('به امروز اضافه شد');
    });
  }

  // ───────────────────────── غذای شخصی ─────────────────────────
  function openCustomSheet(foodId, presetName) {
    const f = foodId ? S.custom.find(x => x.id === foodId) : null;
    const unit = f ? f.d : 'عدد';
    const w = f ? (f.u[f.d] || 100) : 100;
    const per = f ? Object.fromEntries(Object.entries(f.n).map(([k, v]) => [k, Math.round(v * w / 100 * 10) / 10])) : { kcal: '', p: '', c: '', f: '', fib: '', sug: '' };
    const fld = (id, label, val, full) => `<div class="field ${full ? 'full' : ''}"><label>${label}</label><input ${id === 'cname' || id === 'calias' || id === 'cunit' ? 'type="text"' : 'type="number" inputmode="decimal"'} id="${id}" value="${esc(val ?? '')}"></div>`;
    openSheet(`
      <h3>${f ? 'ویرایش غذا' : 'تعریف غذای جدید'}</h3>
      <p class="muted small">ارزش غذایی را برای <b>یک واحد</b> وارد کن (از روی برچسب بسته‌بندی یا اینترنت).</p>
      <div class="form-grid">
        ${fld('cname', 'نام غذا', f ? f.name : (presetName || ''), true)}
        ${fld('calias', 'نام‌های دیگر (اختیاری، با ویرگول)', f ? f.aliases.slice(1).join('، ') : '', true)}
        ${fld('cunit', 'واحد (عدد، قاشق، لیوان…)', unit === 'g' ? 'گرم' : unit)}
        ${fld('cw', 'وزن هر واحد (گرم)', w)}
        ${fld('ckcal', 'کالری', per.kcal)}
        ${fld('cp', 'پروتئین (گرم)', per.p)}
        ${fld('cc', 'کربوهیدرات (گرم)', per.c)}
        ${fld('cf', 'چربی (گرم)', per.f)}
        ${fld('cfib', 'فیبر (گرم)', per.fib)}
        ${fld('csug', 'قند (گرم)', per.sug)}
      </div>
      <p class="small muted" id="ccheck"></p>
      <div class="btn-row">
        ${f ? '<button class="btn danger" id="cdel">حذف</button>' : '<button class="btn" id="ccancel">انصراف</button>'}
        <button class="btn primary" id="csave">ذخیره</button>
      </div>`);
    const num = id => { const v = numOf($('#' + id).value); return isFinite(v) ? v : 0; };
    // بررسی علمی: کالری ≈ ۴×پروتئین + ۴×کربو + ۹×چربی
    const check = () => {
      const est = num('cp') * 4 + num('cc') * 4 + num('cf') * 9;
      const k = num('ckcal');
      $('#ccheck').innerHTML = est && k && Math.abs(est - k) / k > 0.2
        ? `⚠️ کالری واردشده (${fa(k)}) با ماکروها (${fa(est)}) نمی‌خواند؛ اعداد را چک کن.`
        : (est ? `✓ کالری محاسبه‌شده از ماکروها: ${fa(est)}` : '');
    };
    ['ckcal', 'cp', 'cc', 'cf'].forEach(i => $('#' + i).addEventListener('input', check)); check();
    $('#csave').addEventListener('click', () => {
      const name = $('#cname').value.trim();
      if (!name) { toast('نام غذا را بنویس'); return; }
      const unitC = Parser.canonUnit($('#cunit').value.trim() || 'عدد');
      const wt = unitC === 'g' ? 1 : (num('cw') || 100);
      const k = 100 / wt;
      const food = {
        id: f ? f.id : 'c_' + uid(),
        name,
        aliases: [name, ...$('#calias').value.split(/[،,]/).map(s => s.trim()).filter(Boolean)],
        n: { kcal: num('ckcal') * k, p: num('cp') * k, c: num('cc') * k, f: num('cf') * k, fib: num('cfib') * k, sug: num('csug') * k },
        u: { [unitC]: wt },
        d: unitC,
      };
      if (f) S.custom = S.custom.map(x => x.id === f.id ? food : x); else S.custom.push(food);
      save(); Parser.build(S.custom); closeSheet();
      toast('ذخیره شد');
      updatePreview();
      if (view === 'settings') renderSettings();
    });
    const del = $('#cdel');
    if (del) del.addEventListener('click', () => {
      if (!confirm('این غذا حذف شود؟')) return;
      S.custom = S.custom.filter(x => x.id !== f.id);
      save(); Parser.build(S.custom); closeSheet(); renderSettings();
    });
    const cancel = $('#ccancel');
    if (cancel) cancel.addEventListener('click', closeSheet);
  }

  // ───────────────────────── گزارش ─────────────────────────
  $$('#periodSeg button').forEach(b => b.addEventListener('click', () => {
    period = b.dataset.period;
    $$('#periodSeg button').forEach(x => x.classList.toggle('on', x === b));
    renderReport();
  }));
  $('#prevPeriod').addEventListener('click', () => { anchor = addDays(periodDays()[0], -1); renderReport(); });
  $('#nextPeriod').addEventListener('click', () => {
    const d = periodDays();
    const nx = addDays(d[d.length - 1], 1);
    if (nx <= today()) { anchor = nx; renderReport(); }
  });

  function periodDays(p = period, a = anchor) {
    if (p === 'week') {
      const start = addDays(a, -((a.getDay() + 1) % 7));   // شنبه
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const pm = persian(a).month;
    let s = a; while (persian(addDays(s, -1)).month === pm) s = addDays(s, -1);
    const out = []; let d = s;
    while (persian(d).month === pm) { out.push(d); d = addDays(d, 1); }
    return out;
  }

  const METRICS = {
    score: { label: 'امتیاز', get: s => s.score },
    kcal: { label: 'کالری', get: s => s.t.kcal },
    p: { label: 'پروتئین', get: s => s.t.p },
    c: { label: 'کربو', get: s => s.t.c },
    f: { label: 'چربی', get: s => s.t.f },
    fib: { label: 'فیبر', get: s => s.t.fib },
    sug: { label: 'قند', get: s => s.t.sug },
  };

  function renderReport() {
    const days = periodDays();
    const t0 = today();
    const first = days[0], last = days[days.length - 1];
    $('#periodLabel').textContent = period === 'week'
      ? `${fmtDayMonth.format(first)} تا ${fmtDayMonth.format(last)}`
      : fmtMonthYear.format(anchor);
    $('#nextPeriod').disabled = addDays(last, 1) > t0;

    const stats = days.map(d => ({ d, s: d <= t0 ? dayStats(d) : null, future: d > t0 }));
    const logged = stats.filter(x => x.s);
    const elapsed = stats.filter(x => !x.future).length;
    const g = T();

    const avg = logged.length ? Math.round(logged.reduce((a, x) => a + x.s.score, 0) / logged.length) : null;
    const gr = grade(avg);
    const prevLogged = periodDays(period, addDays(first, -1)).map(dayStats).filter(Boolean);
    const prevAvg = prevLogged.length ? Math.round(prevLogged.reduce((a, s) => a + s.score, 0) / prevLogged.length) : null;
    const pw = period === 'week' ? 'هفته' : 'ماه';
    let trend = '';
    if (avg != null && prevAvg != null) {
      const diff = avg - prevAvg;
      trend = diff > 0 ? `<span style="color:var(--good)">▲ ${fa(diff)} امتیاز بهتر از ${pw} قبل</span>`
        : diff < 0 ? `<span style="color:var(--bad)">▼ ${fa(-diff)} امتیاز کمتر از ${pw} قبل</span>`
          : `<span class="muted">مثل ${pw} قبل</span>`;
    }
    $('#reportHero').innerHTML = `
      <div class="ring-wrap">
        <svg class="ring" viewBox="0 0 120 120"><circle class="ring-bg" cx="60" cy="60" r="52"/><circle class="ring-fg" cx="60" cy="60" r="52" style="stroke:${gr.color};stroke-dashoffset:${326.7 * (1 - (avg || 0) / 100)}"/></svg>
        <div class="ring-center"><div class="ring-score">${avg == null ? '–' : fa(avg)}</div><div class="ring-label">میانگین از ۱۰۰</div></div>
      </div>
      <div class="hero-cal">
        <div class="cal-big" style="font-size:22px">${avg == null ? 'بدون داده' : `${gr.emoji} ${gr.label}`}</div>
        <div class="small muted">${fa(logged.length)} روز ثبت‌شده از ${fa(elapsed)} روز</div>
        <div class="small">${trend}</div>
      </div>`;

    $('#metricChips').innerHTML = Object.entries(METRICS).map(([k, m]) => `<button class="chip ${k === metric ? 'on' : ''}" data-k="${k}">${m.label}</button>`).join('');
    $$('#metricChips .chip').forEach(b => b.addEventListener('click', () => { metric = b.dataset.k; renderReport(); }));
    $('#chart').innerHTML = chartSVG(stats);

    const avgOf = key => logged.length ? logged.reduce((a, x) => a + x.s.t[key], 0) / logged.length : 0;
    const cnt = fn => logged.filter(x => fn(x.s.t)).length;
    const tiles = [
      ['کالری', 'var(--accent)', avgOf('kcal'), '', `${fa(cnt(t => t.kcal >= g.kcal && t.kcal <= calMax()))} روز در محدوده`],
      ['پروتئین', 'var(--c-protein)', avgOf('p'), 'g', `${fa(cnt(t => t.p >= g.p * .95))} روز به هدف رسید`],
      ['کربوهیدرات', 'var(--c-carb)', avgOf('c'), 'g', `${fa(cnt(t => t.c <= g.c))} روز زیر ${fa(g.c)}`],
      ['چربی', 'var(--c-fat)', avgOf('f'), 'g', `هدف: ${fa(g.f)} گرم`],
      ['فیبر', 'var(--c-fiber)', avgOf('fib'), 'g', `${fa(cnt(t => t.fib >= g.fib * .95))} روز به هدف رسید`],
      ['قند', 'var(--c-sugar)', avgOf('sug'), 'g', `${fa(cnt(t => t.sug <= g.sug + 2))} روز بدون قند`],
    ];
    $('#statGrid').innerHTML = logged.length ? tiles.map(([l, c, v, u, sub]) => `
      <div class="stat"><div class="lbl"><i style="background:${c}"></i>میانگین ${l}</div>
      <div class="val">${fa(v)} <small>${u === 'g' ? 'گرم' : 'کالری'}</small></div><div class="sub">${sub}</div></div>`).join('') : '';

    renderReportInsights(logged, elapsed);
  }

  function chartSVG(stats) {
    const W = 340, H = 170, top = 14, bottom = 22, left = 4, right = 30;
    const n = stats.length, g = T();
    const m = METRICS[metric];
    const vals = stats.map(x => x.s ? m.get(x.s) : null);
    let maxV, refs = [];
    if (metric === 'score') { maxV = 100; refs = [{ v: 75, label: '۷۵' }]; }
    else if (metric === 'kcal') { maxV = Math.max(calMax() * 1.2, ...vals.filter(v => v != null)); refs = [{ v: g.kcal, label: fa(g.kcal) }, { v: calMax(), label: fa(calMax()) }]; }
    else {
      const tgt = g[metric];
      maxV = Math.max(tgt * 1.3, 10, ...vals.filter(v => v != null));
      refs = metric === 'sug' ? [] : [{ v: tgt, label: fa(tgt) }];
    }
    const ih = H - top - bottom, iw = W - left - right;
    const y = v => top + ih - (v / maxV) * ih;
    const bw = iw / n;
    const barW = Math.max(3, Math.min(26, bw * 0.62));
    const colorOf = v => {
      if (metric === 'score') return grade(v).color;
      if (metric === 'kcal') return v >= g.kcal && v <= calMax() ? 'var(--good)' : v > calMax() ? 'var(--bad)' : 'var(--warn)';
      if (metric === 'p' || metric === 'fib') return v >= g[metric] * .95 ? 'var(--good)' : 'var(--warn)';
      if (metric === 'c') return v <= g.c ? 'var(--good)' : 'var(--bad)';
      if (metric === 'f') return Math.abs(v - g.f) <= g.f * .15 ? 'var(--good)' : 'var(--warn)';
      return v <= g.sug + 2 ? 'var(--good)' : 'var(--bad)';
    };
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="نمودار ${m.label}">`;
    if (metric === 'kcal') s += `<rect x="${left}" y="${y(calMax())}" width="${iw}" height="${y(g.kcal) - y(calMax())}" fill="var(--good)" opacity=".1" rx="4"/>`;
    for (const r of refs) {
      s += `<line x1="${left}" x2="${left + iw}" y1="${y(r.v)}" y2="${y(r.v)}" stroke="var(--muted)" stroke-dasharray="3 4" stroke-width="1" opacity=".6"/>`;
      s += `<text x="${W - 2}" y="${y(r.v) + 3.5}" text-anchor="end">${r.label}</text>`;
    }
    s += `<line x1="${left}" x2="${left + iw}" y1="${top + ih}" y2="${top + ih}" stroke="var(--line)"/>`;
    stats.forEach((x, i) => {
      const cx = left + iw - (i + .5) * bw;   // راست به چپ
      const v = vals[i];
      if (v != null) {
        const h = Math.max(2, top + ih - y(Math.min(v, maxV)));
        s += `<rect x="${cx - barW / 2}" y="${top + ih - h}" width="${barW}" height="${h}" rx="${Math.min(6, barW / 2)}" fill="${colorOf(v)}"><title>${fmtDayMonth.format(x.d)}: ${fa(v)}</title></rect>`;
        if (n <= 7) s += `<text x="${cx}" y="${top + ih - h - 4}" text-anchor="middle" style="fill:var(--text);font-weight:700">${fa(v)}</text>`;
      } else if (!x.future) {
        s += `<circle cx="${cx}" cy="${top + ih - 3}" r="2" fill="var(--line)"/>`;
      }
      const lbl = n <= 7 ? fmtWeekdayNarrow.format(x.d) : ((i % 5 === 0 || i === n - 1) ? fmtDayNum.format(x.d) : '');
      if (lbl) s += `<text x="${cx}" y="${H - 6}" text-anchor="middle" ${sameDay(x.d, today()) ? 'style="fill:var(--accent);font-weight:700"' : ''}>${lbl}</text>`;
    });
    return s + '</svg>';
  }

  function renderReportInsights(logged, elapsed) {
    const box = $('#reportInsights');
    const g = T();
    const word = period === 'week' ? 'این هفته' : 'این ماه';
    if (!logged.length) {
      box.innerHTML = `<h3>📋 نتیجه‌گیری</h3><div class="empty"><span class="emoji">📊</span>در ${word} چیزی ثبت نشده.</div>`;
      return;
    }
    const out = [];
    const add = (cls, ic, html) => out.push(`<div class="ins ${cls}"><span class="ic">${ic}</span><span>${html}</span></div>`);

    const best = logged.reduce((a, x) => x.s.score > a.s.score ? x : a);
    const worst = logged.reduce((a, x) => x.s.score < a.s.score ? x : a);
    add('good', '🏆', `بهترین روز ${word}: <b>${fmtDayLong.format(best.d)}</b> با امتیاز ${fa(best.s.score)}`);
    if (logged.length > 1 && worst !== best) add('', '📉', `ضعیف‌ترین روز: ${fmtDayLong.format(worst.d)} (${fa(worst.s.score)})`);

    const avgRatio = {};
    for (const k in SCORE_MAX) avgRatio[k] = logged.reduce((a, x) => a + scoreOf(x.s.t).parts[k] / SCORE_MAX[k], 0) / logged.length;
    const sorted = Object.entries(avgRatio).sort((a, b) => a[1] - b[1]);
    const [weakK, weakV] = sorted[0];
    const [strongK, strongV] = sorted[sorted.length - 1];
    if (strongV >= .9) add('good', '💚', `نقطه قوت: <b>${SCORE_NAMES[strongK]}</b> (${fa(Math.round(strongV * 100))}٪ امتیاز ممکن)`);
    if (weakV < .9) add(weakV < .6 ? 'bad' : 'warn', '🎯', `بزرگ‌ترین نقطه ضعف: <b>${SCORE_NAMES[weakK]}</b> (${fa(Math.round(weakV * 100))}٪ امتیاز ممکن). ${adviceFor(weakK, logged)}`);

    // کسری انرژی و تخمین کاهش چربی
    const tdee = tdeeOf(S.profile);
    const avgK = logged.reduce((a, x) => a + x.s.t.kcal, 0) / logged.length;
    if (tdee) {
      const def = logged.reduce((a, x) => a + (tdee - x.s.t.kcal), 0);
      if (def > 0) add('good', '⚖️', `مجموع کسری انرژی روزهای ثبت‌شده ≈ ${fa(def)} کالری؛ یعنی حدود <b>${fa(def / 7.7)} گرم چربی</b> (تخمینی).`);
      else add('warn', '⚖️', `در مجموع کسری انرژی نداشتی؛ میانگین ${fa(avgK)} کالری در برابر نیاز ${fa(tdee)}.`);
    } else if (avgK > calMax() + 100) add('bad', '⚖️', `میانگین کالری ${fa(avgK)}؛ بالاتر از سقف ${fa(calMax())}.`);

    const sugar = new Map(), protein = new Map();
    for (const x of logged) for (const e of x.s.entries) {
      const n = entryN(e);
      if (n.sug > 0.5) sugar.set(e.name, (sugar.get(e.name) || 0) + n.sug);
      protein.set(e.name, (protein.get(e.name) || 0) + n.p);
    }
    const topSug = [...sugar.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topSug.length && topSug[0][1] > 5) add('bad', '🍬', `منابع اصلی قند: ${topSug.map(([n, v]) => `${esc(n)} (${fa(v)}g)`).join('، ')}`);
    const topP = [...protein.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topP.length) add('', '🥩', `منابع اصلی پروتئین: ${topP.map(([n, v]) => `${esc(n)} (${fa(v)}g)`).join('، ')}`);

    const missing = elapsed - logged.length;
    if (missing > 0) add('warn', '🗓️', `${fa(missing)} روز ${word} ثبت نشده. ثبت منظم = نتیجه دقیق‌تر.`);
    else add('good', '🔥', `همه روزهای ${word} را ثبت کردی. عالی!`);

    let streak = 0;
    for (let d = today(); streak < 400; d = addDays(d, -1)) {
      const s = dayStats(d);
      if (s && s.score >= 75) streak++;
      else if (!(sameDay(d, today()) && !s)) break;
    }
    if (streak >= 2) add('good', '⚡', `${fa(streak)} روز پیاپی با امتیاز ۷۵+`);

    box.innerHTML = `<h3>📋 نتیجه‌گیری ${word}</h3><div class="insights">${out.join('')}</div>`;
  }

  function adviceFor(k, logged) {
    const g = T();
    const avg = key => logged.reduce((a, x) => a + x.s.t[key], 0) / logged.length;
    switch (k) {
      case 'p': return `میانگین ${fa(avg('p'))} گرم در روز؛ روزانه ${fa(Math.max(0, g.p - avg('p')))} گرم بیشتر لازم است — مثلا یک وعده سینه مرغ یا ۱ اسکوپ وی اضافه.`;
      case 'fib': return `میانگین ${fa(avg('fib'))} گرم؛ سبزیجات بیشتر، تخم چیا یا کتان اضافه کن.`;
      case 'c': return `میانگین ${fa(avg('c'))} گرم؛ نان و برنج را کم کن و سبزیجات جایگزین کن.`;
      case 'f': return `میانگین ${fa(avg('f'))} گرم در برابر هدف ${fa(g.f)}؛ منابع چربی را با ترازو اندازه بگیر (روغن خیلی سریع کالری می‌آورد).`;
      case 'sug': return `میانگین ${fa(avg('sug'), 1)} گرم؛ میوه شیرین، نوشابه، شکر و آبمیوه را حذف کن.`;
      case 'cal': return `میانگین ${fa(avg('kcal'))} کالری؛ سعی کن هر روز بین ${fa(g.kcal)} و ${fa(calMax())} بمانی.`;
    }
    return '';
  }

  // ───────────────────────── اهداف: تغییر یکی، تنظیم بقیه ─────────────────────────
  /**
   * قانون: کالری = ۴×پروتئین + ۴×کربو + ۹×چربی همیشه برقرار می‌ماند.
   * - کالری عوض شود → پروتئین ثابت (حفظ عضله)، کربو و چربی به نسبت فعلی تغییر می‌کنند، فیبر به نسبت کالری.
   * - پروتئین عوض شود → کالری ثابت، تفاوت به نسبت از کربو و چربی کم/زیاد می‌شود.
   * - کربو عوض شود → کالری ثابت، چربی تنظیم می‌شود.
   * - چربی عوض شود → کالری ثابت، کربو تنظیم می‌شود.
   */
  function setTarget(key, val) {
    const t = { ...S.targets };
    val = Math.max(0, val);
    const r = Math.round;
    if (key === 'kcal') {
      const oldK = t.kcal;
      const oldRem = t.c * 4 + t.f * 9;
      const newRem = val - t.p * 4;
      if (newRem <= 0) { t.c = 0; t.f = 0; t.p = r(val / 4); }
      else if (oldRem > 0) { const k = newRem / oldRem; t.c = r(t.c * k); t.f = r(t.f * k); }
      else t.f = r(newRem / 9);
      if (oldK > 0) t.fib = r(t.fib * val / oldK);
      t.kcal = val;
    } else if (key === 'p') {
      const diff = (val - t.p) * 4;
      const cK = t.c * 4, fK = t.f * 9, tot = cK + fK;
      if (tot > 0) {
        const nc = Math.max(0, cK - diff * cK / tot), nf = Math.max(0, fK - diff * fK / tot);
        t.c = r(nc / 4); t.f = r(nf / 9);
      }
      t.p = val;
      t.kcal = r(t.p * 4 + t.c * 4 + t.f * 9);
    } else if (key === 'c') {
      t.c = val;
      t.f = r(Math.max(0, (t.kcal - t.p * 4 - t.c * 4) / 9));
      t.kcal = r(t.p * 4 + t.c * 4 + t.f * 9);
    } else if (key === 'f') {
      t.f = val;
      t.c = r(Math.max(0, (t.kcal - t.p * 4 - t.f * 9) / 4));
      t.kcal = r(t.p * 4 + t.c * 4 + t.f * 9);
    } else t[key] = val;
    const changed = Object.keys(t).filter(k => k !== key && t[k] !== S.targets[k]);
    S.targets = t;
    save();
    return changed;
  }

  const TARGET_FIELDS = [
    ['kcal', 'کالری روزانه', 'کالری', 50],
    ['p', 'پروتئین', 'گرم', 5],
    ['c', 'کربوهیدرات (حداکثر)', 'گرم', 5],
    ['f', 'چربی', 'گرم', 5],
    ['fib', 'فیبر', 'گرم', 1],
    ['sug', 'قند (حداکثر)', 'گرم', 1],
    ['range', 'بازه مجاز بالای کالری', 'کالری', 50],
  ];

  function targetSub(k) {
    const t = T(), w = bodyWeight();
    const tot = t.p * 4 + t.c * 4 + t.f * 9 || 1;
    if (k === 'kcal') return `مجاز تا ${fa(calMax())} کالری`;
    if (k === 'p') return `${fa(t.p * 4 / tot * 100)}٪ کالری${w ? ` · ${fa(t.p / w, 1)} گرم/کیلو` : ''}`;
    if (k === 'c') return `${fa(t.c * 4 / tot * 100)}٪ کالری`;
    if (k === 'f') return `${fa(t.f * 9 / tot * 100)}٪ کالری${w ? ` · ${fa(t.f / w, 1)} گرم/کیلو` : ''}`;
    if (k === 'fib') return `${fa(t.fib / t.kcal * 1000, 1)} گرم به ازای هر ۱۰۰۰ کالری`;
    if (k === 'sug') return 'هدف تو: صفر';
    return '';
  }

  function renderTargets(flash = []) {
    const t = T();
    const tot = t.p * 4 + t.c * 4 + t.f * 9 || 1;
    $('#targetsForm').innerHTML = `
      <div class="split-bar">
        <div style="width:${t.p * 4 / tot * 100}%;background:var(--c-protein)"></div>
        <div style="width:${t.c * 4 / tot * 100}%;background:var(--c-carb)"></div>
        <div style="width:${t.f * 9 / tot * 100}%;background:var(--c-fat)"></div>
      </div>
      <div class="split-legend small"><span><i style="background:var(--c-protein)"></i>پروتئین</span><span><i style="background:var(--c-carb)"></i>کربو</span><span><i style="background:var(--c-fat)"></i>چربی</span></div>
      ${TARGET_FIELDS.map(([k, l, u, step]) => `
        <div class="tgt ${flash.includes(k) ? 'flash' : ''}">
          <div><div class="tgt-name">${l}</div><div class="tgt-sub">${targetSub(k)}</div></div>
          <div class="stepper"><button data-k="${k}" data-s="-${step}">−</button><input type="number" inputmode="numeric" data-t="${k}" value="${t[k]}"><button data-k="${k}" data-s="${step}">+</button></div>
          <span class="tgt-u">${u}</span>
        </div>`).join('')}`;
    const apply = (k, v) => {
      if (!isFinite(v) || v < 0) { renderTargets(); return; }
      const ch = setTarget(k, v);
      renderTargets(ch);
      renderToday();
    };
    $$('#targetsForm input').forEach(i => i.addEventListener('change', () => apply(i.dataset.t, numOf(i.value))));
    $$('#targetsForm .stepper button').forEach(b => b.addEventListener('click', () => apply(b.dataset.k, T()[b.dataset.k] + +b.dataset.s)));
    const tdee = tdeeOf(S.profile);
    $('#fatNote').innerHTML = `با تغییر هر عدد، بقیه خودکار تنظیم می‌شوند تا همیشه <b>کالری = ۴×پروتئین + ۴×کربو + ۹×چربی</b> بماند. پروتئین موقع تغییر کالری ثابت می‌ماند تا عضله حفظ شود.`
      + (tdee ? `<br>کالری نگهداری تو ≈ <b>${fa(tdee)}</b> → کسری روزانه ${fa(tdee - t.kcal)} کالری ≈ <b>${fa((tdee - t.kcal) * 7 / 7700, 1)} کیلو</b> در هفته.` : '');
  }

  // ───────────────────────── ماشین‌حساب علمی ─────────────────────────
  const ACTIVITY = [
    [1.2, 'کم‌تحرک (کار پشت میز، بدون ورزش)'],
    [1.375, 'سبک (۱ تا ۳ جلسه ورزش در هفته)'],
    [1.55, 'متوسط (۳ تا ۵ جلسه در هفته)'],
    [1.725, 'زیاد (۶ تا ۷ جلسه در هفته)'],
    [1.9, 'خیلی زیاد (ورزش سنگین + کار بدنی)'],
  ];
  /** BMR: اگر درصد چربی معلوم است Katch-McArdle، وگرنه Mifflin-St Jeor */
  function bmrOf(p) {
    const w = +p.weight, h = +p.height, a = +p.age, bf = +p.bf;
    if (!(w > 30)) return null;
    if (bf > 3 && bf < 60) return 370 + 21.6 * w * (1 - bf / 100);
    if (!(h > 100 && a > 10)) return null;
    return 10 * w + 6.25 * h - 5 * a + (p.sex === 'f' ? -161 : 5);
  }
  function tdeeOf(p) { const b = bmrOf(p); return b ? Math.round(b * (+p.activity || 1.55) / 10) * 10 : null; }

  function suggestTargets(p) {
    const tdee = tdeeOf(p);
    if (!tdee) return null;
    const w = +p.weight, h = +p.height / 100, bf = +p.bf;
    const kcal = Math.round(tdee * (1 - (+p.deficit || 0.2)) / 50) * 50;
    // پروتئین: ۲٫۵ گرم/کیلو توده بدون چربی (بازه ۲٫۳–۳٫۱) یا ۲ گرم/کیلو وزن (بازه ۱٫۶–۲٫۴)
    let protein;
    if (bf > 3 && bf < 60) protein = 2.5 * w * (1 - bf / 100);
    else {
      const bmi = h ? w / (h * h) : 0;
      protein = 2.0 * (bmi >= 30 ? 27 * h * h : w);   // برای BMI بالا، بر اساس وزن تعدیل‌شده
    }
    protein = Math.round(protein / 5) * 5;
    let carbs = T().c;
    const fatMin = Math.max(0.6 * w, kcal * 0.2 / 9);
    let fat = (kcal - protein * 4 - carbs * 4) / 9;
    if (fat < fatMin) { fat = fatMin; carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4); }
    const fib = Math.max(25, Math.round(14 * kcal / 1000));
    return {
      tdee, bmr: Math.round(bmrOf(p)), kcal, p: protein, c: Math.round(carbs), f: Math.round(fat), fib,
      weekly: (tdee - kcal) * 7 / 7700,
    };
  }

  function openCalcSheet() {
    const p = { ...S.profile };
    openSheet(`
      <h3>🧮 محاسبه علمی اهداف</h3>
      <p class="small muted">هدف: کاهش درصد چربی با حفظ عضله. اگر درصد چربی را بدانی (با دستگاه یا کالیپر)، دقت بیشتر است.</p>
      <div class="chips" id="psex"><button class="chip ${p.sex !== 'f' ? 'on' : ''}" data-v="m">مرد</button><button class="chip ${p.sex === 'f' ? 'on' : ''}" data-v="f">زن</button></div>
      <div class="form-grid" style="margin-top:10px">
        <div class="field"><label>سن</label><input type="number" inputmode="numeric" id="page" value="${esc(p.age)}"></div>
        <div class="field"><label>قد (سانتی‌متر)</label><input type="number" inputmode="numeric" id="pheight" value="${esc(p.height)}"></div>
        <div class="field"><label>وزن (کیلو)</label><input type="number" inputmode="decimal" id="pweight" value="${esc(p.weight)}"></div>
        <div class="field"><label>درصد چربی (اختیاری)</label><input type="number" inputmode="decimal" id="pbf" value="${esc(p.bf)}" placeholder="مثلا ۲۲"></div>
        <div class="field full"><label>میزان فعالیت</label><select id="pact">${ACTIVITY.map(([v, l]) => `<option value="${v}" ${+p.activity === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>سرعت کاهش چربی</label><div class="chips" id="pdef">
        ${[[0.15, 'ملایم ۱۵٪'], [0.2, 'متعادل ۲۰٪'], [0.25, 'سریع ۲۵٪']].map(([v, l]) => `<button class="chip ${+p.deficit === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}
      </div></div>
      <div id="calcOut"></div>
      <div class="btn-row">
        <button class="btn" id="pcancel">بستن</button>
        <button class="btn primary" id="papply">اعمال این اهداف</button>
      </div>`);
    const read = () => {
      p.age = numOf($('#page').value); p.height = numOf($('#pheight').value);
      p.weight = numOf($('#pweight').value); p.bf = $('#pbf').value.trim() ? numOf($('#pbf').value) : '';
      p.activity = +$('#pact').value;
    };
    const show = () => {
      read();
      const s = suggestTargets(p);
      $('#calcOut').innerHTML = s ? `
        <div class="calc-res">
          <div class="row-between small"><span>متابولیسم پایه (BMR)</span><b>${fa(s.bmr)} کالری</b></div>
          <div class="row-between small"><span>کالری نگهداری (TDEE)</span><b>${fa(s.tdee)} کالری</b></div>
          <div class="nut-grid">
            <div class="nut"><b>${fa(s.kcal)}</b><span>کالری</span></div>
            <div class="nut"><b>${fa(s.p)}</b><span>پروتئین g</span></div>
            <div class="nut"><b>${fa(s.c)}</b><span>کربو g</span></div>
            <div class="nut"><b>${fa(s.f)}</b><span>چربی g</span></div>
            <div class="nut"><b>${fa(s.fib)}</b><span>فیبر g</span></div>
            <div class="nut"><b>${fa(s.weekly, 1)}</b><span>کیلو/هفته</span></div>
          </div>
          <p class="small muted">پروتئین: ${+p.bf ? '۲٫۵ گرم به ازای هر کیلو توده بدون چربی' : '۲ گرم به ازای هر کیلو وزن'} (بازه پیشنهادی برای حفظ عضله در کسری کالری). کربو همان سقف فعلی تو (${fa(T().c)} گرم) و بقیه کالری از چربی، با حداقل ۲۰٪ کالری برای سلامت هورمونی. فیبر ۱۴ گرم به ازای هر ۱۰۰۰ کالری (حداقل ۲۵).
          ${s.weekly > (+p.weight * 0.01) ? '<br>⚠️ این سرعت بیش از ۱٪ وزن در هفته است؛ برای حفظ عضله سرعت ملایم‌تر بهتر است.' : ''}</p>
        </div>` : '<p class="small muted">سن، قد و وزن را وارد کن.</p>';
      $('#papply').disabled = !s;
      return s;
    };
    $$('#psex .chip').forEach(b => b.addEventListener('click', () => { p.sex = b.dataset.v; $$('#psex .chip').forEach(x => x.classList.toggle('on', x === b)); show(); }));
    $$('#pdef .chip').forEach(b => b.addEventListener('click', () => { p.deficit = +b.dataset.v; $$('#pdef .chip').forEach(x => x.classList.toggle('on', x === b)); show(); }));
    $$('#page,#pheight,#pweight,#pbf').forEach(i => i.addEventListener('input', show));
    $('#pact').addEventListener('change', show);
    show();
    $('#pcancel').addEventListener('click', () => { read(); S.profile = p; save(); closeSheet(); renderSettings(); });
    $('#papply').addEventListener('click', () => {
      const s = show();
      if (!s) return;
      S.profile = p;
      S.targets = { ...S.targets, kcal: s.kcal, p: s.p, c: s.c, f: s.f, fib: s.fib };
      save(); closeSheet(); renderSettings(); renderToday();
      toast('اهداف جدید اعمال شد ✓');
    });
  }

  // ───────────────────────── تنظیمات ─────────────────────────
  function renderSettings() {
    renderTargets();
    const pr = S.profile, tdee = tdeeOf(pr);
    $('#profileLine').innerHTML = bodyWeight()
      ? `${pr.sex === 'f' ? 'زن' : 'مرد'} · ${fa(pr.age)} ساله · ${fa(pr.height)} سانت · ${fa(pr.weight, 1)} کیلو${+pr.bf ? ` · ${fa(pr.bf, 1)}٪ چربی` : ''}${tdee ? ` · نگهداری ${fa(tdee)} کالری` : ''}`
      : 'مشخصات بدنی وارد نشده';

    const cl = $('#customList');
    cl.innerHTML = S.custom.length
      ? S.custom.map(f => `<button class="custom-item" data-id="${f.id}" style="width:100%;text-align:right"><span>${esc(f.name)}</span><span class="muted small">${fa((f.u[f.d] || 100) * f.n.kcal / 100)} کالری / ${esc(Parser.unitLabel(f.d))}</span></button>`).join('')
      : `<p class="muted small">غذایی که در لیست نیست را اینجا تعریف کن تا از متن تشخیص داده شود.</p>`;
    $$('.custom-item', cl).forEach(b => b.addEventListener('click', () => openCustomSheet(b.dataset.id)));
    renderFoodSearch();
  }
  $('#calcBtn').addEventListener('click', openCalcSheet);
  $('#resetTargets').addEventListener('click', () => {
    if (!confirm('اهداف به پیش‌فرض (۱۸۰۰ کالری، ۱۸۰ پروتئین، ۵۰ کربو، ۹۸ چربی، ۳۰ فیبر) برگردد؟')) return;
    S.targets = { ...DEFAULT_TARGETS }; save(); renderSettings(); renderToday();
  });
  $('#addCustomBtn').addEventListener('click', () => openCustomSheet(null));
  $('#foodSearch').addEventListener('input', renderFoodSearch);
  function renderFoodSearch() {
    const q = $('#foodSearch').value;
    const box = $('#foodSearchRes');
    if (!q.trim()) { box.innerHTML = `<p class="muted small">${fa(Parser.foods.length)} غذا در لیست هست (مقادیر بر پایه داده‌های USDA و جداول ایرانی). جستجو کن تا ببینی هر کدام چقدر کالری دارد.</p>`; return; }
    const res = Parser.search(q);
    box.innerHTML = res.length ? res.map(f => {
      const w = (f.u && f.u[f.d]) || 100;
      const k = w / 100;
      return `<div class="food-row"><div><div>${esc(f.name)}</div><div class="muted">۱ ${esc(Parser.unitLabel(f.d))} ≈ ${fa(w)} گرم</div></div>
        <div class="muted" style="text-align:left">${fa(f.n.kcal * k)} کالری · ${fa(f.n.p * k, 1)}g پروتئین<br>کربو ${fa(f.n.c * k, 1)} · چربی ${fa(f.n.f * k, 1)} · فیبر ${fa(f.n.fib * k, 1)}</div></div>`;
    }).join('') : `<p class="muted small">پیدا نشد. از «غذای جدید» اضافه‌اش کن.</p>`;
  }

  // پشتیبان
  $('#exportBtn').addEventListener('click', async () => {
    const data = JSON.stringify({ app: 'diet', v: 2, exported: new Date().toISOString(), ...S }, null, 1);
    const name = `diet-backup-${dayKey(today())}.json`;
    const file = new File([data], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'پشتیبان دفتر تغذیه' }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('#importInput').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || typeof d.days !== 'object') throw new Error('bad');
      if (!confirm('اطلاعات فعلی با فایل پشتیبان جایگزین شود؟')) return;
      S = normalizeState({ ...d, hideInstall: true });
      save(); Parser.build(S.custom); renderSettings(); renderToday();
      toast('بازیابی شد ✓');
    } catch (e) { toast('فایل نامعتبر است'); }
    ev.target.value = '';
  });
  $('#wipeBtn').addEventListener('click', () => {
    if (!confirm('همه اطلاعات پاک شود؟ این کار برگشت‌پذیر نیست.')) return;
    if (!confirm('مطمئنی؟')) return;
    S = { ...fresh(), hideInstall: S.hideInstall };
    save(); Parser.build(S.custom); renderSettings(); renderToday(); toast('پاک شد');
  });

  // ───────────────────────── راهنمای نصب iOS ─────────────────────────
  function renderInstallHint() {
    const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let el = $('#installHint');
    if (standalone || !ios || S.hideInstall) { if (el) el.remove(); return; }
    if (el) return;
    el = document.createElement('div');
    el.id = 'installHint';
    el.className = 'card';
    el.innerHTML = `<div class="row-between"><b>📲 نصب روی صفحه اصلی</b><button class="btn small" id="hideInstall">بستن</button></div>
      <div class="small muted" style="margin-top:6px">در Safari دکمه <b>Share</b> (مربع با فلش ↑) را بزن و <b>Add to Home Screen</b> را انتخاب کن تا مثل یک اپ واقعی و آفلاین کار کند.</div>`;
    $('#view-today').prepend(el);
    $('#hideInstall').addEventListener('click', () => { S.hideInstall = true; save(); el.remove(); });
  }

  // ───────────────────────── شروع ─────────────────────────
  renderToday();
  updatePreview();

  let lastHidden = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { lastHidden = Date.now(); return; }
    if (view === 'today' && Date.now() - lastHidden > 30 * 60e3) {
      if (!sameDay(cur, today())) { cur = today(); selMeal = 'new'; }
      renderToday();
    }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
