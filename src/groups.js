import { getJson, putJson, getSettings } from './kv.js';
import { entityKey, allEntities } from './storage.js';
import { id, str, int, assert, isGroupId, isChatId, enabled, text as tr } from './config.js';
import { tgApi, sendToUser, resolveToken, memberPresent } from './bot-api.js';
import { sendMedia, getMedia } from './media.js';
import { membershipGate, sendMembershipLock, requiredTargets } from './gate.js';

export const GROUP_DEFAULTS = {
  enabled: true, language: 'fa', blockLinks: true, blockForwards: false, blockBots: true, maxEmojis: 15, maxHashtags: 5, maxLength: 2000,
  floodCount: 6, floodSeconds: 10, words: [], blockedMedia: [], penalty: 'warn', warnLimit: 3, warnPenalty: 'mute', muteSeconds: 3600,
  captcha: true, captchaMode: 'math', captchaSeconds: 120, rulesRequired: true, welcome: true, welcomeText: 'سلام {name} 👋 به گروه خوش آمدید.',
  welcomeTextEn: 'Welcome {name} 👋', welcomeMediaId: '', rules: 'به یکدیگر احترام بگذارید. تبلیغات و اسپم ممنوع است.', rulesEn: 'Be respectful. No advertising or spam.',
  autoClean: true, forceMembership: true, notifyChatId: '', night: { enabled: false, start: '00:00', end: '06:00', timezone: 'Asia/Tehran' },
};
const MEDIA = ['photo', 'document', 'video', 'animation', 'audio', 'voice', 'video_note', 'sticker', 'poll', 'contact'];
const LOCKED = { can_send_messages: false, can_send_audios: false, can_send_documents: false, can_send_photos: false, can_send_videos: false, can_send_video_notes: false, can_send_voice_notes: false, can_send_polls: false, can_send_other_messages: false, can_add_web_page_previews: false };
const DEFAULT_PERMS = { ...Object.fromEntries(Object.keys(LOCKED).map(k => [k, true])), can_invite_users: true };
export const getGroup = (env, chatId) => getJson(env, entityKey('group', chatId));
const saveGroup = (env, g) => putJson(env, entityKey('group', g.chatId), g);
export async function audit(env, kind, data) {
  const event = { id: `${Date.now().toString(36)}-${id().slice(0, 6)}`, kind, at: Date.now(), ...data };
  await putJson(env, entityKey('audit', event.id), event, { ttl: 30 * 86400 }); return event;
}
export async function validateGroup(env, body, existing = {}) {
  const chatId = str(body.chatId || existing.chatId, 24); assert(isGroupId(chatId), 'numeric_group_id_required');
  const g = { ...structuredClone(GROUP_DEFAULTS), ...existing, chatId, title: str(body.title, 100) || existing.title || chatId };
  for (const key of ['enabled', 'blockLinks', 'blockForwards', 'blockBots', 'captcha', 'rulesRequired', 'welcome', 'autoClean', 'forceMembership']) if (key in body) g[key] = !!body[key];
  for (const [key, [min, max]] of Object.entries({ maxEmojis: [0, 200], maxHashtags: [0, 100], maxLength: [0, 4096], floodCount: [0, 50], floodSeconds: [1, 60], warnLimit: [1, 20], muteSeconds: [60, 2592000], captchaSeconds: [30, 600] })) {
    if (key in body) { assert(int(body[key], min, max) !== undefined, 'invalid_group_number'); g[key] = Number(body[key]); }
  }
  for (const [key, options] of Object.entries({ language: ['fa', 'en'], penalty: ['delete', 'warn', 'mute', 'ban'], warnPenalty: ['mute', 'ban'], captchaMode: ['button', 'math'] })) {
    if (key in body) { assert(options.includes(body[key]), 'invalid_group_option'); g[key] = body[key]; }
  }
  if ('words' in body) g.words = (Array.isArray(body.words) ? body.words : []).map(w => str(w, 80)).filter(Boolean).slice(0, 200);
  if ('blockedMedia' in body) g.blockedMedia = (Array.isArray(body.blockedMedia) ? body.blockedMedia : []).filter(k => MEDIA.includes(k));
  for (const key of ['rules', 'rulesEn', 'welcomeText', 'welcomeTextEn']) if (key in body) g[key] = str(body[key], 1500);
  if ('welcomeMediaId' in body) { g.welcomeMediaId = str(body.welcomeMediaId, 32); if (g.welcomeMediaId) assert((await getMedia(env, g.welcomeMediaId))?.kind === 'photo', 'welcome_photo_required'); }
  if ('notifyChatId' in body) { assert(!body.notifyChatId || isChatId(body.notifyChatId), 'invalid_chat_id'); g.notifyChatId = str(body.notifyChatId, 64); }
  if (body.night) {
    const n = body.night;
    assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(n.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(n.end) && n.start !== n.end, 'invalid_night_hours');
    try { new Intl.DateTimeFormat('en', { timeZone: n.timezone }).format(); } catch { assert(false, 'invalid_timezone'); }
    g.night = { enabled: !!n.enabled, start: n.start, end: n.end, timezone: str(n.timezone, 64) };
  }
  g.updatedAt = Date.now(); return g;
}
export function isNight(night, now = Date.now()) {
  if (!night?.enabled) return false;
  const value = new Intl.DateTimeFormat('en-GB', { timeZone: night.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(now));
  return night.start < night.end ? value >= night.start && value < night.end : value >= night.start || value < night.end;
}
const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '');
export function violation(msg, g) {
  const content = String(msg.text || msg.caption || ''), clean = normalize(content);
  if (g.blockLinks && ((msg.entities || msg.caption_entities || []).some(e => ['url', 'text_link'].includes(e.type)) || /(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/)/i.test(content))) return 'link';
  if (g.blockForwards && (msg.forward_origin || msg.forward_date || msg.is_automatic_forward)) return 'forward';
  if (g.maxLength && content.length > g.maxLength) return 'long_text';
  if (g.maxEmojis && (content.match(/\p{Extended_Pictographic}/gu) || []).length > g.maxEmojis) return 'emoji';
  if (g.maxHashtags && (content.match(/#[\p{L}\p{N}_]+/gu) || []).length > g.maxHashtags) return 'hashtag';
  if (g.words.some(w => clean.includes(normalize(w)))) return 'word';
  for (const kind of g.blockedMedia) if (msg[kind]) return `media:${kind}`;
  return null;
}
async function admins(env, token, chatId, fresh = false) {
  const key = entityKey('admins', chatId), cached = await getJson(env, key);
  if (!fresh && cached && Date.now() - cached.at < 30000) return cached.ids;
  const res = await tgApi(token, 'getChatAdministrators', { chat_id: chatId });
  if (!res.ok) return null;
  const ids = res.result.map(a => String(a.user.id)); await putJson(env, key, { ids, at: Date.now() }, { ttl: 60 }); return ids;
}
async function isAdmin(env, token, chatId, uid, fresh = false) { return (await admins(env, token, chatId, fresh))?.includes(String(uid)); }
async function execute(env, token, g, method, payload, extra = {}) {
  const result = await tgApi(token, method, { chat_id: g.chatId, ...payload });
  await audit(env, 'moderation', { chatId: g.chatId, action: method, ok: !!result.ok, error: result.ok ? '' : result.description, ...extra });
  if (!result.ok) { g.lastError = result.description; g.errorAt = Date.now(); await saveGroup(env, g); }
  return result;
}
async function sanction(env, token, g, userId, action, reason) {
  if (action === 'delete') return;
  if (action === 'warn') {
    const key = entityKey('warn', `${g.chatId}:${userId}`), record = (await getJson(env, key)) || { count: 0 };
    record.count++; record.at = Date.now(); await putJson(env, key, record, { ttl: 30 * 86400 });
    await sendToUser(token, g.chatId, `⚠️ ${userId} — ${tr('اخطار', 'Warning', g.language)} ${record.count}/${g.warnLimit}`);
    if (record.count < g.warnLimit) return;
    action = g.warnPenalty;
  }
  const mute = action === 'mute';
  return execute(env, token, g, mute ? 'restrictChatMember' : 'banChatMember', { user_id: Number(userId), ...(mute ? { permissions: LOCKED, use_independent_chat_permissions: true, until_date: Math.floor(Date.now() / 1000) + g.muteSeconds } : { revoke_messages: false }) }, { userId, reason });
}
function duration(arg, fallback) {
  const m = /^(\d+)(m|h|d)?$/i.exec(arg || '');
  return m ? Math.max(60, Math.min(2592000, Number(m[1]) * ({ m: 60, h: 3600, d: 86400 }[m[2]?.toLowerCase()] || 60))) : fallback;
}
async function quickCommand(env, token, g, msg) {
  const [raw, ...args] = String(msg.text || '').trim().split(/\s+/), cmd = raw?.split('@')[0].toLowerCase();
  if (!['/ban', '/unban', '/mute', '/unmute', '/warn', '/resetwarn', '/clean', '/report', '/rules'].includes(cmd)) return false;
  if (cmd === '/rules') { await sendToUser(token, g.chatId, (g.language === 'en' ? g.rulesEn : g.rules) || '—'); return true; }
  if (cmd === '/report') {
    if (!msg.reply_to_message) return true;
    const key = entityKey('reportlimit', `${g.chatId}:${msg.from.id}`), last = await getJson(env, key, 0); if (Date.now() - last < 60000) return true;
    await putJson(env, key, Date.now(), { ttl: 60 });
    const event = await audit(env, 'report', { chatId: g.chatId, userId: msg.from.id, reportedUser: msg.reply_to_message.from?.id, messageId: msg.reply_to_message.message_id, text: str(msg.reply_to_message.text || msg.reply_to_message.caption, 500), resolved: false });
    if (g.notifyChatId) await sendToUser(token, g.notifyChatId, `🚩 ${tr('گزارش پیام', 'Message report', g.language)}\n${g.title}\n${g.chatId} / ${event.messageId}\n${event.text}\n${tr('بررسی در پنل گروه‌ها', 'Review in Groups panel', g.language)}`);
    await sendToUser(token, g.chatId, tr('✅ گزارش برای بررسی در پنل ثبت شد.', '✅ Report saved for administrator review.', g.language)); return true;
  }
  // Administrative commands always re-check Telegram permissions, never trust message text or usernames.
  if (!await isAdmin(env, token, g.chatId, msg.from.id, true)) return true;
  if (cmd === '/clean') {
    const count = int(args[0], 1, 100, 20), first = Math.max(1, msg.message_id - count + 1);
    const result = await execute(env, token, g, 'deleteMessages', { message_ids: Array.from({ length: msg.message_id - first + 1 }, (_, i) => first + i) });
    if (!result.ok) await sendToUser(token, g.chatId, tr('حذف انجام نشد؛ دسترسی ربات و محدودیت ۴۸ ساعت تلگرام را بررسی کنید.', 'Deletion failed. Check bot permissions and Telegram’s 48-hour limit.', g.language));
    return true;
  }
  const userId = msg.reply_to_message?.from?.id || (/^\d+$/.test(args[0]) ? Number(args.shift()) : null);
  if (!userId || await isAdmin(env, token, g.chatId, userId, true)) return true;
  if (cmd === '/warn') await sanction(env, token, g, userId, 'warn', 'admin_command');
  else if (cmd === '/resetwarn') await env.BOT_KV.delete(entityKey('warn', `${g.chatId}:${userId}`));
  else {
    const method = cmd === '/ban' ? 'banChatMember' : cmd === '/unban' ? 'unbanChatMember' : 'restrictChatMember';
    const seconds = duration(args[0], g.muteSeconds);
    const result = await execute(env, token, g, method, { user_id: userId, ...(cmd === '/unban' ? { only_if_banned: true } : {}), ...(method === 'restrictChatMember' ? { permissions: cmd === '/unmute' ? (g.nightActive ? LOCKED : (g.normalPermissions || DEFAULT_PERMS)) : LOCKED, use_independent_chat_permissions: true, until_date: cmd === '/unmute' ? 0 : Math.floor(Date.now() / 1000) + seconds } : {}) }, { userId, reason: 'admin_command' });
    await sendToUser(token, g.chatId, result.ok ? tr('✅ انجام شد.', '✅ Done.', g.language) : tr('❌ انجام نشد؛ خطا در پنل ثبت شد.', '❌ Failed; see the panel log.', g.language));
  }
  return true;
}

async function welcome(env, token, g, member, reply_markup) {
  const content = ((g.language === 'en' ? g.welcomeTextEn : g.welcomeText) || '').replaceAll('{name}', member.first_name || '').replaceAll('{id}', String(member.id));
  const rules = g.language === 'en' ? g.rulesEn : g.rules;
  const body = `${content}${g.rulesRequired ? '\n\n📜 ' + rules : ''}`.slice(0, 3000);
  if (g.welcomeMediaId) await sendMedia(env, token, g.chatId, g.welcomeMediaId, { caption: content.slice(0, 1000) });
  return sendToUser(token, g.chatId, body || tr('خوش آمدید', 'Welcome', g.language), reply_markup ? { reply_markup } : {});
}
export async function onJoin(env, token, g, member) {
  if (!g.enabled || await isAdmin(env, token, g.chatId, member.id)) return;
  if (member.is_bot) { if (g.blockBots) await execute(env, token, g, 'banChatMember', { user_id: member.id }, { reason: 'bot_join', userId: member.id }); return; }
  if (!(g.captcha || g.rulesRequired)) { if (g.welcome) await welcome(env, token, g, member); return; }
  const key = entityKey('captcha', `${g.chatId}:${member.id}`), existing = await getJson(env, key);
  if (existing && Date.now() - existing.createdAt < 10000) return;
  const chat = await tgApi(token, 'getChat', { chat_id: g.chatId });
  if (!chat.ok || chat.result.type !== 'supergroup') {
    await audit(env, 'moderation', { chatId: g.chatId, ok: false, action: 'captcha', error: 'captcha_requires_supergroup_and_admin', userId: member.id }); return;
  }
  const res = await execute(env, token, g, 'restrictChatMember', { user_id: member.id, permissions: LOCKED, use_independent_chat_permissions: true }, { userId: member.id, reason: 'captcha_pending' });
  if (!res.ok) return;
  const random = crypto.getRandomValues(new Uint8Array(3));
  const a = random[0] % 8 + 1, n = random[1] % 8 + 1;
  const challenge = { chatId: g.chatId, userId: member.id, nonce: id().slice(0, 8), answer: g.captcha && g.captchaMode === 'math' ? String(a + n) : 'ok', createdAt: Date.now(), expiresAt: Date.now() + g.captchaSeconds * 1000, permissions: g.nightActive ? g.normalPermissions : chat.result.permissions, status: 'pending', attempts: 0 };
  await putJson(env, key, challenge);
  let rows, content;
  if (challenge.answer === 'ok') {
    content = tr('برای تأیید ورود و پذیرش قوانین، دکمه را بزنید.', 'Tap to verify and accept the rules.', g.language);
    rows = [[{ text: tr('✅ انسان هستم؛ قوانین را می‌پذیرم', '✅ Verify & accept rules', g.language), callback_data: `cap:${member.id}:${challenge.nonce}:ok` }]];
  } else {
    content = `${tr('برای تأیید ورود و پذیرش قوانین پاسخ دهید:', 'Verify and accept the rules by answering:', g.language)}\n${a} + ${n} = ?`;
    const choices = [a + n, a + n + 1, a + n + 2, a + n - 1]; const shift = random[2] % 4;
    rows = [[...choices.slice(shift), ...choices.slice(0, shift)].map(v => ({ text: String(v), callback_data: `cap:${member.id}:${challenge.nonce}:${v}` }))];
  }
  if (g.welcome) await welcome(env, token, g, member);
  else if (g.rulesRequired) await sendToUser(token, g.chatId, (g.language === 'en' ? g.rulesEn : g.rules) || '📜');
  const message = await sendToUser(token, g.chatId, `${member.first_name || member.id}\n${content}\n⏳ ${g.captchaSeconds}s`, { reply_markup: { inline_keyboard: rows } });
  if (message.ok) { challenge.messageId = message.result.message_id; await putJson(env, key, challenge); }
}
export async function captchaCallback(env, token, cb, settings) {
  if (!cb.data?.startsWith('cap:')) return false;
  const [, userId, nonce, answer] = cb.data.split(':'), chatId = String(cb.message?.chat.id || '');
  const g = await getGroup(env, chatId), lang = g?.language || 'fa';
  const respond = text => tgApi(token, 'answerCallbackQuery', { callback_query_id: cb.id, text, show_alert: true });
  if (String(cb.from.id) !== userId) { await respond(tr('این دکمه برای شما نیست.', 'This challenge belongs to another user.', lang)); return true; }
  const key = entityKey('captcha', `${chatId}:${userId}`), record = await getJson(env, key);
  if (!g || !record || record.nonce !== nonce || record.status !== 'pending' || record.expiresAt <= Date.now()) { await respond(tr('این تأیید منقضی شده است.', 'This challenge has expired.', lang)); return true; }
  if (answer !== record.answer) { record.attempts++; if (record.attempts >= 3) record.expiresAt = Date.now(); await putJson(env, key, record); await respond(tr('پاسخ نادرست است.', 'Incorrect answer.', lang)); return true; }
  if (g.forceMembership) {
    const gate = await membershipGate(env, token, { id: cb.from.id }, settings);
    if (!gate.ok) { await sendMembershipLock(token, chatId, gate, lang, cb.from.id); await respond(tr('ابتدا عضو شوید؛ سپس همین دکمه کپچا را دوباره بزنید.', 'Join first, then tap this captcha button again.', lang)); return true; }
  }
  if (g.nightActive) { record.status = 'passed_waiting'; await putJson(env, key, record); await respond(tr('ورود تأیید شد؛ اجازه گفتگو پس از پایان حالت شب باز می‌شود.', 'Verified; chatting unlocks after night mode.', lang)); return true; }
  const res = await execute(env, token, g, 'restrictChatMember', { user_id: Number(userId), permissions: record.permissions || DEFAULT_PERMS, use_independent_chat_permissions: true }, { userId, reason: 'captcha_solved' });
  if (res.ok) { record.status = 'passed'; await putJson(env, key, record, { ttl: 86400 }); if (record.messageId) await tgApi(token, 'deleteMessage', { chat_id: chatId, message_id: record.messageId }); }
  await respond(res.ok ? tr('✅ تأیید شدید.', '✅ Verified.', lang) : tr('ربات اجازه بازکردن دسترسی ندارد؛ به مدیر اطلاع دهید.', 'The bot cannot restore permissions. Contact an admin.', lang)); return true;
}

export async function moderateMessage(env, token, msg, settings) {
  const chatId = String(msg.chat?.id), g = await getGroup(env, chatId);
  if (!enabled(settings, 'moderation') || !g?.enabled) return true;
  if (msg.new_chat_members) {
    for (const member of msg.new_chat_members) await onJoin(env, token, g, member);
    if (g.autoClean) await execute(env, token, g, 'deleteMessage', { message_id: msg.message_id }, { reason: 'service_message' }); return true;
  }
  if (msg.left_chat_member) { if (g.autoClean) await execute(env, token, g, 'deleteMessage', { message_id: msg.message_id }, { reason: 'service_message' }); return true; }
  if (msg.sender_chat) {
    // Anonymous group administrators and the linked channel's automatic root posts are trusted Telegram roles.
    if (String(msg.sender_chat.id) === chatId || msg.is_automatic_forward) return true;
    const reason = violation(msg, g) || (g.forceMembership && requiredTargets(settings).length ? 'anonymous_membership_unverifiable' : null);
    if (reason) {
      await execute(env, token, g, 'deleteMessage', { message_id: msg.message_id }, { reason, senderChatId: msg.sender_chat.id });
      if (g.penalty === 'ban') await execute(env, token, g, 'banChatSenderChat', { sender_chat_id: msg.sender_chat.id }, { reason });
    }
    return true;
  }
  if (!msg.from || msg.from.is_bot) return true;
  const adminIds = await admins(env, token, chatId);
  if (!adminIds) { await audit(env, 'moderation', { chatId, ok: false, action: 'permissions_check', error: 'cannot_verify_group_admins' }); return true; }
  if (adminIds.includes(String(msg.from.id))) { await quickCommand(env, token, g, msg); return true; }
  if (g.forceMembership) {
    const gate = await membershipGate(env, token, { id: msg.from.id }, settings);
    if (!gate.ok) {
      await execute(env, token, g, 'deleteMessage', { message_id: msg.message_id }, { reason: 'membership_lock', userId: msg.from.id });
      const key = entityKey('gatelimit', `${chatId}:${msg.from.id}`), last = await getJson(env, key, 0);
      if (Date.now() - last > 60000) { await sendMembershipLock(token, chatId, gate, g.language, msg.from.id); await putJson(env, key, Date.now(), { ttl: 60 }); }
      return true;
    }
  }
  let reason = violation(msg, g);
  if (!reason && g.floodCount && !msg.edit_date) {
    const key = entityKey('flood', `${chatId}:${msg.from.id}`), times = (await getJson(env, key, [])).filter(t => Date.now() - t < g.floodSeconds * 1000);
    times.push(Date.now()); await putJson(env, key, times.slice(-60), { ttl: 60 }); if (times.length > g.floodCount) reason = 'flood';
  }
  if (reason) {
    const removed = await execute(env, token, g, 'deleteMessage', { message_id: msg.message_id }, { reason, userId: msg.from.id });
    if (removed.ok) await sanction(env, token, g, msg.from.id, g.penalty, reason);
  } else await quickCommand(env, token, g, msg);
  return true;
}
export async function groupMemberUpdate(env, token, update, settings) {
  const change = update.my_chat_member || update.chat_member; if (!change || !['group', 'supergroup'].includes(change.chat.type)) return;
  const chatId = String(change.chat.id); let g = await getGroup(env, chatId);
  if (update.my_chat_member) {
    if (!g) g = { ...structuredClone(GROUP_DEFAULTS), chatId, title: change.chat.title || chatId, enabled: false };
    g.botStatus = change.new_chat_member.status; g.discoveredAt = Date.now(); await saveGroup(env, g);
    await env.BOT_KV.delete(entityKey('admins', chatId)); return;
  }
  if (enabled(settings, 'moderation') && g?.enabled && !memberPresent(change.old_chat_member) && memberPresent(change.new_chat_member)) await onJoin(env, token, g, change.new_chat_member.user);
  if (['administrator', 'creator'].includes(change.old_chat_member.status) || ['administrator', 'creator'].includes(change.new_chat_member.status)) await env.BOT_KV.delete(entityKey('admins', chatId));
}
export async function groupTick(env) {
  const settings = await getSettings(env), token = await resolveToken(env); if (!token) return;
  const challenges = await allEntities(env, 'captcha');
  for (const snapshot of await allEntities(env, 'group')) {
    const task = async () => {
      const g = await getGroup(env, snapshot.chatId); if (!g) return;
    const wanted = enabled(settings, 'moderation') && g.enabled && isNight(g.night);
    if (wanted && !g.nightActive) {
      const info = await tgApi(token, 'getChat', { chat_id: g.chatId }); if (!info.ok || !info.result.permissions) return;
      g.normalPermissions = info.result.permissions; await saveGroup(env, g);
      const res = await execute(env, token, g, 'setChatPermissions', { permissions: LOCKED, use_independent_chat_permissions: true }, { reason: 'night_start' });
      if (res.ok) { g.nightActive = true; await saveGroup(env, g); }
    } else if (!wanted && g.nightActive) {
      const res = await execute(env, token, g, 'setChatPermissions', { permissions: g.normalPermissions || DEFAULT_PERMS, use_independent_chat_permissions: true }, { reason: 'night_end' });
      if (res.ok) { g.nightActive = false; await saveGroup(env, g); }
    }

      for (const entry of challenges.filter(c => String(c.chatId) === String(g.chatId))) {
        const c = await getJson(env, entityKey('captcha', `${entry.chatId}:${entry.userId}`)); if (!c) continue;
    const disabled = !enabled(settings, 'moderation') || !g.enabled || (!g.captcha && !g.rulesRequired);
    if ((c.status === 'passed_waiting' || (disabled && c.status === 'pending')) && !g.nightActive) {
      const res = await execute(env, token, g, 'restrictChatMember', { user_id: c.userId, permissions: c.permissions || DEFAULT_PERMS, use_independent_chat_permissions: true }, { reason: 'captcha_restore', userId: c.userId });
      if (res.ok) { c.status = 'passed'; await putJson(env, entityKey('captcha', `${c.chatId}:${c.userId}`), c, { ttl: 86400 }); }
    } else if (c.status === 'pending' && c.expiresAt <= Date.now() && !disabled) {
      const res = await execute(env, token, g, 'banChatMember', { user_id: c.userId, until_date: Math.floor(Date.now() / 1000) + 60, revoke_messages: false }, { reason: 'captcha_timeout', userId: c.userId });
      if (res.ok) { c.status = 'expired'; await putJson(env, entityKey('captcha', `${c.chatId}:${c.userId}`), c, { ttl: 86400 }); if (c.messageId) await tgApi(token, 'deleteMessage', { chat_id: c.chatId, message_id: c.messageId }); }
    }

      }
    };
    if (env.withGroupLock) await env.withGroupLock(snapshot.chatId, task); else await task();
  }
}
export async function removeGroup(env, chatId) {
  const g = await getGroup(env, chatId); assert(g, 'group_not_found', 404);
  const pending = (await allEntities(env, 'captcha')).some(c => c.chatId === chatId && ['pending', 'passed_waiting'].includes(c.status));
  assert(!g.nightActive && !pending, 'disable_group_and_wait_for_restore'); await env.BOT_KV.delete(entityKey('group', chatId));
}
