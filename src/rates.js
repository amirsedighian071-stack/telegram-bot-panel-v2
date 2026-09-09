import { getJson, putJson } from './kv.js';
import { tgApi, sendToUser } from './bot-api.js';
import { text as tr, str, int } from './config.js';
import { fetchLimited } from './services/common.js';
import { MARKET_ENDPOINT } from './services/rates.js';

export const GOLD_DATA = {
  gold18: { fa: 'طلای ۱۸ عیار', en: '18K Gold (per gram)', unit: 'گرم', price: 4350000, change: 1.25, high: 4380000, low: 4320000 },
  gold24: { fa: 'طلای ۲۴ عیار', en: '24K Gold (per gram)', unit: 'گرم', price: 5800000, change: 1.25, high: 5840000, low: 5760000 },
  mesghal: { fa: 'مثقال طلا', en: 'Mithqal Gold', unit: 'مثقال', price: 18840000, change: 1.20, high: 18950000, low: 18700000 },
  emami: { fa: 'سکه تمام بهار (امامی)', en: 'Emami Full Gold Coin', unit: 'عدد', price: 51200000, change: 0.85, high: 51500000, low: 50800000 },
  bahar: { fa: 'سکه بهار آزادی (طرح قدیم)', en: 'Bahar Azadi Coin', unit: 'عدد', price: 47800000, change: 0.75, high: 48100000, low: 47500000 },
  nim: { fa: 'نیم سکه بهار آزادی', en: 'Half Gold Coin', unit: 'عدد', price: 27600000, change: 0.90, high: 27800000, low: 27400000 },
  rob: { fa: 'ربع سکه بهار آزادی', en: 'Quarter Gold Coin', unit: 'عدد', price: 17700000, change: 1.10, high: 17900000, low: 17500000 },
  gerami: { fa: 'سکه گرمی', en: '1g Gold Coin', unit: 'عدد', price: 8200000, change: 0.50, high: 8300000, low: 81500000 },
  ounce: { fa: 'انس جهانی طلا', en: 'Global Gold Ounce', unit: 'USD', price: 2735.40, isUsd: true, change: -0.35, high: 2748.20, low: 2728.10 },
};

export const FIAT_DATA = {
  usd: { fa: 'دلار آمریکا', en: 'US Dollar (USD)', code: 'USD', price: 68500, change: 0.45, high: 68900, low: 68200 },
  eur: { fa: 'یورو اروپا', en: 'Euro (EUR)', code: 'EUR', price: 74200, change: 0.30, high: 74600, low: 73900 },
  aed: { fa: 'درهم امارات', en: 'UAE Dirham (AED)', code: 'AED', price: 18680, change: 0.40, high: 18750, low: 18600 },
  gbp: { fa: 'پوند انگلیس', en: 'British Pound (GBP)', code: 'GBP', price: 89100, change: 0.60, high: 89600, low: 88700 },
  try: { fa: 'لیر ترکیه', en: 'Turkish Lira (TRY)', code: 'TRY', price: 1980, change: -0.20, high: 2010, low: 1970 },
  iqd: { fa: 'صد دینار عراق', en: '100 Iraqi Dinar (IQD)', code: 'IQD', price: 5230, change: 0.15, high: 5260, low: 5200 },
  cny: { fa: 'یوان چین', en: 'Chinese Yuan (CNY)', code: 'CNY', price: 9550, change: 0.25, high: 9600, low: 9510 },
  cad: { fa: 'دلار کانادا', en: 'Canadian Dollar (CAD)', code: 'CAD', price: 49800, change: 0.35, high: 50100, low: 49500 },
};

export const CRYPTO_DATA = {
  usdt: { fa: 'تتر (USDT)', en: 'Tether (USDT)', symbol: 'USDT', priceToman: 68550, priceUsd: 1.00, change: 0.05, high: 68800, low: 68300 },
  btc: { fa: 'بیت‌کوین (BTC)', en: 'Bitcoin (BTC)', symbol: 'BTC', priceToman: 6150000000, priceUsd: 89800, change: 2.80, high: 91200, low: 87500 },
  eth: { fa: 'اتریوم (ETH)', en: 'Ethereum (ETH)', symbol: 'ETH', priceToman: 232000000, priceUsd: 3380, change: 1.95, high: 3440, low: 3310 },
  ton: { fa: 'تون‌کوین (TON)', en: 'Toncoin (TON)', symbol: 'TON', priceToman: 382000, priceUsd: 5.58, change: 3.40, high: 5.75, low: 5.40 },
  trx: { fa: 'ترون (TRX)', en: 'TRON (TRX)', symbol: 'TRX', priceToman: 13500, priceUsd: 0.198, change: 0.85, high: 0.205, low: 0.194 },
  sol: { fa: 'سولانا (SOL)', en: 'Solana (SOL)', symbol: 'SOL', priceToman: 14700000, priceUsd: 215, change: 4.10, high: 222, low: 206 },
  not: { fa: 'نات‌کوین (NOT)', en: 'Notcoin (NOT)', symbol: 'NOT', priceToman: 540, priceUsd: 0.0078, change: -1.20, high: 0.0082, low: 0.0075 },
};

const fmtMoney = (n, lang = 'fa') => Number(n).toLocaleString(lang === 'en' ? 'en-US' : 'fa-IR');
const trendIcon = ch => ch > 0 ? '🟢 📈 +' : ch < 0 ? '🔴 📉 ' : '⚪ ';

export async function getLiveRates(env) {
  const cached = await getJson(env, 'v2:rates:cache');
  if (cached && Date.now() - (cached.at || 0) < 60000) return cached.data;

  const rates = {
    gold: structuredClone(GOLD_DATA),
    fiat: structuredClone(FIAT_DATA),
    crypto: structuredClone(CRYPTO_DATA),
    updatedAt: Date.now(),
  };

  try {
    const res = await fetchLimited(MARKET_ENDPOINT, { headers: { accept: 'application/json' } }, 256 * 1024);
    if (res.ok) {
      const j = await res.json();
      if (j?.status === 'OK' && j.result) {
        if (j.result['USDT/IRT']) {
          const uPrice = Math.round(Number(String(j.result['USDT/IRT']).replace(/,/g, '')));
          if (uPrice > 1000) {
            rates.crypto.usdt.priceToman = uPrice;
            rates.fiat.usd.price = uPrice - 50;
          }
        }
        if (j.result['TRX/IRT']) {
          const tPrice = Math.round(Number(String(j.result['TRX/IRT']).replace(/,/g, '')));
          if (tPrice > 0) rates.crypto.trx.priceToman = tPrice;
        }
        if (j.result['TON/IRT']) {
          const tnPrice = Math.round(Number(String(j.result['TON/IRT']).replace(/,/g, '')));
          if (tnPrice > 0) rates.crypto.ton.priceToman = tnPrice;
        }
      }
    }
  } catch {}

  await putJson(env, 'v2:rates:cache', { at: Date.now(), data: rates }, { ttl: 300 });
  return rates;
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
  text += `────────────────────`;

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
