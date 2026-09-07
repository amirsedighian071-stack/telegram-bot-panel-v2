import worker from '../src/index.js';
import { getSettings, saveSettings } from '../src/kv.js';
export class MemoryKV {
  constructor() { this.store = new Map(); this.failBatch = false; }
  async get(k) { const r = this.store.get(k); return !r || (r.expires && r.expires <= Date.now()) ? null : r.value; }
  async put(k, value, options = {}) { this.store.set(k, { value, metadata: options.metadata, expires: options.expirationTtl ? Date.now() + options.expirationTtl*1000 : null }); }
  async delete(k) { this.store.delete(k); }
  async batch(writes) { if (this.failBatch) throw new Error('simulated_transaction_failure'); for (const w of writes) await this.put(w.key,w.value,{metadata:w.metadata,expirationTtl:w.ttl}); }
  async list({ prefix='', cursor, limit=1000 } = {}) {
    const keys = [...this.store.keys()].filter(k=>k.startsWith(prefix) && (!this.store.get(k).expires || this.store.get(k).expires>Date.now())).sort();
    const start=Number(cursor||0), slice=keys.slice(start,start+limit), complete=start+slice.length>=keys.length;
    return { keys:slice.map(name=>({name,metadata:this.store.get(name).metadata})),list_complete:complete,cursor:complete?undefined:String(start+slice.length) };
  }
}
export function telegramMock() {
  const calls=[], members=new Map(); let nextMessage=100, override=null;
  const fetcher=async (url,options={})=>{
    const u=String(url), method=u.split('/').at(-1);
    let payload=options.body instanceof FormData ? Object.fromEntries(options.body) : options.body ? JSON.parse(options.body) : {};
    calls.push({url:u,method,payload});
    if(override){const r=await override(u,method,payload);if(r!==undefined)return r instanceof Response?r:Response.json(r);}
    if(u.includes('/file/bot'))return new Response(new Uint8Array([0xff,0xd8,0xff]),{headers:{'content-type':'image/jpeg'}});
    if(!u.startsWith('https://api.telegram.org/'))throw new Error('Unexpected network call: '+u);
    if(method==='getMe')return Response.json({ok:true,result:{id:123,is_bot:true,username:'demo_bot'}});
    if(method==='getChatMember'){
      const m=members.get(`${payload.chat_id}:${payload.user_id}`) || {status:'member'};
      return Response.json(m.ok===false?m:{ok:true,result:m});
    }
    if(method==='getChatAdministrators')return Response.json({ok:true,result:[{user:{id:9000},status:'creator'},{user:{id:123,is_bot:true},status:'administrator'}]});
    if(method==='getChat')return Response.json({ok:true,result:{type:'supergroup',id:Number(payload.chat_id),permissions:{can_send_messages:true,can_send_photos:true}}});
    if(method==='getFile')return Response.json({ok:true,result:{file_path:'photos/test.jpg',file_size:3}});
    const result={message_id:nextMessage++,chat:{id:payload.chat_id}};
    const kind={sendPhoto:'photo',sendDocument:'document',sendVideo:'video',sendAnimation:'animation',sendAudio:'audio'}[method];
    if(kind)result[kind]=kind==='photo'?[{file_id:'file-photo-'+result.message_id,file_size:100}]:{file_id:'file-'+kind+'-'+result.message_id};
    if(method==='copyMessages')return Response.json({ok:true,result:payload.message_ids.map(message_id=>({message_id:nextMessage++}))});
    return Response.json({ok:true,result});
  };
  return {calls,members,fetcher,setOverride(fn){override=fn;},clear(){calls.length=0;},sent(){return calls.filter(c=>c.method.startsWith('send')||c.method.startsWith('copy'));}};
}
export async function setup() {
  const env={BOT_KV:new MemoryKV(),TEST_MODE:true,WEBHOOK_SECRET:'test-webhook-secret',BOT_TOKEN:'123:TEST_TOKEN',APP_VERSION:'2.0.0'};
  const ctx={waitUntil(p){return p;}};
  let updateId=1;
  const raw=async(method,path,{body,token,headers={}}={})=>{
    const h={...headers};if(token)h.authorization='Bearer '+token;
    const form=body instanceof FormData;if(!form)h['content-type']='application/json';
    return worker.fetch(new Request('https://panel.example.com'+path,{method,headers:h,body:body===undefined?undefined:form?body:JSON.stringify(body)}),env,ctx);
  };
  const login=await raw('POST','/api/auth/login',{body:{password:'botpanel123'}}), token=(await login.json()).data.token;
  const api=async(method,path,body)=>{const r=await raw(method,'/api'+path,{body,token});return {status:r.status,...await r.json()};};
  const update=async(data,uid)=>{const r=await raw('POST','/telegram/webhook',{body:{update_id:uid??updateId++,...data},headers:{'x-telegram-bot-api-secret-token':env.WEBHOOK_SECRET}});if(r.status!==200)throw new Error('Webhook status '+r.status);return r.json();};
  const msg=(user,text,extra={})=>update({message:{message_id:updateId,from:{id:user,first_name:'User '+user},chat:{id:user,type:'private'},...(text===undefined?{}:{text}),...extra}});
  const cb=(user,data,extra={})=>update({callback_query:{id:'cb-'+updateId,from:{id:user,first_name:'User '+user},message:{message_id:10,chat:{id:user,type:'private'}},data,...extra}});
  const settings=async body=>{const s=await getSettings(env);const {patchV2Settings}=await import('../src/config.js');patchV2Settings(s,body);await saveSettings(env,s);return s;};
  return {env,token,raw,api,update,msg,cb,settings};
}
