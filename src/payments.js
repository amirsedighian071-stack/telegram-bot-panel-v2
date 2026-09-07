import { getSettings, getJson, putJson } from './kv.js';
import { getOrder, saveOrder, approveOrder, isPaidOrder, statusTitle } from './commerce.js';
import { entityKey } from './storage.js';
import { assert } from './config.js';
import { safeEqual } from './auth.js';

const endpoint = (env, action) => `https://${env.ZARINPAL_SANDBOX === 'true' ? 'sandbox' : 'payment'}.zarinpal.com/pg/v4/payment/${action}.json`;
const payUrl = (env, authority) => `https://${env.ZARINPAL_SANDBOX === 'true' ? 'sandbox' : 'payment'}.zarinpal.com/pg/StartPay/${encodeURIComponent(authority)}`;
const page = (message, status = 200) => new Response(`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>وضعیت پرداخت</title><style>body{font-family:Tahoma,system-ui;background:#08111f;color:#e2e8f0;display:grid;place-content:center;min-height:90vh;margin:0;padding:24px}main{max-width:520px;padding:32px;background:#111e32;border:1px solid #23415f;border-radius:24px}h1{color:#38bdf8;font-size:24px}p{line-height:2}</style><main><h1>وضعیت پرداخت / Payment</h1><p>${String(message).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</p><p>برای جزئیات به ربات تلگرام برگردید.<br>Return to the Telegram bot for details.</p></main></html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" } });
async function gateway(env, action, payload) {
  let res;
  try { res = await fetch(endpoint(env, action), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ merchant_id: env.ZARINPAL_MERCHANT_ID, ...payload }), redirect: 'error', signal: AbortSignal.timeout(15000) }); } catch { throw new Error('gateway_unavailable'); }
  const data = await res.json().catch(() => null);
  assert(data && res.ok, 'gateway_unavailable', 502);
  return data;
}

export async function handlePayment(request, env) {
  const url = new URL(request.url), parts = url.pathname.split('/');
  if (request.method !== 'GET') return page('روش درخواست معتبر نیست.', 405);
  try {
    const action = parts[2], orderId = parts[3];
    assert(/^[a-f0-9]{16}$/.test(orderId || ''), 'invalid_order');
    const order = await getOrder(env, orderId);
    assert(order && order.paymentMethod === 'zarinpal', 'invalid_order');
    const key = url.searchParams.get('key') || '';
    assert(key && await safeEqual(key, order.paymentKey), 'invalid_payment_key', 403);
    assert(env.ZARINPAL_MERCHANT_ID, 'gateway_not_configured', 503);
    if (isPaidOrder(order)) return page('پرداخت قبلاً تأیید شده است. / Payment already approved.');
    if (action === 'start') {
      assert(order.status === 'awaiting_payment' && order.expiresAt > Date.now(), 'order_expired');
      if (order.authority) return Response.redirect(payUrl(env, order.authority), 303);
      const settings = await getSettings(env), base = (env.PUBLIC_BASE_URL || settings.publicBaseUrl || '').replace(/\/$/, '');
      assert(base.startsWith('https://'), 'public_base_url_required');
      const callback_url = `${base}/pay/callback/${order.id}?key=${order.paymentKey}`;
      const response = await gateway(env, 'request', { amount: order.total * 10, currency: 'IRR', callback_url, description: `Order ${order.id}`, metadata: { order_id: order.id } });
      assert(response.data?.code === 100 && /^[A-Za-z0-9]{20,64}$/.test(response.data?.authority || ''), 'gateway_request_failed', 502);
      order.authority = response.data.authority; order.gatewayAmount = order.total * 10; await saveOrder(env, order);
      return Response.redirect(payUrl(env, order.authority), 303);
    }
    assert(action === 'callback', 'not_found', 404);
    const authority = url.searchParams.get('Authority') || '';
    assert(order.authority && await safeEqual(authority, order.authority), 'invalid_authority', 403);
    // A browser redirect (even Status=OK) is never proof of payment.
    if (url.searchParams.get('Status') !== 'OK') return page('پرداخت تکمیل نشده است؛ سفارش تا پایان مهلت باز می‌ماند. / Payment was not completed.');
    const verified = await gateway(env, 'verify', { amount: order.gatewayAmount, authority: order.authority });
    const p = verified.data;
    assert([100, 101].includes(p?.code) && p.ref_id && order.gatewayAmount === order.total * 10, 'payment_not_verified', 400);
    if (p.amount !== undefined) assert(Number(p.amount) === order.gatewayAmount, 'amount_mismatch');
    assert((typeof p.ref_id !== 'number' || Number.isSafeInteger(p.ref_id)) && /^\d{1,30}$/.test(String(p.ref_id)), 'invalid_payment_reference');
    const ref = String(p.ref_id), refKey = entityKey('paymentref', ref), owner = await getJson(env, refKey);
    assert(!owner || owner === order.id, 'duplicate_payment_reference', 409);
    await putJson(env, refKey, order.id);
    order.payment = { source: 'zarinpal_server_verify', refId: ref, verifiedAt: Date.now() };
    if (!['awaiting_payment', 'receipt_review', 'payment_review'].includes(order.status) || order.expiresAt < Date.now()) {
      order.status = 'payment_review'; order.history.push({ at: Date.now(), status: 'payment_review', source: 'late_gateway_payment' }); await saveOrder(env, order);
      return page('پرداخت بانکی تأیید شد، اما سفارش دیر پرداخت شده و برای بررسی موجودی نزد مدیر است. / Payment verified; late order needs administrator review.');
    }
    await saveOrder(env, order);
    await approveOrder(env, order, 'zarinpal_server_verify', order.payment);
    return page('پرداخت با استعلام سرور تأیید شد. محصول یا وضعیت سفارش در ربات ارسال می‌شود. / Payment verified by the server. Check the bot for delivery.');
  } catch (e) {
    const messages = { invalid_payment_key: 'لینک پرداخت نامعتبر است.', invalid_authority: 'شناسه پرداخت مطابقت ندارد.', order_expired: 'مهلت سفارش تمام شده است.', gateway_unavailable: 'ارتباط با درگاه برقرار نشد؛ بعداً دوباره تلاش کنید.', payment_not_verified: 'پرداخت هنوز از سوی درگاه تأیید نشده است.', gateway_not_configured: 'درگاه توسط مدیر تنظیم نشده است.' };
    return page(messages[e.message] || 'پرداخت تأیید نشد. برای بررسی به ربات یا پشتیبانی مراجعه کنید. / Payment not confirmed; contact support.', e.status || 400);
  }
}
