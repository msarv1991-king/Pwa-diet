/*
 * تبدیل متن آزاد فارسی به لیست غذا + مقدار
 * مثال: «۵ عدد سفیده تخم مرغ یک عدد زرده، یک اسکوپ وی، ۸ قاشق برنج»
 */
const Parser = (() => {
  const NUM_WORDS = {
    'یک': 1, 'یه': 1, 'یکی': 1, 'یدونه': 1, 'یدانه': 1,
    'دو': 2, 'سه': 3, 'چهار': 4, 'چار': 4, 'پنج': 5, 'شش': 6, 'شیش': 6, 'هفت': 7, 'هشت': 8, 'نه': 9,
    'ده': 10, 'یازده': 11, 'دوازده': 12, 'سیزده': 13, 'چهارده': 14, 'پانزده': 15, 'پونزده': 15,
    'شانزده': 16, 'شونزده': 16, 'هفده': 17, 'هیفده': 17, 'هجده': 18, 'هیجده': 18, 'نوزده': 19,
    'بیست': 20, 'سی': 30, 'چهل': 40, 'پنجاه': 50, 'شصت': 60, 'هفتاد': 70, 'هشتاد': 80, 'نود': 90,
    'صد': 100, 'یکصد': 100, 'دویست': 200, 'سیصد': 300, 'چهارصد': 400, 'پانصد': 500, 'پونصد': 500,
    'ششصد': 600, 'هفتصد': 700, 'هشتصد': 800, 'نهصد': 900, 'هزار': 1000,
    'نیم': 0.5, 'نصف': 0.5, 'نصفه': 0.5, 'نیمه': 0.5, 'ربع': 0.25,
  };

  // کلمات بی‌اهمیت که نباید «غذای ناشناخته» حساب شوند
  const STOP = new Set([
    'خوردم', 'خوردیم', 'خورده', 'خوردن', 'میخورم', 'هم', 'حدود', 'تقریبا', 'حدودا', 'کمی', 'یکم', 'یکمی', 'کم', 'زیاد',
    'را', 'رو', 'از', 'به', 'در', 'یا', 'که', 'ی', 'اینجوری', 'مثلا', 'بود', 'هست', 'است', 'شد',
    'صبحانه', 'صبونه', 'ناهار', 'نهار', 'شام', 'میان', 'وعده', 'میانوعده', 'عصرانه', 'بعد', 'قبل', 'تمرین', 'باشگاه',
    'پخته', 'آبپز', 'ابپز', 'گریل', 'کبابی', 'بخارپز', 'خام', 'سرخ', 'کرده', 'شده', 'تازه', 'ساده', 'خانگی', 'معمولی',
    'بزرگ', 'کوچیک', 'کوچک', 'متوسط', 'پر', 'سرپر', 'لب', 'کامل', 'خالی', 'تنها', 'فقط', 'دیگه', 'دیگر', 'اضافه',
  ]);

  const SEPARATORS = new Set(['و', 'با', '+', ',', '،', '؛', ';', '.', '-', '|']);

  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹', AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

  function norm(s) {
    return String(s)
      .replace(/[۰-۹]/g, d => FA_DIGITS.indexOf(d))
      .replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d))
      .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه').replace(/[أإٱ]/g, 'ا').replace(/ؤ/g, 'و')
      .replace(/آ/g, 'ا')
      .replace(/[ً-ٰٟـ]/g, '')           // اعراب و کشیده
      .replace(/[‌‍‎‏]/g, ' ')            // نیم‌فاصله
      .replace(/٫/g, '.').replace(/½/g, ' 0.5 ').replace(/¼/g, ' 0.25 ')
      .replace(/(\d)\s*[\/]\s*(\d)/g, '$1/$2')
      .replace(/(\d)([^\d.\/\s])/g, '$1 $2').replace(/([^\d.\/\s])(\d)/g, '$1 $2')
      .replace(/([+،,؛;|()])/g, ' $1 ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ── ساخت فهرست‌های جستجو
  let aliasMap = new Map();   // نام نرمال‌شده → غذا
  let maxAliasLen = 1;
  let unitMap = new Map();    // نام نرمال‌شده واحد → واحد استاندارد
  let maxUnitLen = 1;
  let foods = [];

  function build(customFoods) {
    aliasMap = new Map(); maxAliasLen = 1; foods = [];
    const add = (food) => {
      foods.push(food);
      for (const a of food.aliases) {
        const k = norm(a);
        if (!k) continue;
        if (!aliasMap.has(k) || food.custom) aliasMap.set(k, food);
        maxAliasLen = Math.max(maxAliasLen, k.split(' ').length);
      }
    };
    // غذاهای شخصی اول، تا اگر هم‌نام بودند اولویت داشته باشند
    for (const c of customFoods || []) add({ ...c, custom: true });
    for (const r of FOOD_ROWS) {
      const aliases = r[0].split('|');
      const sug = SUGAR_FREE_FOODS.has(aliases[0]) ? 0 : r[6];
      add({ id: aliases[0], name: aliases[0], aliases, n: { kcal: r[1], p: r[2], c: r[3], f: r[4], fib: r[5], sug }, u: r[7], d: r[8] });
    }
    unitMap = new Map(); maxUnitLen = 1;
    for (const [canon, list] of Object.entries(UNIT_ALIASES)) {
      for (const a of list) {
        const k = norm(a);
        unitMap.set(k, canon);
        maxUnitLen = Math.max(maxUnitLen, k.split(' ').length);
      }
    }
  }

  // ── تبدیل کلمات عددی
  function parseNumToken(t) {
    if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
    if (/^\d+\/\d+$/.test(t)) { const [a, b] = t.split('/').map(Number); return b ? a / b : null; }
    if (t in NUM_WORDS) return NUM_WORDS[t];
    const m = t.match(/^(.+?)(تا|تایی|دونه|دانه)$/);    // «دوتا»، «سه‌تایی»
    if (m && m[1] in NUM_WORDS) return NUM_WORDS[m[1]];
    return null;
  }

  function tokenize(line) {
    const raw = (' ' + norm(line) + ' ').replace(/ سی ?سی /g, ' cc ').split(' ').filter(Boolean);
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      const t = raw[i];
      let n = parseNumToken(t);
      if (n !== null) {
        // «دوتا» → عدد + واحد «تا»
        const hadTa = !/^\d/.test(t) && /(تا|تایی)$/.test(t) && !(t in NUM_WORDS);
        // اعداد ترکیبی: «بیست و پنج»، «یک و نیم»، «صد و بیست»
        while (raw[i + 1] === 'و' && i + 2 < raw.length) {
          const n2 = parseNumToken(raw[i + 2]);
          if (n2 === null || n2 >= n) break;
          n += n2; i += 2;
        }
        // «دو تا سه» → میانگین
        out.push({ n });
        if (hadTa) out.push({ w: 'تا' });
        continue;
      }
      out.push({ w: t });
    }
    // «هزار» به‌عنوان ضریب: «دو هزار» (نادر ولی ممکن)
    return out;
  }

  // ── شکستن متن به بخش‌های جدا (هر بخش = یک غذا)
  function segmentize(tokens) {
    const segs = [];
    let cur = [];
    const hasWord = (seg) => seg.some(t => t.w && !STOP.has(t.w) && !unitMap.has(t.w));
    for (const t of tokens) {
      if (t.w && SEPARATORS.has(t.w)) { if (cur.length) segs.push(cur); cur = []; continue; }
      if (t.n !== undefined && hasWord(cur)) { segs.push(cur); cur = []; }
      cur.push(t);
    }
    if (cur.length) segs.push(cur);
    return segs;
  }

  // پیدا کردن طولانی‌ترین تطابق در فهرست
  function findLongest(words, map, maxLen) {
    let best = null;
    for (let i = 0; i < words.length; i++) {
      if (words[i] === null) continue;
      for (let L = Math.min(maxLen, words.length - i); L >= 1; L--) {
        const slice = words.slice(i, i + L);
        if (slice.some(x => x === null)) continue;
        const key = slice.join(' ');
        if (map.has(key)) {
          if (!best || L > best.len) best = { i, len: L, val: map.get(key) };
          break;
        }
      }
    }
    return best;
  }

  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0]; dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = dp[j];
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return dp[b.length];
  }

  function fuzzyFood(text) {
    if (text.length < 3) return null;
    let best = null, bestD = 9;
    for (const [k, food] of aliasMap) {
      const d = lev(text, k);
      const limit = k.length >= 7 ? 2 : (k.length >= 4 ? 1 : 0);
      if (d <= limit && d < bestD) { best = food; bestD = d; }
    }
    return best;
  }

  function stripSuffix(w) {
    return w.replace(/(های|ها|هایی)$/, '') || w;
  }

  function analyzeSegment(seg) {
    const nums = seg.filter(t => t.n !== undefined).map(t => t.n);
    let words = seg.filter(t => t.w).map(t => t.w);
    if (!words.length && !nums.length) return null;

    // ۱) پیدا کردن غذا
    let food = null;
    let wArr = words.slice();
    let m = findLongest(wArr, aliasMap, maxAliasLen);
    if (!m) {
      const stripped = wArr.map(stripSuffix);
      m = findLongest(stripped, aliasMap, maxAliasLen);
      if (m) wArr = stripped;
    }
    if (m) {
      food = m.val;
      for (let k = m.i; k < m.i + m.len; k++) wArr[k] = null;
    }

    // ۲) پیدا کردن واحد
    let unit = null;
    const um = findLongest(wArr, unitMap, maxUnitLen);
    if (um) { unit = um.val; for (let k = um.i; k < um.i + um.len; k++) wArr[k] = null; }

    const rest = wArr.filter(w => w !== null && !STOP.has(w) && !unitMap.has(w));

    if (!food && rest.length) {
      food = fuzzyFood(rest.join(' '));
      if (!food && rest.length > 1) for (const w of rest) { food = fuzzyFood(w); if (food) break; }
    }

    let qty = nums.length ? nums[0] : null;
    if (nums.length >= 2 && seg.some(t => t.w === 'تا')) {
      // «۲ تا ۳ عدد» → میانگین
      const idx = seg.findIndex(t => t.w === 'تا');
      if (seg[idx - 1] && seg[idx - 1].n !== undefined && seg[idx + 1] && seg[idx + 1].n !== undefined) {
        qty = (seg[idx - 1].n + seg[idx + 1].n) / 2;
        if (unit === 'عدد' && !seg.some((t, j) => j !== idx && t.w && unitMap.get(t.w) === 'عدد')) unit = null;
      }
    }

    return { food, qty, unit, rest, text: words.join(' ') };
  }

  function gramsFor(food, qty, unit) {
    const q = qty == null ? 1 : qty;
    if (!unit) {
      // «۲۰۰ مرغ» → احتمالاً گرم
      if (qty != null && qty >= 30 && food.d !== 'g') return { grams: q, unit: 'g', qty: q };
      unit = food.d || 'g';
    }
    let per;
    if (['g', 'kg', 'ml', 'l'].includes(unit)) per = GENERIC_UNIT_GRAMS[unit];
    else if (food.u && food.u[unit] != null) per = food.u[unit];
    else if (unit === 'عدد') { unit = food.d; per = (food.u && food.u[food.d]) || GENERIC_UNIT_GRAMS[food.d] || 100; }
    else if (unit === 'پیمانه' && food.u && food.u['لیوان']) per = food.u['لیوان'];
    else if (unit === 'اسکوپ' && food.u && food.u['پیمانه']) per = food.u['پیمانه'];
    else per = GENERIC_UNIT_GRAMS[unit] || 100;
    return { grams: q * per, unit, qty: q };
  }

  function nutrientsFor(food, grams) {
    const k = grams / 100, n = food.n;
    return {
      kcal: n.kcal * k, p: n.p * k, c: n.c * k, f: n.f * k, fib: n.fib * k, sug: n.sug * k,
    };
  }

  function unitLabel(u) { return UNIT_LABELS[u] || u; }

  /** خروجی: { items: [...], unknown: [...] } */
  function parse(text) {
    const items = [], unknown = [];
    const lines = String(text).split(/\n+/);
    for (const line of lines) {
      const segs = segmentize(tokenize(line));
      let last = null;   // آخرین آیتم این خط (برای «تخم مرغ ۲ عدد»)
      for (const seg of segs) {
        const a = analyzeSegment(seg);
        if (!a) continue;
        if (!a.food) {
          // فقط مقدار بود → به غذای قبلی بچسبان
          if (!a.rest.length && (a.qty != null || a.unit) && last && !last._explicit) {
            Object.assign(last, buildItem(last.food, a.qty, a.unit, last.src + ' ' + a.text), { _explicit: true });
            continue;
          }
          if (a.rest.length) unknown.push({ text: a.rest.join(' '), qty: a.qty, unit: a.unit });
          continue;
        }
        const it = buildItem(a.food, a.qty, a.unit, a.text);
        it._explicit = a.qty != null || !!a.unit;
        items.push(it);
        last = it;
      }
    }
    items.forEach(i => delete i._explicit);
    return { items, unknown };
  }

  function buildItem(food, qty, unit, src) {
    const g = gramsFor(food, qty, unit);
    return {
      food, src,
      foodId: food.id, name: food.name,
      qty: g.qty, unit: g.unit, grams: Math.round(g.grams * 10) / 10,
      label: describe(g.qty, g.unit, food.name),
      n: nutrientsFor(food, g.grams),
    };
  }

  function fmtQty(q) {
    if (q === 0.5) return 'نیم';
    if (q === 0.25) return 'ربع';
    return (Math.round(q * 100) / 100).toLocaleString('fa-IR');
  }

  function describe(qty, unit, name) {
    return `${fmtQty(qty)} ${unitLabel(unit)} ${name}`;
  }

  function search(q) {
    const k = norm(q);
    if (!k) return foods.slice(0, 40);
    const seen = new Set(), res = [];
    for (const f of foods) {
      if (seen.has(f)) continue;
      if (f.aliases.some(a => norm(a).includes(k))) { res.push(f); seen.add(f); }
    }
    return res.slice(0, 60);
  }

  function canonUnit(s) {
    const k = norm(s);
    return unitMap.get(k) || k || 'عدد';
  }

  return { build, parse, canonUnit, norm, nutrientsFor, gramsFor, unitLabel, describe, search, get foods() { return foods; } };
})();
