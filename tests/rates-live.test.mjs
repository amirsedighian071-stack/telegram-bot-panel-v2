import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, telegramMock, MemoryKV } from './helpers.mjs';
import { getLiveRates, parseMarketNumber, IRAN_MARKET_SOURCES } from '../src/rates.js';

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
