import { Hono } from 'hono';
import { requireAuth } from '../auth.js';
import { getJson, putJson, getSettings, getUser } from '../kv.js';
import { entityKey, allEntities } from '../storage.js';
import { PURPOSES, activeModules, enabled, assert, id, str, int } from '../config.js';
import { getProduct, validateProduct, getOrder, updateOrder, isPaidOrder } from '../commerce.js';
import { validateGroup, GROUP_DEFAULTS, removeGroup, getGroup } from '../groups.js';
import { validateFeed, publishRelay } from '../automation.js';
import { fileResponse } from '../media.js';
import { resolveToken, tgApi } from '../bot-api.js';
import { readJson } from '../body.js';

const r = new Hono(); r.use('*', requireAuth);
const moduleGuard = name => async (c, next) => { assert(enabled(await getSettings(c.env), name), 'module_disabled', 403); await next(); };
const result = (c, data) => c.json({ ok: true, data });
const recent = (rows, key = 'createdAt') => rows.sort((a, b) => (b[key] || 0) - (a[key] || 0));
const page = (c, rows) => {
  const offset = int(c.req.query('offset') || 0, 0, 1000000, 0), limit = int(c.req.query('limit') || 50, 1, 200, 50);
  return { rows: rows.slice(offset, offset + limit), total: rows.length, nextOffset: offset + limit < rows.length ? offset + limit : null };
};
r.get('/summary', async c => {
  const settings = await getSettings(c.env);
  const [products, orders, groups, feeds, relays] = await Promise.all(['product', 'order', 'group', 'feed', 'relay'].map(k => allEntities(c.env, k)));
  return result(c, { purposes: PURPOSES, modules: activeModules(settings), purpose: settings.botPurpose, counts: { products: products.filter(p => !p.hidden).length, orders: orders.length, review: orders.filter(o => ['receipt_review', 'payment_review'].includes(o.status)).length, groups: groups.filter(g => g.enabled).length, feeds: feeds.filter(f => f.enabled).length, relay: relays.filter(r => r.status === 'pending').length, revenue: orders.filter(isPaidOrder).reduce((a, o) => a + o.total, 0) }, groupDefaults: GROUP_DEFAULTS });
});
r.use('/products*', moduleGuard('catalog')); r.use('/categories*', moduleGuard('catalog'));
r.get('/products', async c => result(c, page(c, recent(await allEntities(c.env, 'product')))));
r.post('/products', async c => { const p = await validateProduct(c.env, await readJson(c)); await putJson(c.env, entityKey('product', p.id), p); return result(c, { product: p }); });
r.put('/products/:id', async c => { const old = await getProduct(c.env, c.req.param('id')); assert(old, 'product_not_found', 404); const p = await validateProduct(c.env, await readJson(c), old); await putJson(c.env, entityKey('product', p.id), p); return result(c, { product: p }); });
r.delete('/products/:id', async c => {
  const p = await getProduct(c.env, c.req.param('id')); assert(p, 'product_not_found', 404);
  const used = (await allEntities(c.env, 'order')).some(o => o.items.some(i => i.id === p.id));
  if (used) { p.hidden = true; await putJson(c.env, entityKey('product', p.id), p); }
  else await c.env.BOT_KV.delete(entityKey('product', p.id));
  return result(c, { archived: used });
});
r.get('/categories', async c => result(c, { rows: (await allEntities(c.env, 'category')).sort((a, b) => (a.sort || 0) - (b.sort || 0)) }));
for (const method of ['post', 'put']) r[method](method === 'post' ? '/categories' : '/categories/:id', async c => {
  const body = await readJson(c), cid = c.req.param('id') || id();
  if (method === 'put') assert(await getJson(c.env, entityKey('category', cid)), 'category_not_found', 404);
  const category = { id: cid, title: str(body.title, 64), titleEn: str(body.titleEn, 64), hidden: !!body.hidden, sort: int(body.sort || 0, 0, 10000, 0) };
  assert(category.title, 'category_title_required'); await putJson(c.env, entityKey('category', cid), category); return result(c, { category });
});
r.delete('/categories/:id', async c => { const cid = c.req.param('id'); assert(!(await allEntities(c.env, 'product')).some(p => p.categoryId === cid), 'category_has_products'); await c.env.BOT_KV.delete(entityKey('category', cid)); return result(c, {}); });

r.use('/orders*', moduleGuard('shop'));
r.get('/orders', async c => { let rows = recent(await allEntities(c.env, 'order')); if (c.req.query('status')) rows = rows.filter(o => o.status === c.req.query('status')); return result(c, page(c, rows)); });
r.get('/orders/:id', async c => { const order = await getOrder(c.env, c.req.param('id')); assert(order, 'order_not_found', 404); return result(c, { order }); });
r.get('/orders/:id/receipt', async c => { const o = await getOrder(c.env, c.req.param('id')); assert(o?.receipt?.fileId, 'receipt_not_found', 404); return fileResponse(await resolveToken(c.env), o.receipt.fileId, { inline: true, name: o.receipt.name }); });
r.post('/orders/:id/:action', async c => result(c, { order: await updateOrder(c.env, c.req.param('id'), c.req.param('action'), await readJson(c)) }));
r.use('/coupons*', moduleGuard('shop'));
r.get('/coupons', async c => result(c, { rows: recent(await allEntities(c.env, 'coupon')) }));
for (const method of ['post', 'put']) r[method](method === 'post' ? '/coupons' : '/coupons/:id', async c => {
  const body = await readJson(c), cid = c.req.param('id') || id(), old = await getJson(c.env, entityKey('coupon', cid));
  if (method === 'put') assert(old, 'coupon_not_found', 404);
  const coupon = { id: cid, code: str(body.code, 32).toUpperCase(), type: body.type, value: int(body.value, 1, body.type === 'percent' ? 100 : 1000000000), startsAt: Number(body.startsAt) || 0, expiresAt: Number(body.expiresAt) || 0, maxUses: int(body.maxUses || 0, 0, 1000000), used: old?.used || 0, reserved: old?.reserved || 0, hidden: !!body.hidden, createdAt: old?.createdAt || Date.now() };
  assert(/^[A-Z0-9_-]{3,32}$/.test(coupon.code) && ['percent', 'amount'].includes(coupon.type) && coupon.value !== undefined && coupon.maxUses !== undefined, 'invalid_coupon');
  assert(!coupon.expiresAt || coupon.expiresAt > Math.max(Date.now(), coupon.startsAt), 'invalid_coupon_dates');
  assert(!(await allEntities(c.env, 'coupon')).some(c => c.code === coupon.code && c.id !== cid), 'duplicate_coupon');
  await putJson(c.env, entityKey('coupon', cid), coupon); return result(c, { coupon });
});
r.delete('/coupons/:id', async c => { const coupon = await getJson(c.env, entityKey('coupon', c.req.param('id'))); assert(coupon, 'coupon_not_found', 404); coupon.hidden = true; await putJson(c.env, entityKey('coupon', coupon.id), coupon); return result(c, {}); });

r.use('/groups*', moduleGuard('moderation'));
r.get('/groups', async c => result(c, { rows: await allEntities(c.env, 'group'), defaults: GROUP_DEFAULTS }));
r.post('/groups', async c => { const body = await readJson(c), old = await getGroup(c.env, body.chatId); assert(!old, 'group_already_exists'); const g = await validateGroup(c.env, body); await putJson(c.env, entityKey('group', g.chatId), g); return result(c, { group: g }); });
r.put('/groups/:id', async c => { const old = await getGroup(c.env, c.req.param('id')); assert(old, 'group_not_found', 404); const body = await readJson(c); body.chatId = old.chatId; const g = await validateGroup(c.env, body, old); await putJson(c.env, entityKey('group', g.chatId), g); return result(c, { group: g }); });
r.delete('/groups/:id', async c => { await removeGroup(c.env, c.req.param('id')); return result(c, {}); });
r.post('/groups/:id/check', async c => {
  const token = await resolveToken(c.env); assert(token, 'token_missing'); const me = await tgApi(token, 'getMe'); assert(me.ok, 'telegram_connection_failed');
  const member = await tgApi(token, 'getChatMember', { chat_id: c.req.param('id'), user_id: me.result.id });
  return result(c, { ok: !!member.ok, permissions: member.result || null, error: member.description || '' });
});
r.get('/audit', async c => result(c, page(c, recent(await allEntities(c.env, 'audit'), 'at'))));
r.post('/audit/:id/resolve', async c => { const k = entityKey('audit', c.req.param('id')), a = await getJson(c.env, k); assert(a, 'not_found', 404); a.resolved = true; await putJson(c.env, k, a, { ttl: 30 * 86400 }); return result(c, {}); });

r.use('/feeds*', moduleGuard('channel'));
r.get('/feeds', async c => result(c, { rows: recent(await allEntities(c.env, 'feed')), deletionErrors: await allEntities(c.env, 'deleteerror') }));
for (const method of ['post', 'put']) r[method](method === 'post' ? '/feeds' : '/feeds/:id', async c => {
  const body = await readJson(c), old = c.req.param('id') ? await getJson(c.env, entityKey('feed', c.req.param('id'))) : {};
  assert(old, 'feed_not_found', 404); const f = await validateFeed(c.env, body, old); await putJson(c.env, entityKey('feed', f.id), f); return result(c, { feed: f });
});
r.delete('/feeds/:id', async c => { await c.env.BOT_KV.delete(entityKey('feed', c.req.param('id'))); return result(c, {}); });
r.post('/feeds/:id/scan', async c => { const k = entityKey('feed', c.req.param('id')), f = await getJson(c.env, k); assert(f, 'feed_not_found', 404); f.nextAt = 0; await putJson(c.env, k, f); return result(c, { queued: true }); });

r.use('/relay*', moduleGuard('relay'));
r.get('/relay/:id/attachment/:index', async c => {
  const entry = await getJson(c.env, entityKey('relay', c.req.param('id')));
  const index = int(c.req.param('index'), 0, 9);
  const attachment = entry?.attachments?.[index]; assert(attachment, 'attachment_not_found', 404);
  return fileResponse(await resolveToken(c.env), attachment.fileId, { inline: attachment.kind === 'photo', name: attachment.name });
});
r.get('/relay', async c => result(c, page(c, recent(await allEntities(c.env, 'relay')))));
r.post('/relay/:id/approve', async c => { const b = await readJson(c); assert(Array.isArray(b.destinations), 'invalid_destinations'); return result(c, { relay: await publishRelay(c.env, c.req.param('id'), b.destinations) }); });
r.post('/relay/:id/reject', async c => { const key = entityKey('relay', c.req.param('id')), entry = await getJson(c.env, key); assert(entry?.status === 'pending', 'relay_already_processed'); entry.status = 'rejected'; await putJson(c.env, key, entry); return result(c, {}); });

r.use('/crm*', moduleGuard('crm'));
r.get('/crm', async c => {
  const accounts = (await allEntities(c.env, 'points')).sort((a, b) => b.earned - a.earned);
  const top = await Promise.all(accounts.slice(0, 100).map(async a => ({ ...a, name: (await getUser(c.env, a.userId))?.firstName || a.userId })));
  return result(c, { accounts: top, events: recent(await allEntities(c.env, 'reward'), 'at').slice(0, 60) });
});
r.use('/faq*', moduleGuard('faq'));
r.get('/faq', async c => result(c, { rows: recent(await allEntities(c.env, 'faq')) }));
for (const method of ['post', 'put']) r[method](method === 'post' ? '/faq' : '/faq/:id', async c => {
  const b = await readJson(c), fid = c.req.param('id') || id();
  if (method === 'put') assert(await getJson(c.env, entityKey('faq', fid)), 'faq_not_found', 404);
  const faq = { id: fid, question: str(b.question, 100), questionEn: str(b.questionEn, 100), answer: str(b.answer, 3500), answerEn: str(b.answerEn, 3500), hidden: !!b.hidden, createdAt: Date.now() };
  assert(faq.question && faq.answer, 'invalid_faq'); await putJson(c.env, entityKey('faq', fid), faq); return result(c, { faq });
});
r.delete('/faq/:id', async c => { await c.env.BOT_KV.delete(entityKey('faq', c.req.param('id'))); return result(c, {}); });
export default r;
