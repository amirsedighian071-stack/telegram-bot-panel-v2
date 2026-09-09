import { getJson, putJson } from './kv.js';
import { tgApi, sendToUser } from './bot-api.js';
import { text as tr, str, int } from './config.js';
import { XMLParser } from 'fast-xml-parser';
import { publicFeed, safePublicUrl } from './network.js';

export const NEWS_CATEGORIES = {
  breaking: { fa: '🚨 خبرهای فوری و مهم', en: '🚨 Breaking & Top Stories', icon: 'zap' },
  politics: { fa: '🏛 اخبار سیاسی و دولت', en: '🏛 Politics & Government', icon: 'landmark' },
  economy: { fa: '📈 اخبار اقتصادی و بازار', en: '📈 Economy & Markets', icon: 'trending-up' },
  sports: { fa: '⚽ اخبار ورزشی', en: '⚽ Sports News', icon: 'trophy' },
  tech: { fa: '💻 فناوری و دانش‌بنیان', en: '💻 Tech & Innovation', icon: 'cpu' },
};

export const NEWS_SOURCES = [
  { id: 'irna', name: 'خبرگزاری ایرنا (IRNA)', url: 'https://www.irna.ir/rss' },
  { id: 'isna', name: 'خبرگزاری ایسنا (ISNA)', url: 'https://www.isna.ir/rss' },
  { id: 'mehr', name: 'خبرگزاری مهر (Mehr)', url: 'https://www.mehrnews.com/rss' },
  { id: 'tasnim', name: 'خبرگزاری تسنیم (Tasnim)', url: 'https://www.tasnimnews.com/fa/rss/feed/0/0/0' },
  { id: 'tabnak', name: 'تابناک (Tabnak)', url: 'https://www.tabnak.ir/fa/rss/allnews' },
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

export async function fetchLiveNews(env, category = 'breaking') {
  const cacheKey = `v2:news:${category}`;
  const cached = await getJson(env, cacheKey);
  if (cached && Date.now() - (cached.at || 0) < 5 * 60000) return cached.items;

  let items = FALLBACK_NEWS.filter(n => category === 'breaking' || n.category === category);

  try {
    const feedUrl = NEWS_SOURCES[0].url;
    const xml = await publicFeed(feedUrl);
    const parser = new XMLParser({ ignoreAttributes: false, processEntities: false, parseTagValue: false, trimValues: true });
    const doc = parser.parse(xml);
    const rawItems = doc.rss?.channel?.item || doc.feed?.entry || [];
    const list = Array.isArray(rawItems) ? rawItems : [rawItems];
    const parsed = list.slice(0, 10).map((item, idx) => {
      const title = String(typeof item.title === 'object' ? item.title?.['#text'] || '' : item.title || '').replace(/<[^>]*>/g, '').trim();
      const summary = String(typeof item.description === 'object' ? item.description?.['#text'] || '' : item.description || '').replace(/<[^>]*>/g, '').trim().slice(0, 300);
      const url = String(typeof item.link === 'string' ? item.link : item.link?.['@_href'] || item.link?.['#text'] || '').trim();
      return {
        id: `live_${category}_${idx}`,
        category,
        title: title || 'خبر مهم روز',
        summary: summary || 'برای مطالعه متن کامل به منبع خبر مراجعه کنید.',
        source: 'خبرگزاری ایرنا',
        url: safePublicUrl(url) ? url : 'https://www.irna.ir',
        publishedAt: Date.now() - idx * 10 * 60000,
      };
    }).filter(i => i.title);

    if (parsed.length) items = parsed;
  } catch {}

  await putJson(env, cacheKey, { at: Date.now(), items }, { ttl: 600 });
  return items;
}

export async function newsHome(env, token, user, lang = 'fa') {
  const breaking = await fetchLiveNews(env, 'breaking');
  const top = breaking.slice(0, 3);

  let text = `📰 ${tr('پایگاه اخبار مهم کشور ایران', 'Iran Breaking & Important News', lang)}\n` +
    `جمع‌آوری لحظه‌ای از معتبرترین رسانه‌ها و خبرگزاری‌های رسمی کشور\n` +
    `────────────────────\n\n` +
    `🚨 ${tr('مهم‌ترین سرخط خبرها:', 'Top Headlines:', lang)}\n\n`;

  for (let i = 0; i < top.length; i++) {
    const n = top[i];
    text += `${i + 1}. 📌 ${n.title}\n   🔹 ${n.summary.slice(0, 120)}…\n   🏛 ${n.source}\n\n`;
  }
  text += `────────────────────\n` +
    `${tr('برای مشاهده اخبار بر اساس موضوع، یکی از دسته‌بندی‌های زیر را انتخاب کنید:', 'Select a category below to browse news:', lang)}`;

  const rows = [
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

  let text = `${catInfo.fa}\n────────────────────\n\n`;
  const rows = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    text += `${i + 1}. 📌 ${item.title}\n   🏛 ${item.source}\n\n`;
    rows.push([{ text: `📄 ${item.title.slice(0, 36)}…`, callback_data: `news:item:${category}:${i}` }]);
  }

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
    `${item.summary}\n\n` +
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

  if (action === 'home' || action === 'refresh') {
    await newsHome(env, token, user, lang);
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
