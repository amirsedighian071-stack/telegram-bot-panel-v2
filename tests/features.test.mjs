import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, telegramMock } from './helpers.mjs';
import { getSettings, getUser, getJson, putJson, K, putUser } from '../src/kv.js';
import { entityKey, allEntities } from '../src/storage.js';
import { getProduct, getOrder, getCart, createOrder, cartQuote, saveCart, releaseOrder, expireOrders, approveOrder, commerceMessage } from '../src/commerce.js';
import { membershipGate } from '../src/gate.js';
import { GROUP_DEFAULTS, violation, isNight, groupTick } from '../src/groups.js';
import { broadcastTick, tickBroadcast } from '../src/broadcast.js';
import { parseFeed, feedTick, relayTick } from '../src/automation.js';
import { pointsAccount } from '../src/crm.js';

let h, tg; const originalFetch = globalThis.fetch;
beforeEach(async () => { tg=telegramMock();globalThis.fetch=tg.fetcher;h=await setup(); });
afterEach(()=>{globalThis.fetch=originalFetch;});
const product = async (patch={}) => { const r=await h.api('POST','/studio/products',{title:'محصول تست',titleEn:'Test product',price:1000,stock:3,deliveryMode:'ready',deliveryText:'SECRET-DELIVERY',...patch});assert.equal(r.status,200,JSON.stringify(r));return r.data.product;};
const signature = q => JSON.stringify({items:q.items.map(i=>[i.id,i.qty,i.price]),total:q.total,couponId:q.couponId,usedPoints:q.usedPoints});
async function checkout(uid,p,buyer={name:'Test User',phone:'09121234567'}) {
  await h.settings({shop:{cardNumber:'6037991234567890'}});await h.msg(uid,'/start');await saveCart(h.env,uid,{items:[{id:p.id,qty:1}],coupon:'',usePoints:false});
  const q=await cartQuote(h.env,uid,await getSettings(h.env));return createOrder(h.env,await getUser(h.env,uid),await getSettings(h.env),buyer,'checkout-'+uid,signature(q));
}

test('private APIs reject unauthenticated clients and never expose credentials',async()=>{
  for(const path of ['/api/studio/products','/api/media','/api/studio/orders'])assert.equal((await h.raw('GET',path)).status,401);
  const s=await h.api('GET','/settings');assert.equal(s.data.settings.botToken,undefined);assert.equal(JSON.stringify(s).includes('TEST_TOKEN'),false);assert.equal(Object.keys(s.data.settings.purposes).length,13);
});
test('purpose-specific API and runtime gating preserve saved products',async()=>{
  const p=await product();await h.settings({botPurpose:'relay'});
  assert.equal((await h.api('GET','/studio/products')).status,403);
  await h.msg(42,'/start p_'+p.id);assert.equal(tg.sent().some(c=>c.payload.text==='SECRET-DELIVERY'),false);
  await h.settings({botPurpose:'custom'});assert.equal((await h.api('GET','/studio/products')).data.rows.length,1);
});
test('invalid settings are rejected without partially changing the profile',async()=>{
  const r=await h.api('PUT','/settings',{botPurpose:'shop',requiredChats:{enabled:true,targets:[{chatId:'-1001234',url:'',scope:'all'}]}});assert.equal(r.status,400);assert.equal((await getSettings(h.env)).botPurpose,'custom');
});
test('multiple membership locks are fail-closed; restricted members are handled correctly',async()=>{
  const s=await h.settings({requiredChats:{enabled:true,targets:[{chatId:'@first_channel',url:'',scope:'all'},{chatId:'-1001234',url:'https://t.me/+private',scope:'all'}]}});
  tg.members.set('@first_channel:42',{status:'member'});tg.members.set('-1001234:42',{status:'restricted',is_member:false});
  let gate=await membershipGate(h.env,'123:TEST_TOKEN',{id:42},s);assert.equal(gate.ok,false);assert.equal(gate.missing.length,1);
  tg.members.set('-1001234:42',{status:'restricted',is_member:true});assert.equal((await membershipGate(h.env,'123:TEST_TOKEN',{id:42},s)).ok,true);
  tg.members.set('-1001234:42',{ok:false,error_code:400,description:'bot not admin'});gate=await membershipGate(h.env,'123:TEST_TOKEN',{id:42},s);assert.equal(gate.ok,false);assert.equal(gate.unavailable,true);
});
test('leaving a required chat immediately prevents the next download',async()=>{
  const p=await product({price:0});await h.settings({requiredChats:{enabled:true,targets:[{chatId:'@first_channel',url:'',scope:'all'}]}});await h.msg(42,'/start');await h.cb(42,'download:'+p.id);assert.equal(tg.sent().filter(c=>c.payload.text==='SECRET-DELIVERY').length,1);
  tg.members.set('@first_channel:42',{status:'left'});await h.cb(42,'download:'+p.id);assert.equal(tg.sent().filter(c=>c.payload.text==='SECRET-DELIVERY').length,1);
});
test('profile-scoped locks do not leak into other modes; global locks remain',async()=>{
  const s=await h.settings({botPurpose:'shop',requiredChats:{enabled:true,targets:[{chatId:'@shop_channel',scope:'shop',url:''},{chatId:'@group_channel',scope:'group',url:''}]}});
  tg.clear();assert.equal((await membershipGate(h.env,'123:TEST_TOKEN',{id:42},s)).ok,true);assert.deepEqual(tg.calls.filter(c=>c.method==='getChatMember').map(c=>c.payload.chat_id),['@shop_channel']);
});
test('product deep link resumes after passing all membership locks',async()=>{
  const p=await product({price:0});await h.settings({requiredChats:{enabled:true,targets:[{chatId:'@first_channel',scope:'all',url:''}]}});tg.members.set('@first_channel:42',{status:'left'});
  await h.msg(42,'/start p_'+p.id);assert.equal((await getUser(h.env,42)).pendingStart,'p_'+p.id);assert.equal(tg.sent().some(c=>c.payload.text?.includes('📦 محصول تست')),false);
  tg.members.set('@first_channel:42',{status:'member'});await h.cb(42,'chan:check:42');assert(tg.sent().some(c=>c.payload.text?.includes('📦 محصول تست')));assert.equal((await getUser(h.env,42)).pendingStart,'');
});
test('direct multipart photo upload returns reusable Telegram file ID, never bot URL',async()=>{
  await h.settings({uploads:{chatId:'@storage_channel'}});const form=new FormData();form.set('kind','photo');form.set('file',new File([new Uint8Array([255,216,255,0])],'pic.jpg',{type:'image/jpeg'}));
  const r=await h.raw('POST','/api/media',{token:h.token,body:form}),j=await r.json();assert.equal(r.status,200,JSON.stringify(j));assert.equal(j.data.media.kind,'photo');assert.match(j.data.media.fileId,/^file-photo/);assert.equal(JSON.stringify(j).includes('TEST_TOKEN'),false);
  const d=await h.api('POST','/broadcast',{kind:'photo',target:'chat',chatId:'@destination',mediaId:j.data.media.id,reactions:false,caption:'hello'});assert.equal(d.data.sent,1);
  const send=tg.calls.filter(c=>c.method==='sendPhoto').at(-1);assert.equal(send.payload.photo,j.data.media.fileId);assert.deepEqual(send.payload.reply_markup.inline_keyboard,[]);
});
test('document uploads send documents, not photos or public links',async()=>{
  await h.settings({uploads:{chatId:'@storage_channel'}});const f=new FormData();f.set('kind','document');f.set('file',new File(['test'],'note.txt',{type:'text/plain'}));
  const m=await (await h.raw('POST','/api/media',{token:h.token,body:f})).json();assert.equal(m.ok,true);await h.api('POST','/broadcast',{kind:'document',mediaId:m.data.media.id,target:'chat',chatId:-1001234,caption:'file',reactions:false});assert.equal(tg.calls.at(-1).method,'sendDocument');
});
test('upload validation enforces auth, magic bytes, size and configured processor',async()=>{
  await h.settings({uploads:{chatId:'@storage_channel'}});
  let f=new FormData();f.set('kind','photo');f.set('file',new File(['<svg>bad</svg>'],'fake.jpg',{type:'image/jpeg'}));assert.equal((await h.raw('POST','/api/media',{token:h.token,body:f})).status,400);
  f=new FormData();f.set('kind','document');f.set('file',new File(['data'],'note.txt'));f.set('operation','compress');const r=await h.raw('POST','/api/media',{token:h.token,body:f});assert.equal(r.status,503);assert.equal((await r.json()).error,'media_processor_not_configured');
  assert.equal((await h.raw('POST','/api/media',{token:h.token,body:f,headers:{'content-length':String(30*1024*1024)}})).status,413);
});
test('hidden products and hidden categories never expose free delivery',async()=>{
  const c=await h.api('POST','/studio/categories',{title:'مخفی',hidden:true});const p=await product({price:0,categoryId:c.data.category.id});await h.msg(42,'/start');await h.cb(42,'download:'+p.id);assert.equal(tg.sent().some(c=>c.payload.text==='SECRET-DELIVERY'),false);
});
test('public product preview never includes paid delivery contents',async()=>{
  const p=await product();await h.msg(42,'/start p_'+p.id);assert.equal(tg.sent().some(c=>c.payload.text==='SECRET-DELIVERY'),false);await h.cb(42,'download:'+p.id);assert.equal(tg.sent().some(c=>c.payload.text==='SECRET-DELIVERY'),false);
});
test('checkout transaction reserves stock once and duplicate checkout returns same order',async()=>{
  const p=await product({stock:1});const o=await checkout(42,p);assert.equal((await getProduct(h.env,p.id)).stock,0);assert.equal(o.total,1000);assert.equal(tg.sent().some(c=>c.payload.text==='SECRET-DELIVERY'),false);
  const same=await createOrder(h.env,await getUser(h.env,42),await getSettings(h.env),{},'checkout-42','ignored');assert.equal(same.id,o.id);assert.equal((await allEntities(h.env,'order')).length,1);assert.equal((await getProduct(h.env,p.id)).stock,0);
});
test('failed atomic checkout leaves stock, cart and order unchanged',async()=>{
  const p=await product({stock:1});await h.settings({shop:{cardNumber:'6037991234567890'}});await h.msg(42,'/start');await saveCart(h.env,42,{items:[{id:p.id,qty:1}],coupon:'',usePoints:false});const s=await getSettings(h.env),q=await cartQuote(h.env,42,s);
  const user=await getUser(h.env,42);h.env.BOT_KV.failBatch=true;await assert.rejects(()=>createOrder(h.env,user,s,{},'broken',signature(q)),/simulated_transaction_failure/);h.env.BOT_KV.failBatch=false;
  assert.equal((await getProduct(h.env,p.id)).stock,1);assert.equal((await getCart(h.env,42)).items.length,1);assert.equal((await allEntities(h.env,'order')).length,0);
});
test('a second customer cannot oversell reserved inventory',async()=>{
  const p=await product({stock:1});await checkout(42,p);await h.msg(43,'/start');await saveCart(h.env,43,{items:[{id:p.id,qty:1}],coupon:'',usePoints:false});await assert.rejects(()=>cartQuote(h.env,43,{}),/insufficient_stock/);
});
test('receipt submission is manual review, not payment success; approval delivers exactly once',async()=>{
  const p=await product();const o=await checkout(42,p);await h.cb(42,'order:receipt:'+o.id);await h.msg(42,undefined,{photo:[{file_id:'receipt-file',file_size:1000}]});assert.equal((await getOrder(h.env,o.id)).status,'receipt_review');assert.equal(tg.sent().some(c=>c.payload.text==='SECRET-DELIVERY'),false);
  const a=await h.api('POST',`/studio/orders/${o.id}/approve`,{});assert.equal(a.status,200,JSON.stringify(a));assert.equal(a.data.order.status,'delivered');assert.equal(tg.sent().filter(c=>c.payload.text==='SECRET-DELIVERY').length,1);
  assert.equal((await h.api('POST',`/studio/orders/${o.id}/approve`,{})).status,400);assert.equal(tg.sent().filter(c=>c.payload.text==='SECRET-DELIVERY').length,1);
});
test('forged paid callback and another user receipt submission cannot approve or access an order',async()=>{
  const p=await product();const o=await checkout(42,p);await h.msg(43,'/start');await h.cb(43,'order:receipt:'+o.id);await h.cb(42,'order:paid:'+o.id);assert.equal((await getOrder(h.env,o.id)).status,'awaiting_payment');assert.equal((await getUser(h.env,43)).flow,null);
  assert.equal((await h.api('POST',`/studio/orders/${o.id}/delivered`,{})).status,400);
});
test('receipt rejection restores stock/coupon/points once and not twice',async()=>{
  const p=await product({stock:2});await h.api('POST','/studio/coupons',{code:'SAVE20',type:'percent',value:20,maxUses:1});
  await h.settings({shop:{cardNumber:'6037991234567890'}});await h.msg(42,'/start');await saveCart(h.env,42,{items:[{id:p.id,qty:1}],coupon:'SAVE20',usePoints:false});let q=await cartQuote(h.env,42,await getSettings(h.env));const o=await createOrder(h.env,await getUser(h.env,42),await getSettings(h.env),{},'coupon-order',signature(q));assert.equal(o.total,800);let coupon=(await allEntities(h.env,'coupon'))[0];assert.equal(coupon.reserved,1);
  await releaseOrder(h.env,o,'rejected','invalid receipt');assert.equal((await getProduct(h.env,p.id)).stock,2);coupon=(await allEntities(h.env,'coupon'))[0];assert.equal(coupon.reserved,0);
  await assert.rejects(()=>releaseOrder(h.env,o,'rejected','again'),/invalid_order_transition/);assert.equal((await getProduct(h.env,p.id)).stock,2);
});
test('unpaid order expiry releases stock and keeps auditable order history',async()=>{
  const p=await product({stock:1}),o=await checkout(42,p);o.expiresAt=Date.now()-1000;await putJson(h.env,entityKey('order',o.id),o);await expireOrders(h.env);assert.equal((await getOrder(h.env,o.id)).status,'expired');assert.equal((await getProduct(h.env,p.id)).stock,1);
});
test('full private-chat cart checkout collects name, phone, physical address and delivery slot',async()=>{
  const p=await product({deliveryMode:'physical'});await h.settings({shop:{cardNumber:'6037991234567890',deliverySlots:['tomorrow','next week']}});await h.msg(42,'/start');await h.cb(42,'cart:add:'+p.id);await h.cb(42,'checkout:start');await h.msg(42,'نام گیرنده');await h.msg(42,'۰۹۱۲۱۲۳۴۵۶۷');await h.msg(42,'تهران خیابان اصلی پلاک ۱۲ کدپستی ۱۲۳۴۵۶۷۸۹۰');await h.msg(42,'1');const flow=(await getUser(h.env,42)).flow;assert.equal(flow.step,'confirm');await h.cb(42,'checkout:confirm:'+flow.checkoutId);const o=(await allEntities(h.env,'order'))[0];assert.equal(o.buyer.phone,'09121234567');assert.equal(o.buyer.slot,'tomorrow');assert.equal(o.status,'awaiting_payment');
});
test('self-referrals and repeat starts do not mint referral rewards',async()=>{
  await h.msg(42,'/start');await h.msg(43,'/start ref_42');await h.msg(43,'/start ref_42');assert.equal((await pointsAccount(h.env,42)).referrals,1);assert.equal((await pointsAccount(h.env,42)).points,10);await h.msg(44,'/start ref_44');assert.equal((await pointsAccount(h.env,44)).referrals,0);
});
test('referral rewards are held until membership succeeds',async()=>{
  await h.msg(42,'/start');await h.settings({requiredChats:{enabled:true,targets:[{chatId:'@required_channel',scope:'all',url:''}]}});tg.members.set('@required_channel:43',{status:'left'});await h.msg(43,'/start ref_42');assert.equal((await pointsAccount(h.env,42)).points,0);tg.members.set('@required_channel:43',{status:'member'});await h.cb(43,'chan:check:43');assert.equal((await pointsAccount(h.env,42)).points,10);
});
test('polls accept first-time channel voters but enforce target membership',async()=>{
  const r=await h.api('POST','/broadcast',{kind:'poll',target:'chat',chatId:'@poll_channel',poll:{question:'Q?',options:['A','B'],membersOnly:true}});const pid=r.data.job.pollId;
  tg.members.set('@poll_channel:99',{status:'left'});await h.cb(99,'poll:'+pid+':0',{message:{message_id:100,chat:{id:-1001234,type:'channel'}}});assert.equal((await getJson(h.env,K.POLL(pid))).opts[0].n,0);
  tg.members.set('@poll_channel:99',{status:'member'});await h.cb(99,'poll:'+pid+':0',{message:{message_id:100,chat:{id:-1001234,type:'channel'}}});assert.equal((await getJson(h.env,K.POLL(pid))).opts[0].n,1);
});
test('quiz awards once, does not allow changing an answer and closes at its deadline',async()=>{
  const r=await h.api('POST','/broadcast',{kind:'poll',target:'chat',chatId:-1001234,poll:{question:'2+2?',options:['3','4'],mode:'quiz',correctIndex:1,rewardPoints:5}});const pid=r.data.job.pollId;await h.cb(42,'poll:'+pid+':1');await h.cb(42,'poll:'+pid+':0');assert.equal((await pointsAccount(h.env,42)).points,5);assert.equal((await getJson(h.env,K.POLL(pid))).opts[1].n,1);
  const poll=await getJson(h.env,K.POLL(pid));poll.closesAt=Date.now()-1;await putJson(h.env,K.POLL(pid),poll);await h.cb(43,'poll:'+pid+':1');assert.equal((await getJson(h.env,K.POLL(pid))).participants,1);
});
test('multi-choice polls and reaction toggles count deterministically',async()=>{
  const r=await h.api('POST','/broadcast',{kind:'poll',target:'chat',chatId:-1001234,poll:{question:'Q?',options:['A','B'],mode:'multiple'}}),p=r.data.job.pollId;await h.cb(42,'poll:'+p+':0');await h.cb(42,'poll:'+p+':1');await h.cb(42,'poll:'+p+':0');const poll=await getJson(h.env,K.POLL(p));assert.equal(poll.participants,1);assert.deepEqual(poll.opts.map(o=>o.n),[0,1]);
});
test('duplicate webhook update IDs do not repeat relay actions',async()=>{
  await h.settings({botPurpose:'relay',relay:{enabled:true,approval:false,destinations:[{chatId:'@dest_channel',title:'dest'}]}});const update={update_id:777,message:{message_id:70,from:{id:42,first_name:'U'},chat:{id:42,type:'private'},text:'test',forward_origin:{type:'user'}}};await h.update(update,777);await h.update(update,777);assert.equal(tg.calls.filter(c=>c.method==='copyMessage').length,1);assert.equal(tg.calls.some(c=>c.method==='forwardMessage'),false);
});
test('manual relay approval chooses multiple targets and never forwardMessage',async()=>{
  await h.settings({botPurpose:'relay',relay:{enabled:true,approval:true,destinations:[{chatId:'@dest_channel',title:'dest'}]}});await h.msg(42,'hello');let entry=(await allEntities(h.env,'relay'))[0];assert.equal(entry.status,'pending');assert.equal(tg.calls.filter(c=>c.method==='copyMessage').length,0);
  const r=await h.api('POST','/studio/relay/'+entry.id+'/approve',{destinations:['@dest_channel','-1002222']});assert.equal(r.data.relay.status,'sent');assert.equal(tg.calls.filter(c=>c.method==='copyMessage').length,2);assert.equal((await h.api('POST','/studio/relay/'+entry.id+'/approve',{destinations:['@dest_channel']})).status,400);
});
test('relay album messages are collected and copied together',async()=>{
  await h.settings({botPurpose:'relay',relay:{enabled:true,approval:true,destinations:[]}});await h.msg(42,undefined,{media_group_id:'album',photo:[{file_id:'f1'}]});await h.msg(42,undefined,{media_group_id:'album',photo:[{file_id:'f2'}]});let r=(await allEntities(h.env,'relay'))[0];assert.equal(r.messageIds.length,2);assert.equal(r.attachments.length,2);r.readyAt=0;await putJson(h.env,entityKey('relay',r.id),r);await relayTick(h.env);await h.api('POST','/studio/relay/'+r.id+'/approve',{destinations:['@dest_channel']});assert.equal(tg.calls.filter(c=>c.method==='copyMessages').length,1);
});
test('scheduled broadcasts run without the browser and schedule auto-deletion/repeats',async()=>{
  const r=await h.api('POST','/broadcast',{text:'Scheduled',target:'chat',chatId:'@dest_channel',scheduledAt:Date.now()+60000,deleteAfterSec:3600,repeatEverySec:300});const id=r.data.job.id;assert.equal(tg.sent().length,0);let j=await getJson(h.env,K.BROADCAST(id));j.nextRunAt=0;await putJson(h.env,K.BROADCAST(id),j);await broadcastTick(h.env);j=await getJson(h.env,K.BROADCAST(id));assert.equal(j.status,'scheduled');assert.equal(j.cycle,1);assert.equal((await allEntities(h.env,'deletion')).length,1);assert.equal(tg.sent().filter(c=>c.payload.text==='Scheduled').length,1);
});
test('broadcast backoff honors Telegram retry_after and does not advance the cursor',async()=>{
  await h.msg(42,'/start');const r=await h.api('POST','/broadcast',{text:'Backoff',target:'all'});tg.setOverride((u,m,p)=>m==='sendMessage'&&p.text==='Backoff'?{ok:false,error_code:429,parameters:{retry_after:8}}:undefined);const j=await tickBroadcast(h.env,r.data.job.id);assert.equal(j.cursor,0);assert(j.nextRunAt>Date.now()+6000);assert.equal(j.failed,0);
});
test('uncertain network deliveries stop for review instead of blindly retrying',async()=>{
  await h.msg(42,'/start');const r=await h.api('POST','/broadcast',{text:'Uncertain',target:'all'});tg.setOverride((u,m,p)=>{if(m==='sendMessage'&&p.text==='Uncertain')throw new Error('network disconnected');});let j=await tickBroadcast(h.env,r.data.job.id);assert.equal(j.status,'needs_review');const calls=tg.calls.length;await tickBroadcast(h.env,r.data.job.id);assert.equal(tg.calls.length,calls);
});
test('moderation recognizes links, forwards, emoji, hashtags, words and media',()=>{
  const g=structuredClone(GROUP_DEFAULTS);assert.equal(violation({text:'https://bad.com'},g),'link');g.blockForwards=true;assert.equal(violation({text:'test',forward_origin:{}},g),'forward');g.words=['کلمه'];assert.equal(violation({text:'كلمه'},g),'word');g.blockedMedia=['voice'];assert.equal(violation({voice:{}},g),'media:voice');assert.equal(violation({text:'😀'.repeat(20)},g),'emoji');assert.equal(violation({text:'#x '.repeat(10)},g),'hashtag');
});
test('administrative commands cannot be executed by normal users; command text does not bypass spam rules',async()=>{
  await h.api('POST','/studio/groups',{chatId:'-1001234',title:'G',captcha:false,rulesRequired:false,penalty:'delete'});
  const groupMsg=(uid,text,extra={})=>h.update({message:{message_id:25,chat:{id:-1001234,type:'supergroup'},from:{id:uid,first_name:'U'},text,...extra}});
  await groupMsg(42,'/ban 43');assert.equal(tg.calls.some(c=>c.method==='banChatMember'),false);
  await groupMsg(42,'/rules https://spam.com');assert(tg.calls.some(c=>c.method==='deleteMessage'));
  await groupMsg(9000,'/mute 43 2h');const mute=tg.calls.find(c=>c.method==='restrictChatMember');assert.equal(mute.payload.user_id,43);assert(mute.payload.until_date>=Math.floor(Date.now()/1000)+7195);
});
test('warning threshold triggers punishment and leaves an audit log',async()=>{
  await h.api('POST','/studio/groups',{chatId:'-1001234',title:'G',warnLimit:2,penalty:'warn',warnPenalty:'mute',captcha:false});
  for(let i=0;i<2;i++)await h.update({message:{message_id:i+1,chat:{id:-1001234,type:'supergroup'},from:{id:42},text:'https://spam.com'}});
  assert.equal(tg.calls.filter(c=>c.method==='restrictChatMember').length,1);assert.equal((await getJson(h.env,entityKey('warn','-1001234:42'))).count,2);assert((await allEntities(h.env,'audit')).length>=3);
});
test('captcha is bound to the joining user and restores saved group permissions',async()=>{
  await h.api('POST','/studio/groups',{chatId:'-1001234',title:'G',captcha:true,captchaMode:'button'});await h.update({message:{message_id:1,chat:{id:-1001234,type:'supergroup'},from:{id:9000},new_chat_members:[{id:42,first_name:'New'}]}});
  const c=await getJson(h.env,entityKey('captcha','-1001234:42'));assert.equal(c.status,'pending');const data=`cap:42:${c.nonce}:ok`,message={message_id:c.messageId,chat:{id:-1001234,type:'supergroup'}};
  await h.cb(43,data,{message});assert.equal((await getJson(h.env,entityKey('captcha','-1001234:42'))).status,'pending');await h.cb(42,data,{message});assert.equal((await getJson(h.env,entityKey('captcha','-1001234:42'))).status,'passed');assert.equal(tg.calls.filter(c=>c.method==='restrictChatMember').at(-1).payload.permissions.can_send_messages,true);
});
test('captcha timeout expels unverified members; disabling group restores pending access',async()=>{
  await h.api('POST','/studio/groups',{chatId:'-1001234',title:'G',captcha:true});await h.update({message:{message_id:1,chat:{id:-1001234,type:'supergroup'},from:{id:9000},new_chat_members:[{id:42,first_name:'New'}]}});const key=entityKey('captcha','-1001234:42'),c=await getJson(h.env,key);c.expiresAt=0;await putJson(h.env,key,c);await groupTick(h.env);assert.equal((await getJson(h.env,key)).status,'expired');assert(tg.calls.some(c=>c.method==='banChatMember'));
});
test('night mode supports midnight crossings and disabling restores saved permissions',async()=>{
  const night={enabled:true,start:'23:00',end:'06:00',timezone:'UTC'};assert.equal(isNight(night,Date.parse('2026-09-07T23:30:00Z')),true);assert.equal(isNight(night,Date.parse('2026-09-07T05:30:00Z')),true);assert.equal(isNight(night,Date.parse('2026-09-07T12:30:00Z')),false);
  await h.api('POST','/studio/groups',{chatId:'-1001234',title:'G',enabled:false});let g=await getJson(h.env,entityKey('group','-1001234'));g.nightActive=true;g.normalPermissions={can_send_messages:true,can_send_photos:false};await putJson(h.env,entityKey('group',g.chatId),g);await groupTick(h.env);assert.equal((await getJson(h.env,entityKey('group',g.chatId))).nightActive,false);assert.deepEqual(tg.calls.find(c=>c.method==='setChatPermissions').payload.permissions,g.normalPermissions);
});
test('RSS/Atom parsing rejects entities and unsafe source URLs',async()=>{
  const xml='<rss><channel><item><guid>1</guid><title>Hello</title><link>https://site.org/a</link><description>World</description></item></channel></rss>';assert.equal(parseFeed(xml)[0].title,'Hello');assert.throws(()=>parseFeed('<!DOCTYPE x [<!ENTITY a "boom">]><rss/>'),/feed_entities/);
  assert.equal((await h.api('POST','/studio/feeds',{title:'bad',type:'rss',url:'http://127.0.0.1/feed',destinations:['@dest_channel']})).status,400);
});
test('first feed scan establishes a baseline, later entries are posted once',async()=>{
  const r=await h.api('POST','/studio/feeds',{title:'News',type:'rss',url:'https://site.org/feed',destinations:['@dest_channel'],intervalMinutes:5});let f=r.data.feed,n=1;
  tg.setOverride(u=>u==='https://site.org/feed'?new Response(`<rss><channel><item><guid>${n}</guid><title>Item ${n}</title><link>https://site.org/${n}</link></item></channel></rss>`):undefined);
  await feedTick(h.env);assert.equal(tg.sent().length,0);f=await getJson(h.env,entityKey('feed',f.id));f.nextAt=0;await putJson(h.env,entityKey('feed',f.id),f);n=2;await feedTick(h.env);assert.equal(tg.sent().length,1);
  f=await getJson(h.env,entityKey('feed',f.id));f.nextAt=0;await putJson(h.env,entityKey('feed',f.id),f);await feedTick(h.env);assert.equal(tg.sent().length,1);
});
test('channel auto-poster rejects repost cycles',async()=>{
  assert.equal((await h.api('POST','/studio/feeds',{title:'A',type:'channel',sourceChatId:'@channel_a',destinations:['@channel_b']})).status,200);
  assert.equal((await h.api('POST','/studio/feeds',{title:'B',type:'channel',sourceChatId:'@channel_b',destinations:['@channel_a']})).status,400);
});
test('FAQ and learning templates provide real bot interactions',async()=>{
  await h.settings({botPurpose:'faq'});const f=await h.api('POST','/studio/faq',{question:'پرسش',answer:'پاسخ واقعی'});await h.msg(42,'/start');await h.cb(42,'faq:'+f.data.faq.id);assert(tg.sent().some(c=>c.payload.text==='پاسخ واقعی'));
  await h.settings({botPurpose:'education'});const p=await product({price:0});await h.cb(42,'download:'+p.id);await h.cb(42,'learn:'+p.id);await h.cb(42,'learn:'+p.id);assert.equal((await allEntities(h.env,'progress')).length,1);
});

test('prototype names are not accepted as bot purposes',async()=>{
  for(const botPurpose of ['__proto__','constructor','toString'])assert.equal((await h.api('PUT','/settings',{botPurpose})).status,400);
  assert.equal((await getSettings(h.env)).botPurpose,'custom');
});

test('paid delivery remains gated if the buyer leaves a required chat before payment approval',async()=>{
  const p=await product();await h.settings({requiredChats:{enabled:true,targets:[{chatId:'@required_channel',scope:'all',url:''}]}});
  const o=await checkout(42,p);await h.cb(42,'order:receipt:'+o.id);await h.msg(42,undefined,{photo:[{file_id:'receipt',file_size:200}]});
  tg.members.set('@required_channel:42',{status:'left'});await h.api('POST',`/studio/orders/${o.id}/approve`,{});
  let saved=await getOrder(h.env,o.id);assert.equal(saved.status,'paid');assert.equal(saved.deliveryLocked,true);assert.equal(tg.sent().some(c=>c.payload.text==='SECRET-DELIVERY'),false);
  tg.members.set('@required_channel:42',{status:'member'});await h.cb(42,'chan:check:42');saved=await getOrder(h.env,o.id);assert.equal(saved.status,'delivered');assert.equal(tg.sent().filter(c=>c.payload.text==='SECRET-DELIVERY').length,1);
});

test('posting as an external channel cannot bypass group link filtering',async()=>{
  await h.api('POST','/studio/groups',{chatId:'-1001234',title:'G',penalty:'delete'});
  await h.update({message:{message_id:100,chat:{id:-1001234,type:'supergroup'},from:{id:136817688,is_bot:true},sender_chat:{id:-1009999,type:'channel'},text:'https://spam.com'}});
  assert(tg.calls.some(c=>c.method==='deleteMessage'&&c.payload.message_id===100));
});
