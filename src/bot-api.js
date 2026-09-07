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
export const sendToUser = (token, chatId, text, extra = {}) => tgApi(token, 'sendMessage', { chat_id: chatId, text, ...extra });
export const memberPresent = member => ['creator', 'administrator', 'member'].includes(member?.status) || (member?.status === 'restricted' && member.is_member === true);
