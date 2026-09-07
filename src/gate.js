import { tgApi, memberPresent, sendToUser } from './bot-api.js';
import { text as tr } from './config.js';

export function requiredTargets(settings) {
  const rc = settings.requiredChats;
  if (!rc?.enabled) return [];
  return (rc.targets || []).filter(t => t.scope === 'all' || t.scope === settings.botPurpose);
}
export async function membershipGate(env, token, user, settings, extra = []) {
  const required = [...requiredTargets(settings), ...extra];
  const unique = [...new Map(required.map(t => [String(t.chatId), t])).values()];
  if (!unique.length) return { ok: true, missing: [], unavailable: false };
  // No positive membership cache: leaving a required chat revokes the next request.
  const results = await Promise.all(unique.map(async target => {
    const result = await tgApi(token, 'getChatMember', { chat_id: target.chatId, user_id: Number(user.id) });
    return { target, ok: result.ok && memberPresent(result.result), unavailable: !result.ok };
  }));
  return { ok: results.every(r => r.ok), missing: results.filter(r => !r.ok).map(r => r.target), unavailable: results.some(r => r.unavailable) };
}
export function joinUrl(target) {
  if (target.url) return target.url;
  return String(target.chatId).startsWith('@') ? `https://t.me/${String(target.chatId).slice(1)}` : '';
}
export async function sendMembershipLock(token, chatId, gate, lang, userId) {
  const rows = gate.missing.map(t => ({ title: t.title || tr('عضویت در کانال / گروه', 'Join channel / group', lang), url: joinUrl(t) })).filter(t => t.url).map(t => [{ text: `🔗 ${t.title}`.slice(0, 64), url: t.url }]);
  rows.push([{ text: tr('✅ عضو شدم؛ بررسی دوباره', '✅ I joined — check again', lang), callback_data: userId ? `chan:check:${userId}` : 'chan:check' }]);
  return sendToUser(token, chatId, tr('🔒 ابتدا در همه کانال‌ها و گروه‌های زیر عضو شوید. سپس «عضو شدم» را بزنید.', '🔒 Join all the channels and groups below, then tap “I joined”.', lang) + (gate.unavailable ? '\n\n' + tr('⚠️ بررسی عضویت موقتاً ممکن نیست؛ برای امنیت، دسترسی باز نشده است. مدیر باید دسترسی ادمین ربات و شناسه چت‌ها را بررسی کند.', '⚠️ Membership verification is temporarily unavailable. Access remains locked. The administrator should check bot permissions and chat IDs.', lang) : ''), { reply_markup: { inline_keyboard: rows } });
}
