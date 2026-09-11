import { getJson, putJson, getSettings } from './kv.js';
import { sendToUser, resolveToken } from './bot-api.js';
import { text as tr, str, int, isChatId, isValidTime, assert } from './config.js';
import { publicFeed, safePublicUrl } from './network.js';
import { parseFeed } from './automation.js';
import { fetchLimited } from './services/common.js';

export const NEWS_CATEGORIES = {
  breaking: { fa: '🚨 خبرهای فوری و مهم', en: '🚨 Breaking & Top Stories', icon: 'zap' },
  politics: { fa: '🏛 اخبار سیاسی و دولت', en: '🏛 Politics & Government', icon: 'landmark' },
  economy: { fa: '📈 اخبار اقتصادی و بازار', en: '📈 Economy & Markets', icon: 'trending-up' },
  sports: { fa: '⚽ اخبار ورزشی', en: '⚽ Sports News', icon: 'trophy' },
  tech: { fa: '💻 فناوری و دانش‌بنیان', en: '💻 Tech & Innovation', icon: 'cpu' },
  world: { fa: '🌍 خبرهای کل جهان', en: '🌍 World News', icon: 'globe-2' },
};
export const NEWS_CATEGORY_KEYS = ['all', ...Object.keys(NEWS_CATEGORIES)];
export const NEWS_SEND_CATS = ['breaking', 'politics', 'economy', 'sports', 'tech', 'world'];
// Categories the user can browse inside the bot, per region.
export const NEWS_REGION_CATS = ['breaking', 'politics', 'economy', 'sports', 'tech'];
export const WORLD_REGION_CATS = ['all', 'politics', 'economy', 'sports', 'tech'];

export const NEWS_SOURCES = [
  { id: 'irna', name: 'خبرگزاری ایرنا (IRNA)', url: 'https://www.irna.ir/rss' },
  { id: 'isna', name: 'خبرگزاری ایسنا (ISNA)', url: 'https://www.isna.ir/rss' },
  { id: 'mehr', name: 'خبرگزاری مهر (Mehr)', url: 'https://www.mehrnews.com/rss' },
  { id: 'tasnim', name: 'خبرگزاری تسنیم (Tasnim)', url: 'https://www.tasnimnews.com/fa/rss/feed/0/0/0' },
  { id: 'tabnak', name: 'تابناک (Tabnak)', url: 'https://www.tabnak.ir/fa/rss/allnews' },
];

// World news is deliberately kept separate from the Iranian feeds.  Apart from
// giving users a clear choice, this prevents an Iranian headline from silently
// appearing in the world-news view when one provider is unavailable.
export const WORLD_NEWS_SOURCES = [
  { id: 'bbc-world', name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'aljazeera-world', name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'guardian-world', name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss' },
  { id: 'npr-world', name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml' },
];

export const FALLBACK_NEWS = [
  {
    id: 'n1',
    category: 'breaking',
    title: 'توسعه زیرساخت‌های ملی ارتباطات و اقتصاد دیجیتال در کشور',
    summary: 'وزارت ارتباطات از اتصال روستاهای جدید به شبکه ملی اطلاعات و افزایش پهنای باند و تسهیلات شرکت‌های دانش‌بنیان خبر داد.',
    source: 'خبرگزاری ایرنا',
    url: 'https://www.irna.ir',
    publishedAt: Date.now() - 15 * 60000,
  },
  {
    id: 'n2',
    category: 'breaking',
    title: 'تصویب بسته‌های حمایتی جدید برای توسعه صادرات غیرنفتی',
    summary: 'هیئت دولت آئین‌نامه تسهیل مبادلات تجاری، تسهیلات گمرکی و کاهش بروکراسی برای صادرکنندگان را ابلاغ کرد.',
    source: 'خبرگزاری ایسنا',
    url: 'https://www.isna.ir',
    publishedAt: Date.now() - 40 * 60000,
  },
  {
    id: 'n3',
    category: 'politics',
    title: 'گسترش همکاری‌های دیپلماتیک و اقتصادی با کشورهای همسایه',
    summary: 'رایزنی‌های مشترک تجاری و ترانزیتی در حوزه قفقاز و خلیج فارس با هدف افزایش حجم مبادلات منطقه‌ای وارد فاز اجرایی شد.',
    source: 'خبرگزاری تسنیم',
    url: 'https://www.tasnimnews.com',
    publishedAt: Date.now() - 60 * 60000,
  },
  {
    id: 'n4',
    category: 'economy',
    title: 'رشد تولید صنعتی و افزایش حجم معاملات در بورس کالا',
    summary: 'گزارش‌های رسمی حاکی از رشد تقاضا در بخش فولاد، پتروشیمی و سیمان در رینگ صادراتی و بازار داخلی است.',
    source: 'خبرگزاری مهر',
    url: 'https://www.mehrnews.com',
    publishedAt: Date.now() - 90 * 60000,
  },
  {
    id: 'n5',
    category: 'sports',
    title: 'پیروزی تیم ملی در دیدارهای تدارکاتی و آمادگی برای مسابقات بین‌المللی',
    summary: 'کادر فنی تیم ملی از روند تمرینات و سطح آمادگی ملی‌پوشان در آستانه تورنمنت آسیایی ابراز رضایت کرد.',
    source: 'خبرگزاری ایسنا',
    url: 'https://www.isna.ir',
    publishedAt: Date.now() - 120 * 60000,
  },
  {
    id: 'n6',
    category: 'tech',
    title: 'رونمایی از سامانه‌های جدید هوش مصنوعی و خدمات ابری بومی',
    summary: 'متخصصان پارک‌های علم و فناوری از پلتفرم پردازش زبان فارسی و زیرساخت هوش مصنوعی بومی بهره‌برداری کردند.',
    source: 'تابناک',
    url: 'https://www.tabnak.ir',
    publishedAt: Date.now() - 180 * 60000,
  },
];

/* Keyword classifiers. A dedicated feed per category is unreliable across Iranian
 * agencies, so every general source is aggregated and each item is classified by
 * keywords. Title hits weigh more than summary hits. */
const NEWS_KEYWORDS = {
  politics: ['سیاست', 'سیاسی', 'دولت', 'مجلس', 'وزیر', 'رییس‌جمهور', 'رئیس‌جمهور', 'دیپلمات', 'انتخابات', 'کابینه', 'پارلمان', 'هیئت دولت', 'عراقچی', 'روابط خارجی', 'سخنگوی وزارت', 'قطعنامه', 'مذاکره', 'government', 'parliament', 'political', 'minister', 'president', 'diplomat', 'election'],
  economy: ['اقتصاد', 'اقتصادی', 'بورس', 'بازار سرمایه', 'دلار', 'تورم', 'ارز', 'نفت', 'صادرات', 'واردات', 'بانک مرکزی', 'یارانه', 'سرمایه‌گذاری', 'پتروشیمی', 'فولاد', 'سکه', 'طلا', 'بودجه', 'مالیات', 'economy', 'market', 'inflation', 'stock', 'oil', 'export', 'budget'],
  sports: ['ورزش', 'ورزشی', 'فوتبال', 'تیم ملی', 'لیگ برتر', 'استقلال', 'پرسپولیس', 'بازیکن', 'مربی', 'فدراسیون', 'المپیک', 'کشتی', 'والیبال', 'بسکتبال', 'هندبال', 'جام جهانی', 'نفت آبادان', 'سپاهان', 'تراکتور', 'دروازه‌بان', 'گلزنی', 'sport', 'football', 'soccer', 'league', 'match', 'olympic', 'goal'],
  tech: ['فناوری', 'هوش مصنوعی', 'تکنولوژی', 'دیجیتال', 'اینترنت', 'موبایل', 'گوشی', 'اپلیکیشن', 'نرم‌افزار', 'سخت‌افزار', 'استارتاپ', 'دانش‌بنیان', 'رمزارز', 'بیت‌کوین', 'فضای مجازی', 'سایبری', 'پهپاد', 'ماهواره', 'ناسا', 'رباتیک', 'tech', 'software', 'internet', 'digital', 'startup', 'crypto', 'artificial intelligence'],
};
const NEWS_KEYWORD_FALLBACK_ORDER = ['politics', 'economy', 'sports', 'tech'];

// English-language classifier for the world feeds; items without a clear score
// stay in the general ("all") bucket instead of a forced category.
const WORLD_KEYWORDS = {
  politics: ['government', 'parliament', 'political', 'minister', 'president', 'election', 'diplomacy', 'diplomat', 'summit', 'united nations', 'white house', 'congress', 'senate', 'sanction', 'sanctions', 'treaty', 'coalition', 'opposition', 'prime minister', 'cabinet', 'military', 'army', 'defense', 'defence', 'attack', 'ceasefire', 'peace talks', 'protest', 'policy', 'minister', 'leader'],
  economy: ['economy', 'economic', 'markets', 'inflation', 'interest rates', 'central bank', 'gdp', 'trade', 'tariffs', 'exports', 'imports', 'oil prices', 'stocks', 'investment', 'budget', 'currency', 'dollar', 'euro', 'recession', 'unemployment', 'companies', 'banks', 'investors', 'commodities', 'prices', 'jobs'],
  sports: ['sports', 'football', 'soccer', 'olympics', 'olympic', 'tennis', 'golf', 'basketball', 'cricket', 'racing', 'formula 1', 'f1', 'matches', 'league', 'championship', 'tournament', 'world cup', 'finals', 'players', 'coach', 'stadium', 'season', 'win', 'defeat'],
  tech: ['technology', 'tech', 'ai', 'artificial intelligence', 'software', 'hardware', 'chips', 'semiconductor', 'internet', 'cyber', 'space', 'nasa', 'satellite', 'robot', 'startups', 'smartphone', 'digital', 'quantum', 'data centers'],
};

const normalize = (value) => String(value || '').replace(/[\u200c\u200f\u200e]/g, ' ').toLowerCase();
function classifyWithKeywords(item, keywords, fallback = null) {
  const title = normalize(item.title), summary = normalize(item.summary);
  let best = '', bestScore = 0;
  for (const cat of NEWS_KEYWORD_FALLBACK_ORDER) {
    if (!keywords[cat]) continue;
    let score = 0;
    for (const kw of keywords[cat]) {
      const needle = normalize(kw);
      if (title.includes(needle)) score += 3;
      else if (summary.includes(needle)) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  if (bestScore >= 3) return best;
  if (fallback === null) return item.category && NEWS_CATEGORY_KEYS.includes(item.category) ? item.category : 'breaking';
  return fallback;
}
const classifyItem = (item) => classifyWithKeywords(item, NEWS_KEYWORDS);
const classifyWorldItem = (item) => classifyWithKeywords(item, WORLD_KEYWORDS, null);

/* ---------- Persian translation of world headlines ----------
 * World feeds are English-only, but the bot must show every headline in Persian.
 * Translation goes through free public endpoints (Google gtx first, MyMemory as
 * fallback), is cached for 30 days in KV, and degrades gracefully to the original
 * English text when a provider is unreachable. */
const TRANSLATE_BUILDERS = [
  (q) => `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fa&dt=t&q=${encodeURIComponent(q)}`,
  (q) => `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|fa`,
];
const TRANSLATE_TTL = 30 * 86400;
const NEGATIVE_TTL = 3600;
const hasFaScript = (t) => /[\u0600-\u06FF]/.test(String(t || ''));
const decodeEntities = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
async function hexDigest(value) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function translateToFa(env, raw) {
  const t = String(raw || '').trim();
  if (!t || hasFaScript(t)) return t;
  const key = 'v2:news:tr:' + (await hexDigest(t)).slice(0, 40);
  const cached = await getJson(env, key);
  if (cached?.fa) return cached.fa;
  const q = t.slice(0, 450);
  for (const build of TRANSLATE_BUILDERS) {
    try {
      const res = await fetchLimited(build(q), { headers: { accept: 'application/json' } }, 256 * 1024);
      let out = '';
      if (res.ok && res.data) {
        if (Array.isArray(res.data) && Array.isArray(res.data[0])) out = res.data[0].map(seg => String(seg?.[0] || '')).join('');
        else if (res.data?.responseData?.translatedText) out = String(res.data.responseData.translatedText);
      }
      out = decodeEntities(out).trim();
      if (out && hasFaScript(out) && out !== q) {
        await putJson(env, key, { fa: out, at: Date.now() }, { ttl: TRANSLATE_TTL });
        return out;
      }
    } catch { /* try the next provider */ }
  }
  await putJson(env, key, { fa: '', at: Date.now() }, { ttl: NEGATIVE_TTL });
  return t;
}
// Only the items the user actually sees get translated, so the free endpoints
// are used sparingly; everything is cached afterwards.
async function withFaTitles(env, items, cap = 8) {
  let pending = 0;
  for (const item of items) {
    if (item.titleFa || hasFaScript(item.title) || pending >= cap) continue;
    pending += 1;
    item.titleFa = await translateToFa(env, item.title);
  }
  return items;
}

const SRC_CACHE_TTL = 5 * 60000;
export async function aggregateNews(env) {
  const cached = await Promise.all(NEWS_SOURCES.map(src => getJson(env, `v2:news:src:${src.id}`)));
  const settled = await Promise.allSettled(NEWS_SOURCES.map(async (src, i) => {
    const hit = cached[i];
    if (hit && Date.now() - (hit.at || 0) < SRC_CACHE_TTL && Array.isArray(hit.items)) return hit.items;
    let items = [];
    try {
      const feed = parseFeed(await publicFeed(src.url));
      items = feed.map((item, idx) => ({
        id: `${src.id}:${item.id}`,
        title: item.title,
        summary: item.summary,
        url: item.url,
        source: src.name,
        publishedAt: Date.now() - idx * 10 * 60000,
      }));
    } catch {}
    await putJson(env, `v2:news:src:${src.id}`, { at: Date.now(), items }, { ttl: Math.ceil(SRC_CACHE_TTL / 1000) });
    return items;
  }));
  const merged = [], seen = new Set();
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    for (const item of r.value) {
      const key = normalize(item.title).slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

export async function aggregateWorldNews(env) {
  const cached = await Promise.all(WORLD_NEWS_SOURCES.map(src => getJson(env, `v2:news:world:${src.id}`)));
  const settled = await Promise.allSettled(WORLD_NEWS_SOURCES.map(async (src, i) => {
    const hit = cached[i];
    if (hit && Date.now() - (hit.at || 0) < SRC_CACHE_TTL && Array.isArray(hit.items)) return hit.items;
    let items = [];
    try {
      const feed = parseFeed(await publicFeed(src.url));
      items = feed.map((item, idx) => ({
        id: `world:${src.id}:${item.id}`,
        title: item.title,
        summary: item.summary,
        url: item.url,
        source: src.name,
        publishedAt: Date.now() - idx * 10 * 60000,
        region: 'world',
      }));
    } catch {}
    await putJson(env, `v2:news:world:${src.id}`, { at: Date.now(), items }, { ttl: Math.ceil(SRC_CACHE_TTL / 1000) });
    return items;
  }));
  const merged = [], seen = new Set();
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    for (const item of r.value) {
      const key = normalize(item.title).slice(0, 100);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...item, category: classifyWorldItem(item) });
    }
  }
  return merged;
}

export const WORLD_FALLBACK_NEWS = [
  { id: 'world-1', title: 'World news updates from international sources', titleFa: 'خبرهای بین‌المللی از رسانه‌های جهانی', summary: 'Live international headlines will appear here as soon as a world-news feed is available.', titleFaSummary: 'سرخط‌های خبری بین‌المللی به‌محض در دسترس بودن فیدها اینجا نمایش داده می‌شود.', source: 'World news', url: 'https://www.bbc.com/news/world', publishedAt: Date.now(), category: 'all' },
];

const fallbackWithCategory = (category) =>
  FALLBACK_NEWS.filter(n => n.category === category).map(n => ({ ...n, id: 'fb:' + n.id }));

export async function fetchLiveNews(env, category = 'breaking', region = 'iran') {
  if (region === 'world') {
    let live = await aggregateWorldNews(env);
    if (!live.length) live = WORLD_FALLBACK_NEWS.map(n => ({ ...n, id: `fb:${n.id}`, region: 'world' }));
    if (category && category !== 'all' && category !== 'world' && category !== 'breaking') live = live.filter(i => i.category === category);
    const top = live.slice(0, 12);
    return withFaTitles(env, top).then(() => top);
  }
  const live = (await aggregateNews(env)).map(item => ({ ...item, category: classifyItem(item), region: 'iran' }));
  const mixed = category === 'breaking' || category === 'all' || category === 'world';
  if (mixed) {
    if (live.length) return live.slice(0, 12);
    return fallbackWithCategory('breaking').concat(FALLBACK_NEWS.filter(n => n.category !== 'breaking').map(n => ({ ...n, id: 'fb:' + n.id })));
  }
  // A dedicated category must only ever contain items of that category.
  let items = live.filter(i => i.category === category);
  if (items.length < 3) {
    for (const fb of fallbackWithCategory(category)) {
      if (items.length >= 5) break;
      if (!items.some(i => normalize(i.title).slice(0, 80) === normalize(fb.title).slice(0, 80))) items.push(fb);
    }
  }
  return items.slice(0, 12);
}

export function newsDisplayTitle(item, lang = 'fa') {
  if (lang === 'en') return item.title;
  return item.titleFa || item.title;
}

export function newsDigestText(items, category = 'all', lang = 'fa') {
  const now = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', dateStyle: 'full', timeStyle: 'short' }).format(new Date());
  const header = category === 'all'
    ? `📰 ${tr('خلاصه خبرهای مهم امروز', 'Today\'s top news digest', lang)}\n🕐 ${now}\n────────────────────`
    : `${(NEWS_CATEGORIES[category] && (lang === 'en' ? NEWS_CATEGORIES[category].en : NEWS_CATEGORIES[category].fa)) || NEWS_CATEGORIES.breaking.fa}\n🕐 ${now}\n────────────────────`;
  let body = '';
  if (category === 'all') {
    for (const cat of NEWS_SEND_CATS) {
      const rows = items.filter(i => i.category === cat).slice(0, 2);
      if (!rows.length) continue;
      body += `\n${lang === 'en' ? NEWS_CATEGORIES[cat].en : NEWS_CATEGORIES[cat].fa}\n`;
      for (const item of rows) body += `• ${newsDisplayTitle(item, lang)}\n🔗 ${item.url}\n`;
    }
  } else {
    for (const [i, item] of items.slice(0, 8).entries()) body += `\n${i + 1}. ${newsDisplayTitle(item, lang)}\n🔗 ${item.url}\n🏛 ${item.source}\n`;
  }
  return `${header}${body}\n────────────────────\n`;
}

export async function newsDestinations(env, override = []) {
  const list = (Array.isArray(override) && override.length ? override : (await getSettings(env)).news?.autoSend?.destinations || [])
    .map(d => typeof d === 'string' ? { chatId: d, title: '' } : d)
    .filter(d => d.chatId && isChatId(d.chatId));
  return list.slice(0, 10);
}

export async function sendNewsDigest(env, { category = 'all', destinations = [], items = null } = {}) {
  const token = await resolveToken(env);
  assert(token, 'token_missing');
  const targets = await newsDestinations(env, destinations);
  assert(targets.length, 'invalid_destinations');
  let list = items;
  if (!list) {
    if (category === 'all') {
      list = [];
      for (const cat of NEWS_SEND_CATS) list.push(...(await fetchLiveNews(env, cat)).slice(0, 2));
    } else if (category === 'world') list = await fetchLiveNews(env, 'world', 'world');
    else list = await fetchLiveNews(env, category);
  }
  assert(list.length, 'news_empty');
  const text = newsDigestText(list, category);
  const results = [];
  for (const d of targets) {
    const res = await sendToUser(token, d.chatId, text.slice(0, 4096), { disable_web_page_preview: true });
    results.push({ chatId: d.chatId, title: d.title || '', ok: !!res.ok, error: res.ok ? '' : str(res.description || '', 160) });
  }
  return { category, sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results };
}

/* Scheduled news delivery. Runs from the worker cron; pulls only items that were
 * not sent before, so an idle news day sends nothing.
 * Two modes: interval (every N minutes) or daily time ("HH:MM" in Tehran). */
const NEWS_STATE_KEY = 'v2:news:state';
// Iran has observed a fixed UTC+3:30 offset since 2022 (no DST).
const TEHRAN_OFFSET_MS = 3.5 * 3600 * 1000;
function tehranParts(now) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const g = (t) => parts.find((p) => p.type === t)?.value || '';
  return { y: +g('year'), m: +g('month'), d: +g('day'), h: +g('hour'), min: +g('minute') };
}
export const tehranDate = (now = Date.now()) => { const p = tehranParts(now); return `${p.y}-${p.m}-${p.d}`; };
export function tehranTodayAt(time, now = Date.now()) {
  const [h, m] = String(time).split(':').map(Number);
  const p = tehranParts(now);
  return Date.UTC(p.y, p.m - 1, p.d, h, m) - TEHRAN_OFFSET_MS;
}
export async function newsTick(env) {
  const cfg = (await getSettings(env)).news?.autoSend;
  if (!cfg?.enabled || !cfg.destinations?.length) return;
  const token = await resolveToken(env);
  if (!token) return;
  const state = (await getJson(env, NEWS_STATE_KEY)) || { nextAt: 0, sentIds: [], lastAt: 0, lastDay: '' };
  const now = Date.now();
  let due = false, daily = false;
  if (cfg.time && isValidTime(cfg.time)) {
    daily = true;
    if (state.lastDay === tehranDate(now)) return;
    if (now < tehranTodayAt(cfg.time, now)) return;
    due = true;
    state.lastDay = tehranDate(now);
  } else {
    const interval = Math.max(10, Number(cfg.intervalMinutes) || 60) * 60000;
    if (!state.nextAt || state.nextAt > now) {
      if (!state.nextAt) { state.nextAt = now + interval; await putJson(env, NEWS_STATE_KEY, state); }
      return;
    }
    due = true;
    state.nextAt = now + interval;
  }
  if (!due) { await putJson(env, NEWS_STATE_KEY, state); return; }
  const category = NEWS_CATEGORY_KEYS.includes(cfg.category) ? cfg.category : 'all';
  const fresh = [];
  if (category === 'all') {
    for (const cat of NEWS_SEND_CATS) for (const item of (await fetchLiveNews(env, cat, cat === 'world' ? 'world' : 'iran')).slice(0, 2)) fresh.push(item);
  } else fresh.push(...await fetchLiveNews(env, category, category === 'world' ? 'world' : 'iran'));
  const take = fresh.filter(i => !(state.sentIds || []).includes(i.id)).slice(0, 8);
  if (daily && !take.length) { /* a daily digest must still go out with the freshest items */ }
  if (take.length || daily) {
    const batch = daily ? fresh.slice(0, 8) : take;
    const text = newsDigestText(batch, category).slice(0, 4096);
    for (const d of cfg.destinations.slice(0, 10)) {
      if (!isChatId(d.chatId)) continue;
      const res = await sendToUser(token, d.chatId, text, { disable_web_page_preview: true });
      if (!res.ok && res.description) state.lastError = str(res.description, 160);
    }
    state.sentIds = [...new Set([...(state.sentIds || []), ...batch.map(i => i.id)])].slice(-300);
    state.lastAt = now;
  }
  await putJson(env, NEWS_STATE_KEY, state);
}

/* ============ Bot screens ============
 * Flow (news purpose): /start → «خبر» → region (Iran | World) → category → list → item.
 * Every screen is a text message with inline buttons so callback taps refresh
 * the open message instead of stacking new ones. */
export async function newsHome(env, token, user, lang = 'fa') {
  const breaking = await fetchLiveNews(env, 'breaking');
  const top = breaking.slice(0, 2);
  let text = `📰 ${tr('خبر کل کشور', 'Nation-wide News', lang)}\n` +
    `${tr('اخبار ایران و خبرهای جهان، دسته‌بندی‌شده و با ترجمه فارسی', 'Iran news and world news — categorized, with Persian translation', lang)}\n` +
    `────────────────────\n`;
  if (top.length) {
    text += `🚨 ${tr('مهم‌ترین سرخط‌های این لحظه:', 'Top headlines right now:')}\n\n`;
    for (let i = 0; i < top.length; i++) text += `${i + 1}. 📌 ${newsDisplayTitle(top[i], lang)}\n\n`;
    text += `────────────────────\n`;
  }
  text += tr('منبع خبر را انتخاب کنید:', 'Choose a news source:');
  const rows = [
    [
      { text: '🇮🇷 ' + tr('خبر ایران', 'Iran News', lang), callback_data: 'news:iran' },
      { text: '🌍 ' + tr('خبر جهانی', 'World News', lang), callback_data: 'news:world' },
    ],
    [{ text: '🔙 ' + tr('بازگشت به منوی اصلی', 'Back to main menu', lang), callback_data: 'sub:root' }],
  ];
  return sendToUser(token, user.id, text.slice(0, 4096), { reply_markup: { inline_keyboard: rows }, disable_web_page_preview: true });
}

export async function newsRegion(env, token, user, lang = 'fa', region = 'iran') {
  const isWorld = region === 'world';
  const cats = isWorld ? WORLD_REGION_CATS : NEWS_REGION_CATS;
  const title = isWorld
    ? `🌍 ${tr('خبرهای جهان — ترجمه فارسی', 'World News — Persian translation', lang)}`
    : `🇮🇷 ${tr('خبرهای ایران', 'Iran News', lang)}`;
  const rows = [];
  const label = (key) => {
    if (isWorld && key === 'all') return '🌐 ' + tr('همه دسته‌ها', 'All categories', lang);
    const c = NEWS_CATEGORIES[key] || NEWS_CATEGORIES.breaking;
    return (lang === 'en' ? c.en : c.fa);
  };
  for (let i = 0; i < cats.length; i += 2) {
    const pair = cats.slice(i, i + 2).map((key) => ({
      text: label(key),
      callback_data: isWorld ? `news:wcat:${key}` : `news:cat:${key}`,
    }));
    rows.push(pair);
  }
  rows.push([
    { text: '🔄 ' + tr('بروزرسانی', 'Refresh', lang), callback_data: isWorld ? 'news:world' : 'news:iran' },
    { text: '📰 ' + tr('منبع خبر', 'News source', lang), callback_data: 'news:home' },
  ]);
  rows.push([{ text: '🔙 ' + tr('بازگشت به منوی اصلی', 'Back to main menu', lang), callback_data: 'sub:root' }]);
  return sendToUser(token, user.id,
    `${title}\n${tr('دسته مورد نظر را انتخاب کنید:', 'Choose a category:')}`,
    { reply_markup: { inline_keyboard: rows }, disable_web_page_preview: true });
}

export async function newsCategory(env, token, user, lang = 'fa', category = 'breaking', region = 'iran') {
  const isWorld = region === 'world';
  const catInfo = NEWS_CATEGORIES[category] || (isWorld ? NEWS_CATEGORIES.world : NEWS_CATEGORIES.breaking);
  const items = await fetchLiveNews(env, category, region);

  let text = `${lang === 'en' ? catInfo.en : catInfo.fa}\n${tr('به‌روزشده:', 'Updated:')} ${new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' }).format(new Date())}\n────────────────────\n\n`;
  const rows = [];
  const prefix = isWorld ? 'news:witem' : 'news:item';
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    text += `${i + 1}. 📌 ${newsDisplayTitle(item, lang)}\n   🏛 ${item.source}\n\n`;
    rows.push([{ text: `📄 ${String(newsDisplayTitle(item, lang)).slice(0, 36)}…`, callback_data: `${prefix}:${category}:${i}` }]);
  }
  if (!items.length) text += tr('فعلاً خبری در این دسته یافت نشد.', 'No news found in this category yet.', lang) + '\n\n';

  rows.push([
    { text: '🔄 ' + tr('بروزرسانی', 'Refresh', lang), callback_data: isWorld ? `news:wcat:${category}` : `news:cat:${category}` },
    { text: '🔙 ' + tr('بازگشت به دسته‌ها', 'Back to categories', lang), callback_data: isWorld ? 'news:world' : 'news:iran' },
  ]);
  rows.push([
    { text: '📰 ' + tr('منبع خبر', 'News source', lang), callback_data: 'news:home' },
    { text: '🔙 ' + tr('منوی اصلی', 'Main menu', lang), callback_data: 'sub:root' },
  ]);

  return sendToUser(token, user.id, text.slice(0, 4096), { reply_markup: { inline_keyboard: rows }, disable_web_page_preview: true });
}

export async function newsItem(env, token, user, lang = 'fa', category = 'breaking', index = 0, region = 'iran') {
  const isWorld = region === 'world';
  const items = await fetchLiveNews(env, category, region);
  const item = items[index] || items[0];
  if (!item) return newsRegion(env, token, user, lang, region);

  const timeStr = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' }).format(new Date(item.publishedAt || Date.now()));
  const summary = isWorld && lang === 'fa' && item.titleFaSummary ? item.titleFaSummary : item.summary;

  const text = `📰 <b>${newsDisplayTitle(item, lang)}</b>\n\n` +
    `⏰ ${tr('زمان انتشار', 'Published', lang)}: ${timeStr} | 🏛 ${item.source}\n\n` +
    `${String(summary || '').slice(0, 1200)}\n\n` +
    `────────────────────\n` +
    `🔗 ${tr('برای مشاهده متن کامل خبر در سایت مرجع، دکمه زیر را لمس کنید.', 'Tap below to read the full article on the news website.', lang)}`;

  const rows = [];
  if (item.url && safePublicUrl(item.url)) {
    rows.push([{ text: '🌐 ' + tr('مشاهده متن کامل خبر در منبع', 'Read Full Article', lang), url: item.url }]);
  }
  rows.push([
    { text: '🔙 ' + tr('بازگشت به لیست اخبار', 'Back to news list', lang), callback_data: isWorld ? `news:wcat:${category}` : `news:cat:${category}` },
    { text: '🔙 ' + tr('دسته‌ها', 'Categories', lang), callback_data: isWorld ? 'news:world' : 'news:iran' },
  ]);
  rows.push([
    { text: '📰 ' + tr('منبع خبر', 'News source', lang), callback_data: 'news:home' },
    { text: '🔙 ' + tr('منوی اصلی', 'Main menu', lang), callback_data: 'sub:root' },
  ]);

  return sendToUser(token, user.id, text.slice(0, 4096), { reply_markup: { inline_keyboard: rows }, disable_web_page_preview: true });
}

export async function newsCallback(env, token, user, lang, data) {
  if (!data.startsWith('news:')) return false;
  const parts = data.split(':');
  const action = parts[1];

  if (action === 'home' || action === 'refresh') {
    await newsHome(env, token, user, lang);
    return true;
  }
  if (action === 'iran') {
    await newsRegion(env, token, user, lang, 'iran');
    return true;
  }
  if (action === 'world') {
    await newsRegion(env, token, user, lang, 'world');
    return true;
  }
  if (action === 'cat') {
    await newsCategory(env, token, user, lang, parts[2] || 'breaking', 'iran');
    return true;
  }
  if (action === 'wcat') {
    await newsCategory(env, token, user, lang, parts[2] || 'all', 'world');
    return true;
  }
  if (action === 'item') {
    await newsItem(env, token, user, lang, parts[2] || 'breaking', Number(parts[3] || 0), 'iran');
    return true;
  }
  if (action === 'witem') {
    await newsItem(env, token, user, lang, parts[2] || 'all', Number(parts[3] || 0), 'world');
    return true;
  }
  return false;
}
