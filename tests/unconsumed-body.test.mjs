import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { BotCoordinator } from '../src/index.js';
import { MemoryKV, telegramMock } from './helpers.mjs';

// Regression: an http request that reaches the Durable Object with a body no handler
// consumes (unknown route 404, expired-session 401, validation 400 …) used to make
// workerd throw "Can't read from request stream after response has been sent",
// crashing the isolate so every later request failed with http 500. The coordinator
// now buffers the body up front (detachedRequest), so the socket-backed stream is
// always drained before the response is sent and handlers still see the full body.
function storageAdapter() {
  const db = new DatabaseSync(':memory:'); let alarm = null;
  return {
    db,
    sql: { exec(sql, ...args) { const rows = db.prepare(sql).all(...args); return { toArray: () => rows }; } },
    transactionSync(fn) { db.exec('BEGIN IMMEDIATE'); try { const value=fn(); db.exec('COMMIT'); return value; } catch(e) { db.exec('ROLLBACK'); throw e; } },
    async getAlarm() { return alarm; }, async setAlarm(value) { alarm=value; },
  };
}
let coordinator, token, tg;
const originalFetch = globalThis.fetch;
beforeEach(async () => {
  tg = telegramMock(); globalThis.fetch = tg.fetcher;
  const storage = storageAdapter();
  const context = { storage, waitUntil(p) { return p; } };
  const outer = { BOT_KV: new MemoryKV(), BOT_TOKEN: '123:TEST_TOKEN', WEBHOOK_SECRET: 'test-hook', TEST_MODE: true };
  outer.BOT_STATE = { idFromName: () => 'test', get: () => coordinator };
  coordinator = new BotCoordinator(context, outer);
  const login = await post('/api/auth/login', { password: 'botpanel123' }, '');
  token = (await login.json()).data.token;
  await post('/api/auth/change-password', { currentPassword: 'botpanel123', newPassword: 'unconsumed-body-test-private' });
});
afterEach(() => { globalThis.fetch = originalFetch; });
function raw(method, path, body, auth = true, headers = {}) {
  return coordinator.fetch(new Request('https://panel.example.com' + path, {
    method, headers: { 'content-type': 'application/json', ...(auth === true ? { authorization: 'Bearer ' + token } : auth ? { authorization: 'Bearer ' + auth } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
}
function post(path, body, auth) {
  return raw('POST', path, body, auth !== undefined ? auth : true);
}
const json = async (res) => ({ status: res.status, ...(await res.json()) });

test('a POST whose body no handler consumes (404 route) answers normally and the coordinator keeps serving', async () => {
  const first = await json(await post('/api/news/settings', { any: 'body' }));
  assert.equal(first.status, 404);
  assert.equal(first.error, 'not_found');
  const second = await json(await raw('GET', '/api/health'));
  assert.equal(second.status, 200);
  assert.equal(second.ok, true);
});

test('an expired-session 401 short-circuit does not poison later requests', async () => {
  const rejected = await json(await post('/api/broadcast', { kind: 'text', text: 'سلام' }, 'stale-token'));
  assert.equal(rejected.status, 401);
  assert.equal(rejected.error, 'unauthorized');
  const healthy = await json(await post('/api/menu/preview', { chatId: 4242 }));
  assert.equal(healthy.status, 200);
  assert.equal(healthy.data.sent, true);
});

test('handler-visible request bodies stay intact after the coordinator buffers them', async () => {
  const saved = await json(await raw('PUT', '/api/settings', { botLangMode: 'en' }));
  assert.equal(saved.status, 200);
  assert.equal(saved.data.settings.botLangMode, 'en');
  const read = await json(await raw('GET', '/api/settings'));
  assert.equal(read.data.settings.botLangMode, 'en');
});

test('webhook updates still parse after the coordinator hop', async () => {
  const res = await coordinator.fetch(new Request('https://panel.example.com/telegram/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'test-hook' },
    body: JSON.stringify({ update_id: 991, message: { message_id: 1, from: { id: 551, first_name: 'U' }, chat: { id: 551, type: 'private' }, text: '/start' } }),
  }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});
