import { XMLParser } from 'fast-xml-parser';
import { getJson, putJson, getSettings } from './kv.js';
import { allEntities, entityKey } from './storage.js';
import { assert, id, str, int, isChatId, enabled, text as tr } from './config.js';
import { publicFeed, safePublicUrl } from './network.js';
import { tgApi, resolveToken, sendToUser } from './bot-api.js';
import { audit } from './groups.js';

const asArray = value => value == null ? [] : Array.isArray(value) ? value : [value];
const plain = value => String(typeof value === 'object' ? value?.['#text'] || '' : value || '').replace(/<[^>]*>/g, '').trim();
export function parseFeed(xml) {
  assert(!/<!DOCTYPE|<!ENTITY/i.test(xml), 'feed_entities_not_allowed');
  const doc = new XMLParser({ ignoreAttributes: false, processEntities: false, parseTagValue: false, trimValues: true }).parse(xml);
  const items = asArray(doc.rss?.channel?.item || doc.feed?.entry);
  return items.map(i => {
    const links = asArray(i.link); const href = links.find(l => typeof l === 'object' && (!l['@_rel'] || l['@_rel'] === 'alternate'))?.['@_href'] || (typeof links[0] === 'string' ? links[0] : '');
    return { id: plain(i.guid || i.id) || href, title: plain(i.title).slice(0, 300), url: href, summary: plain(i.description || i.summary).slice(0, 1800) };
  }).filter(i => i.id && i.title && safePublicUrl(i.url)).slice(0, 40);
}
export async function validateFeed(env, b, existing = {}) {
  const f = { id: existing.id || id(), title: str(b.title, 100), type: b.type || 'rss', enabled: b.enabled !== false, destinations: (Array.isArray(b.destinations) ? b.destinations : []).map(String), intervalMinutes: int(b.intervalMinutes, 5, 1440, 15), createdAt: existing.createdAt || Date.now(), nextAt: Date.now(), seen: existing.seen || [], initialized: existing.initialized || false, pending: existing.pending || [], lastError: existing.lastError || '', ...Object.fromEntries(['lastAt', 'lastSentAt'].filter(k => existing[k]).map(k => [k, existing[k]])) };
  assert(f.title && ['rss', 'youtube', 'channel'].includes(f.type), 'invalid_feed');
  assert(f.destinations.length > 0 && f.destinations.length <= 10 && f.destinations.every(isChatId), 'invalid_destinations');
  if (f.type === 'channel') {
    f.sourceChatId = str(b.sourceChatId, 64); assert(isChatId(f.sourceChatId) && !f.destinations.includes(f.sourceChatId), 'invalid_source_chat');
    // Only one-hop channel rules. Refuse cross-rule cycles before saving.
    const rules = (await allEntities(env, 'feed')).filter(x => x.id !== f.id && x.type === 'channel');
    rules.push(f);
    const walk = (source, seen = new Set()) => { assert(!seen.has(source), 'channel_repost_cycle'); const next = new Set(seen); next.add(source); for (const r of rules.filter(r => r.sourceChatId === source)) for (const dest of r.destinations) walk(dest, next); };
    for (const r of rules) walk(r.sourceChatId);
  } else {
    f.url = f.type === 'youtube' ? `https://www.youtube.com/feeds/videos.xml?channel_id=${str(b.youtubeChannelId, 64)}` : str(b.url, 1500);
    f.youtubeChannelId = f.type === 'youtube' ? str(b.youtubeChannelId, 64) : '';
    if (f.type === 'youtube') assert(/^UC[A-Za-z0-9_-]{22}$/.test(f.youtubeChannelId), 'invalid_youtube_channel_id');
    assert(safePublicUrl(f.url), 'unsafe_feed_url');
  }
  if (existing.url !== f.url || existing.sourceChatId !== f.sourceChatId) { f.seen = []; f.pending = []; f.initialized = false; }
  return f;
}
export async function feedTick(env) {
  const settings = await getSettings(env); if (!enabled(settings, 'channel')) return;
  const token = await resolveToken(env); if (!token) return;
  const feeds = (await allEntities(env, 'feed')).filter(f => f.enabled && f.type !== 'channel' && f.nextAt <= Date.now()).sort((a, b) => a.nextAt - b.nextAt).slice(0, 3);
  for (const f of feeds) {
    f.nextAt = Date.now() + f.intervalMinutes * 60000;
    try {
      const items = parseFeed(await publicFeed(f.url));
      if (!f.initialized) { f.seen = items.map(i => i.id); f.initialized = true; }
      else {
        const fresh = items.filter(i => !f.seen.includes(i.id)).reverse().slice(0, Math.max(0, 100 - f.pending.length));
        for (const i of fresh) { f.pending.push({ ...i, targets: f.destinations.map(chatId => ({ chatId, status: 'pending' })) }); f.seen.push(i.id); }
        f.seen = [...new Set(f.seen)].slice(-200);
        await putJson(env, entityKey('feed', f.id), f);
        for (const item of f.pending.slice(0, 3)) {
          for (const target of item.targets) {
            if (target.status === 'sending') { target.status = 'review'; f.lastError = 'feed_delivery_uncertain'; continue; }
            if (target.status !== 'pending') continue;
            target.status = 'sending'; await putJson(env, entityKey('feed', f.id), f);
            const res = await sendToUser(token, target.chatId, `📰 ${item.title}\n\n${item.summary}\n\n${item.url}`.slice(0, 4096), { disable_web_page_preview: false });
            target.status = res.ok ? 'sent' : res.uncertain ? 'review' : 'failed'; target.error = res.description || '';
            if (!res.ok) f.lastError = target.error;
            else f.lastSentAt = Date.now();
            await putJson(env, entityKey('feed', f.id), f);
          }
        }
        f.pending = f.pending.filter(i => i.targets.some(t => t.status === 'pending' || t.status === 'review'));
      }
      f.lastAt = Date.now();
    } catch (e) { f.lastError = str(e.message, 180); }
    await putJson(env, entityKey('feed', f.id), f);
  }
}
export async function channelPost(env, token, msg, settings) {
  if (!enabled(settings, 'channel')) return;
  const source = String(msg.chat.id), username = msg.chat.username ? '@' + msg.chat.username : '';
  for (const chat of [source, username].filter(Boolean)) if (await getJson(env, entityKey('autogenerated', `${chat.toLowerCase()}:${msg.message_id}`))) return;
  for (const f of (await allEntities(env, 'feed')).filter(f => f.enabled && f.type === 'channel' && [source, username].includes(f.sourceChatId))) {
    for (const dest of f.destinations) {
      if ([source, username].includes(dest)) continue;
      const key = entityKey('autocopied', `${f.id}:${msg.message_id}:${dest}`);
      if (await getJson(env, key)) continue;
      await putJson(env, key, { status: 'sending', at: Date.now() }, { ttl: 7 * 86400 });
      const res = await tgApi(token, 'copyMessage', { chat_id: dest, from_chat_id: msg.chat.id, message_id: msg.message_id });
      if (res.ok && res.result?.message_id) await putJson(env, entityKey('autogenerated', `${String(dest).toLowerCase()}:${res.result.message_id}`), { at: Date.now() }, { ttl: 7 * 86400 });
      await putJson(env, key, { status: res.ok ? 'sent' : 'failed', error: res.description || '', at: Date.now() }, { ttl: 7 * 86400 });
      await audit(env, 'autoposter', { source, destination: dest, ok: !!res.ok, error: res.description || '', messageId: msg.message_id });
      if (!res.ok) f.lastError = res.description;
    }
    f.lastAt = Date.now(); await putJson(env, entityKey('feed', f.id), f);
  }
}

export async function relayMessage(env, token, msg, user, settings, lang) {
  if (!enabled(settings, 'relay') || !settings.relay.enabled) return false;
  if (msg.text?.startsWith('/')) return false;
  const allowed = ['text', 'photo', 'document', 'video', 'animation', 'voice', 'audio', 'sticker', 'video_note'];
  if (!allowed.some(k => msg[k])) { await sendToUser(token, user.id, tr('این نوع پیام قابل کپی نیست.', 'This message type cannot be copied.', lang)); return true; }
  const groupKey = msg.media_group_id ? `${msg.chat.id}:${msg.media_group_id}` : null;
  let entry = groupKey ? await getJson(env, entityKey('relayalbum', groupKey)) : null;
  if (entry) entry = await getJson(env, entityKey('relay', entry));
  if (!entry || entry.status !== 'collecting') entry = { id: id(), userId: String(user.id), userName: user.firstName, sourceChat: msg.chat.id, messageIds: [], attachments: [], text: str(msg.text || msg.caption, 1000), status: msg.media_group_id ? 'collecting' : settings.relay.approval ? 'pending' : 'ready', destinations: [], createdAt: Date.now(), readyAt: Date.now() + 4000, botId: token.split(':')[0] };
  if (!entry.messageIds.includes(msg.message_id)) {
    entry.messageIds.push(msg.message_id);
    const media = msg.photo?.at(-1) || msg.document || msg.video || msg.animation || msg.audio || msg.voice || msg.sticker || msg.video_note;
    if (media?.file_id) { entry.attachments = entry.attachments || []; entry.attachments.push({ fileId: media.file_id, name: media.file_name || (msg.photo ? 'photo.jpg' : 'attachment'), kind: msg.photo ? 'photo' : 'document' }); }
  }
  entry.messageIds.sort((a, b) => a - b); entry.readyAt = Date.now() + 4000;
  await putJson(env, entityKey('relay', entry.id), entry);
  if (groupKey) await putJson(env, entityKey('relayalbum', groupKey), entry.id, { ttl: 3600 });
  if (!msg.media_group_id) {
    if (!settings.relay.approval) await publishRelay(env, entry.id, settings.relay.destinations.map(d => d.chatId), false);
    else await notifyRelayAdmin(env, entry);
    await sendToUser(token, user.id, settings.relay.approval ? tr('✅ پیام برای بررسی مدیر ثبت شد. هویت شما فقط در پنل مدیر دیده می‌شود؛ مقصد برچسب فوروارد دریافت نمی‌کند.', '✅ Submitted for review. The administrator can see your identity; recipients see no forward attribution.', lang) : tr('پیام پردازش شد؛ وضعیت ارسال در پنل ثبت شده است.', 'Message processed; delivery status is recorded in the panel.', lang));
  }
  return true;
}
export async function publishRelay(env, relayId, destinations, manual = true) {
  const r = await getJson(env, entityKey('relay', relayId)); assert(r, 'relay_not_found', 404);
  assert(['pending', 'ready'].includes(r.status), 'relay_already_processed');
  const settings = await getSettings(env), token = await resolveToken(env);
  assert(enabled(settings, 'relay'), 'module_disabled', 403); assert(r.botId === token?.split(':')[0], 'media_belongs_to_another_bot');
  const ids = [...new Set([...destinations.map(String), ...(settings.relay.echoToUser ? [r.userId] : [])])];
  assert(ids.length && ids.length <= 11 && ids.every(isChatId), 'invalid_destinations');
  r.status = 'publishing'; r.destinations = ids.map(chatId => ({ chatId, status: 'pending' })); r.approvedAt = Date.now(); await putJson(env, entityKey('relay', r.id), r);
  for (const d of r.destinations) {
    d.status = 'sending'; await putJson(env, entityKey('relay', r.id), r);
    const res = await tgApi(token, r.messageIds.length > 1 ? 'copyMessages' : 'copyMessage', { chat_id: d.chatId, from_chat_id: r.sourceChat, ...(r.messageIds.length > 1 ? { message_ids: r.messageIds } : { message_id: r.messageIds[0] }) });
    const partial = res.ok && Array.isArray(res.result) && res.result.length < r.messageIds.length;
    d.status = res.ok && !partial ? 'sent' : res.uncertain ? 'review' : 'failed'; d.error = partial ? 'some_album_messages_not_copied' : res.description || ''; d.result = res.ok ? res.result : undefined;
    await putJson(env, entityKey('relay', r.id), r);
  }
  r.status = r.destinations.every(d => d.status === 'sent') ? 'sent' : 'failed'; await putJson(env, entityKey('relay', r.id), r); return r;
}
export async function relayTick(env) {
  const settings = await getSettings(env);
  for (const r of await allEntities(env, 'relay')) {
    if (r.status === 'publishing') { r.status = 'review'; await putJson(env, entityKey('relay', r.id), r); }
    if (r.status === 'ready' && settings.relay.enabled && !settings.relay.approval && enabled(settings, 'relay')) { await publishRelay(env, r.id, settings.relay.destinations.map(d => d.chatId), false); continue; }
    if (r.status !== 'collecting' || r.readyAt > Date.now()) continue;
    r.status = settings.relay.approval ? 'pending' : 'ready'; await putJson(env, entityKey('relay', r.id), r);
    if (settings.relay.approval && enabled(settings, 'relay')) await notifyRelayAdmin(env, r);
    if (!settings.relay.approval && settings.relay.enabled && enabled(settings, 'relay')) await publishRelay(env, r.id, settings.relay.destinations.map(d => d.chatId), false);
  }
}

/* After the bot receives a message/file for clean-copy publishing, it asks the
 * administrator right inside Telegram: publish to the configured destinations
 * (forward header removed via copyMessage), reject, or edit destinations. */
export async function notifyRelayAdmin(env, r) {
  const settings = await getSettings(env);
  const adminId = settings.adminId || env.ADMIN_ID;
  if (!adminId || !isChatId(adminId) || String(adminId) === String(r.userId)) return;
  const token = await resolveToken(env);
  if (!token) return;
  const marker = entityKey('relaynotified', r.id);
  if (await getJson(env, marker)) return;
  await putJson(env, marker, { at: Date.now() }, { ttl: 7 * 86400 });
  const destinations = (settings.relay.destinations || []).map(d => d.title || d.chatId).join('، ') || '— ثبت نشده';
  await sendToUser(token, adminId,
    `🪄 ${tr('پیام جدید برای انتشار بدون فوروارد', 'New message for clean-copy publishing', 'fa')}\n` +
    `👤 ${r.userName || ''} (${r.userId})\n` +
    `📝 ${(r.text || '—').slice(0, 300)}\n` +
    `📎 ${(r.messageIds || []).length} ${'پیام'}\n` +
    `📡 ${tr('مقصدهای ثبت‌شده', 'Configured destinations', 'fa')}: ${destinations}\n\n` +
    tr('این پیام به کانال/گروه ارسال شود؟ (بدون برچسب فوروارد)', 'Publish this message to the channel/group? (no forward header)', 'fa'),
    { reply_markup: { inline_keyboard: [[
      { text: '✅ انتشار در مقصدها', callback_data: `rl:pub:${r.id}` },
      { text: '❌ رد', callback_data: `rl:rej:${r.id}` },
    ], [
      { text: '📂 مدیریت حذف فوروارد', callback_data: 'adm:relay' },
    ]] } });
}
