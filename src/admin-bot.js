/* Administrator controls inside Telegram itself. Every feature that can be
 * managed from the web panel — news publishing/scheduling, forward-removal
 * approvals and the menu/button editor — has an equivalent here, driven by
 * inline buttons and short input flows, restricted to the bot administrator. */
import { getSettings, saveSettings, getMenu, saveMenu, putUser } from './kv.js';
import { entityKey, allEntities } from './storage.js';
import { str, int, isChatId, text as tr, assert } from './config.js';
import { sendToUser, resolveToken } from './bot-api.js';
import { NEWS_CATEGORIES, sendNewsDigest } from './news.js';
import { publishRelay } from './automation.js';
import { patchV2Settings } from './config.js';

export const isAdminUser = (env, settings, user) =>
  !!user && ((settings.adminId && String(user.id) === String(settings.adminId)) || (env.ADMIN_ID && String(user.id) === String(env.ADMIN_ID)));

const T = {
  adminOnly: ['⛔ این بخش فقط برای ادمین ربات در دسترس است.', '⛔ Admin access only.'],
  invalidValue: ['❌ مقدار واردشده معتبر نیست؛ دوباره تلاش کنید یا /cancel را بزنید.', '❌ Invalid value; try again or send /cancel.'],
  noDest: ['⚠️ ابتدا مقصدها را ثبت کنید.', '⚠️ Set destinations first.'],
  newsSent: ['✅ خبر ارسال شد به', '✅ News sent to'],
  newsFailed: ['مقصد ناموفق', 'failed destination(s)'],
  btnTextSaved: ['✅ متن دکمه به‌روزرسانی شد.', '✅ Button text updated.'],
  btnValueSaved: ['✅ مقدار دکمه به‌روزرسانی شد.', '✅ Button value updated.'],
  btnAdded: ['✅ دکمه اضافه شد.', '✅ Button added.'],
  btnDeleted: ['🗑 دکمه حذف شد.', '🗑 Button deleted.'],
  btnMoved: ['↔️ جای دکمه تغییر کرد.', '↔️ Button moved.'],
  saved: ['✅ ذخیره شد.', '✅ Saved.'],
  destSaved: (n) => [`✅ ${n} مقصد ثبت شد.`, `✅ ${n} destinations saved.`],
  sendTextPrompt: ['متن دکمه را بفرستید (حداکثر ۶۴ کاراکتر). /cancel برای انصراف', 'Send the button text (max 64 chars). /cancel to abort'],
  sendValuePrompt: ['مقدار دکمه را بفرستید:\n• لینک: با https شروع شود\n• کال‌بک: حداکثر ۶۴ کاراکتر\n• پاپ‌آپ متن: حداکثر ۲۰۰ کاراکتر', 'Send the button value:\n• URL: must start with https\n• Callback: up to 64 chars\n• Text popup: up to 200 chars'],
  addTextPrompt: ['متن دکمه جدید را بفرستید. /cancel برای انصراف', 'Send the new button text. /cancel to abort'],
  addValuePrompt: ['مقدار دکمه جدید را بفرستید (لینک کامل، کال‌بک یا متن پاپ‌آپ).', 'Send the new button value (full URL, callback or popup text).'],
  newsDestPrompt: ['آیدی مقصدهای خبر را بفرستید؛ هر خط: عنوان | آیدی\nمثال:\nکانال خبر | @mychannel\nگروه ورزشی | -1001234567890', 'Send news destinations; one per line: Title | ChatID'],
  relayDestPrompt: ['آیدی مقصدهای حذف‌فوروارد را بفرستید؛ هر خط: عنوان | آیدی', 'Send relay destinations; one per line: Title | ChatID'],
  typePrompt: ['نوع دکمه جدید را انتخاب کنید:', 'Choose the button type:'],
};
const t2 = (key, lang) => tr(T[key]?.[0] || key, T[key]?.[1] || key, lang);

const typeName = (type, lang) => ({
  url: tr('لینک', 'URL', lang), callback: tr('کال‌بک', 'Callback', lang),
  submenu: tr('زیرمنو', 'Submenu', lang), text: tr('پاپ‌آپ متن', 'Text popup', lang),
}[type] || type);
const catName = (key, lang) => key === 'all' ? tr('همه دسته‌ها (ترکیبی)', 'All categories (mixed)', lang) : (NEWS_CATEGORIES[key]?.fa || key);
const onOff = (v, lang) => v ? tr('روشن ✅', 'On ✅', lang) : tr('خاموش ❌', 'Off ❌', lang);

async function patch(env, body) {
  const s = await getSettings(env);
  patchV2Settings(s, body);
  await saveSettings(env, s);
  return s;
}

const backRow = (lang) => [{ text: '🔙 ' + tr('پنل ادمین', 'Admin panel', lang), callback_data: 'adm:root' }];

/* ============ Main admin screen ============ */
export async function adminHome(env, token, chatId, settings, lang = 'fa') {
  const url = settings.publicBaseUrl || env.PUBLIC_BASE_URL || '';
  const rows = [
    [
      { text: '📊 ' + tr('آمار ربات', 'Bot Stats', lang), callback_data: 'admin:stats' },
      { text: '📦 ' + tr('سفارش‌ها', 'Orders', lang), callback_data: 'admin:orders' },
    ],
    [
      { text: '📰 ' + tr('مدیریت اخبار', 'News manager', lang), callback_data: 'adm:news' },
    ],
    [
      { text: '🪄 ' + tr('حذف فوروارد', 'Forward removal', lang), callback_data: 'adm:relay' },
      { text: '🎛 ' + tr('دکمه‌ها و منو', 'Buttons & menu', lang), callback_data: 'adm:menu' },
    ],
  ];
  if (url) rows.push([{ text: '🚀 ' + tr('پنل مدیریت (مینی‌اپ)', 'Admin Mini App', lang), web_app: { url } }]);
  rows.push(backRow(lang));
  return sendToUser(token, chatId,
    `🛠 <b>${tr('مدیریت ربات از تلگرام', 'Manage the bot from Telegram', lang)}</b>\n\n` +
    tr('همه بخش‌ها از اینجا هم قابل مدیریت‌اند: اخبار و زمان‌بندی، حذف فوروارد و منو و دکمه‌ها.',
      'Everything is manageable here too: news & scheduling, forward removal, and buttons/menu.', lang),
    { reply_markup: { inline_keyboard: rows }, disable_web_page_preview: true });
}

/* ============ News manager ============ */
async function newsScreen(env, token, chatId, settings, lang) {
  const cfg = settings.news?.autoSend || {};
  const state = await env.BOT_KV.get('v2:news:state').then(v => v ? JSON.parse(v) : {});
  const dest = cfg.destinations || [];
  const lines = [
    `📰 <b>${tr('مدیریت اخبار', 'News manager', lang)}</b>`,
    '',
    `${tr('ارسال خودکار', 'Auto-send', lang)}: ${onOff(cfg.enabled, lang)}`,
    `${tr('دسته', 'Category', lang)}: ${catName(cfg.category, lang)}`,
    `${tr('فاصله ارسال', 'Interval', lang)}: ${tr('هر', 'every', lang)} ${cfg.intervalMinutes} ${tr('دقیقه', 'min', lang)}`,
    `${tr('مقصدها', 'Destinations', lang)}: ${dest.length ? dest.map(d => d.title || d.chatId).join('، ') : tr('ثبت نشده', 'none', lang)}`,
    state.nextAt && cfg.enabled ? `⏰ ${tr('ارسال بعدی', 'Next send', lang)}: ${new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', dateStyle: 'short', timeStyle: 'short' }).format(state.nextAt)}` : '',
    state.lastError ? `⚠️ ${state.lastError}` : '',
    '',
    tr('برای ارسال فوری، دسته را انتخاب کنید:', 'Tap a category to send it right now:', lang),
  ].filter(Boolean);
  const rows = [
    [
      { text: '🚨 ' + tr('فوری', 'Breaking', lang), callback_data: 'adm:nsend:breaking' },
      { text: '🏛 ' + tr('سیاسی', 'Politics', lang), callback_data: 'adm:nsend:politics' },
      { text: '📈 ' + tr('اقتصاد', 'Economy', lang), callback_data: 'adm:nsend:economy' },
    ],
    [
      { text: '⚽ ' + tr('ورزشی', 'Sports', lang), callback_data: 'adm:nsend:sports' },
      { text: '💻 ' + tr('فناوری', 'Tech', lang), callback_data: 'adm:nsend:tech' },
      { text: '🌐 ' + tr('همه', 'All', lang), callback_data: 'adm:nsend:all' },
    ],
    [
      { text: '⏱ ' + tr('زمان‌بندی', 'Schedule', lang), callback_data: 'adm:nintmenu' },
      { text: '🎯 ' + catName(cfg.category, lang), callback_data: 'adm:ncatmenu' },
    ],
    [
      { text: `${cfg.enabled ? '⏸' : '▶️'} ${tr('ارسال خودکار', 'Auto-send', lang)}: ${onOff(cfg.enabled, lang)}`, callback_data: 'adm:nauto' },
      { text: `📡 ${tr('مقصدها', 'Destinations', lang)} (${dest.length})`, callback_data: 'adm:ndest' },
    ],
    backRow(lang),
  ];
  return sendToUser(token, chatId, lines.join('\n'), { reply_markup: { inline_keyboard: rows } });
}

async function newsCatPickScreen(env, token, chatId, settings, lang) {
  const rows = [[{ text: '🌐 ' + tr('همه دسته‌ها', 'All categories', lang), callback_data: 'adm:ncat:all' }]];
  for (const [key, cat] of Object.entries(NEWS_CATEGORIES)) {
    rows.push([{ text: cat.fa, callback_data: `adm:ncat:${key}` }]);
  }
  rows.push([{ text: '🔙 ' + tr('بازگشت', 'Back', lang), callback_data: 'adm:news' }]);
  return sendToUser(token, chatId, tr('دسته ارسال خودکار را انتخاب کنید:', 'Choose the auto-send category:', lang), { reply_markup: { inline_keyboard: rows } });
}

async function newsIntervalScreen(env, token, chatId, settings, lang) {
  const options = [15, 30, 60, 180, 360, 720, 1440];
  const rows = [];
  for (let i = 0; i < options.length; i += 2) {
    rows.push(options.slice(i, i + 2).map(m => ({ text: tr('هر', 'Every', lang) + ' ' + m + ' ' + tr('دقیقه', 'min', lang), callback_data: `adm:nint:${m}` })));
  }
  rows.push([{ text: '🔙 ' + tr('بازگشت', 'Back', lang), callback_data: 'adm:news' }]);
  return sendToUser(token, chatId, tr('فاصله ارسال خودکار خبر (با انتخاب، ارسال خودکار روشن می‌شود):', 'Auto-send interval (picking one turns auto-send on):', lang), { reply_markup: { inline_keyboard: rows } });
}

/* ============ Forward-removal (relay) manager ============ */
async function relayScreen(env, token, chatId, settings, lang) {
  const rl = settings.relay || {};
  const pending = (await allEntities(env, 'relay')).filter(r => ['pending', 'ready'].includes(r.status)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5);
  const dest = rl.destinations || [];
  const lines = [
    `🪄 <b>${tr('حذف فوروارد / بی‌نام‌ساز', 'Forward removal / relay', lang)}</b>`,
    '',
    `${tr('دریافت پیام کاربران', 'Receive user messages', lang)}: ${onOff(rl.enabled, lang)}`,
    `${tr('تأیید مدیر پیش از ارسال', 'Admin approval', lang)}: ${onOff(rl.approval !== false, lang)}`,
    `${tr('مقصدها', 'Destinations', lang)}: ${dest.length ? dest.map(d => d.title || d.chatId).join('، ') : tr('ثبت نشده', 'none', lang)}`,
    '',
    pending.length ? tr('پیام‌های در انتظار تصمیم شما:', 'Messages waiting for your decision:', lang) : tr('پیام در انتظاری وجود ندارد.', 'Nothing is waiting right now.', lang),
  ];
  const rows = [];
  for (const [i, r] of pending.entries()) {
    rows.push([{ text: `#${i + 1} ${String(r.userName || r.userId).slice(0, 16)}: ${String(r.text || tr('فایل/رسانه', 'file/media', lang)).slice(0, 24)}`, callback_data: `adm:relayview:${r.id}` }]);
  }
  rows.push([
    { text: `${rl.approval !== false ? '⏭' : '🛡'} ${tr('تأیید مدیر', 'Admin approval', lang)}: ${onOff(rl.approval !== false, lang)}`, callback_data: 'adm:rapp' },
  ]);
  rows.push([
    { text: `${rl.enabled ? '⏸' : '▶️'} ${tr('دریافت پیام', 'Receive messages', lang)}`, callback_data: 'adm:ron' },
    { text: `📡 ${tr('مقصدها', 'Destinations', lang)} (${dest.length})`, callback_data: 'adm:rdest' },
  ]);
  rows.push(backRow(lang));
  return sendToUser(token, chatId, lines.join('\n'), { reply_markup: { inline_keyboard: rows } });
}

async function relayViewScreen(env, token, chatId, settings, lang, relayId) {
  const r = await env.BOT_KV.get(entityKey('relay', relayId)).then(v => v ? JSON.parse(v) : null);
  if (!r) return sendToUser(token, chatId, tr('این پیام پیدا نشد؛ شاید قبلاً بررسی شده است.', 'Message not found; it may already be processed.', lang), { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'adm:relay' }]] } });
  const attachments = (r.attachments || []).length;
  const rows = [['pending', 'ready'].includes(r.status) ? [
    { text: '✅ ' + tr('انتشار در مقصدها', 'Publish to destinations', lang), callback_data: `rl:pub:${r.id}` },
    { text: '❌ ' + tr('رد', 'Reject', lang), callback_data: `rl:rej:${r.id}` },
  ] : [{ text: `ℹ️ ${tr('وضعیت', 'Status', lang)}: ${r.status}`, callback_data: 'noop' }]];
  rows.push([{ text: '🔙 ' + tr('بازگشت', 'Back', lang), callback_data: 'adm:relay' }]);
  return sendToUser(token, chatId,
    `🪄 <b>${tr('بررسی پیام', 'Review message', lang)}</b>\n\n` +
    `👤 ${r.userName || ''} (${r.userId})\n` +
    `🕐 ${new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', dateStyle: 'short', timeStyle: 'short' }).format(r.createdAt || Date.now())}\n` +
    `📝 ${String(r.text || '—').slice(0, 1000)}\n` +
    `📎 ${attachments} ${tr('پیوست', 'attachment(s)', lang)}\n` +
    `🧾 ${tr('وضعیت', 'Status', lang)}: ${r.status}\n\n` +
    tr('با تأیید، پیام با copyMessage و بدون برچسب فوروارد به مقصدها ارسال می‌شود.', 'On approval the message is delivered with copyMessage — no forward attribution.', lang),
    { reply_markup: { inline_keyboard: rows } });
}

/* ============ Menu & button editor ============ */
function menuListScreen(menu, lang) {
  const rows = menu.inlineButtons || [];
  const lines = [`🎛 <b>${tr('دکمه‌های صفحه اصلی', 'Main-page buttons', lang)}</b>`, '', tr('برای ویرایش، جابجایی یا حذف، دکمه هر ردیف را لمس کنید:', 'Tap a row to edit, move or delete it:', lang)];
  rows.forEach((row, r) => row.forEach((b, bi) => {
    const meta = typeName(b.type, lang) + (b.type === 'submenu' ? ` → ${b.value}` : b.value ? ` → ${String(b.value).slice(0, 28)}` : '');
    lines.push(`${r + 1}-${bi + 1}. ${b.text} <i>(${meta})</i>`);
  }));
  const kb = [];
  rows.forEach((row, r) => row.forEach((b, bi) => {
    kb.push([
      { text: `✏️ ${r + 1}-${bi + 1} ${b.text.slice(0, 18)}`, callback_data: `adm:mb:${r}:${bi}` },
      { text: '🗑', callback_data: `adm:mbx:${r}:${bi}` },
    ]);
  }));
  kb.push([{ text: '➕ ' + tr('افزودن دکمه جدید', 'Add a button', lang), callback_data: 'adm:mbadd' }]);
  kb.push(backRow(lang));
  return { text: lines.join('\n').slice(0, 4000), reply_markup: { inline_keyboard: kb }, disable_web_page_preview: true };
}

function buttonEditorScreen(menu, r, b, lang) {
  const row = menu.inlineButtons[r];
  const btn = row?.[b];
  if (!btn) return menuListScreen(menu, lang);
  const lines = [
    `🎛 <b>${tr('ویرایش دکمه', 'Edit button', lang)}</b>`,
    '',
    `#${r + 1}-${b + 1}`,
    `${tr('متن', 'Text', lang)}: ${btn.text}`,
    `${tr('نوع', 'Type', lang)}: ${typeName(btn.type, lang)}`,
    `${tr('مقدار', 'Value', lang)}: ${btn.value || '—'}`,
    '',
    tr('جابجایی: عقب/جلو در همان ردیف، یا انتقال به ردیف بالا/پایین.', 'Move: back/forward inside the row, or to the row above/below.', lang),
  ];
  const kb = [
    [
      { text: '✏️ ' + tr('متن', 'Text', lang), callback_data: `adm:mbt:${r}:${b}` },
      { text: '🔤 ' + tr('مقدار', 'Value', lang), callback_data: `adm:mbv:${r}:${b}` },
    ],
    [
      { text: '◀️ ' + tr('عقب', 'Back', lang), callback_data: `adm:mbl:${r}:${b}` },
      { text: '▶️ ' + tr('جلو', 'Fwd', lang), callback_data: `adm:mbr:${r}:${b}` },
    ],
    [
      { text: '⬆️ ' + tr('ردیف بالا', 'Row up', lang), callback_data: `adm:mbu:${r}:${b}` },
      { text: '⬇️ ' + tr('ردیف پایین', 'Row down', lang), callback_data: `adm:mbd:${r}:${b}` },
    ],
    [
      { text: '🗑 ' + tr('حذف دکمه', 'Delete', lang), callback_data: `adm:mbx:${r}:${b}` },
      { text: '🔙 ' + tr('لیست دکمه‌ها', 'Button list', lang), callback_data: 'adm:menu' },
    ],
  ];
  return { text: lines.join('\n'), reply_markup: { inline_keyboard: kb } };
}

function validateMenuButton(btn, menu) {
  const text = str(btn.text, 64);
  assert(text, 'invalid_menu_button');
  const type = ['url', 'callback', 'submenu', 'text'].includes(btn.type) ? btn.type : 'callback';
  const value = String(btn.value ?? '').trim();
  if (type === 'url') { assert(/^https?:\/\//i.test(value), 'invalid_menu_button'); return { text, type, value: value.slice(0, 512) }; }
  if (type === 'callback') { assert(value.length >= 1 && value.length <= 64, 'invalid_menu_button'); return { text, type, value }; }
  if (type === 'text') { assert(value.length >= 1 && value.length <= 200, 'invalid_menu_button'); return { text, type, value }; }
  assert(menu?.submenus?.[value], 'submenu_not_found');
  return { text, type, value };
}

async function mutateMenu(env, mutator) {
  const menu = await getMenu(env);
  mutator(menu.inlineButtons, menu);
  menu.inlineButtons = menu.inlineButtons.filter(r => Array.isArray(r) && r.length);
  await saveMenu(env, menu);
  return menu;
}

const errText = (e, lang) => ({
  invalid_menu_button: tr('مقدار دکمه معتبر نیست (لینک با https، کال‌بک ≤۶۴، متن ≤۲۰۰).', 'Invalid button value (https URL, callback ≤64, text ≤200).', lang),
  submenu_not_found: tr('زیرمنوی انتخابی وجود ندارد؛ ابتدا از پنل وب بسازید.', 'The submenu does not exist; create it in the web panel first.', lang),
  invalid_destinations: tr('مقصد معتبری ثبت نشده؛ با دکمه «مقصدها» آیدی کانال یا گروه را ثبت کنید.', 'No valid destinations; set channel/group IDs with the Destinations button first.', lang),
  news_empty: tr('فعلاً خبر تازه‌ای برای این دسته پیدا نشد؛ بعداً تلاش کنید.', 'No fresh news found for this category right now; try again later.', lang),
  module_disabled: tr('این ماژول در نوع فعلی ربات غیرفعال است.', 'This module is disabled for the current bot type.', lang),
  token_missing: tr('ابتدا توکن ربات را در پنل ثبت کنید.', 'Set the bot token in the panel first.', lang),
}[e.message] || e.message);

/* ============ Callback router ============ */
export async function adminCallback(env, cb, token, user, settings, lang, { answer }) {
  const data = String(cb.data || '');
  if (!(data.startsWith('adm:') || data.startsWith('rl:'))) return false;
  const chatId = cb.message?.chat?.id;
  if (!isAdminUser(env, settings, user)) { await answer(t2('adminOnly', lang), true); return true; }
  if (!chatId || Number(chatId) < 0) return true;
  const refresh = { token, chatId, lang, settings };
  try {
    if (data === 'adm:root') { await adminHome(env, token, chatId, await getSettings(env), lang); return true; }
    if (data === 'adm:news' || data.startsWith('adm:nauto') || data.startsWith('adm:nsend:') || data.startsWith('adm:ncat:') || data.startsWith('adm:nint:')) {
      return await handleNews(env, token, chatId, user, lang, data, answer);
    }
    if (data === 'adm:nintmenu') { await newsIntervalScreen(env, token, chatId, await getSettings(env), lang); return true; }
    if (data === 'adm:ncatmenu') { await newsCatPickScreen(env, token, chatId, await getSettings(env), lang); return true; }
    if (data === 'adm:relay' || data === 'adm:rapp' || data === 'adm:ron') {
      if (data === 'adm:rapp') await patch(env, { relay: { ...settings.relay, approval: !(settings.relay.approval !== false) } });
      if (data === 'adm:ron') await patch(env, { relay: { ...settings.relay, enabled: !settings.relay.enabled } });
      await relayScreen(env, token, chatId, await getSettings(env), lang);
      return true;
    }
    if (data.startsWith('adm:relayview:')) { await relayViewScreen(env, token, chatId, await getSettings(env), lang, data.slice('adm:relayview:'.length)); return true; }
    if (data.startsWith('rl:pub:')) return await handleRelayPublish(env, token, chatId, lang, data.slice('rl:pub:'.length), answer, true);
    if (data.startsWith('rl:rej:')) {
      const key = entityKey('relay', data.slice('rl:rej:'.length));
      const r = await env.BOT_KV.get(key).then(v => v ? JSON.parse(v) : null);
      if (r && ['pending', 'ready', 'failed'].includes(r.status)) { r.status = 'rejected'; await env.BOT_KV.put(key, JSON.stringify(r)); }
      await answer(t2('saved', lang));
      await relayScreen(env, token, chatId, await getSettings(env), lang);
      return true;
    }
    if (data === 'adm:menu') {
      const menu = await getMenu(env);
      const view = menuListScreen(menu, lang);
      await sendToUser(token, chatId, view.text, view);
      return true;
    }
    if (data.startsWith('adm:mb:')) {
      const [, , r, b] = data.split(':');
      const menu = await getMenu(env);
      const view = buttonEditorScreen(menu, Number(r), Number(b), lang);
      await sendToUser(token, chatId, view.text, view);
      return true;
    }
    if (data.startsWith('adm:mbt:') || data.startsWith('adm:mbv:')) {
      const [, tag, r, b] = data.split(':');
      user.flow = { type: tag === 'mbt' ? 'adm_menu_text' : 'adm_menu_value', r: Number(r), b: Number(b) };
      await putUser(env, user);
      await answer();
      await sendToUser(token, chatId, t2(tag === 'adm:mbt' ? 'sendTextPrompt' : 'sendValuePrompt', lang));
      return true;
    }
    if (data.startsWith('adm:mbl:') || data.startsWith('adm:mbr:') || data.startsWith('adm:mbu:') || data.startsWith('adm:mbd:')) {
      const [, tag, r, b] = data.split(':');
      let moved = null;
      await mutateMenu(env, (rows) => {
        const row = rows[Number(r)];
        const i = Number(r), j = Number(b);
        if (!row?.[j]) return;
        if (tag === 'mbl' && j > 0) { [row[j - 1], row[j]] = [row[j], row[j - 1]]; moved = [i, j - 1]; }
        else if (tag === 'mbr' && j < row.length - 1) { [row[j + 1], row[j]] = [row[j], row[j + 1]]; moved = [i, j + 1]; }
        else if (tag === 'mbu' && i > 0) { const [x] = row.splice(j, 1); rows[i - 1].push(x); if (!row.length) rows.splice(i, 1); moved = [i - 1, rows[i - 1].length - 1]; }
        else if (tag === 'mbd' && i < rows.length - 1) { const [x] = row.splice(j, 1); rows[i + 1].push(x); if (!row.length) rows.splice(i, 1); moved = [i + 1, rows[i + 1].length - 1]; }
      });
      await answer(moved ? t2('btnMoved', lang) : '—');
      const menu = await getMenu(env);
      const view = moved ? buttonEditorScreen(menu, moved[0], moved[1], lang) : menuListScreen(menu, lang);
      await sendToUser(token, chatId, view.text, view);
      return true;
    }
    if (data.startsWith('adm:mbx:')) {
      const [, , r, b] = data.split(':');
      await mutateMenu(env, (rows) => { const row = rows[Number(r)]; if (row) row.splice(Number(b), 1); });
      await answer(t2('btnDeleted', lang));
      const menu = await getMenu(env);
      const view = menuListScreen(menu, lang);
      await sendToUser(token, chatId, view.text, view);
      return true;
    }
    if (data === 'adm:mbadd') {
      user.flow = { type: 'adm_add_text' };
      await putUser(env, user);
      await answer();
      await sendToUser(token, chatId, t2('addTextPrompt', lang));
      return true;
    }
    if (data.startsWith('adm:atype:')) {
      if (user.flow?.type !== 'adm_add_type') return answer(t2('invalidValue', lang), true);
      const type = data.slice('adm:atype:'.length);
      if (!['url', 'callback', 'text', 'submenu'].includes(type)) return answer(t2('invalidValue', lang), true);
      user.flow = { type: 'adm_add_value', pending: { ...user.flow.pending, type } };
      await putUser(env, user);
      await answer();
      await sendToUser(token, chatId, t2('addValuePrompt', lang));
      return true;
    }
    if (data === 'adm:ndest' || data === 'adm:rdest') {
      user.flow = { type: data === 'adm:ndest' ? 'adm_news_dest' : 'adm_relay_dest' };
      await putUser(env, user);
      await answer();
      await sendToUser(token, chatId, t2(data === 'adm:ndest' ? 'newsDestPrompt' : 'relayDestPrompt', lang));
      return true;
    }
    await answer('—');
    return true;
  } catch (e) {
    await answer(errText(e, lang), true);
    return true;
  }
}

async function handleNews(env, token, chatId, user, lang, data, answer) {
  const settings = await getSettings(env);
  if (data.startsWith('adm:nsend:')) {
    const category = data.slice('adm:nsend:'.length);
    const out = await sendNewsDigest(env, { category });
    await answer(`${t2('newsSent', lang)} ${out.sent} ${tr('مقصد', 'destination(s)', lang)}${out.failed ? ` · ${out.failed} ${t2('newsFailed', lang)}` : ''}`, false);
    await newsScreen(env, token, chatId, await getSettings(env), lang);
    return true;
  }
  if (data.startsWith('adm:ncat:')) {
    const category = data.slice('adm:ncat:'.length);
    await patch(env, { news: { autoSend: { ...settings.news.autoSend, category, enabled: true } } });
    await answer(t2('saved', lang));
    await newsScreen(env, token, chatId, await getSettings(env), lang);
    return true;
  }
  if (data.startsWith('adm:nint:')) {
    const intervalMinutes = int(data.slice('adm:nint:'.length), 10, 1440, 60);
    await patch(env, { news: { autoSend: { ...settings.news.autoSend, intervalMinutes, enabled: true } } });
    await answer(t2('saved', lang));
    await newsScreen(env, token, chatId, await getSettings(env), lang);
    return true;
  }
  if (data === 'adm:nauto') {
    await patch(env, { news: { autoSend: { ...settings.news.autoSend, enabled: !settings.news.autoSend.enabled } } });
    const next = await getSettings(env);
    await answer(next.news.autoSend.enabled ? '▶️ ' + tr('ارسال خودکار روشن شد', 'Auto-send enabled', lang) : '⏸ ' + tr('ارسال خودکار خاموش شد', 'Auto-send disabled', lang));
    await newsScreen(env, token, chatId, next, lang);
    return true;
  }
  await newsScreen(env, token, chatId, settings, lang);
  return true;
}

async function handleRelayPublish(env, token, chatId, lang, relayId, answer, refresh) {
  const settings = await getSettings(env);
  const dest = (settings.relay.destinations || []).map(d => d.chatId);
  if (!dest.length) { await answer(t2('noDest', lang), true); return true; }
  const r = await publishRelay(env, relayId, dest, true);
  const ok = r.destinations?.filter(d => d.status === 'sent').length || 0;
  const fail = (r.destinations?.length || 0) - ok;
  await answer(`✅ ${tr('بدون برچسب فوروارد ارسال شد به', 'Copied without forward attribution to', lang)} ${ok}${fail ? ` · ${fail} ✗` : ''}`);
  if (refresh) await relayScreen(env, token, chatId, await getSettings(env), lang);
  return true;
}

/* ============ Text-input flows ============ */
export async function adminFlow(env, token, user, settings, lang, msg) {
  if (!isAdminUser(env, settings, user) || !user.flow?.type?.startsWith('adm_')) return false;
  const text = String(msg.text || '').trim();
  const chatId = msg.chat.id;
  const finish = async (reply, markup) => { user.flow = null; await putUser(env, user); await sendToUser(token, chatId, reply, markup || {}); };
  const flow = user.flow;
  if (!text) { await sendToUser(token, chatId, t2('invalidValue', lang)); return true; }
  try {
    if (flow.type === 'adm_news_dest' || flow.type === 'adm_relay_dest') {
      const dest = text.split('\n').map(line => {
        const [title, chat] = line.split('|').map(s => s.trim());
        return { title: chat ? title : '', chatId: chat || title };
      }).filter(d => d.chatId);
      assert(dest.length && dest.length <= 10 && dest.every(d => isChatId(d.chatId)), 'invalid_destinations');
      if (flow.type === 'adm_news_dest') await patch(env, { news: { autoSend: { ...settings.news.autoSend, destinations: dest } } });
      else await patch(env, { relay: { ...settings.relay, destinations: dest } });
      const [fa, en] = T.destSaved(dest.length);
      await finish(tr(fa, en, lang));
      return true;
    }
    if (flow.type === 'adm_menu_text') {
      const btnText = str(text, 64);
      assert(btnText, 'invalid_menu_button');
      await mutateMenu(env, (rows) => { const b = rows[flow.r]?.[flow.b]; assert(b, 'invalid_menu_button'); b.text = btnText; });
      await finish(t2('btnTextSaved', lang));
      return true;
    }
    if (flow.type === 'adm_menu_value') {
      const menu = await getMenu(env);
      const btn = menu.inlineButtons[flow.r]?.[flow.b];
      assert(btn, 'invalid_menu_button');
      const clean = validateMenuButton({ ...btn, value: text }, menu);
      await mutateMenu(env, (rows) => { const target = rows[flow.r]?.[flow.b]; assert(target, 'invalid_menu_button'); target.value = clean.value; });
      await finish(t2('btnValueSaved', lang));
      return true;
    }
    if (flow.type === 'adm_add_text') {
      const btnText = str(text, 64);
      assert(btnText, 'invalid_menu_button');
      user.flow = { type: 'adm_add_type', pending: { text: btnText } };
      await putUser(env, user);
      await sendToUser(token, chatId, t2('typePrompt', lang), { reply_markup: { inline_keyboard: [
        [{ text: '🔗 ' + tr('لینک', 'URL', lang), callback_data: 'adm:atype:url' }, { text: '⚡ ' + tr('کال‌بک', 'Callback', lang), callback_data: 'adm:atype:callback' }],
        [{ text: '📂 ' + tr('زیرمنو', 'Submenu', lang), callback_data: 'adm:atype:submenu' }, { text: '💬 ' + tr('پاپ‌آپ متن', 'Text popup', lang), callback_data: 'adm:atype:text' }],
      ] } });
      return true;
    }
    if (flow.type === 'adm_add_value') {
      const { text: btnText, type } = flow.pending || {};
      assert(btnText && type, 'invalid_menu_button');
      const menu = await getMenu(env);
      const clean = validateMenuButton({ text: btnText, type, value: text }, menu);
      await mutateMenu(env, (rows) => {
        let row = [...rows].reverse().find(r => r.length < 8);
        if (!row && rows.length < 10) { row = []; rows.push(row); }
        assert(row, 'invalid_menu_button');
        row.push(clean);
      });
      await finish(t2('btnAdded', lang));
      return true;
    }
  } catch (e) {
    user.flow = null;
    await putUser(env, user);
    await sendToUser(token, chatId, errText(e, lang) + '\n/cancel');
    return true;
  }
  return false;
}
