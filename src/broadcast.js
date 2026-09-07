import { Hono } from 'hono';
import { requireAuth } from './auth.js';
import { K, getJson, putJson, getSettings, bumpStats, getUser, putUser, collectTargetIds, pushBroadcastId, pushEngIndex, getRecentBroadcasts } from './kv.js';
import { entityKey, allEntities } from './storage.js';
import { assert, id, int, str, isChatId, urlButtons, enabled } from './config.js';
import { tgApi, sendToUser, resolveToken } from './bot-api.js';
import { getMedia, sendMedia, checkBotMedia } from './media.js';
import { sendPollToChat, reactMarkup } from './engagement.js';
import { isPaidOrder } from './commerce.js';

export const jobView = j => ({ ...j, targets: undefined });
async function broadcastJobs(env) {
  const jobs = []; let cursor;
  do {
    const p = await env.BOT_KV.list({ prefix: 'broadcast:', limit: 1000, cursor });
    for (const k of p.keys) { if (k.name === K.BROADCAST_INDEX) continue; const j = await getJson(env, k.name); if (j?.id) jobs.push(j); }
    cursor = p.list_complete ? null : p.cursor;
  } while (cursor);
  return jobs;
}
export async function makePayload(env, body) {
  const kind = body.kind || 'text', settings = await getSettings(env);
  assert(['text', 'poll', 'photo', 'document', 'video', 'animation', 'audio'].includes(kind), 'invalid_broadcast_kind');
  const p = { kind, parseMode: ['HTML', 'MarkdownV2'].includes(body.parseMode) ? body.parseMode : null, buttons: urlButtons(body.buttons) };
  if (kind === 'text') { p.text = str(body.text, 4097); assert(p.text && p.text.length <= 4096, 'invalid_text'); }
  else if (kind === 'poll') {
    const q = str(body.poll?.question, 301), options = (Array.isArray(body.poll?.options) ? body.poll.options : []).map(o => str(o, 100)).filter(Boolean);
    assert(q && q.length <= 300 && options.length >= 2 && options.length <= 10, 'invalid_poll');
    const mode = ['single', 'multiple', 'quiz'].includes(body.poll.mode) ? body.poll.mode : 'single';
    const closesAt = body.poll.closesAt ? Number(body.poll.closesAt) : 0;
    assert(!closesAt || Number.isSafeInteger(closesAt) && closesAt > Date.now(), 'invalid_poll_deadline');
    const correctIndex = int(body.poll.correctIndex, 0, options.length - 1);
    assert(mode !== 'quiz' || correctIndex !== undefined, 'quiz_answer_required');
    p.poll = { id: id().slice(0, 10), q, opts: options.map(label => ({ label, n: 0 })), mode, correctIndex: mode === 'quiz' ? correctIndex : null, rewardPoints: int(body.poll.rewardPoints, 0, 1000, 1), closesAt, participants: 0, membersOnly: !!body.poll.membersOnly, requiredChats: [], createdAt: Date.now() };
  } else {
    p.mediaId = str(body.mediaId || body.photo?.mediaId, 32); p.caption = str(body.caption ?? body.photo?.caption, 1025);
    assert(p.caption.length <= 1024, 'invalid_caption');
    if (p.mediaId) { const m = await getMedia(env, p.mediaId); checkBotMedia(m, await resolveToken(env)); assert(m.kind === kind, 'media_kind_mismatch'); }
    else {
      // Backward compatibility for existing saved photo broadcasts. New panel uploads files.
      assert(kind === 'photo' && /^https:\/\//i.test(body.photo?.url || '') && body.photo.url.length <= 512, 'media_required'); p.photoUrl = body.photo.url;
    }
    p.post = { id: id().slice(0, 10), mediaId: p.mediaId, photo: p.photoUrl || '', caption: p.caption, kind, reactions: body.reactions ?? body.photo?.reactions ?? true, feedback: !!body.feedback, botUsername: settings.botUsername, buttons: p.buttons, likes: 0, dislikes: 0, createdAt: Date.now() };
  }
  return p;
}
export async function deliver(env, token, chatId, payload) {
  if (payload.kind === 'poll') {
    const poll = payload.poll?.id ? (await getJson(env, K.POLL(payload.poll.id))) || payload.poll : payload.poll;
    return sendPollToChat(token, chatId, poll);
  }
  const reply_markup = payload.post ? reactMarkup((await getJson(env, K.POST(payload.post.id))) || payload.post) : payload.buttons?.length ? { inline_keyboard: payload.buttons } : undefined;
  if (payload.mediaId) return sendMedia(env, token, chatId, payload.mediaId, { caption: payload.caption, parse_mode: payload.parseMode || undefined, reply_markup });
  if (payload.photoUrl) return tgApi(token, 'sendPhoto', { chat_id: chatId, photo: payload.photoUrl, caption: payload.caption, parse_mode: payload.parseMode || undefined, reply_markup });
  return sendToUser(token, chatId, payload.text, { parse_mode: payload.parseMode || undefined, disable_web_page_preview: true, reply_markup });
}
async function targetsFor(env, body) {
  const target = body.target || 'all'; let ids;
  if (target === 'users') ids = (Array.isArray(body.userIds) ? body.userIds : String(body.userIds || '').split(/[,،\s]+/)).map(String).filter(i => /^[1-9]\d{0,15}$/.test(i)).slice(0, 50);
  else if (target === 'chat') {
    ids = (Array.isArray(body.chatIds) ? body.chatIds : String(body.chatIds || body.chatId || '').split(/[,،\s]+/)).map(v => String(v).trim()).filter(Boolean);
    assert(ids.length <= 20 && ids.every(isChatId), 'invalid_chat_id');
  } else if (target === 'purchased') {
    assert(body.productId, 'segment_product_required');
    ids = (await allEntities(env, 'order')).filter(o => isPaidOrder(o) && o.items.some(i => i.id === body.productId)).map(o => o.userId);
  } else {
    assert(['all', 'active7d', 'active30d'].includes(target), 'invalid_target');
    ids = await collectTargetIds(env, target === 'all' ? 0 : target === 'active7d' ? 7 : 30);
  }
  ids = [...new Set(ids || [])]; assert(ids.length, 'no_targets'); assert(ids.length <= 20000, 'broadcast_target_limit'); return ids;
}
export async function createBroadcast(env, body) {
  const token = await resolveToken(env); assert(token, 'token_missing');
  const settings = await getSettings(env); assert(enabled(settings, 'broadcast'), 'module_disabled', 403);
  if (body.target === 'purchased') assert(enabled(settings, 'shop'), 'module_disabled', 403);
  const payload = await makePayload(env, body), targets = await targetsFor(env, body);
  const now = Date.now(), scheduledAt = body.scheduledAt ? Number(body.scheduledAt) : 0;
  assert(!scheduledAt || Number.isSafeInteger(scheduledAt) && scheduledAt > now && scheduledAt <= now + 365 * 86400000, 'invalid_schedule_time');
  const deleteAfterSec = int(body.deleteAfterSec || 0, 0, 47 * 3600), repeatEverySec = int(body.repeatEverySec || 0, 0, 365 * 86400);
  assert(deleteAfterSec !== undefined && repeatEverySec !== undefined && (!repeatEverySec || repeatEverySec >= 300), 'invalid_schedule_interval');
  if (scheduledAt || deleteAfterSec || repeatEverySec) assert(enabled(settings, 'channel'), 'channel_module_required', 403);
  if (payload.poll) {
    payload.poll.requiredChats = body.target === 'chat' ? targets.map(chatId => ({ chatId, title: String(chatId), url: settings.requiredChats.targets.find(c => c.chatId === chatId)?.url || '' })) : [];
    await putJson(env, K.POLL(payload.poll.id), payload.poll); await pushEngIndex(env, 'poll', payload.poll.id);
  }
  if (payload.post) { await putJson(env, K.POST(payload.post.id), payload.post); await pushEngIndex(env, 'post', payload.post.id); }
  const job = { id: id().slice(0, 10), kind: payload.kind, target: body.target || 'all', payload, targets, total: targets.length, cursor: 0, sent: 0, failed: 0, text: payload.text, caption: payload.caption, postId: payload.post?.id, pollId: payload.poll?.id, status: scheduledAt ? 'scheduled' : 'running', scheduledAt, nextRunAt: scheduledAt || now, deleteAfterSec, repeatEverySec, cycle: 0, createdAt: now, finishedAt: null, errors: [] };
  await putJson(env, K.BROADCAST(job.id), job); await pushBroadcastId(env, job.id); await bumpStats(env, { broadcasts: 1 });
  if (!scheduledAt && ['users', 'chat'].includes(job.target) && targets.length <= 5) {
    const processed = await tickBroadcast(env, job.id, 5);
    return { mode: 'direct', job: jobView(processed), results: processed.results || [], sent: processed.sent, failed: processed.failed };
  }
  return { job: jobView(job) };
}

async function legacyPayload(env, j) {
  if (j.payload) return j.payload;
  return { kind: j.kind, text: j.text, parseMode: j.parseMode, buttons: j.buttons, photoUrl: j.photoUrl, caption: j.caption, ...(j.pollId ? { poll: await getJson(env, K.POLL(j.pollId)) } : {}), ...(j.postId ? { post: await getJson(env, K.POST(j.postId)) } : {}) };
}
export async function tickBroadcast(env, jobId, maxBatch) {
  const j = await getJson(env, K.BROADCAST(jobId)); assert(j, 'not_found', 404);
  if (j.status === 'ticking') { j.status = 'needs_review'; j.errors.push({ d: 'legacy_interrupted_delivery' }); await putJson(env, K.BROADCAST(j.id), j); return j; }
  if (!['running', 'scheduled'].includes(j.status) || j.nextRunAt > Date.now()) return j;
  const settings = await getSettings(env);
  if (!enabled(settings, 'broadcast') || ((j.scheduledAt || j.repeatEverySec || j.deleteAfterSec) && !enabled(settings, 'channel'))) { j.status = 'paused'; await putJson(env, K.BROADCAST(j.id), j); return j; }
  const token = await resolveToken(env); assert(token, 'token_missing');
  if (j.inFlight) { j.status = 'needs_review'; j.errors.push({ d: 'delivery_interrupted_check_destination_before_retry', id: j.inFlight.chatId }); await putJson(env, K.BROADCAST(j.id), j); return j; }
  j.status = 'running'; j.payload = await legacyPayload(env, j);
  const size = Math.min(maxBatch || settings.broadcast.batchSize || 25, 25), deadline = Date.now() + 12000;
  j.results = j.results || []; let count = 0;
  while (j.cursor < j.targets.length && count < size && Date.now() < deadline) {
    const chatId = j.targets[j.cursor];
    const user = /^\d+$/.test(String(chatId)) ? await getUser(env, chatId) : null;
    if (user?.banned || user?.blockedBot) { j.failed++; j.cursor++; count++; await putJson(env, K.BROADCAST(j.id), j); continue; }
    j.inFlight = { chatId, cursor: j.cursor, at: Date.now() }; await putJson(env, K.BROADCAST(j.id), j);
    let res; try { res = await deliver(env, token, chatId, j.payload); } catch (e) { res = { ok: false, description: e.message }; }
    if (res.error_code === 429) { j.inFlight = null; j.nextRunAt = Date.now() + Math.max(1, res.parameters?.retry_after || 30) * 1000; await putJson(env, K.BROADCAST(j.id), j); break; }
    if (res.uncertain) { j.status = 'needs_review'; j.errors.push({ id: chatId, d: 'delivery_uncertain_check_destination' }); await putJson(env, K.BROADCAST(j.id), j); break; }
    j.inFlight = null;
    if (res.ok) {
      j.sent++;
      if (j.deleteAfterSec && res.result?.message_id) await putJson(env, entityKey('deletion', `${j.id}:${j.cycle || 0}:${j.cursor}`), { id: `${j.id}:${j.cycle || 0}:${j.cursor}`, chatId, messageId: res.result.message_id, at: Date.now() + j.deleteAfterSec * 1000, attempts: 0 });
      await bumpStats(env, { sent: 1 });
    } else {
      j.failed++; if (j.errors.length < 50) j.errors.push({ id: chatId, code: res.error_code || 0, d: str(res.description, 160) });
      if (res.error_code === 403 && user) { user.blockedBot = true; await putUser(env, user); }
    }
    if (j.results.length < 50) j.results.push({ id: chatId, ok: !!res.ok, messageId: res.result?.message_id, error: res.ok ? undefined : res.description });
    j.cursor++; count++; await putJson(env, K.BROADCAST(j.id), j);
    if (j.cursor < j.targets.length) await new Promise(r => setTimeout(r, Math.max(40, settings.broadcast.delayMs || 40)));
  }
  if (j.cursor >= j.targets.length) {
    j.finishedAt = Date.now();
    if (j.repeatEverySec) { j.status = 'scheduled'; j.nextRunAt = Date.now() + j.repeatEverySec * 1000; j.cycle = (j.cycle || 0) + 1; j.cursor = 0; }
    else j.status = 'done';
  }
  await putJson(env, K.BROADCAST(j.id), j); return j;
}
export async function broadcastTick(env) {
  const jobs = (await broadcastJobs(env)).filter(j => ['running', 'scheduled', 'ticking'].includes(j.status) && (!j.nextRunAt || j.nextRunAt <= Date.now())).sort((a, b) => (a.lastTickAt || a.createdAt) - (b.lastTickAt || b.createdAt));
  for (const j of jobs.slice(0, 4)) { j.lastTickAt = Date.now(); await putJson(env, K.BROADCAST(j.id), j); try { await tickBroadcast(env, j.id, 10); } catch (e) { j.errors.push({ d: str(e.message, 160) }); j.nextRunAt = Date.now() + 60000; await putJson(env, K.BROADCAST(j.id), j); } }
  const token = await resolveToken(env); if (!token) return;
  for (const d of (await allEntities(env, 'deletion')).filter(d => d.at <= Date.now()).slice(0, 30)) {
    const res = await tgApi(token, 'deleteMessage', { chat_id: d.chatId, message_id: d.messageId });
    if (res.ok || res.description?.includes('message to delete not found')) await env.BOT_KV.delete(entityKey('deletion', d.id));
    else { d.attempts++; d.error = res.description; d.at = Date.now() + Math.min(d.attempts * 60000, 3600000); if (d.attempts >= 5) { await putJson(env, entityKey('deleteerror', d.id), d, { ttl: 30 * 86400 }); await env.BOT_KV.delete(entityKey('deletion', d.id)); } else await putJson(env, entityKey('deletion', d.id), d); }
  }
}
const r = new Hono(); r.use('*', requireAuth);
r.post('/', async c => c.json({ ok: true, data: await createBroadcast(c.env, await c.req.json()) }));
r.get('/', async c => { const all = await broadcastJobs(c.env); return c.json({ ok: true, data: { jobs: all.sort((a, b) => b.createdAt - a.createdAt).slice(0, 100).map(jobView) } }); });
r.get('/:id', async c => { const j = await getJson(c.env, K.BROADCAST(c.req.param('id'))); assert(j, 'not_found', 404); return c.json({ ok: true, data: { job: jobView(j) } }); });
r.post('/:id/tick', async c => c.json({ ok: true, data: { job: jobView(await tickBroadcast(c.env, c.req.param('id'))) } }));
for (const action of ['pause', 'resume', 'stop', 'skip']) r.post(`/:id/${action}`, async c => {
  const j = await getJson(c.env, K.BROADCAST(c.req.param('id'))); assert(j, 'not_found', 404);
  if (action === 'pause' && ['running', 'scheduled'].includes(j.status)) j.status = 'paused';
  if (action === 'resume' && j.status === 'paused') j.status = j.nextRunAt > Date.now() ? 'scheduled' : 'running';
  if (action === 'stop') { j.status = 'stopped'; j.finishedAt = Date.now(); }
  if (action === 'skip' && j.status === 'needs_review') { j.cursor++; j.failed++; j.inFlight = null; j.status = 'running'; }
  await putJson(c.env, K.BROADCAST(j.id), j); return c.json({ ok: true, data: { job: jobView(j) } });
});
export default r;
