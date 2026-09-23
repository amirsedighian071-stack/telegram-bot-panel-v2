import { getJson, putJson, getSettings } from './kv.js';
import { tgApi, sendToUser, resolveToken } from './bot-api.js';
import { text as tr, str, int, isChatId, isValidTime, assert } from './config.js';
import { fetchLimited } from './services/common.js';
import { MARKET_ENDPOINT } from './services/rates.js';
import { tehranDate, tehranTodayAt } from './news.js';

export const RATES_SEND_CATS = ['all', 'gold', 'fiat', 'crypto'];
export const RATES_CATEGORIES = {
  gold: { fa: '🪙 طلا و انواع سکه', en: '🪙 Gold & Coins' },
  fiat: { fa: '💵 ارزهای بازار آزاد', en: '💵 Fiat Currencies' },
  crypto: { fa: '💎 رمزارزها و تتر', en: '💎 Crypto & Tether' },
};

/* Offline snapshot of the Iranian market, kept in Toman. It is only the starting
 * point of the table: every refresh replaces these numbers with live quotes from
 * TGJU / Bonbast / Nobitex and, when those are unreachable, from the public
 * Iranian trackers (moj3.ir, alanchand.com, isignal.ir). Keeping it current means
 * a cold start (or a fully blocked network) still shows realistic Iranian prices
 * instead of obviously wrong ones. Values below match the 1405/07/01 session. */
export const GOLD_DATA = {
  gold18: { fa: 'طلای ۱۸ عیار', en: '18K Gold (per gram)', unit: 'گرم', price: 23450000, change: 0.98, high: 23590000, low: 23310000 },
  gold24: { fa: 'طلای ۲۴ عیار', en: '24K Gold (per gram)', unit: 'گرم', price: 31918000, change: 0.98, high: 32110000, low: 31730000 },
  mesghal: { fa: 'مثقال طلا (آبشده)', en: 'Mithqal Gold (melted)', unit: 'مثقال', price: 101250000, change: 0.78, high: 101900000, low: 100600000 },
  emami: { fa: 'سکه تمام بهار (امامی)', en: 'Emami Full Gold Coin', unit: 'عدد', price: 234000000, change: 1.50, high: 235000000, low: 231000000 },
  bahar: { fa: 'سکه بهار آزادی (طرح قدیم)', en: 'Bahar Azadi Coin', unit: 'عدد', price: 230000000, change: 1.37, high: 231000000, low: 227000000 },
  nim: { fa: 'نیم سکه بهار آزادی', en: 'Half Gold Coin', unit: 'عدد', price: 119500000, change: 0.83, high: 120200000, low: 118500000 },
  rob: { fa: 'ربع سکه بهار آزادی', en: 'Quarter Gold Coin', unit: 'عدد', price: 63500000, change: 0.00, high: 63900000, low: 63100000 },
  gerami: { fa: 'سکه گرمی', en: '1g Gold Coin', unit: 'عدد', price: 33000000, change: 0.00, high: 33200000, low: 32800000 },
  ounce: { fa: 'انس جهانی طلا', en: 'Global Gold Ounce', unit: 'USD', price: 4330.50, isUsd: true, change: -0.70, high: 4365.00, low: 4300.00 },
};

export const FIAT_DATA = {
  usd: { fa: 'دلار آمریکا', en: 'US Dollar (USD)', code: 'USD', price: 233200, change: 1.04, high: 233900, low: 231800 },
  eur: { fa: 'یورو اروپا', en: 'Euro (EUR)', code: 'EUR', price: 266890, change: 0.71, high: 267600, low: 265600 },
  aed: { fa: 'درهم امارات', en: 'UAE Dirham (AED)', code: 'AED', price: 63522, change: 1.07, high: 63800, low: 63100 },
  gbp: { fa: 'پوند انگلیس', en: 'British Pound (GBP)', code: 'GBP', price: 305000, change: 0.55, high: 306600, low: 302000 },
  try: { fa: 'لیر ترکیه', en: 'Turkish Lira (TRY)', code: 'TRY', price: 4840, change: -0.20, high: 4900, low: 4800 },
  iqd: { fa: 'صد دینار عراق', en: '100 Iraqi Dinar (IQD)', code: 'IQD', price: 14870, change: 0.15, high: 14950, low: 14800 },
  cny: { fa: 'یوان چین', en: 'Chinese Yuan (CNY)', code: 'CNY', price: 34800, change: 0.25, high: 34950, low: 34600 },
  cad: { fa: 'دلار کانادا', en: 'Canadian Dollar (CAD)', code: 'CAD', price: 165200, change: 0.35, high: 165900, low: 164400 },
};

export const CRYPTO_DATA = {
  usdt: { fa: 'تتر (USDT)', en: 'Tether (USDT)', symbol: 'USDT', priceToman: 228000, priceUsd: 1.00, change: 0.20, high: 228600, low: 227300 },
  btc: { fa: 'بیت‌کوین (BTC)', en: 'Bitcoin (BTC)', symbol: 'BTC', priceToman: 19745000000, priceUsd: 86430, change: 1.12, high: 19900000000, low: 19500000000 },
  eth: { fa: 'اتریوم (ETH)', en: 'Ethereum (ETH)', symbol: 'ETH', priceToman: 630500000, priceUsd: 2756, change: 0.85, high: 634000000, low: 625000000 },
  ton: { fa: 'تون‌کوین (TON)', en: 'Toncoin (TON)', symbol: 'TON', priceToman: 335600, priceUsd: 1.47, change: 2.22, high: 340000, low: 331000 },
  trx: { fa: 'ترون (TRX)', en: 'TRON (TRX)', symbol: 'TRX', priceToman: 78650, priceUsd: 0.3442, change: -1.37, high: 79900, low: 77400 },
  sol: { fa: 'سولانا (SOL)', en: 'Solana (SOL)', symbol: 'SOL', priceToman: 27135000, priceUsd: 118.78, change: 1.69, high: 27600000, low: 26750000 },
  not: { fa: 'نات‌کوین (NOT)', en: 'Notcoin (NOT)', symbol: 'NOT', priceToman: 114, priceUsd: 0.0005, change: 0.80, high: 117, low: 111 },
};

const fmtMoney = (n, lang = 'fa') => Number(n).toLocaleString(lang === 'en' ? 'en-US' : 'fa-IR');
const trendIcon = ch => ch > 0 ? '🟢 📈 +' : ch < 0 ? '🔴 📉 ' : '⚪ ';

/* ============ Live Iran-market sources (gold, coins, fiat, crypto) ============
 * Several independent public sources are queried in parallel and merged by
 * priority. Every quote is sanity-checked against a plausible range, and
 * Rial/Toman unit mistakes are auto-corrected, so a broken source can never
 * poison the table. When every source fails, the last good snapshot is served
 * (marked stale) instead of silently showing old static numbers. */
export const IRAN_MARKET_SOURCES = {
  tgju: ['https://call1.tgju.org/ajax.json', 'https://call2.tgju.org/ajax.json', 'https://call3.tgju.org/ajax.json', 'https://call4.tgju.org/ajax.json', 'https://www.tgju.org/ajax.json'],
  bonbast: 'https://bonbast.liara.run/json',
  nobitex: 'https://apiv2.nobitex.ir/market/stats?srcCurrency=usdt,btc,eth,trx,ton,sol&dstCurrency=rls',
  coingecko: 'https://api.coingecko.com/api/v3/simple/price?ids=tether,bitcoin,ethereum,tron,the-open-network,solana,notcoin&vs_currencies=usd&include_24hr_change=true&precision=4',
};

/* Public Iranian price trackers (the pages the panel owner checks by hand). They
 * have no free JSON API, so their published Persian price tables are read from
 * the served HTML and used to fill every quote the JSON feeds above missed —
 * for example when TGJU blocks the Worker's egress. The declared unit of each
 * site is applied before the value is range-checked, and a quote is accepted
 * only when it lands inside a plausible Toman band, so a layout change can never
 * push nonsense into the table. */
export const IRAN_MARKET_HTML_SOURCES = {
  alanchand: { url: 'https://alanchand.com/', unit: 'toman' },
  moj3: { url: 'https://moj3.ir/price/', unit: 'toman' },
  isignal: { url: 'https://isignal.ir/gold-currency/', unit: 'rial' },
};

// Persian labels used by those three sites, in the order they are tried. The
// first label that appears in the page wins; from its position the largest
// number that fits the asset's plausible band is taken as the quote.
const SITE_LABELS = [
  [[/طلای\s*۱۸ عیار/, /طلای\s*18 عیار/, /گرم طلای 18 عیار/], 'gold', 'gold18'],
  [[/طلای\s*۲۴ عیار/, /طلای\s*24 عیار/], 'gold', 'gold24'],
  [[/آبشده/, /مثقال طلا/], 'gold', 'mesghal'],
  [[/سکه امامی/, /سکه طرح جدید/], 'gold', 'emami'],
  [[/سکه بهار آزادی/, /سکه طرح قدیم/], 'gold', 'bahar'],
  [[/نیم سکه/], 'gold', 'nim'],
  [[/ربع سکه/], 'gold', 'rob'],
  [[/سکه یک گرمی/, /سکه گرمی/, /سکه\s*1 گرمی/], 'gold', 'gerami'],
  [[/انس جهانی طلا/, /انس طلا/], 'gold', 'ounce'],
  [[/دلار آمریکا/, /دلار/], 'fiat', 'usd'],
  [[/یورو/], 'fiat', 'eur'],
  [[/درهم/], 'fiat', 'aed'],
  [[/پوند انگلیس/, /پوند/], 'fiat', 'gbp'],
  [[/لیر ترکیه/, /لیر/], 'fiat', 'try'],
  [[/صد دینار عراق/, /دینار عراق/], 'fiat', 'iqd'],
  [[/یوان چین/, /یوان/], 'fiat', 'cny'],
  [[/دلار کانادا/], 'fiat', 'cad'],
  [[/تتر/], 'crypto', 'usdt'],
  [[/بیت\s*کوین/], 'crypto', 'btc'],
  [[/اتریوم/], 'crypto', 'eth'],
  [[/تون\s*کوین/], 'crypto', 'ton'],
  [[/ترون/], 'crypto', 'trx'],
  [[/سولانا/], 'crypto', 'sol'],
  [[/نات\s*کوین/], 'crypto', 'not'],
];

const HTML_ENTITIES = { '&nbsp;': ' ', '&zwnj;': '\u200c', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&laquo;': '«', '&raquo;': '»' };

// Cell (one table cell / inline element) and record (one row or card) markers, so
// a label can be tied to the numbers printed in its own row instead of the next
// currency's row.
const SITE_CELL = '\u0001';
export const SITE_REC = '\u0002';
const SITE_BLOCK_TAGS = 'tr|div|li|section|article|table|tbody|thead|ul|ol|dl|nav|main|header|footer';
const SITE_CELL_TAGS = 'p|span|td|th|h1|h2|h3|h4|h5|h6|b|strong|em|i|a|small|label|time|dt|dd';

// Flattens a price page to text while keeping row boundaries, dropping scripts,
// styles and every other tag.
export function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(new RegExp(`</?(?:${SITE_BLOCK_TAGS})\\s*/?>`, 'gi'), SITE_REC)
    .replace(/<br\s*\/?>/gi, SITE_REC)
    .replace(new RegExp(`</?(?:${SITE_CELL_TAGS})[^>]*>`, 'gi'), SITE_CELL)
    .replace(/<[^>]*>/g, SITE_CELL)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z#0-9]+;/gi, (e) => HTML_ENTITIES[e.toLowerCase()] ?? ' ')
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();
}

const SITE_TOKEN_RE = /[0-9][0-9.,٬]*|[۰-۹][۰-۹.,٬]*|[٠-٩][٠-٩.,٬]*/g;

/* Finds the quote a label points at. Every occurrence of the label is tried in
 * order: a heading without numbers is skipped, and a quote is only accepted when
 * it lands inside the asset's plausible band after applying the site's unit. */
function siteQuoteFor(text, label, cat, key, unit) {
  const [min, max] = RATE_RANGES[key] || [0, Infinity];
  const normalize = (raw) => (key === 'ounce' ? raw : unit === 'rial' ? raw / 10 : raw);
  label.lastIndex = 0;
  let match, checked = 0;
  while ((match = label.exec(text)) && checked < 12) {
    checked++;
    const record = text.slice(match.index + match[0].length, text.length).slice(0, 600).split(SITE_REC)[0];
    const hits = [];
    let firstCell = null;
    for (const cell of record.split(SITE_CELL)) {
      const cellHits = [];
      for (const token of cell.match(SITE_TOKEN_RE) || []) {
        const raw = parseMarketNumber(token);
        if (!Number.isFinite(raw) || raw <= 0) continue;
        const toman = normalize(raw);
        if (toman < min || toman > max) continue;
        cellHits.push({ raw, toman });
      }
      if (cellHits.length) {
        hits.push(...cellHits);
        if (!firstCell) firstCell = cellHits;
      }
    }
    const pool = hits.length ? (cat === 'fiat' ? hits : firstCell) : null;
    if (!pool) continue;
    // Currencies publish a buy and a sell column (the free-market price is the
    // sell one), so the largest plausible value of the row is the quote.
    const pick = pool.reduce((a, b) => (b.toman > a.toman ? b : a));
    return key === 'ounce' ? Math.round(pick.raw * 100) / 100 : Math.round(pick.toman);
  }
  return 0;
}

/* Reads the price table of one of the public Iranian trackers. Returns quotes in
 * Toman keyed as `category.key`, ready for `applySiteQuotes`. */
export function parseIranSiteHtml(html, source = 'alanchand') {
  const unit = IRAN_MARKET_HTML_SOURCES[source]?.unit || 'toman';
  const text = htmlToText(html);
  const quotes = {};
  for (const [regexes, cat, key] of SITE_LABELS) {
    for (const re of regexes) {
      // The global flag lets every occurrence of a label be tried in order, so a
      // heading that mentions the asset without a price is skipped.
      const value = siteQuoteFor(text, new RegExp(re.source, 'g'), cat, key, unit);
      if (value) { quotes[`${cat}.${key}`] = value; break; }
    }
  }
  return quotes;
}

// Applied after the JSON feeds, so it only fills the gaps they left behind.
export function applySiteQuotes(rates, quotes) {
  let hits = 0;
  for (const [path, value] of Object.entries(quotes || {})) {
    const [cat, key] = path.split('.');
    if (cat === 'gold' && key === 'ounce') {
      const item = rates.gold?.ounce;
      if (!item || item._live) continue;
      if (value >= RATE_RANGES.ounce[0] && value <= RATE_RANGES.ounce[1]) {
        item.price = value; item._live = true; hits++;
      }
      continue;
    }
    if (applyQuote(rates, cat, key, value, {}, true, 'toman')) hits++;
  }
  return hits;
}

// Plausible [min, max] per key, in Toman (ounce in USD). Bands stay narrow on
// purpose: Rial and Toman readings must never both fit the same band, so a
// source that flips its unit is caught instead of silently shifting 10×.
const RATE_RANGES = {
  gold18: [1000000, 80000000], gold24: [1500000, 110000000], mesghal: [4000000, 350000000],
  emami: [8000000, 1200000000], bahar: [8000000, 1200000000], nim: [4000000, 600000000],
  rob: [2000000, 400000000], gerami: [1000000, 150000000], ounce: [300, 30000],
  usd: [20000, 3000000], eur: [20000, 3500000], aed: [5000, 1000000], gbp: [25000, 4000000],
  try: [500, 200000], iqd: [1000, 400000], cny: [2500, 500000], cad: [15000, 2500000],
  usdt: [20000, 3000000], btc: [500000000, 80000000000], eth: [5000000, 1500000000],
  ton: [50000, 30000000], trx: [2000, 3000000], sol: [2000000, 150000000], not: [50, 300000],
};

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export function parseMarketNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (value == null) return NaN;
  let s = String(value).trim().replace(/,/g, '').replace(/%/g, '').replace(/٬/g, '');
  s = s.replace(/[۰-۹]/g, d => FA_DIGITS.indexOf(d)).replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d));
  s = s.replace('٫', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// Accept the quote when it fits the range in the source's declared unit
// (TGJU and Nobitex publish Rial, SwapWallet publishes Toman IRT). When the
// declared unit misses, one ×10/÷10 retry absorbs a source-side unit flip;
// anything else is rejected so a broken feed can never poison the table.
function fitMoney(raw, key, unit = 'auto') {
  const [min, max] = RATE_RANGES[key] || [0, Infinity];
  const v = parseMarketNumber(raw);
  if (!Number.isFinite(v) || v <= 0) return 0;
  const candidates = unit === 'rial' ? [v / 10, v]
    : unit === 'toman' ? [v, v / 10]
    : [v, v / 10, v * 10];
  for (const c of candidates) {
    if (c >= min && c <= max) return Math.round(c);
  }
  return 0;
}

function fitPercent(raw) {
  const v = parseMarketNumber(raw);
  if (!Number.isFinite(v) || Math.abs(v) > 50) return null;
  return Math.round(v * 100) / 100;
}

function applyQuote(rates, cat, key, price, extra = {}, gapsOnly = false, unit = 'auto') {
  const item = rates[cat]?.[key];
  if (!item) return false;
  if (gapsOnly && item._live) return false;
  const toman = fitMoney(price, key, unit);
  if (!toman) return false;
  if (cat === 'crypto') item.priceToman = toman;
  else item.price = toman;
  const high = fitMoney(extra.high, key, unit);
  const low = fitMoney(extra.low, key, unit);
  if (high) item.high = high;
  if (low) item.low = low;
  const change = fitPercent(extra.change);
  if (change !== null && change !== undefined) item.change = change;
  item._live = true;
  return true;
}

function clearLiveFlags(rates) {
  for (const cat of Object.values(rates)) {
    if (!cat || typeof cat !== 'object') continue;
    for (const item of Object.values(cat)) {
      if (item && typeof item === 'object') { delete item._live; delete item._usdLive; }
    }
  }
}

const TGJU_MAP = {
  gold_18: ['gold', 'gold18'], gold_24: ['gold', 'gold24'], gold_melted: ['gold', 'mesghal'],
  sekee: ['gold', 'emami'], sekeb: ['gold', 'bahar'], nim: ['gold', 'nim'],
  rob: ['gold', 'rob'], gerami: ['gold', 'gerami'],
  price_dollar_rl: ['fiat', 'usd'], price_eur: ['fiat', 'eur'], price_gbp: ['fiat', 'gbp'],
  price_aed: ['fiat', 'aed'], price_try: ['fiat', 'try'], price_cny: ['fiat', 'cny'],
  price_cad: ['fiat', 'cad'], price_iqd: ['fiat', 'iqd'],
};

function parseTgju(payload, rates) {
  const current = payload?.current;
  if (!current || typeof current !== 'object') return 0;
  let hits = 0;
  for (const [tgKey, [cat, key]] of Object.entries(TGJU_MAP)) {
    const row = current[tgKey];
    if (!row) continue;
    if (applyQuote(rates, cat, key, row.p ?? row.price, {
      high: row.h ?? row.high, low: row.l ?? row.low,
      change: row.dp ?? row.change ?? row.d,
    }, false, 'rial')) hits++;
  }
  // Global ounce is quoted in USD, never Toman.
  const ounce = parseMarketNumber(current.ons?.p ?? current.ons?.price);
  if (Number.isFinite(ounce) && ounce >= RATE_RANGES.ounce[0] && ounce <= RATE_RANGES.ounce[1]) {
    rates.gold.ounce.price = Math.round(ounce * 100) / 100;
    const high = parseMarketNumber(current.ons?.h), low = parseMarketNumber(current.ons?.l);
    if (high > 0) rates.gold.ounce.high = high;
    if (low > 0) rates.gold.ounce.low = low;
    const ch = fitPercent(current.ons?.dp ?? current.ons?.change);
    if (ch !== null) rates.gold.ounce.change = ch;
    rates.gold.ounce._live = true;
    hits++;
  }
  return hits;
}

const BONBAST_KEYS = [
  [/dollar|usd|دلار/i, 'usd'], [/eur|یورو/i, 'eur'], [/gbp|pound|پوند/i, 'gbp'],
  [/aed|dirham|درهم/i, 'aed'], [/try|lira|لیر/i, 'try'], [/iqd|dinar|دینار/i, 'iqd'],
  [/cny|yuan|یوان/i, 'cny'], [/cad|کانادا/i, 'cad'],
];

function parseBonbast(payload, rates) {
  // Community mirror without a frozen schema: accept {code: price-ish} maps
  // as well as [{code|name, sell|price|buy}] lists, matched best-effort.
  // Runs after TGJU, so it only fills keys TGJU missed.
  const rows = [];
  if (Array.isArray(payload)) {
    for (const row of payload) {
      if (row && typeof row === 'object')
        rows.push([String(row.code ?? row.name ?? row.title ?? ''), row.sell ?? row.price ?? row.buy]);
    }
  } else if (payload && typeof payload === 'object') {
    const list = Array.isArray(payload.result) ? payload.result : null;
    if (list) return parseBonbast(list, rates);
    for (const [k, v] of Object.entries(payload))
      rows.push([k, v && typeof v === 'object' ? (v.sell ?? v.price ?? v.buy) : v]);
  }
  let hits = 0;
  for (const [name, price] of rows) {
    const match = BONBAST_KEYS.find(([re]) => re.test(name));
    if (match && applyQuote(rates, 'fiat', match[1], price, {}, true)) hits++;
  }
  return hits;
}

const NOBITEX_MAP = { usdt: 'usdt', btc: 'btc', eth: 'eth', trx: 'trx', ton: 'ton', sol: 'sol' };

function parseNobitex(payload, rates) {
  const stats = payload?.stats;
  if (!stats || typeof stats !== 'object') return 0;
  let hits = 0;
  for (const [src, key] of Object.entries(NOBITEX_MAP)) {
    const row = stats[`${src}-rls`] || stats[`${src}-usdt`];
    if (!row) continue;
    if (applyQuote(rates, 'crypto', key, row.latest ?? row.last, {
      high: row.dayHigh, low: row.dayLow, change: row.dayChange,
    }, false, 'rial')) hits++;
  }
  // The free-market dollar tracks USDT closely; mirror it when TGJU missed it.
  const usdt = rates.crypto.usdt.priceToman;
  if (hits && usdt > 1000 && !rates.fiat.usd._live) {
    rates.fiat.usd.price = usdt;
    rates.fiat.usd.change = rates.crypto.usdt.change;
    rates.fiat.usd._live = true;
    hits++;
  }
  return hits;
}



const GECKO_MAP = {
  tether: 'usdt', bitcoin: 'btc', ethereum: 'eth', tron: 'trx',
  'the-open-network': 'ton', solana: 'sol', notcoin: 'not',
};

function parseCoingecko(payload, rates, usdtToman) {
  if (!payload || typeof payload !== 'object') return 0;
  let hits = 0;
  for (const [id, key] of Object.entries(GECKO_MAP)) {
    const row = payload[id];
    const usd = parseMarketNumber(row?.usd);
    if (!Number.isFinite(usd) || usd <= 0) continue;
    const item = rates.crypto[key];
    if (!item) continue;
    item.priceUsd = usd < 100 ? Math.round(usd * 10000) / 10000 : Math.round(usd * 100) / 100;
    item._usdLive = true;
    const ch = fitPercent(row?.usd_24h_change);
    if (ch !== null) item.change = ch;
    // Last-resort Toman estimate for coins no Iranian source quoted.
    if (key !== 'usdt' && usdtToman > 1000 && !item._live) {
      const est = fitMoney(Math.round(usd * usdtToman), key);
      if (est) { item.priceToman = est; item._live = true; }
    }
    hits++;
  }
  return hits;
}

function parseSwapwallet(payload, rates) {
  const result = payload?.status === 'OK' ? payload.result : null;
  if (!result || typeof result !== 'object') return 0;
  let hits = 0;
  const map = { 'USDT/IRT': 'usdt', 'TRX/IRT': 'trx', 'TON/IRT': 'ton' };
  for (const [pair, key] of Object.entries(map)) {
    // Nobitex already covered these when reachable; only fill its gaps.
    if (result[pair] && applyQuote(rates, 'crypto', key, result[pair], {}, true, 'toman')) hits++;
  }
  return hits;
}

async function fetchJson(url, max = 512 * 1024) {
  const res = await fetchLimited(url, { headers: { accept: 'application/json' } }, max);
  if (!res.ok) throw new Error('bad_status_' + res.status);
  return res.data ?? JSON.parse(res.text);
}

// Iranian trackers serve HTML to browsers; a browser-like identity is sent so a
// default worker user agent is not rejected outright.
async function fetchHtml(url, max = 600 * 1024) {
  const res = await fetchLimited(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'fa-IR,fa;q=0.9,en;q=0.8',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  }, max);
  if (!res.ok) throw new Error('bad_status_' + res.status);
  return res.text;
}

export async function getLiveRates(env) {
  const cached = await getJson(env, 'v2:rates:cache');
  if (cached && Date.now() - (cached.at || 0) < 60000) return cached.data;

  const rates = {
    gold: structuredClone(GOLD_DATA),
    fiat: structuredClone(FIAT_DATA),
    crypto: structuredClone(CRYPTO_DATA),
    updatedAt: Date.now(),
    source: 'fallback',
    stale: false,
  };

  // Fetch everything in parallel, then apply strictly in priority order so the
  // merged table is deterministic: TGJU (gold/coins/fiat) → Bonbast (fiat
  // gaps) → Nobitex (crypto Toman + dollar gap) → SwapWallet (crypto gaps) →
  // CoinGecko (USD legs + crypto gaps).
  const attempt = async (fn) => {
    try { return await fn(); } catch { return null; }
  };
  const [tgju, bonbast, nobitex, swap, gecko, sites] = await Promise.all([
    attempt(async () => {
      for (const url of IRAN_MARKET_SOURCES.tgju) {
        try { return await fetchJson(url); } catch { /* try next mirror */ }
      }
      return null;
    }),
    attempt(() => fetchJson(IRAN_MARKET_SOURCES.bonbast)),
    attempt(() => fetchJson(IRAN_MARKET_SOURCES.nobitex)),
    attempt(() => fetchJson(MARKET_ENDPOINT, 256 * 1024)),
    attempt(() => fetchJson(IRAN_MARKET_SOURCES.coingecko, 256 * 1024)),
    Promise.all(Object.entries(IRAN_MARKET_HTML_SOURCES).map(async ([name, cfg]) => {
      try { return [name, await fetchHtml(cfg.url)]; } catch { return [name, '']; }
    })),
  ]);

  const tgjuHits = tgju ? parseTgju(tgju, rates) : 0;
  const bonbastHits = bonbast ? parseBonbast(bonbast, rates) : 0;
  const nobitexHits = nobitex ? parseNobitex(nobitex, rates) : 0;
  const swapHits = swap ? parseSwapwallet(swap, rates) : 0;
  const liveUsdt = rates.crypto.usdt.priceToman;
  const geckoHits = gecko ? parseCoingecko(gecko, rates, liveUsdt) : 0;

  // The public Iranian trackers fill whatever the JSON feeds above could not
  // quote, so the table still mirrors moj3 / alanchand / isignal prices when
  // TGJU is unreachable from the Worker.
  const siteParts = [];
  let siteHits = 0;
  for (const [name, html] of sites || []) {
    if (!html) continue;
    const hits = applySiteQuotes(rates, parseIranSiteHtml(html, name));
    if (hits) { siteHits += hits; siteParts.push(name); }
  }

  // Anchor every coin's USD leg to the live Iranian USDT/Toman rate so the
  // table stays internally consistent with the market it quotes.
  if (liveUsdt > 1000) {
    for (const [key, item] of Object.entries(rates.crypto)) {
      if (key !== 'usdt' && item._live && item.priceToman > 0)
        item.priceUsd = Math.round((item.priceToman / liveUsdt) * 10000) / 10000;
    }
    rates.crypto.usdt.priceUsd = 1;
  }
  clearLiveFlags(rates);

  const totalHits = tgjuHits + bonbastHits + nobitexHits + swapHits + geckoHits + siteHits;
  if (totalHits > 0) {
    const parts = [];
    if (tgjuHits) parts.push('tgju');
    if (bonbastHits) parts.push('bonbast');
    if (nobitexHits) parts.push('nobitex');
    if (swapHits) parts.push('swapwallet');
    if (geckoHits) parts.push('coingecko');
    parts.push(...siteParts);
    rates.source = parts.join('+');
    rates.updatedAt = Date.now();
    await putJson(env, 'v2:rates:lastgood', { at: Date.now(), data: rates }, { ttl: 7 * 86400 });
  } else {
    // Every source failed: serve the last good snapshot when one exists, and
    // say so openly instead of pretending the static table is live.
    const lastGood = await getJson(env, 'v2:rates:lastgood');
    if (lastGood?.data) {
      lastGood.data.stale = true;
      await putJson(env, 'v2:rates:cache', { at: Date.now(), data: lastGood.data }, { ttl: 300 });
      return lastGood.data;
    }
    rates.stale = true;
    rates.offline = true;
  }

  await putJson(env, 'v2:rates:cache', { at: Date.now(), data: rates }, { ttl: 300 });
  return rates;
}

export function ratesSourceLine(rates, lang = 'fa') {
  if (rates?.stale)
    return tr('آخرین نرخ ذخیره‌شده (اتصال به بازار برقرار نشد)', 'Last saved rates (market unreachable)', lang);
  return tr('نرخ زنده بازار ایران', 'Live Iran market rates', lang);
}

export function formatDateTime(now = Date.now()) {
  const time = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(now));
  const date = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  return { time, date };
}

export async function ratesHome(env, token, user, lang = 'fa') {
  const data = await getLiveRates(env);
  const { time, date } = formatDateTime(data.updatedAt);

  let text = `📈 ${tr('قیمت لحظه‌ای طلا، ارز و رمزارزها', 'Live Gold, Currency & Crypto Rates', lang)}\n` +
    `⏰ ${tr('ساعت بروزرسانی', 'Updated at', lang)}: ${time} · ${date}\n` +
    `────────────────────\n` +
    `🪙 ${tr('طلای ۱۸ عیار', '18K Gold', lang)}: ${fmtMoney(data.gold.gold18.price, lang)} ${tr('تومان', 'Toman', lang)} (${trendIcon(data.gold.gold18.change)}${data.gold.gold18.change}%)\n` +
    `🥇 ${tr('سکه امامی', 'Emami Coin', lang)}: ${fmtMoney(data.gold.emami.price, lang)} ${tr('تومان', 'Toman', lang)} (${trendIcon(data.gold.emami.change)}${data.gold.emami.change}%)\n` +
    `💵 ${tr('دلار آمریکا', 'US Dollar', lang)}: ${fmtMoney(data.fiat.usd.price, lang)} ${tr('تومان', 'Toman', lang)} (${trendIcon(data.fiat.usd.change)}${data.fiat.usd.change}%)\n` +
    `💶 ${tr('یورو', 'Euro', lang)}: ${fmtMoney(data.fiat.eur.price, lang)} ${tr('تومان', 'Toman', lang)} (${trendIcon(data.fiat.eur.change)}${data.fiat.eur.change}%)\n` +
    `💎 ${tr('تتر', 'Tether USDT', lang)}: ${fmtMoney(data.crypto.usdt.priceToman, lang)} ${tr('تومان', 'Toman', lang)} (${trendIcon(data.crypto.usdt.change)}${data.crypto.usdt.change}%)\n` +
    `₿ ${tr('بیت‌کوین', 'Bitcoin', lang)}: $${fmtMoney(data.crypto.btc.priceUsd, lang)} (${trendIcon(data.crypto.btc.change)}${data.crypto.btc.change}%)\n` +
    `────────────────────\n` +
    `${data.stale ? '⚠️' : '✅'} ${ratesSourceLine(data, lang)}\n` +
    `${tr('برای مشاهده لیست کامل و جزئیات هر بخش دکمه مورد نظر را انتخاب کنید:', 'Select a section below for full details:', lang)}`;

  const rows = [
    [
      { text: '🪙 ' + tr('طلا و انواع سکه', 'Gold & Coins', lang), callback_data: 'rates:gold' },
      { text: '💵 ' + tr('ارزهای بازار آزاد', 'Fiat Currencies', lang), callback_data: 'rates:fiat' },
    ],
    [
      { text: '💎 ' + tr('رمزارزها و تتر', 'Cryptocurrencies', lang), callback_data: 'rates:crypto' },
      { text: '🔄 ' + tr('بروزرسانی', 'Refresh', lang), callback_data: 'rates:refresh' },
    ],
    [
      { text: '🔙 ' + tr('بازگشت به منوی اصلی', 'Back to main menu', lang), callback_data: 'sub:root' },
    ],
  ];

  return sendToUser(token, user.id, text, { reply_markup: { inline_keyboard: rows } });
}

export async function ratesCategory(env, token, user, lang = 'fa', cat = 'gold') {
  const data = await getLiveRates(env);
  const { time, date } = formatDateTime(data.updatedAt);
  let title = '', items = {}, unitDefault = tr('تومان', 'Toman', lang);

  if (cat === 'gold') {
    title = '🪙 ' + tr('قیمت طلا و انواع سکه', 'Gold & Coins Price Table', lang);
    items = data.gold;
  } else if (cat === 'fiat') {
    title = '💵 ' + tr('قیمت ارزهای بازار آزاد', 'Fiat Currency Rates', lang);
    items = data.fiat;
  } else {
    title = '💎 ' + tr('قیمت ارزهای دیجیتال و تتر', 'Crypto & Stablecoins', lang);
    items = data.crypto;
  }

  let text = `${title}\n⏰ ${time} · ${date}\n────────────────────\n`;
  for (const [key, item] of Object.entries(items)) {
    const name = lang === 'en' ? item.en : item.fa;
    const priceStr = item.isUsd ? `$${fmtMoney(item.price, lang)}` : `${fmtMoney(item.priceToman || item.price, lang)} ${unitDefault}`;
    text += `▫️ ${name}:\n  💰 ${priceStr} | ${trendIcon(item.change)}${item.change}%\n  📊 ${tr('بالاترین', 'High', lang)}: ${fmtMoney(item.high, lang)} | ${tr('پایین‌ترین', 'Low', lang)}: ${fmtMoney(item.low, lang)}\n\n`;
  }
  text += `────────────────────\n${data.stale ? '⚠️' : '✅'} ${ratesSourceLine(data, lang)}`;

  const rows = [
    [
      { text: '🪙 ' + tr('طلا و سکه', 'Gold', lang), callback_data: 'rates:gold' },
      { text: '💵 ' + tr('ارزها', 'Currencies', lang), callback_data: 'rates:fiat' },
      { text: '💎 ' + tr('کریپتو', 'Crypto', lang), callback_data: 'rates:crypto' },
    ],
    [
      { text: '🔄 ' + tr('بروزرسانی جدول', 'Refresh', lang), callback_data: `rates:${cat}` },
      { text: '🔙 ' + tr('بازگشت به نرخ‌ها', 'Back to rates', lang), callback_data: 'rates:home' },
    ],
    [
      { text: '🔙 ' + tr('بازگشت به منوی اصلی', 'Back to main menu', lang), callback_data: 'sub:root' },
    ],
  ];

  return sendToUser(token, user.id, text.slice(0, 4096), { reply_markup: { inline_keyboard: rows } });
}

export async function ratesCallback(env, token, user, lang, data) {
  if (!data.startsWith('rates:')) return false;
  const action = data.slice(6);
  if (action === 'home' || action === 'refresh') {
    await ratesHome(env, token, user, lang);
    return true;
  }
  if (['gold', 'fiat', 'crypto'].includes(action)) {
    await ratesCategory(env, token, user, lang, action);
    return true;
  }
  return false;
}

/* ============ Scheduled rate delivery to a channel/group ============
 * The administrator picks which asset family (gold / currencies / crypto, or all
 * three) and a daily Tehran time; the cron tick publishes the table at that time. */
export async function liveRatesDigestText(env, category = 'all', lang = 'fa') {
  const data = await getLiveRates(env);
  const { time, date } = formatDateTime(data.updatedAt);
  const name = (k) => (lang === 'en' ? RATES_CATEGORIES[k].en : RATES_CATEGORIES[k].fa);
  const lines = [`📈 ${tr('جدول قیمت‌های لحظه‌ای', 'Live price table', lang)}\n🕐 ${time} · ${date}\n${data.stale ? '⚠️' : '✅'} ${ratesSourceLine(data, lang)}\n────────────────────`];
  const cats = category === 'all' ? ['gold', 'fiat', 'crypto'] : [category];
  const table = { gold: data.gold, fiat: data.fiat, crypto: data.crypto };
  for (const k of cats) {
    const items = table[k];
    if (!items) continue;
    lines.push(`\n${name(k)}`);
    const keys = k === 'gold' ? ['gold18', 'gold24', 'emami', 'bahar'] : k === 'fiat' ? ['usd', 'eur', 'aed', 'gbp', 'try'] : ['usdt', 'btc', 'eth', 'ton'];
    for (const key of keys) {
      const item = items[key];
      if (!item) continue;
      const priceStr = item.isUsd ? `$${fmtMoney(item.price, lang)}` : k === 'crypto' ? `${fmtMoney(item.priceToman, lang)} ${tr('تومان', 'Toman', lang)}` : `${fmtMoney(item.price, lang)} ${tr('تومان', 'Toman', lang)}`;
      lines.push(`• ${lang === 'en' ? item.en : item.fa}: ${priceStr} (${item.change > 0 ? '🟢 +📈' : item.change < 0 ? '🔴 -' : '⚪'} ${Math.abs(item.change)}%)`);
    }
  }
  lines.push('\n────────────────────');
  return lines.join('\n');
}

export async function ratesDestinations(env, override = []) {
  const list = (Array.isArray(override) && override.length ? override : (await getSettings(env)).rates?.autoSend?.destinations || [])
    .map(d => typeof d === 'string' ? { chatId: d, title: '' } : d)
    .filter(d => d.chatId && isChatId(d.chatId));
  return list.slice(0, 10);
}

export async function sendRatesNow(env, { category = 'all', destinations = [] } = {}) {
  const token = await resolveToken(env);
  assert(token, 'token_missing');
  const targets = await ratesDestinations(env, destinations);
  assert(targets.length, 'invalid_destinations');
  const text = (await liveRatesDigestText(env, category)).slice(0, 4096);
  const results = [];
  for (const d of targets) {
    const res = await sendToUser(token, d.chatId, text, { disable_web_page_preview: true });
    results.push({ chatId: d.chatId, title: d.title || '', ok: !!res.ok, error: res.ok ? '' : str(res.description || '', 160) });
  }
  return { category, sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results };
}

const RATES_STATE_KEY = 'v2:rates:state';
export async function ratesTick(env) {
  const cfg = (await getSettings(env)).rates?.autoSend;
  if (!cfg?.enabled || !cfg.time || !isValidTime(cfg.time) || !cfg.destinations?.length) return;
  const token = await resolveToken(env);
  if (!token) return;
  const state = (await getJson(env, RATES_STATE_KEY)) || { lastDay: '', lastAt: 0 };
  const now = Date.now();
  const today = tehranDate(now);
  if (state.lastDay === today) return;
  if (now < tehranTodayAt(cfg.time, now)) return;
  const category = RATES_SEND_CATS.includes(cfg.category) ? cfg.category : 'all';
  const text = (await liveRatesDigestText(env, category)).slice(0, 4096);
  for (const d of cfg.destinations.slice(0, 10)) {
    if (!isChatId(d.chatId)) continue;
    const res = await sendToUser(token, d.chatId, text, { disable_web_page_preview: true });
    if (!res.ok && res.description) state.lastError = str(res.description, 160);
  }
  state.lastDay = today;
  state.lastAt = now;
  await putJson(env, RATES_STATE_KEY, state);
}
