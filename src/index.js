import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { handleUpdate } from './telegram.js';
import { DurableKV } from './storage.js';
import { getJson, putJson } from './kv.js';
import { safeEqual } from './auth.js';
import { broadcastTick } from './broadcast.js';
import { expireOrders } from './commerce.js';
import { groupTick } from './groups.js';
import { feedTick, relayTick } from './automation.js';
import { handlePayment } from './payments.js';
import authRoutes from './routes/auth.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import usersRoutes from './routes/users.routes.js';
import broadcastRoutes from './broadcast.js';
import engagementRoutes from './routes/engagement.routes.js';
import supportRoutes from './routes/support.routes.js';
import menuRoutes from './routes/menu.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import mediaRoutes from './media.js';
import studioRoutes from './routes/studio.routes.js';

const api = new Hono().basePath('/api');
api.use('*', async (c, next) => bodyLimit({ maxSize: c.req.path.startsWith('/api/media') ? 22 * 1024 * 1024 : 1024 * 1024, onError: c => c.json({ ok: false, error: 'request_too_large' }, 413) })(c, next));
api.use('*', async (c, next) => { c.header('cache-control', 'no-store'); c.header('x-content-type-options', 'nosniff'); await next(); });
for (const [path, routes] of Object.entries({ auth: authRoutes, dashboard: dashboardRoutes, users: usersRoutes, broadcast: broadcastRoutes, engagement: engagementRoutes, support: supportRoutes, menu: menuRoutes, settings: settingsRoutes, media: mediaRoutes, studio: studioRoutes })) api.route('/' + path, routes);
api.get('/health', c => c.json({ ok: true, data: { ts: Date.now(), version: c.env.APP_VERSION || '2.0.0', colo: c.req.raw.cf?.colo || null, durable: !!c.env.__coordinated } }));
api.notFound(c => c.json({ ok: false, error: 'not_found' }, 404));
api.onError((err, c) => {
  if (err.status) return c.json({ ok: false, error: err.message }, err.status);
  console.error('[api] request failed', err.name);
  return c.json({ ok: false, error: 'internal_error' }, 500);
});

export async function runScheduled(env) {
  const at = Date.now(), previous = await getJson(env, 'v2:runtime:cron', {});
  if (at - (previous.at || 0) < 10000) return;
  const errors = [];
  await putJson(env, 'v2:runtime:cron', { at, status: 'running' });
  // Each subsystem records its own delivery results; one failure must not stop the others.
  for (const [name, fn] of Object.entries({ orders: expireOrders, groups: groupTick, broadcasts: broadcastTick, feeds: feedTick, relay: relayTick })) {
    try { await fn(env); } catch (e) { errors.push({ name, error: String(e.message).slice(0, 160) }); }
  }
  await putJson(env, 'v2:runtime:cron', { at, finishedAt: Date.now(), status: errors.length ? 'partial' : 'ok', errors });
}
async function dispatch(request, env, ctx) {
  const { pathname } = new URL(request.url);
  if (pathname === '/internal/tick') { await runScheduled(env); return Response.json({ ok: true }); }
  if (pathname === '/telegram/webhook') {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    const secret = request.headers.get('x-telegram-bot-api-secret-token') || '';
    if (!env.WEBHOOK_SECRET || !await safeEqual(secret, env.WEBHOOK_SECRET)) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    if (Number(request.headers.get('content-length') || 0) > 1024 * 1024) return new Response('Too large', { status: 413 });
    let update; try { update = await request.json(); } catch {}
    if (!update || Array.isArray(update) || typeof update !== 'object') return Response.json({ ok: false, error: 'bad_request' }, { status: 400 });
    // Acknowledge only after durable state changes. Telegram may retry a non-2xx update.
    try { await handleUpdate(env, update); } catch (e) { console.error('[webhook] processing failed', e.name); return Response.json({ ok: false }, { status: 500 }); }
    return Response.json({ ok: true });
  }
  if (pathname.startsWith('/pay/')) return handlePayment(request, env);
  return api.fetch(request, env, ctx);
}

export class BotCoordinator {
  constructor(state, env) {
    this.state = state;
    this.kv = new DurableKV(state.storage, env.BOT_KV);
    this.env = { ...env, BOT_KV: this.kv, __coordinated: true };
    this.queue = Promise.resolve();
    this.groupQueues = new Map();
    this.env.withGroupLock = (id, fn) => this.withGroupLock(id, fn);
  }
  enqueue(fn) { const task = this.queue.then(fn, fn); this.queue = task.catch(() => {}); return task; }
  withGroupLock(id, fn) {
    const previous = this.groupQueues.get(String(id)) || Promise.resolve();
    const task = previous.then(fn, fn);
    this.groupQueues.set(String(id), task);
    const cleanup = () => { if (this.groupQueues.get(String(id)) === task) this.groupQueues.delete(String(id)); };
    task.then(cleanup, cleanup); return task;
  }
  async arm() {
    const current = await this.state.storage.getAlarm(), next = Date.now() + 15000;
    if (!current || current > next) await this.state.storage.setAlarm(next);
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const run = () => dispatch(request, this.env, this.state);
    // Uploads/downloads have independent UUID records and need not block group moderation.
    const independentMedia = path.startsWith('/api/media') || /^\/api\/studio\/orders\/[^/]+\/receipt$/.test(path);
    let groupId = /^\/api\/studio\/groups\/(-\d+)(?:\/|$)/.exec(path)?.[1];
    if (path === '/telegram/webhook' || (path === '/api/studio/groups' && request.method === 'POST')) {
      const body = await request.clone().json().catch(() => null);
      const update = body?.message || body?.edited_message || body?.chat_member || body?.my_chat_member || (body?.callback_query?.data?.startsWith('cap:') ? body.callback_query.message : null);
      if (update && ['group', 'supergroup'].includes(update.chat?.type)) groupId = String(update.chat.id);
      if (path === '/api/studio/groups' && /^-\d+$/.test(body?.chatId)) groupId = body.chatId;
    }
    // A slow broadcast/upload must not serialize unrelated busy groups. Each group keeps its own ordered mutations.
    const response = await (independentMedia ? run() : groupId ? this.withGroupLock(groupId, run) : this.enqueue(run));
    if (request.method !== 'GET' || path.startsWith('/pay/')) await this.arm();
    return response;
  }
  async alarm() {
    await this.enqueue(() => runScheduled(this.env)); this.kv.cleanup();
    await this.state.storage.setAlarm(Date.now() + 60000);
  }
}
function stub(env) { return env.BOT_STATE.get(env.BOT_STATE.idFromName('telegram-bot-panel-v2')); }
export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/internal/')) return new Response('Not Found', { status: 404 });
    if (path === '/telegram/webhook') {
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
      const secret = request.headers.get('x-telegram-bot-api-secret-token') || '';
      if (!env.WEBHOOK_SECRET || !await safeEqual(secret, env.WEBHOOK_SECRET)) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
      if (Number(request.headers.get('content-length') || 0) > 1024 * 1024) return new Response('Too large', { status: 413 });
    }
    if (path.startsWith('/api/') || path === '/telegram/webhook' || path.startsWith('/pay/')) {
      if (env.BOT_STATE) return stub(env).fetch(request);
      if (env.TEST_MODE) return dispatch(request, env, ctx);
      return Response.json({ ok: false, error: 'durable_object_binding_required' }, { status: 503 });
    }
    return env.ASSETS && request.method === 'GET' ? env.ASSETS.fetch(request) : new Response('Not Found', { status: 404 });
  },
  async scheduled(event, env, ctx) {
    if (env.BOT_STATE) ctx.waitUntil(stub(env).fetch(new Request('https://internal/internal/tick', { method: 'POST' })));
    else if (env.TEST_MODE) ctx.waitUntil(runScheduled(env));
  },
};
