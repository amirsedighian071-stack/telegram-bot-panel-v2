import { getJson, putJson, getSettings } from './kv.js';
import { sendToUser, resolveToken } from './bot-api.js';
import { text as tr, str, isChatId, assert } from './config.js';
import { publicFeed, safePublicUrl } from './network.js';
import { parseFeed } from './automation.js';

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

/* International outlets publish in English, so the world-news view is shown fully
 * in Persian: headlines and summaries are machine-translated (see translateToPersian)
 * and outlet names are mapped to their Persian equivalents. */
const WORLD_SOURCE_FA = {
  'bbc-world': 'بی‌بی‌سی',
  'aljazeera-world': 'الجزیره',
  'guardian-world': 'گاردین',
  'npr-world': 'ان‌پی‌آر',
};
const WORLD_SOURCE_BY_NAME = Object.fromEntries(WORLD_NEWS_SOURCES.map((s) => [s.name, WORLD_SOURCE_FA[s.id]]));
const persianSourceName = (item) => WORLD_SOURCE_FA[item.sourceId] || WORLD_SOURCE_BY_NAME[item.source] || item.source;

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

const normalize = (value) => String(value || '').replace(/[\u200c\u200f\u200e]/g, ' ').toLowerCase();
function classifyItem(item) {
  const title = normalize(item.title), summary = normalize(item.summary);
  let best = '', bestScore = 0;
  for (const cat of NEWS_KEYWORD_FALLBACK_ORDER) {
    let score = 0;
    for (const kw of NEWS_KEYWORDS[cat]) {
      const needle = normalize(kw);
      if (title.includes(needle)) score += 3;
      else if (summary.includes(needle)) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return bestScore >= 3 ? best : item.category && NEWS_CATEGORY_KEYS.includes(item.category) ? item.category : 'breaking';
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
        source: WORLD_SOURCE_FA[src.id] || src.name,
        sourceId: src.id,
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
      merged.push(item);
    }
  }
  return merged;
}

export const WORLD_FALLBACK_NEWS = [
  { id: 'world-1', title: 'اخبار جهانی از منابع بین‌المللی', summary: 'به‌محض در دسترس بودن فید خبری جهانی، تیترهای بین‌المللی به‌صورت زنده و فارسی همین‌جا نمایش داده می‌شود.', source: 'اخبار جهانی', url: 'https://www.bbc.com/news/world', publishedAt: Date.now() },
];

/* ---- Persian translation for the world-news section ----
 * International feeds publish in English; every headline and summary shown to
 * the user is translated to Persian. Translations are cached in KV for two weeks
 * keyed by the source text, so each headline is translated at most once. Any
 * failure (no network, upstream limits) returns the original text — the news
 * view degrades gracefully instead of breaking. */
const TR_TTL_SEC = 14 * 24 * 3600;
const TR_TEXT_MAX = 900;
const TR_HAS_PERSIAN = /[\u0600-\u06FF]/;
const TR_HAS_LATIN = /[A-Za-z]{2,}/;

const translatable = (s) => TR_HAS_LATIN.test(s) && !TR_HAS_PERSIAN.test(s.slice(0, 120));

async function sha256Hex(value) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function gtxFetch(text) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=fa&dt=t&q=' + encodeURIComponent(text);
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; NewsBot/3)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`translate_http_${res.status}`);
  const data = await res.json();
  const out = Array.isArray(data?.[0]) ? data[0].map((seg) => (Array.isArray(seg) ? seg[0] : '') || '').join('') : '';
  const fa = String(out).replace(/\s+/g, ' ').trim();
  if (!fa) throw new Error('translate_empty');
  return fa;
}

export async function translateToPersian(env, text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw || !translatable(raw.slice(0, TR_TEXT_MAX))) return raw;
  let key = '';
  try { key = 'v2:news:tr:' + (await sha256Hex(raw.slice(0, TR_TEXT_MAX))); } catch { key = ''; }
  if (key) {
    const hit = await getJson(env, key);
    if (hit && typeof hit.fa === 'string' && hit.fa) return hit.fa;
  }
  try {
    const fa = await gtxFetch(raw.slice(0, TR_TEXT_MAX));
    if (key && fa) await putJson(env, key, { fa, at: Date.now() }, { ttl: TR_TTL_SEC });
    return fa || raw;
  } catch {
    return raw;
  }
}

const fallbackWithCategory = (category) =>
  FALLBACK_NEWS.filter(n => n.category === category).map(n => ({ ...n, id: 'fb:' + n.id }));

export async function fetchLiveNews(env, category = 'breaking') {
  if (category === 'world') {
    const liveWorld = await aggregateWorldNews(env);
    const top = (liveWorld.length
      ? liveWorld.map(item => ({
          ...item,
          category: 'world',
          region: 'world',
          // Older caches may still carry the English outlet name.
          source: persianSourceName(item),
        }))
      : WORLD_FALLBACK_NEWS.map(n => ({ ...n, id: `fb:${n.id}`, category: 'world', region: 'world' }))).slice(0, 12);
    // Everything the user sees in the world section must read in Persian:
    // translate each headline and summary (cached, best-effort).
    return Promise.all(top.map(async (item) => ({
      ...item,
      title: await translateToPersian(env, item.title),
      summary: item.summary ? await translateToPersian(env, item.summary) : item.summary,
    })));
  }
  const live = (await aggregateNews(env)).map(item => ({ ...item, category: classifyItem(item), region: 'iran' }));
  const mixed = category === 'breaking' || category === 'all';
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
      for (const item of rows) body += `• ${item.title}\n🔗 ${item.url}\n`;
    }
  } else {
    for (const [i, item] of items.slice(0, 8).entries()) body += `\n${i + 1}. ${item.title}\n🔗 ${item.url}\n🏛 ${item.source}\n`;
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
    } else list = await fetchLiveNews(env, category);
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
 * not sent before, so an idle news day sends nothing. */
const NEWS_STATE_KEY = 'v2:news:state';
export async function newsTick(env) {
  const cfg = (await getSettings(env)).news?.autoSend;
  if (!cfg?.enabled || !cfg.destinations?.length) return;
  const token = await resolveToken(env);
  if (!token) return;
  const state = (await getJson(env, NEWS_STATE_KEY)) || { nextAt: 0, sentIds: [], lastAt: 0 };
  if (!state.nextAt || state.nextAt > Date.now()) {
    if (!state.nextAt) { state.nextAt = Date.now() + Math.max(10, cfg.intervalMinutes) * 60000; await putJson(env, NEWS_STATE_KEY, state); }
    return;
  }
  const category = NEWS_CATEGORY_KEYS.includes(cfg.category) ? cfg.category : 'all';
  const fresh = [];
  if (category === 'all') {
    for (const cat of NEWS_SEND_CATS) for (const item of (await fetchLiveNews(env, cat)).slice(0, 2)) fresh.push(item);
  } else fresh.push(...await fetchLiveNews(env, category));
  const take = fresh.filter(i => !(state.sentIds || []).includes(i.id)).slice(0, 8);
  state.nextAt = Date.now() + Math.max(10, cfg.intervalMinutes) * 60000;
  if (take.length) {
    const text = newsDigestText(take, category).slice(0, 4096);
    for (const d of cfg.destinations.slice(0, 10)) {
      if (!isChatId(d.chatId)) continue;
      const res = await sendToUser(token, d.chatId, text, { disable_web_page_preview: true });
      if (!res.ok && res.description) state.lastError = str(res.description, 160);
    }
    state.sentIds = [...new Set([...(state.sentIds || []), ...take.map(i => i.id)])].slice(-300);
    state.lastAt = Date.now();
  }
  await putJson(env, NEWS_STATE_KEY, state);
}

export async function newsHome(env, token, user, lang = 'fa') {
  const breaking = await fetchLiveNews(env, 'breaking');
  const top = breaking.slice(0, 3);

  let text = `📰 ${tr('پایگاه اخبار مهم کشور ایران', 'Iran Breaking & Important News', lang)}\n` +
    `${tr('جمع‌آوری لحظه‌ای از معتبرترین رسانه‌ها و خبرگزاری‌های رسمی کشور', 'Live collection from the country\'s most trusted news agencies', lang)}\n` +
    `────────────────────\n\n` +
    `🚨 ${tr('مهم‌ترین سرخط خبرها:', 'Top Headlines:', lang)}\n\n`;

  for (let i = 0; i < top.length; i++) {
    const n = top[i];
    text += `${i + 1}. 📌 ${n.title}\n   🔹 ${String(n.summary || '').slice(0, 120)}…\n   🏛 ${n.source}\n\n`;
  }
  text += `────────────────────\n` +
    `${tr('منبع خبر را انتخاب کنید یا اخبار را بر اساس موضوع ببینید:', 'Choose a news region or browse by topic:', lang)}`;

  const rows = [
    [
      { text: '🇮🇷 ' + tr('اخبار ایران', 'Iran News', lang), callback_data: 'news:iran' },
      { text: '🌍 ' + tr('اخبار کل جهان', 'World News', lang), callback_data: 'news:world' },
    ],
    [
      { text: '🚨 ' + tr('خبرهای فوری', 'Breaking', lang), callback_data: 'news:cat:breaking' },
      { text: '🏛 ' + tr('سیاسی و دولت', 'Politics', lang), callback_data: 'news:cat:politics' },
    ],
    [
      { text: '📈 ' + tr('اقتصادی و بازار', 'Economy', lang), callback_data: 'news:cat:economy' },
      { text: '⚽ ' + tr('ورزشی', 'Sports', lang), callback_data: 'news:cat:sports' },
    ],
    [
      { text: '💻 ' + tr('فناوری و دانش', 'Technology', lang), callback_data: 'news:cat:tech' },
      { text: '🔄 ' + tr('بروزرسانی اخبار', 'Refresh', lang), callback_data: 'news:refresh' },
    ],
    [
      { text: '🔙 ' + tr('بازگشت به منوی اصلی', 'Back to main menu', lang), callback_data: 'sub:root' },
    ],
  ];

  return sendToUser(token, user.id, text.slice(0, 4096), { reply_markup: { inline_keyboard: rows }, disable_web_page_preview: true });
}

export async function newsCategory(env, token, user, lang = 'fa', category = 'breaking') {
  const catInfo = NEWS_CATEGORIES[category] || NEWS_CATEGORIES.breaking;
  const items = await fetchLiveNews(env, category);

  let text = `${lang === 'en' ? catInfo.en : catInfo.fa}\n${tr('به‌روزشده:', 'Updated:', lang)} ${new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' }).format(new Date())}\n────────────────────\n\n`;
  const rows = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    text += `${i + 1}. 📌 ${item.title}\n   🏛 ${item.source}\n\n`;
    rows.push([{ text: `📄 ${item.title.slice(0, 36)}…`, callback_data: `news:item:${category}:${i}` }]);
  }
  if (!items.length) text += tr('فعلاً خبری در این دسته یافت نشد.', 'No news found in this category yet.', lang) + '\n\n';

  rows.push([
    { text: '🔄 ' + tr('بروزرسانی', 'Refresh', lang), callback_data: `news:cat:${category}` },
    { text: '🔙 ' + tr('بازگشت به دسته‌ها', 'Back to categories', lang), callback_data: 'news:home' },
  ]);
  rows.push([
    { text: '🔙 ' + tr('بازگشت به منوی اصلی', 'Back to main menu', lang), callback_data: 'sub:root' },
  ]);

  return sendToUser(token, user.id, text.slice(0, 4096), { reply_markup: { inline_keyboard: rows }, disable_web_page_preview: true });
}

export async function newsItem(env, token, user, lang = 'fa', category = 'breaking', index = 0) {
  const items = await fetchLiveNews(env, category);
  const item = items[index] || items[0];
  if (!item) return newsHome(env, token, user, lang);

  const timeStr = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' }).format(new Date(item.publishedAt || Date.now()));

  const text = `📰 <b>${item.title}</b>\n\n` +
    `⏰ ${tr('زمان انتشار', 'Published', lang)}: ${timeStr} | 🏛 ${item.source}\n\n` +
    `${String(item.summary || '').slice(0, 1200)}\n\n` +
    `────────────────────\n` +
    `🔗 ${tr('برای مشاهده متن کامل خبر در سایت مرجع، دکمه زیر را لمس کنید.', 'Tap below to read the full article on the news website.', lang)}`;

  const rows = [];
  if (item.url && safePublicUrl(item.url)) {
    rows.push([{ text: '🌐 ' + tr('مشاهده متن کامل خبر در منبع', 'Read Full Article', lang), url: item.url }]);
  }
  rows.push([
    { text: '🔙 ' + tr('بازگشت به لیست اخبار', 'Back to news list', lang), callback_data: `news:cat:${category}` },
    { text: '🔙 ' + tr('منوی اخبار', 'News menu', lang), callback_data: 'news:home' },
  ]);
  rows.push([
    { text: '🔙 ' + tr('بازگشت به منوی اصلی', 'Back to main menu', lang), callback_data: 'sub:root' },
  ]);

  return sendToUser(token, user.id, text.slice(0, 4096), { reply_markup: { inline_keyboard: rows }, disable_web_page_preview: true });
}

export async function newsCallback(env, token, user, lang, data) {
  if (!data.startsWith('news:')) return false;
  const parts = data.split(':');
  const action = parts[1];

  if (action === 'home' || action === 'iran' || action === 'refresh') {
    await newsHome(env, token, user, lang);
    return true;
  }
  if (action === 'world') {
    await newsCategory(env, token, user, lang, 'world');
    return true;
  }
  if (action === 'cat') {
    await newsCategory(env, token, user, lang, parts[2] || 'breaking');
    return true;
  }
  if (action === 'item') {
    await newsItem(env, token, user, lang, parts[2] || 'breaking', Number(parts[3] || 0));
    return true;
  }
  return false;
}
