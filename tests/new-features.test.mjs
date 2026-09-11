import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, telegramMock } from './helpers.mjs';
import { getLiveRates } from '../src/rates.js';
import { fetchLiveNews } from '../src/news.js';
import { getJson } from '../src/kv.js';
import { entityKey } from '../src/storage.js';

let h, tg;
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  tg = telegramMock();
  globalThis.fetch = tg.fetcher;
  h = await setup();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('rates parser processes gold, dollar, crypto, coins and profit-loss calculations', async () => {
  const rates = await getLiveRates(h.env);
  assert(rates.gold);
  assert(rates.fiat);
  assert(rates.crypto);
  assert(rates.fiat.usd);
  assert(rates.crypto.usdt);
  assert(rates.gold.gold18);
  assert(rates.gold.emami);
  assert(rates.crypto.btc);
});

test('news fetcher aggregates top Iran news articles', async () => {
  const news = await fetchLiveNews(h.env, 'breaking');
  assert(news.length > 0);
  assert(news[0].title);
  assert(news[0].summary);
});

test('telegram admin mini app authentication verifies adminId correctly', async () => {
  await h.settings({ adminId: '123456789' });

  // Missing initData or invalid admin fails
  const res1 = await h.raw('POST', '/api/auth/telegram-admin', { body: { initData: '' } });
  assert.equal(res1.status, 400);

  // Valid initData format with non-admin ID fails
  const nonAdminData = `query_id=AAHd&user=${encodeURIComponent(JSON.stringify({ id: 9999999, first_name: 'Imposter' }))}&auth_date=${Math.floor(Date.now() / 1000)}&hash=dummyhash`;
  const res2 = await h.raw('POST', '/api/auth/telegram-admin', { body: { initData: nonAdminData } });
  assert.equal(res2.status, 401);
});

test('group management enforces chat lock, media lock, word filter, word count and quick responses', async () => {
  await h.api('POST', '/studio/groups', {
    chatId: '-100998877',
    title: 'Test Mod Group',
    enabled: true,
    lockChat: false,
    minWords: 3,
    maxWords: 10,
    requiredWord: '#contest',
    words: ['badword', 'gambling'],
    blockedMedia: ['sticker', 'voice', 'location'],
    responses: {
      'سایت': 'https://example.com',
      'help': 'Please see /rules',
    },
    forcedAdd: { enabled: false, count: 3 },
  });

  // 1. Forbidden word triggers deletion
  await h.update({
    message: {
      message_id: 201,
      chat: { id: -100998877, type: 'supergroup' },
      from: { id: 501, first_name: 'User1' },
      text: 'This contains badword #contest text here',
    },
  });
  assert(tg.calls.some(c => c.method === 'deleteMessage' && c.payload.message_id === 201));

  // 2. Blocked media (sticker) triggers deletion
  await h.update({
    message: {
      message_id: 202,
      chat: { id: -100998877, type: 'supergroup' },
      from: { id: 502, first_name: 'User2' },
      sticker: { file_id: 'stk1' },
    },
  });
  assert(tg.calls.some(c => c.method === 'deleteMessage' && c.payload.message_id === 202));

  // 3. Min words violation (too short) triggers deletion
  await h.update({
    message: {
      message_id: 203,
      chat: { id: -100998877, type: 'supergroup' },
      from: { id: 503, first_name: 'User3' },
      text: 'Hi #contest',
    },
  });
  assert(tg.calls.some(c => c.method === 'deleteMessage' && c.payload.message_id === 203));

  // 4. Missing required word triggers deletion
  await h.update({
    message: {
      message_id: 204,
      chat: { id: -100998877, type: 'supergroup' },
      from: { id: 504, first_name: 'User4' },
      text: 'This is a long message without the special hashtag',
    },
  });
  assert(tg.calls.some(c => c.method === 'deleteMessage' && c.payload.message_id === 204));

  // 5. Canned response trigger
  await h.update({
    message: {
      message_id: 205,
      chat: { id: -100998877, type: 'supergroup' },
      from: { id: 505, first_name: 'User5' },
      text: 'آدرس وب سایت اصلی #contest',
    },
  });
  assert(tg.sent().some(c => c.payload.text === 'https://example.com'));
});

test('group admin reply commands (/lock, /unlock, /raffle)', async () => {
  await h.api('POST', '/studio/groups', {
    chatId: '-100554433',
    title: 'Admin Mod Group',
    enabled: true,
  });

  // /lock command from admin (id 9000 in telegramMock)
  await h.update({
    message: {
      message_id: 301,
      chat: { id: -100554433, type: 'supergroup' },
      from: { id: 9000, first_name: 'Admin' },
      text: '/lock',
    },
  });
  const gAfterLock = await getJson(h.env, entityKey('group', '-100554433'));
  assert.equal(gAfterLock.lockChat, true);

  // /unlock command
  await h.update({
    message: {
      message_id: 302,
      chat: { id: -100554433, type: 'supergroup' },
      from: { id: 9000, first_name: 'Admin' },
      text: '/unlock',
    },
  });
  const gAfterUnlock = await getJson(h.env, entityKey('group', '-100554433'));
  assert.equal(gAfterUnlock.lockChat, false);

  // /raffle command
  await h.update({
    message: {
      message_id: 303,
      chat: { id: -100554433, type: 'supergroup' },
      from: { id: 9000, first_name: 'Admin' },
      text: '/raffle 1',
    },
  });
  assert(tg.sent().some(c => c.payload.text?.includes('قرعه‌کشی')));
});

test('rates and news commands in private chat with back buttons', async () => {
  // /rates command
  await h.msg(101, '/rates');
  assert(tg.sent().some(c => c.payload.text?.includes('قیمت لحظه‌ای طلا، ارز و رمزارزها')));

  // /news command opens the region picker (Iran | World) of the "خبر کل کشور" bot
  await h.msg(101, '/news');
  const newsMsg = tg.sent().filter(c => c.payload.text?.includes('خبر کل کشور')).pop();
  assert(newsMsg, 'news home must announce the nation-wide news section');
  const flat = (newsMsg.payload.reply_markup?.inline_keyboard || []).flat().map(b => b.callback_data || '');
  assert(flat.includes('news:iran') && flat.includes('news:world'), 'region picker must offer Iran and World buttons');
});

test('product catalog search command (/search)', async () => {
  await h.api('POST', '/studio/products', {
    title: 'کانفیگ اختصاصی پرسرعت',
    titleEn: 'Fast VPN Config',
    price: 50000,
    stock: 10,
    deliveryMode: 'ready',
    deliveryText: 'YOUR_CONFIG_URL',
  });

  await h.msg(101, '/search پرسرعت');
  assert(tg.sent().some(c => c.payload.text?.includes('نتایج جستجو')));
});
