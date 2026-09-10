import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, telegramMock } from './helpers.mjs';
import { putJson, getJson, getMenu } from '../src/kv.js';
import { entityKey } from '../src/storage.js';
import { NEWS_SOURCES, newsTick, fetchLiveNews } from '../src/news.js';

let h, tg;
const originalFetch = globalThis.fetch;

const seedItem = (src, category, i) => ({
  id: `${src}:${category}${i}`,
  title: category === 'sports'
    ? `تیم ملی فوتبال بازی تدارکاتی شماره ${i} ${src}`
    : category === 'politics'
      ? `نشست مجلس و وزیر درباره پرونده شماره ${i} ${src}`
      : `فناوری هوش مصنوعی گزارش ${i} ${src}`,
  summary: `خلاصه خبر ${category} از منبع ${src}`,
  url: `https://media-${src}.ir/${category}/${i}`,
  source: src,
  publishedAt: Date.now() - i * 60000,
});

async function seedNewsCaches(env) {
  for (const src of NEWS_SOURCES) {
    const items = [];
    for (let i = 0; i < 3; i++) items.push(seedItem(src.id, 'sports', i));
    for (let i = 0; i < 3; i++) items.push(seedItem(src.id, 'politics', i));
    for (let i = 0; i < 3; i++) items.push(seedItem(src.id, 'tech', i));
    await putJson(env, `v2:news:src:${src.id}`, { at: Date.now(), items }, { ttl: 300 });
  }
}

beforeEach(async () => {
  tg = telegramMock();
  globalThis.fetch = tg.fetcher;
  h = await setup();
  await seedNewsCaches(h.env);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('news categories are separated: sports/politics/tech only return their own items', async () => {
  for (const [category, marker] of [['sports', 'فوتبال'], ['politics', 'مجلس'], ['tech', 'هوش مصنوعی']]) {
    const res = await h.api('GET', '/news/latest?category=' + category);
    assert.equal(res.status, 200);
    assert(res.data.items.length >= 3, category + ' should have items');
    for (const item of res.data.items) {
      assert.equal(item.category, category, `item in ${category} must stay in ${category}`);
      if (item.id.startsWith('irna:')) assert.ok(item.title.includes(marker));
    }
  }
});

test('mixed news digest gathers items from every category', async () => {
  const res = await h.api('GET', '/news/latest?category=all');
  const categories = new Set(res.data.items.map(i => i.category));
  assert.ok(categories.has('sports') && categories.has('politics') && categories.has('tech'));
});

test('news settings API validates and persists auto-send scheduling config', async () => {
  await h.settings({ botPurpose: 'news' });
  const bad = await h.api('PUT', '/news/settings', { autoSend: { enabled: true, category: 'sports', intervalMinutes: 30, destinations: [{ chatId: 'not-a-chat' }] } });
  assert.equal(bad.status, 400);
  assert.equal(bad.error, 'invalid_destinations');
  const ok = await h.api('PUT', '/news/settings', { autoSend: { enabled: true, category: 'sports', intervalMinutes: 45, destinations: [{ chatId: '@newschannel', title: 'کانال خبر' }] } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.news.autoSend.intervalMinutes, 45);
  assert.equal(ok.data.news.autoSend.category, 'sports');
  const state = await h.api('GET', '/news');
  assert.equal(state.status, 200);
  assert.equal(state.data.news.autoSend.destinations[0].chatId, '@newschannel');
  assert(state.data.categories.sports);
});

test('news can be sent right now to a channel/group by category', async () => {
  await h.settings({ botPurpose: 'news', news: { autoSend: { enabled: false, category: 'all', intervalMinutes: 60, destinations: [{ chatId: '-100123', title: 'کانال خبر' }, { chatId: '-100555', title: 'گروه ورزشی' }] } } });
  const res = await h.api('POST', '/news/send', { category: 'sports' });
  assert.equal(res.status, 200);
  assert.equal(res.data.sent, 2);
  assert.equal(res.data.failed, 0);
  const sends = tg.sent().filter(c => c.method === 'sendMessage' && ['-100123', '-100555'].includes(String(c.payload.chat_id)));
  assert.equal(sends.length, 2);
  assert(sends.every(c => c.payload.text.includes('⚽ اخبار ورزشی')));
  assert(sends.every(c => !c.payload.text.includes('🏛 اخبار سیاسی')));
});

test('scheduled news delivery deduplicates and skips idle days', async () => {
  await h.settings({ botPurpose: 'news', news: { autoSend: { enabled: true, category: 'sports', intervalMinutes: 15, destinations: [{ chatId: '-100123', title: 'کانال' }] } } });
  await newsTick(h.env); // first run initializes the schedule without sending
  assert.equal(tg.sent().filter(c => String(c.payload.chat_id) === '-100123').length, 0);
  const state = await getJson(h.env, 'v2:news:state');
  assert(state.nextAt > Date.now());
  state.nextAt = Date.now() - 1000;
  await putJson(h.env, 'v2:news:state', state);
  await newsTick(h.env); // due: sends the digest
  assert.equal(tg.sent().filter(c => String(c.payload.chat_id) === '-100123').length, 1);
  const after = await getJson(h.env, 'v2:news:state');
  assert(after.sentIds.length > 0);
  after.nextAt = Date.now() - 1000;
  await putJson(h.env, 'v2:news:state', after);
  await newsTick(h.env); // remaining unseen items are delivered on the next due run
  const sendsAfterSecondRun = tg.sent().filter(c => String(c.payload.chat_id) === '-100123').length;
  assert.equal(sendsAfterSecondRun, 2);
  const state2 = await getJson(h.env, 'v2:news:state');
  state2.nextAt = Date.now() - 1000;
  await putJson(h.env, 'v2:news:state', state2);
  await newsTick(h.env); // everything was already sent: an idle cycle sends nothing
  assert.equal(tg.sent().filter(c => String(c.payload.chat_id) === '-100123').length, sendsAfterSecondRun);
});

test('relay: the bot asks the admin in Telegram and publishes without forward attribution', async () => {
  await h.settings({ adminId: '9000', botPurpose: 'relay', relay: { enabled: true, approval: true, destinations: [{ chatId: '-100999', title: 'کانال مخفی' }], echoToUser: false } });
  await h.update({ message: { message_id: 500, from: { id: 777, first_name: 'Ali' }, chat: { id: 777, type: 'private' }, photo: [{ file_id: 'photo-1' }], caption: 'فایل محرمانه' } });

  // The user gets the review notice; the administrator is asked with buttons.
  const notice = tg.calls.find(c => c.method === 'sendMessage' && String(c.payload.chat_id) === '9000' && c.payload.reply_markup?.inline_keyboard?.flat().some(b => String(b.callback_data || '').startsWith('rl:pub:')));
  assert(notice, 'admin must be asked about the received file');
  const relayId = notice.payload.reply_markup.inline_keyboard.flat().map(b => String(b.callback_data || '')).find(d => d.startsWith('rl:pub:')).split(':')[2];

  tg.clear();
  await h.cb(9000, `rl:pub:${relayId}`);
  const copies = tg.calls.filter(c => c.method === 'copyMessage');
  assert.equal(copies.length, 1);
  assert.equal(copies[0].payload.chat_id, '-100999');
  assert.equal(copies[0].payload.from_chat_id, 777); // copyMessage carries no forward header
  assert.equal(tg.calls.some(c => c.method === 'forwardMessage'), false);

  tg.clear();
  await h.update({ message: { message_id: 501, from: { id: 777, first_name: 'Ali' }, chat: { id: 777, type: 'private' }, text: 'دوم' } });
  const notice2 = tg.calls.find(c => c.method === 'sendMessage' && String(c.payload.chat_id) === '9000' && c.payload.reply_markup?.inline_keyboard?.flat().some(b => String(b.callback_data || '').startsWith('rl:pub:')));
  assert(notice2, 'the second file must also ask the administrator');
  const relayId2 = notice2.payload.reply_markup.inline_keyboard.flat().map(b => String(b.callback_data || '')).find(d => d.startsWith('rl:pub:')).split(':')[2];
  assert.notEqual(relayId2, relayId);
  await h.cb(9000, `rl:rej:${relayId2}`);
  const rejected = await getJson(h.env, entityKey('relay', relayId2));
  assert.equal(rejected.status, 'rejected');
});

test('admin can edit, move and add main-menu buttons entirely from Telegram', async () => {
  await h.settings({ adminId: '9000' });

  // Add a button through the guided flow.
  await h.cb(9000, 'adm:mbadd');
  await h.msg(9000, 'دکمه تستی');
  await h.cb(9000, 'adm:atype:url');
  await h.msg(9000, 'https://example-news.com/promo');
  let menu = await getMenu(h.env);
  const added = menu.inlineButtons.flatMap((row, r) => row.map((b, bIdx) => ({ ...b, r, bIdx }))).find(b => b.text === 'دکمه تستی');
  assert(added, 'new button must be saved');
  assert.equal(added.type, 'url');

  // Move it backwards inside its row.
  if (added.bIdx > 0) {
    await h.cb(9000, `adm:mbl:${added.r}:${added.bIdx}`);
    menu = await getMenu(h.env);
    assert.equal(menu.inlineButtons[added.r][added.bIdx - 1].text, 'دکمه تستی');
  } else if (added.r > 0) {
    await h.cb(9000, `adm:mbu:${added.r}:${added.bIdx}`);
    menu = await getMenu(h.env);
    assert(menu.inlineButtons[added.r - 1].some(b => b.text === 'دکمه تستی'), 'button must move to the row above');
  }

  // Edit its text, then delete it.
  const pos = menu.inlineButtons.flatMap((row, r) => row.map((b, bIdx) => ({ b, r, bIdx }))).find(x => x.b.text === 'دکمه تستی');
  await h.cb(9000, `adm:mbt:${pos.r}:${pos.bIdx}`);
  await h.msg(9000, 'نام تازه');
  menu = await getMenu(h.env);
  assert(menu.inlineButtons[pos.r][pos.bIdx].text === 'نام تازه', 'text edit must persist');
  await h.cb(9000, `adm:mbx:${pos.r}:${pos.bIdx}`);
  menu = await getMenu(h.env);
  assert(!menu.inlineButtons.flat().some(b => b.text === 'نام تازه'), 'deleted button must be gone');
});

test('non-admins are refused by the Telegram admin controls', async () => {
  await h.settings({ adminId: '9000' });
  await h.cb(555, 'adm:menu');
  const answered = tg.calls.find(c => c.method === 'answerCallbackQuery' && c.payload.text?.includes('ادمین'));
  assert(answered, 'non-admin must get an access-denied alert');
});
