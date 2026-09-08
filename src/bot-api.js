import { getSettings } from './kv.js';

export async function resolveToken(env) {
  const s = await getSettings(env);
  return s.botToken || env.BOT_TOKEN || null;
}
export async function tgApi(token, method, payload = {}) {
  if (!token) return { ok: false, error_code: 0, description: 'token_missing' };
  try {
    const form = payload instanceof FormData;
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: form ? undefined : { 'content-type': 'application/json' },
      body: form ? payload : JSON.stringify(payload), signal: AbortSignal.timeout(form ? 60000 : 12000),
    });
    return await res.json().catch(() => ({ ok: false, error_code: res.status, description: 'telegram_invalid_response' }));
  } catch {
    // Never include an exception URL: Telegram URLs contain the bot credential.
    return { ok: false, error_code: 0, description: 'telegram_network_error', uncertain: true };
  }
}
// Button taps must refresh the open message instead of stacking a new one in the chat.
// A callback handler opens an edit slot; the first reply to that same chat edits the
// original message, and anything the handler sends afterwards is delivered normally.
let EDIT_SLOT = null;
const EDITABLE_EXTRA = ['reply_markup', 'parse_mode', 'entities', 'disable_web_page_preview', 'link_preview_options'];
export function beginMessageEdit(chatId, messageId) {
  EDIT_SLOT = { chatId: String(chatId), messageId, used: false };
}
export function endMessageEdit() { EDIT_SLOT = null; }
function editableExtra(extra) {
  if (Object.keys(extra || {}).some((k) => !EDITABLE_EXTRA.includes(k))) return false;
  const markup = extra && extra.reply_markup;
  // Only navigable screens replace themselves. Plain notices, delivered content and
  // reply-keyboard prompts stay separate messages the user can keep scrolling back to.
  return !!markup && Array.isArray(markup.inline_keyboard) && markup.inline_keyboard.length > 0;
}
export async function sendToUser(token, chatId, text, extra = {}) {
  const slot = EDIT_SLOT;
  if (slot && !slot.used && String(chatId) === slot.chatId && editableExtra(extra)) {
    slot.used = true;
    const payload = { chat_id: chatId, message_id: slot.messageId, text, ...extra };
    const edited = await tgApi(token, 'editMessageText', payload);
    if (edited.ok) return edited;
    // Telegram reports an unchanged message as an error; the screen is already correct.
    if (/message is not modified/i.test(edited.description || '')) return { ok: true, result: { message_id: slot.messageId, chat: { id: chatId } } };
    // Media captions, expired messages and deleted messages fall back to a new message.
  }
  return tgApi(token, 'sendMessage', { chat_id: chatId, text, ...extra });
}
export const memberPresent = member => ['creator', 'administrator', 'member'].includes(member?.status) || (member?.status === 'restricted' && member.is_member === true);
