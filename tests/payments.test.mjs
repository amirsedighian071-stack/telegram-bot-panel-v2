import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {setup,telegramMock} from './helpers.mjs';
import {getSettings,getUser,putJson} from '../src/kv.js';
import {entityKey} from '../src/storage.js';
import {getOrder,createOrder,cartQuote,saveCart,expireOrders} from '../src/commerce.js';
let h,tg,authority,verified=true,ref='987654';const realFetch=globalThis.fetch;
beforeEach(async()=>{
  tg=telegramMock();globalThis.fetch=tg.fetcher;h=await setup();h.env.ZARINPAL_MERCHANT_ID='merchant-test';h.env.PUBLIC_BASE_URL='https://panel.example.com';authority='A'.repeat(36);verified=true;ref='987654';
  tg.setOverride((url,m,p)=>url.includes('/payment/request.json')?{data:{code:100,authority}}:url.includes('/payment/verify.json')?{data:{code:verified?100:-51,ref_id:verified?ref:undefined}}:undefined);
});
afterEach(()=>globalThis.fetch=realFetch);
async function order(uid=42){
  await h.settings({shop:{payment:'zarinpal'}});await h.msg(uid,'/start');const p=await h.api('POST','/studio/products',{title:'Paid',price:12345,stock:2,deliveryMode:'ready',deliveryText:'PAID-CONTENT'});
  await saveCart(h.env,uid,{items:[{id:p.data.product.id,qty:1}],coupon:'',usePoints:false});const s=await getSettings(h.env),q=await cartQuote(h.env,uid,s),sig=JSON.stringify({items:q.items.map(i=>[i.id,i.qty,i.price]),total:q.total,couponId:q.couponId,usedPoints:q.usedPoints});
  return createOrder(h.env,await getUser(h.env,uid),s,{name:'User',phone:'123456789'},'pay-checkout-'+uid,sig);
}
const start=o=>h.raw('GET',`/pay/start/${o.id}?key=${o.paymentKey}`);
const callback=(o,status='OK',a=authority,key=o.paymentKey)=>h.raw('GET',`/pay/callback/${o.id}?key=${key}&Authority=${a}&Status=${status}`);

test('payment start requires the unguessable order key; secrets never enter redirects',async()=>{
  const o=await order();let r=await h.raw('GET',`/pay/start/${o.id}?key=wrong`);assert.equal(r.status,403);assert.equal(tg.calls.some(c=>c.url.includes('request.json')),false);
  r=await start(o);assert.equal(r.status,303);assert.equal(r.headers.get('location'),`https://payment.zarinpal.com/pg/StartPay/${authority}`);assert.equal(r.headers.get('location').includes('merchant-test'),false);
});
test('gateway requests use the stored amount converted to IRR and a fixed trusted callback',async()=>{
  const o=await order();await start(o);const request=tg.calls.find(c=>c.url.includes('request.json'));assert.equal(request.payload.amount,123450);assert.equal(request.payload.currency,'IRR');assert(request.payload.callback_url.startsWith('https://panel.example.com/pay/callback/'+o.id));
  const r=await callback(o);assert.equal(r.status,200);const verify=tg.calls.find(c=>c.url.includes('verify.json'));assert.equal(verify.payload.amount,123450);assert.equal((await getOrder(h.env,o.id)).status,'delivered');
});
test('Status=OK without successful server verification is never considered paid',async()=>{
  const o=await order();await start(o);verified=false;const r=await callback(o);assert.equal(r.status,400);assert.equal((await getOrder(h.env,o.id)).status,'awaiting_payment');assert.equal(tg.sent().some(c=>c.payload.text==='PAID-CONTENT'),false);
});
test('authority mismatch is rejected before contacting the gateway',async()=>{
  const o=await order();await start(o);const r=await callback(o,'OK','B'.repeat(36));assert.equal(r.status,403);assert.equal(tg.calls.some(c=>c.url.includes('verify.json')),false);
});
test('duplicate payment callbacks cannot redeliver a product',async()=>{
  const o=await order();await start(o);await callback(o);await callback(o);assert.equal(tg.sent().filter(c=>c.payload.text==='PAID-CONTENT').length,1);assert.equal(tg.calls.filter(c=>c.url.includes('verify.json')).length,1);
});
test('gateway cancellation does not fake a successful or failed settlement',async()=>{
  const o=await order();await start(o);const r=await callback(o,'NOK');assert.equal(r.status,200);assert.equal((await getOrder(h.env,o.id)).status,'awaiting_payment');assert.equal(tg.calls.some(c=>c.url.includes('verify.json')),false);
});
test('late verified payments enter manual review instead of overselling',async()=>{
  let o=await order();await start(o);o=await getOrder(h.env,o.id);o.expiresAt=Date.now()-1000;await putJson(h.env,entityKey('order',o.id),o);await expireOrders(h.env);assert.equal((await getOrder(h.env,o.id)).status,'expired');await callback(o);assert.equal((await getOrder(h.env,o.id)).status,'payment_review');assert.equal(tg.sent().some(c=>c.payload.text==='PAID-CONTENT'),false);
});
test('one bank reference cannot settle two different orders',async()=>{
  const a=await order(42);await start(a);await callback(a);authority='B'.repeat(36);const b=await order(43);await start(b);const r=await callback(b);assert.equal(r.status,409);assert.equal((await getOrder(h.env,b.id)).status,'awaiting_payment');
});
test('a mismatching verified amount is rejected even if the gateway code is successful',async()=>{
  const o=await order();await start(o);tg.setOverride(url=>url.includes('verify.json')?{data:{code:100,ref_id:'100',amount:1}}:undefined);const r=await callback(o);assert.equal(r.status,400);assert.equal((await getOrder(h.env,o.id)).status,'awaiting_payment');
});
