import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, telegramMock, MemoryKV } from './helpers.mjs';
import { getLiveRates, parseMarketNumber, parseIranSiteHtml, IRAN_MARKET_SOURCES } from '../src/rates.js';

let tg;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  tg = telegramMock();
  globalThis.fetch = tg.fetcher;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const tgjuPayload = () => ({
  current: {
    // Rial-denominated quotes must be normalized to Toman automatically.
    gold_18: { p: '45,000,000', h: '45,200,000', l: '44,800,000', dp: '1.5' },
    sekee: { p: '520,000,000', h: '525,000,000', l: '518,000,000', dp: '0.8' },
    price_dollar_rl: { p: '900,000', h: '905,000', l: '895,000', dp: '0.4' },
    price_eur: { p: '980,000', dp: '0.3' },
    ons: { p: '2735.40', h: '2748.20', l: '2728.10', dp: '-0.35' },
  },
});

const nobitexPayload = () => ({
  status: 'ok',
  stats: {
    'usdt-rls': { latest: '9010000', dayLow: '8950000', dayHigh: '9050000', dayChange: '0.42' },
    'btc-rls': { latest: '62500000000', dayLow: '61000000000', dayHigh: '63000000000', dayChange: '2.1' },
    'trx-rls': { latest: '145000', dayLow: '140000', dayHigh: '147000', dayChange: '0.9' },
  },
});

function marketEnv() {
  return { BOT_KV: new MemoryKV(), TEST_MODE: true };
}

test('live rates merge TGJU gold/fiat with Nobitex crypto and normalize Rial to Toman', async () => {
  tg.setOverride((u) => {
    if (u.includes('tgju.org')) return tgjuPayload();
    if (u.includes('nobitex.ir')) return nobitexPayload();
    if (u.includes('coingecko.com')) return {};
    if (u.includes('bonbast')) throw new Error('offline');
    if (u.includes('swapwallet')) throw new Error('offline');
    return undefined;
  });
  const rates = await getLiveRates(marketEnv());
  assert.equal(rates.stale, false);
  assert.match(rates.source, /tgju/);
  assert.match(rates.source, /nobitex/);
  // Rial → Toman normalization
  assert.equal(rates.gold.gold18.price, 4500000);
  assert.equal(rates.gold.emami.price, 52000000);
  assert.equal(rates.fiat.usd.price, 90000);
  assert.equal(rates.fiat.eur.price, 98000);
  // Ounce stays in USD
  assert.equal(rates.gold.ounce.price, 2735.4);
  // Nobitex Rial → Toman
  assert.equal(rates.crypto.usdt.priceToman, 901000);
  assert.equal(rates.crypto.btc.priceToman, 6250000000);
  // USD leg anchored to the live USDT rate
  assert(rates.crypto.btc.priceUsd > 6000 && rates.crypto.btc.priceUsd < 8000);
  assert.equal(rates.crypto.usdt.priceUsd, 1);
  assert(!('offline' in rates));
});

test('every source failing serves the last good snapshot marked stale', async () => {
  const env = marketEnv();
  tg.setOverride((u) => {
    if (u.includes('tgju.org')) return tgjuPayload();
    if (u.includes('nobitex.ir')) return nobitexPayload();
    throw new Error('offline');
  });
  const fresh = await getLiveRates(env);
  assert.equal(fresh.stale, false);
  assert.equal(fresh.gold.gold18.price, 4500000);
  // Expire the 60s cache, then fail every source.
  tg.setOverride(() => { throw new Error('offline'); });
  await env.BOT_KV.delete('v2:rates:cache');
  const stale = await getLiveRates(env);
  assert.equal(stale.stale, true);
  assert.equal(stale.gold.gold18.price, 4500000);
  assert.equal(stale.fiat.usd.price, 90000);
});

test('absurd quotes are rejected and the table keeps its previous values', async () => {
  tg.setOverride((u) => {
    if (u.includes('tgju.org'))
      return { current: { gold_18: { p: '99999999999999' }, price_dollar_rl: { p: '-5' } } };
    throw new Error('offline');
  });
  const rates = await getLiveRates(marketEnv());
  // Nothing usable arrived and no snapshot exists: static fallback, flagged.
  assert.equal(rates.stale, true);
  assert.equal(rates.offline, true);
  assert(rates.gold.gold18.price > 0);
});

test('parseMarketNumber reads latin, persian and arabic digits', () => {
  assert.equal(parseMarketNumber('1,234.5'), 1234.5);
  assert.equal(parseMarketNumber('۱۲۳۴'), 1234);
  assert.equal(parseMarketNumber('١٢٣٤'), 1234);
  assert.equal(parseMarketNumber('1.5%'), 1.5);
  assert(Number.isNaN(parseMarketNumber('—')));
});

test('panel live endpoint exposes the same table with source metadata', async () => {
  const h = await setup();
  tg.setOverride((u) => {
    if (u.includes('tgju.org')) return tgjuPayload();
    if (u.includes('nobitex.ir')) return nobitexPayload();
    throw new Error('offline');
  });
  void IRAN_MARKET_SOURCES;
  const res = await h.api('GET', '/rates/live');
  assert.equal(res.ok, true);
  assert.equal(res.data.stale, false);
  assert.equal(res.data.gold.gold18.price, 4500000);
  assert.equal(res.data.fiat.usd.price, 90000);
  assert.equal(res.data.crypto.usdt.priceToman, 901000);
  assert(res.data.updatedAt > 0);
});

/* ============ Public Iranian tracker pages (moj3 / alanchand / isignal) ============
 * These pages are the ones the panel owner checks by hand; their published tables
 * are read as HTML and used whenever the JSON feeds above cannot answer. Fixtures
 * below mirror the served markup of each site's price page. */

const alanchandHtml = `
<table><tr><th>نام ارز</th><th>قیمت خرید</th><th>قیمت فروش</th></tr>
<tr><td>دلار آمریکا</td><td>۲۳۰,۳۵۰</td><td>۲۳۲,۷۰۰</td><td>-</td></tr>
<tr><td>یورو</td><td>۲۶۳,۱۰۰</td><td>۲۶۵,۸۰۰</td><td>۰.۸۷۵</td></tr>
<tr><td>درهم</td><td>۶۲,۷۳۰</td><td>۶۳,۳۶۰</td><td>۳.۶۷</td></tr>
<tr><td>لیر ترکیه</td><td>۴,۶۹۰</td><td>۴,۸۴۰</td><td>۴۸.۸</td></tr>
<tr><td>پوند انگلیس</td><td>۳۰۲,۰۰۰</td><td>۳۰۶,۶۰۰</td><td>۰.۷۵۱</td></tr>
<tr><td>یوان چین</td><td>۳۴,۱۰۰</td><td>۳۴,۸۰۰</td><td>۶.۷۱</td></tr>
<tr><td>دلار کانادا</td><td>۱۶۲,۷۰۰</td><td>۱۶۵,۲۰۰</td><td>۱.۴۰۹</td></tr></table>
<div><h3>آبشده(مثقال طلا)</h3><p>۱۰۱,۲۵۰,۰۰۰ تومان</p></div>
<div><h3>گرم طلای 18 عیار</h3><p>۲۳,۳۷۳,۶۶۰ تومان</p></div>
<div><h3>سکه امامی (طرح جدید)</h3><p>۲۳۵,۰۰۰,۰۰۰ تومان</p></div>
<div><h3>انس طلا</h3><p>۴,۳۲۹.۳۵$</p></div>
<div><h3>تتر</h3><p>۲۲۸,۴۵۴ تومان ۰.۵۷%</p></div>
<div><h3>بیت کوین</h3><p>۱۹,۷۴۴,۸۹۶,۱۵۲ تومان ۱.۱۴$۸۶,۴۴۴</p></div>
<div><h3>اتریوم</h3><p>۶۳۰,۴۹۰,۰۰۰ تومان ۰.۹۰$۲,۷۵۷</p></div>
<div><h3>تون کوین</h3><p>۰ تومان ۰.۹۵$۱.۶۰۰</p></div>
<div><h3>ترون</h3><p>۷۸,۹۳۳ تومان ۱.۳۸$۰.۳۴۴</p></div>
<div><h3>سولانا</h3><p>۲۷,۱۶۸,۳۹۲ تومان ۱.۷۴$۱۱۸.۸</p></div>
<div><h3>نات کوین</h3><p>۱۱۶ تومان ۰.۷۹$۰.۰۰۰۵۱</p></div>`;

const moj3Html = `
<h1>قیمت طلا امروز؛ قیمت لحظه‌ای طلا، دلار و سکه</h1>
<table><tr><td>طلای 18 عیار</td><td>23,431,368</td><td>-3.7%</td><td>+0.98%</td><td>+231,800</td></tr>
<tr><td>طلای 24 عیار</td><td>31,918,300</td><td>-1.6%</td><td>+0.98%</td><td>+309,000</td></tr>
<tr><td>دلار</td><td>233,200</td><td></td><td>+1.04%</td><td>+2,400</td></tr>
<tr><td>سکه طرح جدید</td><td>234,000,000</td><td>-0.9%</td><td>+1.50%</td><td>+3,510,000</td></tr>
<tr><td>سکه طرح قدیم</td><td>230,000,000</td><td>-1.8%</td><td>+1.37%</td><td>+3,160,000</td></tr>
<tr><td>نیم سکه</td><td>119,500,000</td><td>+0.62%</td><td>+0.83%</td><td>+1,000,000</td></tr>
<tr><td>ربع سکه</td><td>63,500,000</td><td>+6.48%</td><td>0.00%</td><td>0</td></tr>
<tr><td>انس جهانی طلا</td><td>4,328</td><td></td><td>-0.72%</td><td>-31</td></tr></table>
<h2>قیمت دلار امروز در بازار آزاد</h2>
<table><tr><td>دلار</td><td>233,200</td><td>+1.04%</td><td>+2,400</td></tr></table>
<h2>قیمت تتر، یورو و درهم امروز</h2>
<table><tr><td>تتر</td><td>227,715</td><td>0.00%</td><td>0</td></tr>
<tr><td>درهم</td><td>63,522</td><td>+1.07%</td><td>+672</td></tr>
<tr><td>یورو</td><td>266,890</td><td>+0.71%</td><td>+1,880</td></tr></table>`;

const isignalHtml = `
<div><h3>سکه امامی</h3><span>1405/06/31</span><span>35,623,500</span><span>1.5%</span>
<span>2,374,900,000 ریال</span></div>
<div><h3>دلار</h3><span>1405/06/31</span><span>24,253</span><span>1.04%</span><span>2,332,000 ریال</span></div>
<div><h3>تتر</h3><span>09:59:00</span><span>0.84%</span><span>2,275,870 ریال</span></div>
<div><h3>طلای 18 عیار</h3><span>1405/06/31</span><span>2,346,022</span><span>0.98%</span>
<span>239,390,000 ریال</span></div>
<div><h3>انس جهانی طلا</h3><span>10:03:49</span><span>28.88</span><span>0.66%</span><span>4,331 دلار</span></div>
<div><h3>آبشده نقدی</h3><span>1405/06/31</span><span>8,052,876</span><span>0.78%</span><span>1,032,420,000 ریال</span></div>
<div><h3>طلای 24 عیار</h3><span>1405/06/31</span><span>319,183,000 ریال</span></div>
<div><h3>سکه بهار آزادی</h3><span>1405/06/31</span><span>2,332,900,000 ریال</span></div>
<div><h3>نیم سکه</h3><span>1,210,000,000 ریال</span></div>
<div><h3>ربع سکه</h3><span>630,000,000 ریال</span></div>
<div><h3>سکه یک گرمی</h3><span>330,000,000 ریال</span></div>`;

const htmlResponse = (html) => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });

test('the public Iranian trackers are read as Toman quotes with range checks', () => {
  const alanchand = parseIranSiteHtml(alanchandHtml, 'alanchand');
  assert.equal(alanchand['fiat.usd'], 232700, 'the sell column is the market price');
  assert.equal(alanchand['fiat.eur'], 265800);
  assert.equal(alanchand['fiat.try'], 4840);
  assert.equal(alanchand['gold.gold18'], 23373660);
  assert.equal(alanchand['gold.emami'], 235000000);
  assert.equal(alanchand['gold.ounce'], 4329.35, 'the global ounce stays in USD');
  assert.equal(alanchand['crypto.usdt'], 228454);
  assert.equal(alanchand['crypto.btc'], 19744896152);
  assert.equal(alanchand['crypto.sol'], 27168392);
  assert.equal(alanchand['crypto.not'], 116);
  assert.equal(alanchand['crypto.ton'], undefined, 'a zero quote is rejected instead of stored');

  const moj3 = parseIranSiteHtml(moj3Html, 'moj3');
  assert.equal(moj3['gold.gold18'], 23431368);
  assert.equal(moj3['gold.gold24'], 31918300);
  assert.equal(moj3['fiat.usd'], 233200);
  assert.equal(moj3['gold.emami'], 234000000);
  assert.equal(moj3['gold.bahar'], 230000000);
  assert.equal(moj3['gold.nim'], 119500000);
  assert.equal(moj3['gold.rob'], 63500000);
  assert.equal(moj3['gold.ounce'], 4328);

  const isignal = parseIranSiteHtml(isignalHtml, 'isignal');
  // isignal publishes Rial: the values are normalized to Toman.
  assert.equal(isignal['gold.gold18'], 23939000);
  assert.equal(isignal['gold.gold24'], 31918300);
  assert.equal(isignal['gold.emami'], 237490000);
  assert.equal(isignal['gold.mesghal'], 103242000);
  assert.equal(isignal['fiat.usd'], 233200);
  assert.equal(isignal['gold.ounce'], 4331, 'ounce is not divided as a Rial price');
});

test('the tracker pages fill the gaps left by the JSON feeds', async () => {
  const env = marketEnv();
  tg.setOverride((u) => {
    if (u.includes('tgju.org')) return tgjuPayload();
    if (u.includes('alanchand.com')) return htmlResponse(alanchandHtml);
    if (u.includes('isignal.ir')) return htmlResponse(isignalHtml);
    if (u.includes('moj3.ir')) return htmlResponse(moj3Html);
    throw new Error('offline');
  });
  const rates = await getLiveRates(env);
  assert.equal(rates.stale, false);
  // TGJU wins for the keys it answered…
  assert.equal(rates.fiat.usd.price, 90000);
  assert.match(rates.source, /tgju/);
  // …while the trackers cover what it did not.
  assert.match(rates.source, /alanchand/);
  assert.equal(rates.gold.gold24.price, 31918300);
  assert.equal(rates.gold.bahar.price, 230000000);
  assert.equal(rates.gold.nim.price, 119500000);
  assert.equal(rates.crypto.not.priceToman, 116);
});

test('tracker quotes alone are enough to keep the table plausible offline', async () => {
  const env = marketEnv();
  tg.setOverride((u) => {
    if (u.includes('alanchand.com')) return htmlResponse(alanchandHtml);
    if (u.includes('isignal.ir')) return htmlResponse(isignalHtml);
    if (u.includes('moj3.ir')) return htmlResponse(moj3Html);
    throw new Error('offline');
  });
  const rates = await getLiveRates(env);
  assert.equal(rates.stale, false, 'the page sources keep the table live');
  assert.equal(rates.fiat.usd.price, 232700);
  assert.equal(rates.gold.gold18.price, 23373660);
  assert.equal(rates.crypto.usdt.priceToman, 228454);
  assert.match(rates.source, /alanchand/);
});
