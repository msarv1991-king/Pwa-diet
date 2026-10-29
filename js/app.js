(() => {
  'use strict';

  // ───────────────────────── ذخیره‌سازی ─────────────────────────
  const KEY = 'diet.v1';
  const DEFAULT_TARGETS = { calMin: 1800, calMax: 2000, p: 180, c: 50, fib: 30, sug: 0 };

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.days) return { days: s.days, custom: s.custom || [], targets: { ...DEFAULT_TARGETS, ...(s.targets || {}) }, hideInstall: !!s.hideInstall };
    } catch (e) { /* داده خراب */ }
    return { days: {}, custom: [], targets: { ...DEFAULT_TARGETS }, hideInstall: false };
  }
  let S = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast('ذخیره نشد! حافظه پر است'); }
  }
  // درخواست حافظه ماندگار (تا iOS اطلاعات را پاک نکند)
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

  const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); };
  const sameDay = (a, b) => dayKey(a) === dayKey(b);

  const fmtDayLong = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtDayMonth = new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'long' });
  const fmtMonthYear = new Intl.DateTimeFormat('fa-IR', { month: 'long', year: 'numeric' });
  const fmtWeekdayNarrow = new Intl.DateTimeFormat('fa-IR', { weekday: 'narrow' });
  const fmtDayNum = new Intl.DateTimeFormat('fa-IR', { day: 'numeric' });
  const fmtPersianNum = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' });
  function persian(d) {
    const p = {};
    for (const part of fmtPersianNum.formatToParts(d)) if (part.type !== 'literal') p[part.type] = +part.value;
    return p;
  }

  const MEALS = { breakfast: 'صبحانه', lunch: 'ناهار', snack: 'میان‌وعده', dinner: 'شام' };
  const MEAL_ICON = { breakfast: '🌅', lunch: '🍽️', snack: '🍎', dinner: '🌙' };
  function mealByTime() {
    const h = new Date().getHours();
    if (h < 11) return 'breakfast';
    if (h < 16) return 'lunch';
    if (h < 19) return 'snack';
    return 'dinner';
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
  }

  // ───────────────────────── محاسبات ─────────────────────────
  const T = () => S.targets;
  const fatTarget = () => Math.max(0, Math.round((T().calMin - T().p * 4 - T().c * 4) / 9));

  function entryN(e) {
    const k = e.grams / 100, p = e.per;
    return { kcal: p.kcal * k, p: p.p * k, c: p.c * k, f: p.f * k, fib: p.fib * k, sug: p.sug * k };
  }
  function totals(entries) {
    const t = { kcal: 0, p: 0, c: 0, f: 0, fib: 0, sug: 0 };
    for (const e of entries || []) { const n = entryN(e); for (const k in t) t[k] += n[k]; }
    return t;
  }

  /** امتیاز ۰ تا ۱۰۰: کالری ۳۰، پروتئین ۳۰، کربو ۱۵، فیبر ۱۵، قند ۱۰ */
  function scoreOf(t) {
    const g = T();
    let cal;
    if (t.kcal < g.calMin) cal = 1 - (g.calMin - t.kcal) / 900;
    else if (t.kcal > g.calMax) cal = 1 - (t.kcal - g.calMax) / 600;
    else cal = 1;
    const p = g.p ? t.p / g.p : 1;
    const c = t.c <= g.c ? 1 : 1 - (t.c - g.c) / Math.max(g.c, 25);
    const fib = g.fib ? t.fib / g.fib : 1;
    const allow = g.sug + 2;
    const sug = t.sug <= allow ? 1 : 1 - (t.sug - allow) / 20;
    const parts = {
      cal: clamp01(cal) * 30, p: clamp01(p) * 30, c: clamp01(c) * 15, fib: clamp01(fib) * 15, sug: clamp01(sug) * 10,
    };
    const total = Math.round(parts.cal + parts.p + parts.c + parts.fib + parts.sug);
    return { total, parts };
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

  // ───────────────────────── وضعیت رابط ─────────────────────────
  let cur = today();
  let meal = mealByTime();
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
  }

  // ───────────────────────── تاریخ ─────────────────────────
  $('#prevDay').addEventListener('click', () => { cur = addDays(cur, -1); renderToday(); });
  $('#nextDay').addEventListener('click', () => { if (!sameDay(cur, today())) { cur = addDays(cur, 1); renderToday(); } });
  $('#dateLabel').addEventListener('click', () => { cur = today(); renderToday(); });

  function dateTitle(d) {
    const t = today();
    if (sameDay(d, t)) return 'امروز · ' + fmtDayMonth.format(d);
    if (sameDay(d, addDays(t, -1))) return 'دیروز · ' + fmtDayMonth.format(d);
    return fmtDayLong.format(d);
  }

  // ───────────────────────── صفحه امروز ─────────────────────────
  function renderToday() {
    $('#dateLabel').textContent = dateTitle(cur);
    $('#nextDay').disabled = sameDay(cur, today());
    const entries = dayEntries(cur);
    const t = totals(entries);
    const g = T();
    const sc = entries.length ? scoreOf(t).total : null;
    const gr = grade(sc);

    // حلقه امتیاز
    const ring = $('#scoreRing');
    ring.style.strokeDashoffset = 326.7 * (1 - (sc || 0) / 100);
    ring.style.stroke = gr.color;
    $('#scoreNum').textContent = sc == null ? '–' : fa(sc);
    $('#scoreLabel').textContent = sc == null ? 'هنوز چیزی ثبت نشده' : `امتیاز · ${gr.label}`;

    // کالری
    $('#calNum').textContent = fa(t.kcal);
    $('#calTarget').textContent = ` / ${fa(g.calMin)}`;
    const scale = g.calMax * 1.15;
    const band = $('#calBand');
    band.style.right = (g.calMin / scale * 100) + '%';
    band.style.width = ((g.calMax - g.calMin) / scale * 100) + '%';
    const fill = $('#calFill');
    fill.style.width = Math.min(100, t.kcal / scale * 100) + '%';
    fill.style.background = t.kcal > g.calMax ? 'var(--bad)' : '';
    let remain;
    if (t.kcal < g.calMin) remain = `<span class="muted">${fa(g.calMin - t.kcal)} کالری تا هدف</span>`;
    else if (t.kcal <= g.calMax) remain = `<span style="color:var(--good)">✓ در محدوده هدف (${fa(g.calMin)}–${fa(g.calMax)})</span>`;
    else remain = `<span style="color:var(--bad)">${fa(t.kcal - g.calMax)} کالری بیش از سقف</span>`;
    $('#calRemain').innerHTML = remain;

    // ماکروها
    $('#macros').innerHTML = [
      macroRow('پروتئین', 'var(--c-protein)', t.p, g.p, 'min'),
      macroRow('کربوهیدرات', 'var(--c-carb)', t.c, g.c, 'max'),
      macroRow('فیبر', 'var(--c-fiber)', t.fib, g.fib, 'min'),
      macroRow('قند', 'var(--c-sugar)', t.sug, g.sug, 'zero'),
      macroRow('چربی', 'var(--c-fat)', t.f, fatTarget(), 'max'),
    ].join('');

    // وعده‌ها
    $$('#mealTabs button').forEach(b => b.classList.toggle('on', b.dataset.meal === meal));
    renderMeals(entries);
    renderDayInsights(entries, t);
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
    } else { // قند: هدف صفر
      const allow = target + 2;
      ratio = val / 25;
      if (val <= allow) tag = `<span class="tag good">✓ عالی</span>`;
      else { tag = `<span class="tag ${val <= 10 ? 'warn' : 'bad'}">باید صفر باشد</span>`; }
    }
    const w = Math.min(100, ratio * 100);
    const tgt = mode === 'zero' ? fa(target) : fa(target);
    return `<div class="macro">
      <div class="macro-name"><i style="background:${color}"></i>${name}${tag}</div>
      <div class="macro-val"><b>${fa(val, 1)}</b> <span class="muted">/ ${tgt} گرم</span></div>
      <div class="bar"><div style="width:${w}%;background:${barColor}"></div></div>
    </div>`;
  }

  function renderMeals(entries) {
    const box = $('#mealsList');
    if (!entries.length) {
      box.innerHTML = `<div class="card empty"><span class="emoji">🥗</span>هنوز چیزی برای ${sameDay(cur, today()) ? 'امروز' : 'این روز'} ثبت نکردی.<br><span class="small">هر چی خوردی را بالا بنویس، خودم حساب می‌کنم.</span></div>`;
      return;
    }
    let html = '';
    for (const m of Object.keys(MEALS)) {
      const list = entries.filter(e => e.meal === m);
      if (!list.length) continue;
      const mt = totals(list);
      html += `<div class="card meal"><div class="meal-head"><span>${MEAL_ICON[m]} ${MEALS[m]}</span><span>${fa(mt.kcal)} کالری · ${fa(mt.p)}g پروتئین</span></div>`;
      for (const e of list) {
        const n = entryN(e);
        html += `<button class="entry" data-id="${e.id}">
          <div class="entry-main">
            <div class="entry-title">${esc(entryLabel(e))}</div>
            <div class="entry-sub">${fa(e.grams)} گرم · پروتئین ${fa(n.p, 1)} · کربو ${fa(n.c, 1)} · فیبر ${fa(n.fib, 1)}${n.sug > 0.5 ? ` · قند ${fa(n.sug, 1)}` : ''}</div>
          </div>
          <div class="entry-kcal">${fa(n.kcal)} <small>کالری</small></div>
        </button>`;
      }
      html += '</div>';
    }
    box.innerHTML = html;
    $$('.entry', box).forEach(b => b.addEventListener('click', () => openEntrySheet(b.dataset.id)));
  }

  function entryLabel(e) {
    if (e.unit === 'g') return `${fa(e.grams)} گرم ${e.name}`;
    const q = e.grams / e.ug;
    const qs = Math.abs(q - 0.5) < 0.01 ? 'نیم' : fa(Math.round(q * 100) / 100, 1);
    return `${qs} ${Parser.unitLabel(e.unit)} ${e.name}`;
  }

  // ───────────────────────── ورودی متنی ─────────────────────────
  const input = $('#foodInput');
  let parseTimer;
  input.addEventListener('input', () => {
    autoGrow();
    clearTimeout(parseTimer); parseTimer = setTimeout(updatePreview, 120);
  });
  function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(220, input.scrollHeight + 2) + 'px'; }

  function updatePreview() {
    parsed = Parser.parse(input.value);
    const box = $('#preview');
    let html = '';
    for (const it of parsed.items) {
      html += `<div class="pv-item"><span>✓ ${esc(it.label)}</span><span class="pv-n">${fa(it.n.kcal)} کالری · ${fa(it.n.p, 1)}g پروتئین</span></div>`;
    }
    parsed.unknown.forEach((u, i) => {
      html += `<div class="pv-item pv-unknown"><span>❓ «${esc(u.text)}» را نشناختم</span><button data-u="${i}">تعریف کن</button></div>`;
    });
    if (parsed.items.length > 1) {
      const t = parsed.items.reduce((a, it) => { a.k += it.n.kcal; a.p += it.n.p; a.c += it.n.c; return a; }, { k: 0, p: 0, c: 0 });
      html += `<div class="pv-total">جمع: ${fa(t.k)} کالری · ${fa(t.p)}g پروتئین · ${fa(t.c)}g کربو</div>`;
    }
    box.innerHTML = html;
    $$('[data-u]', box).forEach(b => b.addEventListener('click', () => openCustomSheet(null, parsed.unknown[+b.dataset.u].text)));
    $('#addBtn').disabled = !parsed.items.length;
  }

  $$('#mealTabs button').forEach(b => b.addEventListener('click', () => {
    meal = b.dataset.meal;
    $$('#mealTabs button').forEach(x => x.classList.toggle('on', x === b));
  }));

  $('#addBtn').addEventListener('click', addParsed);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addParsed(); }
  });

  function addParsed() {
    updatePreview();
    if (!parsed.items.length) return;
    const k = dayKey(cur);
    const list = S.days[k] || (S.days[k] = []);
    for (const it of parsed.items) {
      list.push({
        id: uid(), name: it.name, foodId: it.foodId, src: it.src,
        qty: it.qty, unit: it.unit, ug: it.qty ? it.grams / it.qty : it.grams, grams: it.grams,
        per: { ...it.food.n }, meal, ts: Date.now(),
      });
    }
    save();
    const n = parsed.items.length;
    const kcal = parsed.items.reduce((a, it) => a + it.n.kcal, 0);
    input.value = ''; autoGrow(); updatePreview();
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
      autoGrow(); updatePreview();
    }));
  }

  // ───────────────────────── نتیجه‌گیری روز ─────────────────────────
  function renderDayInsights(entries, t) {
    const box = $('#dayInsights');
    const g = T();
    if (!entries.length) {
      box.innerHTML = `<h3>🎯 هدف روزانه</h3><div class="insights">
        <div class="ins"><span class="ic">🔥</span><span>کالری بین <b>${fa(g.calMin)}</b> تا <b>${fa(g.calMax)}</b></span></div>
        <div class="ins"><span class="ic">💪</span><span>پروتئین <b>${fa(g.p)}</b> گرم · کربو حداکثر <b>${fa(g.c)}</b> گرم · فیبر <b>${fa(g.fib)}</b> گرم</span></div>
        <div class="ins"><span class="ic">🚫</span><span>قند <b>صفر</b> · چربی حدود <b>${fa(fatTarget())}</b> گرم (برای تکمیل ${fa(g.calMin)} کالری)</span></div>
      </div>`;
      return;
    }
    const out = [];
    const add = (cls, ic, html) => out.push(`<div class="ins ${cls}"><span class="ic">${ic}</span><span>${html}</span></div>`);

    // کالری
    if (t.kcal < g.calMin) add('', '🔥', `<b>${fa(g.calMin - t.kcal)}</b> کالری دیگر تا حداقل هدف (${fa(g.calMin)}) جا داری.`);
    else if (t.kcal <= g.calMax) add('good', '🔥', `کالری در محدوده هدف است. تا سقف ${fa(g.calMax)} فقط <b>${fa(g.calMax - t.kcal)}</b> کالری مانده.`);
    else add('bad', '🔥', `<b>${fa(t.kcal - g.calMax)}</b> کالری از سقف ${fa(g.calMax)} بیشتر خوردی.`);

    // پروتئین
    if (t.p >= g.p) add('good', '💪', `پروتئین کامل شد (${fa(t.p)} گرم). عالی!`);
    else add(t.p >= g.p * .75 ? 'warn' : 'bad', '💪', `<b>${fa(g.p - t.p)}</b> گرم پروتئین کم داری (${fa(Math.round(t.p / g.p * 100))}٪ هدف).`);

    // کربو
    if (t.c <= g.c) add('good', '🍞', `کربوهیدرات ${fa(t.c)} گرم — هنوز <b>${fa(g.c - t.c)}</b> گرم جا داری.`);
    else add('bad', '🍞', `کربوهیدرات <b>${fa(t.c - g.c)}</b> گرم بیشتر از حد (${fa(g.c)}) شد.${topSources(entries, 'c')}`);

    // فیبر
    if (t.fib >= g.fib) add('good', '🥦', `فیبر کامل است (${fa(t.fib)} گرم).`);
    else add(t.fib >= g.fib * .6 ? 'warn' : 'bad', '🥦', `<b>${fa(g.fib - t.fib)}</b> گرم فیبر کم داری.`);

    // قند
    if (t.sug <= g.sug + 2) add('good', '🍬', `قند تقریبا صفر — آفرین!`);
    else add('bad', '🍬', `<b>${fa(t.sug, 1)}</b> گرم قند خوردی؛ هدف صفر است.${topSources(entries, 'sug')}`);

    // چربی
    const ft = fatTarget();
    if (t.f > ft * 1.15) add('warn', '🥑', `چربی ${fa(t.f)} گرم است؛ بالاتر از بودجه ${fa(ft)} گرم.`);

    box.innerHTML = `<h3>📋 نتیجه‌گیری</h3><div class="insights">${out.join('')}</div>${balancePlan(t)}`;
  }

  function topSources(entries, key) {
    const m = new Map();
    for (const e of entries) { const v = entryN(e)[key]; if (v > 0.5) m.set(e.name, (m.get(e.name) || 0) + v); }
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (!top.length) return '';
    return `<br><span class="small">بیشترین سهم: ${top.map(([n, v]) => `${esc(n)} (${fa(v, 1)}g)`).join('، ')}</span>`;
  }

  /** پیشنهاد برای بستن روز و رسیدن متعادل به حداقل کالری هدف */
  function balancePlan(t) {
    const g = T();
    if (!sameDay(cur, today())) return '';
    if (t.kcal >= g.calMax) {
      return `<div class="plan"><h4>🧭 بقیه امروز</h4><ul><li>کالری پر شده؛ اگر گرسنه شدی فقط سبزیجات (خیار، کاهو، کلم) و آب/چای بدون قند.</li></ul></div>`;
    }
    const items = [];
    let kcal = 0, carbs = 0;
    const pGap = g.p - t.p;
    if (pGap > 5) {
      const ch = round5(pGap / 0.31);
      kcal += ch * 1.65;
      const whites = Math.ceil(pGap / 3.6), scoops = Math.round(pGap / 24 * 2) / 2;
      items.push(`<b>${fa(ch)} گرم سینه مرغ</b> (≈${fa(pGap)}g پروتئین) — یا ${fa(whites)} عدد سفیده${scoops >= 0.5 && scoops <= 3 ? `، یا ${fa(scoops, 1)} اسکوپ وی` : ''}`);
    }
    const fGap = g.fib - t.fib;
    if (fGap > 3) {
      let left = fGap;
      const chia = Math.min(2, Math.floor(left / 4));
      if (chia > 0) { items.push(`<b>${fa(chia)} قاشق تخم چیا</b> (≈${fa(chia * 4)}g فیبر)`); kcal += chia * 58; carbs += chia * 5; left -= chia * 4.1; }
      if (left > 1) {
        const veg = Math.min(600, round5(left / 2.6 * 100));
        items.push(`<b>${fa(veg)} گرم سبزیجات</b> مثل بروکلی، گل‌کلم، کاهو و خیار (≈${fa(left)}g فیبر)`);
        kcal += veg * 0.3; carbs += veg * 0.06;
      }
    }
    const rest = g.calMin - t.kcal - kcal;
    const carbRoom = g.c - t.c - carbs;
    if (rest > 60) {
      const alm = round5(rest / 5.8);
      const oil = Math.round(rest / 119 * 2) / 2;
      items.push(`<b>${fa(Math.min(alm, 60))} گرم بادام یا گردو</b>${alm > 60 ? ` + ${fa(Math.round((rest - 60 * 5.8) / 119 * 2) / 2, 1)} قاشق روغن زیتون روی سالاد` : ` — یا ${fa(oil, 1)} قاشق روغن زیتون`} برای رسیدن به ${fa(g.calMin)} کالری با چربی سالم`);
    }
    if (!items.length) {
      if (t.kcal >= g.calMin) return `<div class="plan"><h4>🧭 جمع‌بندی</h4><ul><li>روز متعادلی بود. ادامه بده! ✨</li></ul></div>`;
      return '';
    }
    let foot = '';
    const after = t.kcal + kcal + Math.max(0, rest);
    if (rest < -60) foot = `<li class="small">با این برنامه حدود ${fa(t.kcal + kcal)} کالری می‌شود${t.kcal + kcal > g.calMax ? ' که بیشتر از سقف است؛ چربی و کربو را کم کن.' : ' که هنوز در محدوده مجاز است.'}</li>`;
    else foot = `<li class="small muted">جمع پیش‌بینی: حدود ${fa(Math.max(after, g.calMin))} کالری${carbRoom < 0 ? ' — کربو از حد گذشته، نان و برنج را حذف کن.' : ''}</li>`;
    return `<div class="plan"><h4>🧭 پیشنهاد برای رسیدن به ${fa(g.calMin)} کالری متعادل</h4><ul>${items.map(i => `<li>${i}</li>`).join('')}${foot}</ul></div>`;
  }

  // ───────────────────────── برگه ویرایش ─────────────────────────
  function openSheet(html) {
    $('#sheetBody').innerHTML = html;
    $('#sheet').classList.add('on'); $('#sheetBackdrop').classList.add('on');
  }
  function closeSheet() {
    $('#sheet').classList.remove('on'); $('#sheetBackdrop').classList.remove('on');
    document.activeElement && document.activeElement.blur();
  }
  $('#sheetBackdrop').addEventListener('click', closeSheet);

  function openEntrySheet(id) {
    const list = dayEntries(cur);
    const e = list.find(x => x.id === id);
    if (!e) return;
    const mealOpts = Object.entries(MEALS).map(([k, v]) => `<button class="chip ${k === e.meal ? 'on' : ''}" data-m="${k}">${v}</button>`).join('');
    openSheet(`
      <h3>${esc(e.name)}</h3>
      <div class="field"><label>مقدار (گرم)</label><input type="number" inputmode="decimal" id="egrams" value="${Math.round(e.grams * 10) / 10}"></div>
      <div class="mult-row"><button data-x=".5">نصف</button><button data-x="1.5">×۱٫۵</button><button data-x="2">×۲</button>${e.unit !== 'g' ? `<button data-x="+1">+۱ ${esc(Parser.unitLabel(e.unit))}</button>` : ''}</div>
      <div class="nut-grid" id="enuts"></div>
      <div class="chips" id="emeal">${mealOpts}</div>
      <div class="btn-row">
        <button class="btn danger" id="edel">حذف</button>
        <button class="btn primary" id="esave">ذخیره</button>
      </div>`);
    let m = e.meal;
    const gi = $('#egrams');
    const upd = () => {
      const gr = Math.max(0, parseFloat(Parser.norm(gi.value)) || 0);
      const n = entryN({ ...e, grams: gr });
      $('#enuts').innerHTML = [['کالری', n.kcal, 0], ['پروتئین', n.p, 1], ['کربو', n.c, 1], ['فیبر', n.fib, 1], ['قند', n.sug, 1], ['چربی', n.f, 1]]
        .map(([l, v, d]) => `<div class="nut"><b>${fa(v, d)}</b><span>${l}</span></div>`).join('');
    };
    upd();
    gi.addEventListener('input', upd);
    $$('.mult-row button').forEach(b => b.addEventListener('click', () => {
      const gr = parseFloat(Parser.norm(gi.value)) || 0;
      gi.value = Math.round((b.dataset.x === '+1' ? gr + e.ug : gr * +b.dataset.x) * 10) / 10;
      upd();
    }));
    $$('#emeal .chip').forEach(b => b.addEventListener('click', () => {
      m = b.dataset.m; $$('#emeal .chip').forEach(x => x.classList.toggle('on', x === b));
    }));
    $('#edel').addEventListener('click', () => {
      S.days[dayKey(cur)] = list.filter(x => x.id !== id);
      if (!S.days[dayKey(cur)].length) delete S.days[dayKey(cur)];
      save(); closeSheet(); renderToday(); toast('حذف شد');
    });
    $('#esave').addEventListener('click', () => {
      const gr = parseFloat(Parser.norm(gi.value));
      if (!(gr > 0)) { toast('مقدار نامعتبر است'); return; }
      e.grams = gr; e.meal = m;
      save(); closeSheet(); renderToday();
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
      <div class="btn-row">
        ${f ? '<button class="btn danger" id="cdel">حذف</button>' : '<button class="btn" id="ccancel">انصراف</button>'}
        <button class="btn primary" id="csave">ذخیره</button>
      </div>`);
    const num = id => { const v = parseFloat(Parser.norm($('#' + id).value)); return isFinite(v) ? v : 0; };
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
  $('#prevPeriod').addEventListener('click', () => { anchor = period === 'week' ? addDays(periodDays()[0], -1) : addDays(periodDays()[0], -1); renderReport(); });
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
    score: { label: 'امتیاز', get: s => s.score, unit: '' },
    kcal: { label: 'کالری', get: s => s.t.kcal, unit: '' },
    p: { label: 'پروتئین', get: s => s.t.p, unit: 'g' },
    c: { label: 'کربو', get: s => s.t.c, unit: 'g' },
    fib: { label: 'فیبر', get: s => s.t.fib, unit: 'g' },
    sug: { label: 'قند', get: s => s.t.sug, unit: 'g' },
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

    // قهرمان
    const avg = logged.length ? Math.round(logged.reduce((a, x) => a + x.s.score, 0) / logged.length) : null;
    const gr = grade(avg);
    const prevDays = periodDays(period, addDays(first, -1));
    const prevLogged = prevDays.map(dayStats).filter(Boolean);
    const prevAvg = prevLogged.length ? Math.round(prevLogged.reduce((a, s) => a + s.score, 0) / prevLogged.length) : null;
    let trend = '';
    if (avg != null && prevAvg != null) {
      const diff = avg - prevAvg;
      trend = diff > 0 ? `<span style="color:var(--good)">▲ ${fa(diff)} امتیاز بهتر از ${period === 'week' ? 'هفته' : 'ماه'} قبل</span>`
        : diff < 0 ? `<span style="color:var(--bad)">▼ ${fa(-diff)} امتیاز کمتر از ${period === 'week' ? 'هفته' : 'ماه'} قبل</span>`
          : `<span class="muted">مثل ${period === 'week' ? 'هفته' : 'ماه'} قبل</span>`;
    }
    $('#reportHero').innerHTML = `
      <div class="ring-wrap">
        <svg class="ring" viewBox="0 0 120 120"><circle class="ring-bg" cx="60" cy="60" r="52"/><circle class="ring-fg" cx="60" cy="60" r="52" style="stroke:${gr.color};stroke-dashoffset:${326.7 * (1 - (avg || 0) / 100)}"/></svg>
        <div class="ring-center"><div class="ring-score">${avg == null ? '–' : fa(avg)}</div><div class="ring-label">میانگین امتیاز</div></div>
      </div>
      <div class="hero-cal">
        <div class="cal-big" style="font-size:22px">${avg == null ? 'بدون داده' : `${gr.emoji} ${gr.label}`}</div>
        <div class="small muted">${fa(logged.length)} روز ثبت‌شده از ${fa(elapsed)} روز</div>
        <div class="small">${trend}</div>
      </div>`;

    // نمودار
    $('#metricChips').innerHTML = Object.entries(METRICS).map(([k, m]) => `<button class="chip ${k === metric ? 'on' : ''}" data-k="${k}">${m.label}</button>`).join('');
    $$('#metricChips .chip').forEach(b => b.addEventListener('click', () => { metric = b.dataset.k; renderReport(); }));
    $('#chart').innerHTML = chartSVG(stats);

    // آمار
    const avgOf = key => logged.length ? logged.reduce((a, x) => a + x.s.t[key], 0) / logged.length : 0;
    const cnt = fn => logged.filter(x => fn(x.s.t)).length;
    const tiles = [
      ['کالری', 'var(--accent)', avgOf('kcal'), '', `${fa(cnt(t => t.kcal >= g.calMin && t.kcal <= g.calMax))} روز در محدوده`],
      ['پروتئین', 'var(--c-protein)', avgOf('p'), 'g', `${fa(cnt(t => t.p >= g.p * .95))} روز به هدف رسید`],
      ['کربوهیدرات', 'var(--c-carb)', avgOf('c'), 'g', `${fa(cnt(t => t.c <= g.c))} روز زیر ${fa(g.c)}`],
      ['فیبر', 'var(--c-fiber)', avgOf('fib'), 'g', `${fa(cnt(t => t.fib >= g.fib * .95))} روز به هدف رسید`],
      ['قند', 'var(--c-sugar)', avgOf('sug'), 'g', `${fa(cnt(t => t.sug <= g.sug + 2))} روز بدون قند`],
      ['چربی', 'var(--c-fat)', avgOf('f'), 'g', `بودجه: ${fa(fatTarget())} گرم`],
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
    else if (metric === 'kcal') { maxV = Math.max(g.calMax * 1.2, ...vals.filter(v => v != null)); refs = [{ v: g.calMin, label: fa(g.calMin) }, { v: g.calMax, label: fa(g.calMax) }]; }
    else {
      const tgt = { p: g.p, c: g.c, fib: g.fib, sug: g.sug }[metric];
      maxV = Math.max(tgt * 1.3, 10, ...vals.filter(v => v != null));
      refs = metric === 'sug' ? [] : [{ v: tgt, label: fa(tgt) }];
    }
    const ih = H - top - bottom, iw = W - left - right;
    const y = v => top + ih - (v / maxV) * ih;
    const bw = iw / n;
    const barW = Math.max(3, Math.min(26, bw * 0.62));
    const colorOf = v => {
      if (metric === 'score') return grade(v).color;
      if (metric === 'kcal') return v >= g.calMin && v <= g.calMax ? 'var(--good)' : v > g.calMax ? 'var(--bad)' : 'var(--warn)';
      if (metric === 'p' || metric === 'fib') return v >= ({ p: g.p, fib: g.fib }[metric]) * .95 ? 'var(--good)' : 'var(--warn)';
      if (metric === 'c') return v <= g.c ? 'var(--good)' : 'var(--bad)';
      return v <= g.sug + 2 ? 'var(--good)' : 'var(--bad)';
    };
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="نمودار ${m.label}">`;
    if (metric === 'kcal') s += `<rect x="${left}" y="${y(g.calMax)}" width="${iw}" height="${y(g.calMin) - y(g.calMax)}" fill="var(--good)" opacity=".1" rx="4"/>`;
    for (const r of refs) {
      s += `<line x1="${left}" x2="${left + iw}" y1="${y(r.v)}" y2="${y(r.v)}" stroke="var(--muted)" stroke-dasharray="3 4" stroke-width="1" opacity=".6"/>`;
      s += `<text x="${W - 2}" y="${y(r.v) + 3.5}" text-anchor="end">${r.label}</text>`;
    }
    s += `<line x1="${left}" x2="${left + iw}" y1="${top + ih}" y2="${top + ih}" stroke="var(--line)"/>`;
    stats.forEach((x, i) => {
      // راست به چپ: روز اول در سمت راست
      const cx = left + iw - (i + .5) * bw;
      const v = vals[i];
      if (v != null) {
        const h = Math.max(2, top + ih - y(Math.min(v, maxV)));
        s += `<rect class="bar-r" x="${cx - barW / 2}" y="${top + ih - h}" width="${barW}" height="${h}" rx="${Math.min(6, barW / 2)}" fill="${colorOf(v)}"><title>${fmtDayMonth.format(x.d)}: ${fa(v)}</title></rect>`;
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
    if (!logged.length) {
      box.innerHTML = `<h3>📋 نتیجه‌گیری</h3><div class="empty"><span class="emoji">📊</span>در این ${period === 'week' ? 'هفته' : 'ماه'} چیزی ثبت نشده.</div>`;
      return;
    }
    const out = [];
    const add = (cls, ic, html) => out.push(`<div class="ins ${cls}"><span class="ic">${ic}</span><span>${html}</span></div>`);
    const word = period === 'week' ? 'این هفته' : 'این ماه';

    // بهترین و بدترین روز
    const best = logged.reduce((a, x) => x.s.score > a.s.score ? x : a);
    const worst = logged.reduce((a, x) => x.s.score < a.s.score ? x : a);
    add('good', '🏆', `بهترین روز ${word}: <b>${fmtDayLong.format(best.d)}</b> با امتیاز ${fa(best.s.score)}`);
    if (logged.length > 1 && worst !== best) add('', '📉', `ضعیف‌ترین روز: ${fmtDayLong.format(worst.d)} (${fa(worst.s.score)})`);

    // نقاط قوت و ضعف
    const MAXP = { cal: 30, p: 30, c: 15, fib: 15, sug: 10 };
    const NAMES = { cal: 'کالری', p: 'پروتئین', c: 'کربوهیدرات', fib: 'فیبر', sug: 'قند' };
    const avgRatio = {};
    for (const k in MAXP) avgRatio[k] = logged.reduce((a, x) => a + scoreOf(x.s.t).parts[k] / MAXP[k], 0) / logged.length;
    const sorted = Object.entries(avgRatio).sort((a, b) => a[1] - b[1]);
    const [weakK, weakV] = sorted[0];
    const [strongK, strongV] = sorted[sorted.length - 1];
    if (strongV >= .9) add('good', '💚', `نقطه قوت: <b>${NAMES[strongK]}</b> (${fa(Math.round(strongV * 100))}٪ امتیاز ممکن)`);
    if (weakV < .9) add(weakV < .6 ? 'bad' : 'warn', '🎯', `بزرگ‌ترین نقطه ضعف: <b>${NAMES[weakK]}</b> (${fa(Math.round(weakV * 100))}٪ امتیاز ممکن). ${adviceFor(weakK, logged)}`);

    // منابع قند
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

    // ثبت منظم
    const missing = elapsed - logged.length;
    if (missing > 0) add('warn', '🗓️', `${fa(missing)} روز ${word} ثبت نشده. ثبت منظم = نتیجه دقیق‌تر.`);
    else add('good', '🔥', `همه روزهای ${word} را ثبت کردی. عالی!`);

    // روزهای پیاپی خوب
    let streak = 0;
    for (let d = today(); ; d = addDays(d, -1)) {
      const s = dayStats(d);
      if (s && s.score >= 75) streak++;
      else if (!(sameDay(d, today()) && !s)) break;
      if (streak > 400) break;
    }
    if (streak >= 2) add('good', '⚡', `${fa(streak)} روز پیاپی با امتیاز ۷۵+`);

    // میانگین کالری نسبت به هدف
    const avgK = logged.reduce((a, x) => a + x.s.t.kcal, 0) / logged.length;
    if (avgK < g.calMin - 150) add('warn', '⚖️', `میانگین کالری ${fa(avgK)} است؛ کمتر از هدف. کم‌خوری طولانی عضله را کم می‌کند.`);
    else if (avgK > g.calMax + 100) add('bad', '⚖️', `میانگین کالری ${fa(avgK)} است؛ بالاتر از سقف ${fa(g.calMax)}.`);

    box.innerHTML = `<h3>📋 نتیجه‌گیری ${word}</h3><div class="insights">${out.join('')}</div>`;
  }

  function adviceFor(k, logged) {
    const g = T();
    const avg = key => logged.reduce((a, x) => a + x.s.t[key], 0) / logged.length;
    switch (k) {
      case 'p': return `میانگین ${fa(avg('p'))} گرم در روز؛ روزانه ${fa(Math.max(0, g.p - avg('p')))} گرم بیشتر لازم است — مثلا یک وعده سینه مرغ یا ۱ اسکوپ وی اضافه.`;
      case 'fib': return `میانگین ${fa(avg('fib'))} گرم؛ سبزیجات بیشتر، تخم چیا یا کتان اضافه کن.`;
      case 'c': return `میانگین ${fa(avg('c'))} گرم؛ نان و برنج را کم کن و سبزیجات جایگزین کن.`;
      case 'sug': return `میانگین ${fa(avg('sug'), 1)} گرم؛ میوه شیرین، نوشابه، شکر و آبمیوه را حذف کن.`;
      case 'cal': return `میانگین ${fa(avg('kcal'))} کالری؛ سعی کن هر روز بین ${fa(g.calMin)} و ${fa(g.calMax)} بمانی.`;
    }
    return '';
  }

  // ───────────────────────── تنظیمات ─────────────────────────
  function renderSettings() {
    const g = T();
    const fields = [
      ['calMin', 'حداقل کالری'], ['calMax', 'حداکثر کالری'], ['p', 'پروتئین (گرم)'],
      ['c', 'حداکثر کربو (گرم)'], ['fib', 'فیبر (گرم)'], ['sug', 'حداکثر قند (گرم)'],
    ];
    $('#targetsForm').innerHTML = fields.map(([k, l]) => `<div class="field"><label>${l}</label><input type="number" inputmode="numeric" data-t="${k}" value="${g[k]}"></div>`).join('');
    $$('#targetsForm input').forEach(i => i.addEventListener('change', () => {
      const v = parseFloat(Parser.norm(i.value));
      if (isFinite(v) && v >= 0) { S.targets[i.dataset.t] = v; save(); renderFatNote(); renderToday(); }
      else i.value = S.targets[i.dataset.t];
    }));
    renderFatNote();

    const cl = $('#customList');
    cl.innerHTML = S.custom.length
      ? S.custom.map(f => `<button class="custom-item" data-id="${f.id}" style="width:100%;text-align:right"><span>${esc(f.name)}</span><span class="muted small">${fa((f.u[f.d] || 100) * f.n.kcal / 100)} کالری / ${esc(Parser.unitLabel(f.d))}</span></button>`).join('')
      : `<p class="muted small">غذایی که در لیست نیست را اینجا تعریف کن تا از متن تشخیص داده شود.</p>`;
    $$('.custom-item', cl).forEach(b => b.addEventListener('click', () => openCustomSheet(b.dataset.id)));
    renderFoodSearch();
  }
  function renderFatNote() {
    const g = T();
    $('#fatNote').innerHTML = `چربی به‌صورت خودکار برای بالانس ${fa(g.calMin)} کالری حساب می‌شود: <b>${fa(fatTarget())} گرم</b> (${fa(g.p)}×۴ + ${fa(g.c)}×۴ + چربی×۹ = ${fa(g.calMin)})`;
  }
  $('#addCustomBtn').addEventListener('click', () => openCustomSheet(null));
  $('#foodSearch').addEventListener('input', renderFoodSearch);
  function renderFoodSearch() {
    const q = $('#foodSearch').value;
    const box = $('#foodSearchRes');
    if (!q.trim()) { box.innerHTML = `<p class="muted small">${fa(Parser.foods.length)} غذا در لیست هست. جستجو کن تا ببینی هر کدام چقدر کالری دارد.</p>`; return; }
    const res = Parser.search(q);
    box.innerHTML = res.length ? res.map(f => {
      const w = (f.u && f.u[f.d]) || 100;
      const k = w / 100;
      return `<div class="food-row"><div><div>${esc(f.name)}</div><div class="muted">۱ ${esc(Parser.unitLabel(f.d))} ≈ ${fa(w)} گرم</div></div>
        <div class="muted" style="text-align:left">${fa(f.n.kcal * k)} کالری · ${fa(f.n.p * k, 1)}g پروتئین<br>کربو ${fa(f.n.c * k, 1)} · فیبر ${fa(f.n.fib * k, 1)} · قند ${fa(f.n.sug * k, 1)}</div></div>`;
    }).join('') : `<p class="muted small">پیدا نشد. از «غذای جدید» اضافه‌اش کن.</p>`;
  }

  // پشتیبان
  $('#exportBtn').addEventListener('click', async () => {
    const data = JSON.stringify({ app: 'diet', v: 1, exported: new Date().toISOString(), ...S }, null, 1);
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
      S = { days: d.days, custom: d.custom || [], targets: { ...DEFAULT_TARGETS, ...(d.targets || {}) }, hideInstall: true };
      save(); Parser.build(S.custom); renderSettings(); renderToday();
      toast('بازیابی شد ✓');
    } catch (e) { toast('فایل نامعتبر است'); }
    ev.target.value = '';
  });
  $('#wipeBtn').addEventListener('click', () => {
    if (!confirm('همه اطلاعات پاک شود؟ این کار برگشت‌پذیر نیست.')) return;
    if (!confirm('مطمئنی؟')) return;
    S = { days: {}, custom: [], targets: { ...DEFAULT_TARGETS }, hideInstall: S.hideInstall };
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

  // اگر برنامه روز بعد باز شد، به امروز برگرد
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && view === 'today' && !sameDay(cur, today()) && Date.now() - lastHidden > 30 * 60e3) { cur = today(); meal = mealByTime(); renderToday(); }
    if (document.visibilityState === 'hidden') lastHidden = Date.now();
  });
  let lastHidden = Date.now();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
