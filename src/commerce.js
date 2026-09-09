import { getJson, putJson, getSettings, putUser, getUser, ticketAppendUser } from './kv.js';
import { allEntities, entityKey, commitJson } from './storage.js';
import { id, assert, str, int, enabled, text as tr } from './config.js';
import { tgApi, sendToUser, resolveToken } from './bot-api.js';
import { getMedia, sendMedia, checkBotMedia } from './media.js';
import { reward, rewardWrites, pointsAccount } from './crm.js';
import { membershipGate, sendMembershipLock } from './gate.js';

export const getProduct = (env, id) => getJson(env, entityKey('product', id));
export const getOrder = (env, id) => getJson(env, entityKey('order', id));
export const saveOrder = (env, order) => putJson(env, entityKey('order', order.id), order);
export const getCart = async (env, uid) => (await getJson(env, entityKey('cart', uid))) || { items: [], coupon: '', usePoints: false };
export const saveCart = (env, uid, cart) => putJson(env, entityKey('cart', uid), cart);
export const money = (amount, lang = 'fa') => `${Number(amount).toLocaleString(lang === 'en' ? 'en-US' : 'fa-IR')} ${lang === 'en' ? 'toman' : 'تومان'}`;
export const titleOf = (item, lang = 'fa') => (lang === 'en' && item.titleEn) || item.title;
const b = (text, data) => ({ text, callback_data: data });
const say = (token, user, text, rows) => sendToUser(token, user.id, text, rows ? { reply_markup: { inline_keyboard: rows } } : {});
export const STATUS = {
  awaiting_payment: ['در انتظار پرداخت', 'Awaiting payment'], receipt_review: ['بررسی فیش', 'Receipt review'],
  paid: ['پرداخت تأیید شد', 'Payment approved'], preparing: ['در حال آماده‌سازی', 'Preparing'], shipped: ['ارسال شده', 'Shipped'],
  delivered: ['تحویل داده شد', 'Delivered'], rejected: ['رد شده', 'Rejected'], cancelled: ['لغو شده', 'Cancelled'],
  expired: ['مهلت پرداخت تمام شد', 'Payment expired'], payment_review: ['پرداخت دیرهنگام؛ بررسی مدیر', 'Late payment — review required'],
};
export const statusTitle = (status, lang) => (STATUS[status] || [status, status])[lang === 'en' ? 1 : 0];
const OPEN = ['awaiting_payment', 'receipt_review'];
const PAID = ['paid', 'preparing', 'shipped', 'delivered'];
export const isPaidOrder = order => PAID.includes(order.status);

export async function validateProduct(env, body, existing = {}) {
  const p = { ...existing, id: existing.id || id(), title: str(body.title, 120), titleEn: str(body.titleEn, 120), description: str(body.description, 3000), descriptionEn: str(body.descriptionEn, 3000), categoryId: str(body.categoryId, 32), price: int(body.price, 0, 1000000000), stock: int(body.stock, -1, 1000000), hidden: !!body.hidden, deliveryMode: body.deliveryMode || 'manual', deliveryText: str(body.deliveryText, 3500), deliveryMediaId: str(body.deliveryMediaId, 32), imageId: str(body.imageId, 32), updatedAt: Date.now(), createdAt: existing.createdAt || Date.now() };
  assert(p.title && p.price !== undefined && p.stock !== undefined, 'invalid_product');
  assert(['manual', 'ready', 'physical'].includes(p.deliveryMode), 'invalid_delivery_mode');
  assert(p.deliveryMode !== 'ready' || p.deliveryText || p.deliveryMediaId, 'delivery_content_required');
  if (p.categoryId) assert(await getJson(env, entityKey('category', p.categoryId)), 'category_not_found');
  const token = await resolveToken(env);
  for (const key of ['imageId', 'deliveryMediaId']) if (p[key]) { const m = await getMedia(env, p[key]); checkBotMedia(m, token); if (key === 'imageId') assert(m.kind === 'photo', 'product_image_required'); }
  if (existing.id && existing.stock !== p.stock) {
    const openOrders = (await allEntities(env, 'order')).some(o => OPEN.includes(o.status) && o.items.some(i => i.id === p.id));
    assert(!openOrders || body.confirmStockChange === true, 'stock_has_reservations');
  }
  return p;
}

export async function catalog(env, token, user, settings, lang, category = 'all', page = 0) {
  const categories = (await allEntities(env, 'category')).filter(c => !c.hidden).sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const hidden = (await allEntities(env, 'category')).filter(c => c.hidden).map(c => c.id);
  const products = (await allEntities(env, 'product')).filter(p => !p.hidden && !hidden.includes(p.categoryId) && (category === 'all' || p.categoryId === category)).sort((a, b) => b.createdAt - a.createdAt);
  const rows = [];
  if (category === 'all' && page === 0) for (let i = 0; i < categories.length; i += 2) rows.push(categories.slice(i, i + 2).map(c => b(`🗂 ${titleOf(c, lang)}`, `cat:${c.id}:0`)));
  const start = Math.max(0, page) * 8;
  for (const p of products.slice(start, start + 8)) rows.push([b(`${p.stock === 0 ? '⛔' : '📦'} ${titleOf(p, lang).slice(0, 38)}${p.price ? ' · ' + money(p.price, lang) : ''}`, `product:${p.id}`)]);
  const nav = [];
  if (page > 0) nav.push(b('‹', `cat:${category}:${page - 1}`));
  if (start + 8 < products.length) nav.push(b('›', `cat:${category}:${page + 1}`));
  if (nav.length) rows.push(nav);
  if (category !== 'all') rows.push([b(tr('همه دسته‌ها', 'All categories', lang), 'cat:all:0')]);
  if (enabled(settings, 'shop')) rows.push([b(tr('🛒 سبد خرید', '🛒 Cart', lang), 'cart:show')]);
  rows.push([b(tr('🔙 بازگشت به منوی اصلی', '🔙 Back to main menu', lang), 'sub:root')]);
  return say(token, user, products.length ? tr('📚 یک دسته یا محصول را انتخاب کنید:', '📚 Choose a category or an item:', lang) : tr('هنوز محصولی در این دسته موجود نیست.', 'No items in this category yet.', lang), rows);
}

export async function showProduct(env, token, user, settings, lang, productId) {
  const p = await getProduct(env, productId);
  const category = p?.categoryId ? await getJson(env, entityKey('category', p.categoryId)) : null;
  if (!p || p.hidden || category?.hidden) return say(token, user, tr('این محصول در دسترس نیست.', 'This item is unavailable.', lang), [[b(tr('🔙 منوی اصلی', '🔙 Main menu', lang), 'sub:root')]]);
  let content = `📦 ${titleOf(p, lang)}\n\n${(lang === 'en' && p.descriptionEn) || p.description || ''}\n\n${p.price ? money(p.price, lang) : tr('رایگان', 'Free', lang)}`;
  if (p.stock === 0) content += '\n' + tr('⛔ ناموجود', '⛔ Out of stock', lang);
  const rows = [];
  if (p.stock !== 0) {
    if (p.price === 0 && p.deliveryMode === 'ready') rows.push([b(tr('📥 دریافت', '📥 Download', lang), `download:${p.id}`)]);
    else if (enabled(settings, 'shop')) rows.push([b(tr('🛒 افزودن به سبد', '🛒 Add to cart', lang), `cart:add:${p.id}`)]);
    else rows.push([b(tr('💬 درخواست از پشتیبانی', '💬 Contact support', lang), 'support:open')]);
  }
  rows.push([b(tr('🗂 دسته‌بندی‌ها', '🗂 Categories', lang), 'cat:all:0'), b(tr('🔙 منوی اصلی', '🔙 Main menu', lang), 'sub:root')]);
  if (p.imageId) await sendMedia(env, token, user.id, p.imageId, { caption: titleOf(p, lang) });
  return say(token, user, content.slice(0, 4096), rows);
}

export async function searchProducts(env, token, user, settings, lang, query = '') {
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    user.flow = { type: 'product_search' };
    await putUser(env, user);
    return say(token, user, tr('🔍 نام یا کد محصول مورد نظر خود را وارد کنید:', '🔍 Enter the product name or code to search:', lang), [[b(tr('🔙 منوی اصلی', '🔙 Main menu', lang), 'sub:root')]]);
  }
  const hidden = (await allEntities(env, 'category')).filter(c => c.hidden).map(c => c.id);
  const products = (await allEntities(env, 'product')).filter(p => !p.hidden && !hidden.includes(p.categoryId) && (p.title?.toLowerCase().includes(q) || p.titleEn?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.id === q)).slice(0, 10);
  if (!products.length) {
    return say(token, user, tr(`محصولی با عبارت «${q}» یافت نشد.`, `No products found matching "${q}".`, lang), [[b(tr('📚 همه محصولات', '📚 All products', lang), 'cat:all:0'), b(tr('🔙 منوی اصلی', '🔙 Main menu', lang), 'sub:root')]]);
  }
  const rows = products.map(p => [b(`📦 ${titleOf(p, lang)} · ${money(p.price, lang)}`, `product:${p.id}`)]);
  rows.push([b(tr('🗂 دسته‌بندی‌ها', '🗂 Categories', lang), 'cat:all:0'), b(tr('🔙 منوی اصلی', '🔙 Main menu', lang), 'sub:root')]);
  return say(token, user, `🔍 ${tr('نتایج جستجو برای', 'Search results for', lang)} «${q}»:\n${tr('برای مشاهده جزئیات محصول، روی دکمه آن کلیک کنید.', 'Tap an item to view details.', lang)}`, rows);
}

export async function cartQuote(env, uid, settings) {
  const cart = await getCart(env, uid), items = []; let subtotal = 0;
  assert(cart.items.length, 'cart_empty');
  for (const line of cart.items) {
    const p = await getProduct(env, line.id);
    assert(p && !p.hidden, 'product_unavailable');
    if (p.categoryId) assert(!(await getJson(env, entityKey('category', p.categoryId)))?.hidden, 'product_unavailable');
    assert(p.stock < 0 || p.stock >= line.qty, 'insufficient_stock');
    assert(line.qty > 0 && line.qty <= 99, 'invalid_quantity');
    subtotal += p.price * line.qty;
    items.push({ id: p.id, title: p.title, titleEn: p.titleEn, qty: line.qty, price: p.price, deliveryMode: p.deliveryMode, deliveryText: p.deliveryText, deliveryMediaId: p.deliveryMediaId, fulfillment: 'pending' });
  }
  assert(Number.isSafeInteger(subtotal) && subtotal <= 1000000000, 'order_total_limit');
  let discount = 0, coupon = null;
  if (cart.coupon) {
    coupon = (await allEntities(env, 'coupon')).find(c => c.code === cart.coupon);
    assert(coupon && !coupon.hidden && (!coupon.startsAt || coupon.startsAt <= Date.now()) && (!coupon.expiresAt || coupon.expiresAt > Date.now()) && (!coupon.maxUses || (coupon.used || 0) + (coupon.reserved || 0) < coupon.maxUses), 'coupon_unavailable');
    discount = Math.min(subtotal, coupon.type === 'percent' ? Math.floor(subtotal * coupon.value / 100) : coupon.value);
  }
  let usedPoints = 0, pointsDiscount = 0;
  if (cart.usePoints && settings.loyalty.enabled && enabled(settings, 'crm') && settings.loyalty.pointValue > 0) {
    const acc = await pointsAccount(env, uid);
    const cap = Math.floor((subtotal - discount) * settings.loyalty.maxDiscountPercent / 100);
    usedPoints = Math.min(acc.points, Math.floor(cap / settings.loyalty.pointValue));
    pointsDiscount = usedPoints * settings.loyalty.pointValue;
  }
  return { cart, items, subtotal, discount, couponId: coupon?.id || '', usedPoints, pointsDiscount, total: subtotal - discount - pointsDiscount };
}

export async function showCart(env, token, user, settings, lang) {
  const cart = await getCart(env, user.id);
  if (!cart.items.length) return say(token, user, tr('🛒 سبد خرید شما خالی است.', '🛒 Your cart is empty.', lang), [[b(tr('مشاهده محصولات', 'Browse products', lang), 'cat:all:0'), b(tr('🔙 منوی اصلی', '🔙 Main menu', lang), 'sub:root')]]);
  let subtotal = 0; const lines = [], rows = [];
  for (const item of cart.items) {
    const p = await getProduct(env, item.id);
    if (!p) { lines.push(tr('محصول حذف شده — از سبد حذف کنید', 'Deleted product — remove it from the cart', lang)); rows.push([b('✕', `cart:remove:${item.id}`)]); continue; }
    subtotal += p.price * item.qty;
    lines.push(`${titleOf(p, lang)} × ${item.qty} — ${money(item.qty * p.price, lang)}`);
    rows.push([b('−', `cart:minus:${p.id}`), b(`${titleOf(p, lang).slice(0, 22)} × ${item.qty}`, `product:${p.id}`), b('+', `cart:add:${p.id}`), b('✕', `cart:remove:${p.id}`)]);
  }
  let totals = tr('جمع محصولات', 'Subtotal', lang) + ': ' + money(subtotal, lang);
  try {
    const quote = await cartQuote(env, user.id, settings);
    totals += '\n' + tr('قابل پرداخت', 'Total payable', lang) + ': ' + money(quote.total, lang) + (quote.discount + quote.pointsDiscount ? '\n' + tr('تخفیف', 'Discount', lang) + ': ' + money(quote.discount + quote.pointsDiscount, lang) : '');
  } catch (e) { totals += '\n⚠ ' + checkoutError(e.message, lang); }
  rows.push([b(tr('🎟 کد تخفیف', '🎟 Discount code', lang), 'cart:coupon'), b(tr('حذف کد', 'Clear code', lang), 'cart:clearcoupon')]);
  if (enabled(settings, 'crm') && settings.loyalty.enabled) rows.push([b(`${cart.usePoints ? '☑' : '☐'} ${tr('استفاده از امتیاز', 'Use loyalty points', lang)}`, 'cart:points')]);
  rows.push([b(tr('✅ تسویه حساب', '✅ Checkout', lang), 'checkout:start')]);
  rows.push([b(tr('🗂 ادامه خرید', '🗂 Continue shopping', lang), 'cat:all:0'), b(tr('🔙 منوی اصلی', '🔙 Main menu', lang), 'sub:root')]);
  return say(token, user, `🛒\n${lines.join('\n')}\n\n${totals}\n${cart.coupon ? '🎟 ' + cart.coupon : ''}`.slice(0, 4096), rows);
}

export function checkoutError(code, lang) {
  const errors = {
    cart_empty: ['سبد خرید خالی است.', 'The cart is empty.'], insufficient_stock: ['موجودی کافی نیست؛ سبد را اصلاح کنید.', 'Insufficient stock; edit your cart.'],
    product_unavailable: ['یکی از محصولات دیگر موجود نیست.', 'An item is no longer available.'], coupon_unavailable: ['کد تخفیف معتبر نیست یا ظرفیت آن تمام شده؛ کد را حذف کنید.', 'The discount code is unavailable; remove it.'],
    too_many_open_orders: ['ابتدا سفارش قبلی را پرداخت یا لغو کنید.', 'Please pay or cancel your previous orders first.'], payment_not_configured: ['روش پرداخت هنوز توسط مدیر تنظیم نشده است.', 'The administrator has not configured payments.'],
    quote_changed: ['قیمت یا موجودی تغییر کرده؛ سبد خرید را دوباره بررسی کنید.', 'Price or availability changed; review the cart again.'],
  };
  return errors[code]?.[lang === 'en' ? 1 : 0] || tr('عملیات انجام نشد؛ دوباره بررسی کنید.', 'The operation failed; please review and try again.', lang);
}
const quoteSignature = q => JSON.stringify({ items: q.items.map(i => [i.id, i.qty, i.price]), total: q.total, couponId: q.couponId, usedPoints: q.usedPoints });

export async function createOrder(env, user, settings, buyer, checkoutId, signature) {
  const previous = await getJson(env, entityKey('checkout', checkoutId));
  if (previous) return getOrder(env, previous);
  const q = await cartQuote(env, user.id, settings);
  assert(signature === quoteSignature(q), 'quote_changed');
  const unpaid = (await allEntities(env, 'order')).filter(o => String(o.userId) === String(user.id) && OPEN.includes(o.status));
  assert(unpaid.length < 3, 'too_many_open_orders');
  assert(q.total === 0 || (settings.shop.payment === 'manual' ? settings.shop.cardNumber : env.ZARINPAL_MERCHANT_ID && (env.PUBLIC_BASE_URL || settings.publicBaseUrl)), 'payment_not_configured');
  const order = { id: id(), checkoutId, userId: String(user.id), userName: user.firstName, lang: ['fa', 'en'].includes(settings.botLangMode) ? settings.botLangMode : user.lang || settings.defaultLang, ...q, cart: undefined, buyer, status: 'awaiting_payment', paymentMethod: settings.shop.payment, createdAt: Date.now(), expiresAt: Date.now() + settings.shop.reservationMinutes * 60000, paymentKey: crypto.randomUUID().replace(/-/g, '') + id(), history: [], stockReleased: false, couponSettled: false };
  const writes = [];
  for (const item of order.items) { const p = await getProduct(env, item.id); if (p.stock >= 0) { p.stock -= item.qty; writes.push([entityKey('product', p.id), p]); } }
  if (q.couponId) { const c = await getJson(env, entityKey('coupon', q.couponId)); c.reserved = (c.reserved || 0) + 1; writes.push([entityKey('coupon', c.id), c]); }
  writes.push(...await rewardWrites(env, user.id, -q.usedPoints, `spend:${order.id}`, 'checkout'));
  order.history.push({ at: Date.now(), status: order.status, source: 'checkout' });
  writes.push([entityKey('order', order.id), order], [entityKey('checkout', checkoutId), order.id], [entityKey('cart', user.id), { items: [], coupon: '', usePoints: false }]);
  await commitJson(env, writes);
  const token = await resolveToken(env);
  if (settings.shop.notifyChatId) {
    const res = await sendToUser(token, settings.shop.notifyChatId, `🛒 سفارش جدید / New order\n#${order.id}\n${user.firstName || user.id}\n${money(order.total)}\n${order.items.map(i => `${i.title} × ${i.qty}`).join('\n')}`);
    order.adminNotified = !!res.ok; await saveOrder(env, order);
  }
  if (!order.total) await approveOrder(env, order, 'free_order');
  return order;
}

export async function paymentInstructions(env, token, user, settings, lang, order) {
  if (isPaidOrder(order)) return say(token, user, `#${order.id}\n✅ ${statusTitle(order.status, lang)}`, [[b(tr('🔙 منوی اصلی', '🔙 Main menu', lang), 'sub:root')]]);
  const rows = [[b(tr('لغو سفارش', 'Cancel order', lang), `order:cancel:${order.id}`)]];
  let message = `#${order.id}\n${tr('مبلغ نهایی', 'Amount', lang)}: ${money(order.total, lang)}\n${tr('مهلت پرداخت', 'Pay before', lang)}: ${new Date(order.expiresAt).toLocaleString(lang === 'en' ? 'en-US' : 'fa-IR', { timeZone: 'Asia/Tehran' })} (Asia/Tehran)`;
  if (order.paymentMethod === 'manual') {
    message += `\n\n💳 ${settings.shop.cardNumber}\n${settings.shop.cardHolder}\n\n${tr('پس از واریز، دکمه ارسال فیش را بزنید و عکس یا PDF رسید را بفرستید. تأیید فقط پس از بررسی مدیر انجام می‌شود.', 'After transferring, tap Submit receipt and send a photo or PDF. Only the administrator can approve the receipt.', lang)}`;
    rows.unshift([b(tr('📎 ارسال فیش واریز', '📎 Submit receipt', lang), `order:receipt:${order.id}`)]);
  } else {
    const base = (env.PUBLIC_BASE_URL || settings.publicBaseUrl).replace(/\/$/, '');
    rows.unshift([{ text: tr('💳 پرداخت امن', '💳 Secure payment', lang), url: `${base}/pay/start/${order.id}?key=${order.paymentKey}` }]);
  }
  rows.push([b(tr('🔙 منوی اصلی', '🔙 Main menu', lang), 'sub:root')]);
  return say(token, user, message, rows);
}

async function notifyStatus(env, order, note = '') {
  const token = await resolveToken(env);
  const result = await sendToUser(token, order.userId, `📦 #${order.id}\n${statusTitle(order.status, order.lang)}${order.trackingCode ? '\n' + tr('کد رهگیری', 'Tracking', order.lang) + ': ' + order.trackingCode : ''}${note ? '\n' + note : ''}`);
  order.lastNotification = { ok: !!result.ok, at: Date.now(), error: result.ok ? '' : result.description }; await saveOrder(env, order);
}

export async function releaseOrder(env, order, status, reason = '') {
  assert(OPEN.includes(order.status), 'invalid_order_transition');
  const writes = [];
  if (!order.stockReleased) {
    for (const item of order.items) { const p = await getProduct(env, item.id); if (p && p.stock >= 0) { p.stock += item.qty; writes.push([entityKey('product', p.id), p]); } }
    if (order.couponId && !order.couponSettled) { const c = await getJson(env, entityKey('coupon', order.couponId)); if (c) { c.reserved = Math.max(0, (c.reserved || 0) - 1); writes.push([entityKey('coupon', c.id), c]); } order.couponReservationReleased = true; }
    writes.push(...await rewardWrites(env, order.userId, order.usedPoints, `refundpoints:${order.id}`, 'cancelled_order'));
    order.stockReleased = true;
  }
  order.status = status; order.history.push({ status, at: Date.now(), reason: str(reason, 300) });
  writes.push([entityKey('order', order.id), order]); await commitJson(env, writes);
  await notifyStatus(env, order, reason); return order;
}

export async function fulfillReady(env, order) {
  assert(isPaidOrder(order), 'payment_required');
  const token = await resolveToken(env), settings = await getSettings(env);
  if (order.items.some(item => item.deliveryMode === 'ready' && item.fulfillment === 'pending')) {
    const gate = await membershipGate(env, token, { id: order.userId }, settings);
    if (!gate.ok) {
      if (!order.deliveryLocked) await sendMembershipLock(token, order.userId, gate, order.lang, order.userId);
      order.deliveryLocked = true; order.nextDeliveryCheck = Date.now() + 300000; await saveOrder(env, order); return order;
    }
    order.deliveryLocked = false; order.nextDeliveryCheck = 0; await saveOrder(env, order);
  }
  for (const item of order.items) {
    if (item.deliveryMode !== 'ready' || item.fulfillment !== 'pending') continue;
    item.fulfillment = 'sending'; await saveOrder(env, order);
    let result;
    try {
      if (item.deliveryMediaId) result = await sendMedia(env, token, order.userId, item.deliveryMediaId, { protect_content: settings.shop.protectContent, caption: `📦 ${titleOf(item, order.lang)}\n#${order.id}` });
      else result = { ok: true };
      if (result.ok && item.deliveryText) result = await sendToUser(token, order.userId, item.deliveryText, { protect_content: settings.shop.protectContent });
    } catch (e) { result = { ok: false, description: e.message }; }
    item.fulfillment = result.ok ? 'sent' : 'review'; item.deliveryError = result.ok ? '' : result.description;
    await saveOrder(env, order);
    if (result.ok) {
      await putJson(env, entityKey('access', `${order.userId}:${item.id}`), { at: Date.now(), orderId: order.id });
      if (enabled(settings, 'learning')) await sendToUser(token, order.userId, tr('پس از مطالعه، درس را تکمیل کنید:', 'When you finish, mark the lesson complete:', order.lang), { reply_markup: { inline_keyboard: [[{ text: tr('✅ مطالعه کردم', '✅ Mark complete', order.lang), callback_data: `learn:${item.id}` }]] } });
    }
  }
  if (order.items.every(i => i.fulfillment === 'sent') && order.status !== 'delivered') {
    order.status = 'delivered'; order.history.push({ status: 'delivered', at: Date.now(), source: 'automatic_delivery' }); await saveOrder(env, order); await notifyStatus(env, order);
  }
  return order;
}

export async function approveOrder(env, order, source, payment = {}) {
  if (isPaidOrder(order)) return fulfillReady(env, order);
  assert(OPEN.includes(order.status) || order.status === 'payment_review', 'invalid_order_transition');
  const writes = [];
  if (order.stockReleased) {
    for (const i of order.items) { const p = await getProduct(env, i.id); assert(p && (p.stock < 0 || p.stock >= i.qty), 'late_payment_insufficient_stock'); if (p.stock >= 0) { p.stock -= i.qty; writes.push([entityKey('product', p.id), p]); } }
    writes.push(...await rewardWrites(env, order.userId, -order.usedPoints, `latepoints:${order.id}`, 'late_payment'));
    order.stockReleased = false;
  }
  if (order.couponId && order.couponReservationReleased) {
    const c = await getJson(env, entityKey('coupon', order.couponId));
    if (c) { c.reserved = (c.reserved || 0) + 1; writes.push([entityKey('coupon', c.id), c]); }
    order.couponReservationReleased = false;
  }
  if (order.couponId && !order.couponSettled) {
    const c = await getJson(env, entityKey('coupon', order.couponId));
    if (c) { c.used = (c.used || 0) + 1; c.reserved = Math.max(0, (c.reserved || 0) - 1); writes.push([entityKey('coupon', c.id), c]); }
    order.couponSettled = true;
  }
  const settings = await getSettings(env);
  if (settings.loyalty.enabled && enabled(settings, 'crm') && settings.loyalty.purchaseUnit > 0) {
    const earned = Math.floor(order.total / settings.loyalty.purchaseUnit);
    if (earned > 0) writes.push(...await rewardWrites(env, order.userId, earned, `order:${order.id}`, 'purchase'));
  }
  order.status = 'paid'; order.payment = { ...payment, source, at: Date.now() };
  order.history.push({ status: 'paid', at: Date.now(), source });
  writes.push([entityKey('order', order.id), order]);
  await commitJson(env, writes);
  await notifyStatus(env, order);
  return fulfillReady(env, order);
}

export async function updateOrder(env, orderId, action, body = {}) {
  const o = await getOrder(env, orderId); assert(o, 'order_not_found', 404);
  if (action === 'approve') {
    assert(['receipt_review', 'payment_review'].includes(o.status), 'receipt_or_payment_review_required');
    return approveOrder(env, o, 'admin_receipt_approval');
  }
  if (action === 'reject') {
    assert(o.status === 'receipt_review', 'receipt_or_payment_review_required');
    const reason = str(body.reason, 300); assert(reason, 'rejection_reason_required');
    o.receipt = null; return releaseOrder(env, o, 'rejected', reason);
  }
  if (['preparing', 'shipped', 'delivered', 'cancelled'].includes(action)) {
    if (['preparing', 'shipped', 'delivered'].includes(action)) assert(isPaidOrder(o), 'payment_required');
    if (action === 'shipped') { o.trackingCode = str(body.trackingCode, 120); assert(o.trackingCode, 'tracking_required'); }
    if (action === 'cancelled') return releaseOrder(env, o, 'cancelled', str(body.reason, 300));
    o.status = action; o.history.push({ status: action, at: Date.now(), source: 'admin_update' });
    await saveOrder(env, o); await notifyStatus(env, o); return o;
  }
  if (action === 'deliver_again') {
    assert(isPaidOrder(o) && o.items.some(i => i.deliveryMode === 'ready' && i.fulfillment !== 'sent'), 'delivery_already_attempted');
    for (const i of o.items) if (i.deliveryMode === 'ready' && i.fulfillment !== 'sent') i.fulfillment = 'pending';
    await saveOrder(env, o); return fulfillReady(env, o);
  }
  assert(false, 'invalid_order_transition');
}

export async function expireOrders(env) {
  const now = Date.now();
  const openOrders = (await allEntities(env, 'order')).filter(o => o.status === 'awaiting_payment' && o.expiresAt <= now);
  for (const order of openOrders) await releaseOrder(env, order, 'expired', 'reservation_timeout');
  const stuck = (await allEntities(env, 'order')).filter(o => o.deliveryLocked && isPaidOrder(o) && o.nextDeliveryCheck && o.nextDeliveryCheck <= now);
  for (const o of stuck) await fulfillReady(env, o);
  for (const o of await allEntities(env, 'order')) {
    if (isPaidOrder(o) && o.items.some(i => i.fulfillment === 'sending' && (Date.now() - (o.updatedAt || o.createdAt) > 300000) && (!o.history.some(h => h.status === 'delivered') && !o.items.every(i => i.fulfillment === 'sent')))) {
      for (const i of o.items) if (i.fulfillment === 'sending') { i.fulfillment = 'review'; i.deliveryError = 'delivery_interrupted_check_destination'; }
      await saveOrder(env, o);
    }
  }
}

export async function commerceCallback(env, token, user, settings, lang, data) {
  if (!enabled(settings, 'catalog') && !enabled(settings, 'shop')) return false;
  const [cmd, action, pid] = data.split(':');
  if (cmd === 'cat') {
    if (action === 'search') {
      await searchProducts(env, token, user, settings, lang, '');
      return true;
    }
    await catalog(env, token, user, settings, lang, action || 'all', int(pid, 0, 10000, 0));
    return true;
  }
  if (cmd === 'product') { await showProduct(env, token, user, settings, lang, action); return true; }
  if (cmd === 'download') {
    const p = await getProduct(env, action);
    assert(p && !p.hidden && p.stock !== 0 && p.price === 0 && p.deliveryMode === 'ready', 'product_unavailable');
    if (p.categoryId) assert(!(await getJson(env, entityKey('category', p.categoryId)))?.hidden, 'product_unavailable');
    const accessKey = entityKey('downloadlimit', `${user.id}:${p.id}`);
    const at = await getJson(env, accessKey, 0); assert(Date.now() - at > 5000, 'download_rate_limited');
    await putJson(env, accessKey, Date.now(), { ttl: 60 });
    let res = { ok: true };
    if (p.deliveryMediaId) res = await sendMedia(env, token, user.id, p.deliveryMediaId, { caption: titleOf(p, lang), protect_content: settings.shop.protectContent });
    if (res.ok && p.deliveryText) res = await say(token, user, p.deliveryText);
    assert(res.ok, 'delivery_failed');
    await putJson(env, entityKey('access', `${user.id}:${p.id}`), { at: Date.now(), free: true });
    if (enabled(settings, 'learning')) await say(token, user, tr('پس از مطالعه، درس را تکمیل کنید:', 'When you finish, mark the lesson complete:', lang), [[b(tr('✅ مطالعه کردم', '✅ Mark complete', lang), `learn:${p.id}`)]]);
    return true;
  }
  if (!enabled(settings, 'shop')) return false;
  if (cmd === 'cart') {
    const cart = await getCart(env, user.id);
    if (action === 'add') {
      const p = await getProduct(env, pid); assert(p && !p.hidden, 'product_unavailable');
      const line = cart.items.find(i => i.id === pid); const qty = (line?.qty || 0) + 1;
      assert(qty <= 99 && (p.stock < 0 || qty <= p.stock), 'insufficient_stock');
      assert(line || cart.items.length < 20, 'cart_item_limit');
      if (line) line.qty = qty; else cart.items.push({ id: pid, qty });
    }
    if (action === 'minus') { const line = cart.items.find(i => i.id === pid); if (line) line.qty--; cart.items = cart.items.filter(i => i.qty > 0); }
    if (action === 'remove') cart.items = cart.items.filter(i => i.id !== pid);
    if (action === 'points') cart.usePoints = !cart.usePoints;
    if (action === 'clearcoupon') cart.coupon = '';
    if (action === 'coupon') { user.flow = { type: 'coupon' }; user.supportOpen = false; await putUser(env, user); await say(token, user, tr('کد تخفیف را بفرستید. /cancel برای انصراف', 'Send the discount code. /cancel to stop', lang)); return true; }
    await saveCart(env, user.id, cart); await showCart(env, token, user, settings, lang); return true;
  }
  if (cmd === 'checkout' && action === 'start') {
    const q = await cartQuote(env, user.id, settings);
    user.flow = { type: 'checkout', step: 'name', checkoutId: id(), signature: quoteSignature(q), buyer: {}, needsAddress: settings.shop.requireAddress || q.items.some(i => i.deliveryMode === 'physical') }; user.supportOpen = false;
    await putUser(env, user);
    await say(token, user, tr('نام و نام خانوادگی گیرنده را بفرستید.\n/cancel برای انصراف', 'Send the recipient’s full name.\n/cancel to stop', lang)); return true;
  }
  if (cmd === 'checkout' && action === 'confirm') {
    assert(user.flow?.type === 'checkout' && user.flow.step === 'confirm' && user.flow.checkoutId === pid, 'checkout_expired');
    const flow = user.flow, order = await createOrder(env, user, settings, flow.buyer, flow.checkoutId, flow.signature);
    user.flow = null; await putUser(env, user); await paymentInstructions(env, token, user, settings, lang, order); return true;
  }
  if (cmd === 'order') {
    const o = await getOrder(env, pid); assert(o && o.userId === String(user.id), 'order_not_found');
    if (action === 'cancel') { assert(o.status === 'awaiting_payment', 'order_in_review'); await releaseOrder(env, o, 'cancelled'); }
    if (action === 'pay') await paymentInstructions(env, token, user, settings, lang, o);
    if (action === 'receipt') {
      assert(o.paymentMethod === 'manual' && o.status === 'awaiting_payment' && o.expiresAt > Date.now(), 'receipt_not_allowed');
      user.flow = { type: 'receipt', orderId: o.id }; user.supportOpen = false; await putUser(env, user);
      await say(token, user, tr('عکس یا PDF فیش را ارسال کنید (حداکثر ۲۰ مگابایت). تأیید فیش دستی است. /cancel', 'Send the receipt as a photo or PDF (up to 20 MB). It is reviewed manually. /cancel', lang));
    }
    return true;
  }
  if (data === 'orders:mine') { await myOrders(env, token, user, lang); return true; }
  return false;
}

export async function commerceMessage(env, token, user, settings, lang, msg) {
  if (!enabled(settings, 'catalog') && !enabled(settings, 'shop')) return false;
  const flow = user.flow, input = str(msg.text, 1000);
  if (!flow || !['coupon', 'checkout', 'receipt', 'product_search'].includes(flow.type)) return false;
  if (flow.type === 'product_search') {
    user.flow = null; await putUser(env, user);
    await searchProducts(env, token, user, settings, lang, input);
    return true;
  }
  if (flow.type === 'receipt') {
    const o = await getOrder(env, flow.orderId);
    assert(o && o.userId === String(user.id) && o.status === 'awaiting_payment' && o.expiresAt > Date.now(), 'receipt_not_allowed');
    const f = msg.photo?.at(-1) || (msg.document?.mime_type === 'application/pdf' ? msg.document : null);
    if (!f || (f.file_size || 0) > 20 * 1024 * 1024) { await say(token, user, tr('لطفاً عکس یا PDF معتبر بفرستید.', 'Please send a photo or a PDF.', lang)); return true; }
    o.receipt = { fileId: f.file_id, name: msg.document?.file_name || 'receipt.jpg', chatId: msg.chat.id, messageId: msg.message_id, at: Date.now() };
    o.status = 'receipt_review'; o.expiresAt = Date.now() + 48 * 3600000;
    o.history.push({ status: o.status, at: Date.now(), source: 'user_receipt' }); await saveOrder(env, o);
    user.flow = null; await putUser(env, user); await notifyStatus(env, o);
    if (settings.shop.notifyChatId) {
      await sendToUser(token, settings.shop.notifyChatId, `📎 فیش جدید / New receipt\n#${o.id}\n${money(o.total)}\nتأیید یا رد از پنل / Review in the admin panel`);
      await tgApi(token, 'copyMessage', { chat_id: settings.shop.notifyChatId, from_chat_id: msg.chat.id, message_id: msg.message_id, protect_content: true });
    }
    return true;
  }
  if ((!input && !msg.contact) || input.startsWith('/')) return false;
  if (flow.type === 'coupon') {
    const cart = await getCart(env, user.id); cart.coupon = input.toUpperCase(); await saveCart(env, user.id, cart);
    user.flow = null; await putUser(env, user); await showCart(env, token, user, settings, lang); return true;
  }
  if (flow.step === 'name') { assert(input.length >= 3 && input.length <= 100, 'invalid_buyer_name'); flow.buyer.name = input; flow.step = 'phone'; await say(token, user, tr('شماره تماس گیرنده را بفرستید:', 'Send the recipient’s phone number:', lang)); }
  else if (flow.step === 'phone') {
    const phone = (msg.contact && String(msg.contact.user_id) === String(user.id) ? msg.contact.phone_number : input).replace(/[\s()-]/g, '').replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c));
    assert(/^\+?\d{8,15}$/.test(phone), 'invalid_phone'); flow.buyer.phone = phone;
    flow.step = flow.needsAddress ? 'address' : settings.shop.deliverySlots.length ? 'slot' : 'confirm';
    if (flow.step === 'address') await say(token, user, tr('آدرس کامل و کد پستی را بفرستید:', 'Send the full address and postal code:', lang));
  } else if (flow.step === 'address') { assert(input.length >= 10 && input.length <= 800, 'invalid_address'); flow.buyer.address = input; flow.step = settings.shop.deliverySlots.length ? 'slot' : 'confirm'; }
  else if (flow.step === 'slot') {
    const n = Number(input.replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c))) - 1;
    assert(settings.shop.deliverySlots[n], 'invalid_delivery_slot'); flow.buyer.slot = settings.shop.deliverySlots[n]; flow.step = 'confirm';
  }
  user.flow = flow; await putUser(env, user);
  if (flow.step === 'slot') await say(token, user, tr('شماره زمان ارسال را بفرستید:', 'Send a delivery time number:', lang) + '\n' + settings.shop.deliverySlots.map((s, i) => `${i + 1}. ${s}`).join('\n'));
  if (flow.step === 'confirm') {
    const q = await cartQuote(env, user.id, settings);
    if (quoteSignature(q) !== flow.signature) { user.flow = null; await putUser(env, user); throw new Error('quote_changed'); }
    await say(token, user, `${flow.buyer.name}\n${flow.buyer.phone}\n${flow.buyer.address || ''}\n${flow.buyer.slot || ''}\n\n${tr('مبلغ نهایی', 'Final amount', lang)}: ${money(q.total, lang)}\n${tr('اطلاعات صحیح است؟', 'Confirm your details?', lang)}`, [[b(tr('✅ ثبت سفارش', '✅ Place order', lang), `checkout:confirm:${flow.checkoutId}`)]]);
  }
  return true;
}

export async function myOrders(env, token, user, lang) {
  const orders = (await allEntities(env, 'order')).filter(o => o.userId === String(user.id)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  for (const o of orders) await say(token, user, `📦 #${o.id}\n${statusTitle(o.status, lang)}\n${money(o.total, lang)}${o.trackingCode ? '\n' + o.trackingCode : ''}`, o.status === 'awaiting_payment' ? [[b(tr('پرداخت / ارسال فیش', 'Pay / submit receipt', lang), `order:pay:${o.id}`)]] : undefined);
  if (!orders.length) await say(token, user, tr('هنوز سفارشی ثبت نکرده‌اید.', 'You have no orders yet.', lang), [[b(tr('🛍 فروشگاه', '🛍 Store', lang), 'cat:all:0'), b(tr('🔙 منوی اصلی', '🔙 Main menu', lang), 'sub:root')]]);
}

export async function resumeMemberDeliveries(env, userId) {
  const orders = (await allEntities(env, 'order')).filter(o => o.userId === String(userId) && o.deliveryLocked && isPaidOrder(o));
  for (const order of orders) await fulfillReady(env, order);
}
