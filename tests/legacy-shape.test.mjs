import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';
import {
  getJson, putJson, K,
  getStats, bumpStats,
  getRecentUsers, pushRecentUser,
  getRecentBroadcasts, pushBroadcastId,
  getEngagementLists, pushEngIndex,
} from '../src/kv.js';

/* ------------------------------------------------------------------ */
/*  Simulate legacy / migrated data that is NOT an array               */
/* ------------------------------------------------------------------ */

test('getStats returns zeroed object when stored value is a plain string (legacy)', async () => {
  const { env } = await setup();
  // Simulate legacy data: a string instead of an object
  await env.BOT_KV.put(K.STATS, JSON.stringify('corrupt-legacy'));
  const s = await getStats(env);
  assert.equal(typeof s, 'object');
  assert.equal(s.users, 0);
  assert.equal(s.banned, 0);
  assert.equal(s.messages, 0);
  assert.equal(s.broadcasts, 0);
  assert.equal(s.sent, 0);
});

test('getStats returns zeroed object when stored value is an array (legacy)', async () => {
  const { env } = await setup();
  await env.BOT_KV.put(K.STATS, JSON.stringify([1, 2, 3]));
  const s = await getStats(env);
  assert.equal(s.users, 0);
  assert.equal(s.banned, 0);
  assert.equal(s.messages, 0);
});

test('getStats merges partial object with defaults', async () => {
  const { env } = await setup();
  await env.BOT_KV.put(K.STATS, JSON.stringify({ users: 5, messages: 42 }));
  const s = await getStats(env);
  assert.equal(s.users, 5);
  assert.equal(s.messages, 42);
  assert.equal(s.banned, 0);
  assert.equal(s.broadcasts, 0);
  assert.equal(s.sent, 0);
});

test('bumpStats does not throw when stored stats is a non-object legacy value', async () => {
  const { env } = await setup();
  await env.BOT_KV.put(K.STATS, JSON.stringify('old-format'));
  const s = await bumpStats(env, { users: 1, messages: 3 });
  assert.equal(s.users, 1);
  assert.equal(s.messages, 3);
  assert.equal(s.banned, 0);
});

/* ------------------------------------------------------------------ */
/*  recent_users index                                                  */
/* ------------------------------------------------------------------ */

test('getRecentUsers returns empty array when stored value is an object (legacy)', async () => {
  const { env } = await setup();
  // Simulate legacy: stored as an object instead of an array
  await env.BOT_KV.put(K.RECENT_USERS, JSON.stringify({ foo: 'bar' }));
  const users = await getRecentUsers(env);
  assert(Array.isArray(users));
  assert.equal(users.length, 0);
});

test('getRecentUsers returns empty array when stored value is a string (legacy)', async () => {
  const { env } = await setup();
  await env.BOT_KV.put(K.RECENT_USERS, JSON.stringify('not-an-array'));
  const users = await getRecentUsers(env);
  assert(Array.isArray(users));
  assert.equal(users.length, 0);
});

test('pushRecentUser overwrites legacy non-array and works correctly', async () => {
  const { env } = await setup();
  await env.BOT_KV.put(K.RECENT_USERS, JSON.stringify({ corrupt: true }));
  await pushRecentUser(env, '42');
  const raw = await getJson(env, K.RECENT_USERS, []);
  assert(Array.isArray(raw));
  assert.deepEqual(raw, ['42']);
});

/* ------------------------------------------------------------------ */
/*  broadcast:index                                                     */
/* ------------------------------------------------------------------ */

test('getRecentBroadcasts returns empty array when stored value is an object (legacy)', async () => {
  const { env } = await setup();
  await env.BOT_KV.put(K.BROADCAST_INDEX, JSON.stringify({ legacy: true }));
  const broadcasts = await getRecentBroadcasts(env);
  assert(Array.isArray(broadcasts));
  assert.equal(broadcasts.length, 0);
});

test('getRecentBroadcasts returns empty array when stored value is a string (legacy)', async () => {
  const { env } = await setup();
  await env.BOT_KV.put(K.BROADCAST_INDEX, JSON.stringify('old-index'));
  const broadcasts = await getRecentBroadcasts(env);
  assert(Array.isArray(broadcasts));
  assert.equal(broadcasts.length, 0);
});

test('pushBroadcastId overwrites legacy non-array and works correctly', async () => {
  const { env } = await setup();
  await env.BOT_KV.put(K.BROADCAST_INDEX, JSON.stringify('broken'));
  await pushBroadcastId(env, 'bcast-1');
  const raw = await getJson(env, K.BROADCAST_INDEX, []);
  assert(Array.isArray(raw));
  assert.deepEqual(raw, ['bcast-1']);
});

/* ------------------------------------------------------------------ */
/*  eng:index                                                           */
/* ------------------------------------------------------------------ */

test('getEngagementLists returns empty lists when stored value is an object (legacy)', async () => {
  const { env } = await setup();
  await env.BOT_KV.put(K.ENG_INDEX, JSON.stringify({ legacy: true }));
  const data = await getEngagementLists(env);
  assert(Array.isArray(data.polls));
  assert(Array.isArray(data.posts));
  assert.equal(data.polls.length, 0);
  assert.equal(data.posts.length, 0);
});

test('getEngagementLists returns empty lists when stored value is a number (legacy)', async () => {
  const { env } = await setup();
  await env.BOT_KV.put(K.ENG_INDEX, JSON.stringify(999));
  const data = await getEngagementLists(env);
  assert.equal(data.polls.length, 0);
  assert.equal(data.posts.length, 0);
});

test('pushEngIndex overwrites legacy non-array and works correctly', async () => {
  const { env } = await setup();
  await env.BOT_KV.put(K.ENG_INDEX, JSON.stringify({ corrupt: 1 }));
  await pushEngIndex(env, 'poll', 'p-1');
  const raw = await getJson(env, K.ENG_INDEX, []);
  assert(Array.isArray(raw));
  assert.equal(raw.length, 1);
  assert.equal(raw[0].t, 'poll');
  assert.equal(raw[0].id, 'p-1');
});

/* ------------------------------------------------------------------ */
/*  Dashboard API never returns 500 with legacy data                    */
/* ------------------------------------------------------------------ */

test('GET /api/dashboard/stats does not 500 when all indexes are legacy-shaped', async () => {
  const h = await setup();
  // Poison all relevant keys with non-array / non-object legacy values
  await h.env.BOT_KV.put(K.STATS, JSON.stringify('old-string'));
  await h.env.BOT_KV.put(K.RECENT_USERS, JSON.stringify({ migrated: true }));
  await h.env.BOT_KV.put(K.BROADCAST_INDEX, JSON.stringify('v1-index'));

  const r = await h.api('GET', '/dashboard/stats');
  assert.equal(r.status, 200, `Expected 200 but got ${r.status}: ${JSON.stringify(r)}`);
  assert.equal(typeof r.data.stats, 'object');
  assert(Array.isArray(r.data.recentUsers));
  assert.equal(r.data.recentUsers.length, 0);
});
