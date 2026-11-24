'use strict';
window.AnbanAPI=(()=>{
 const enabled=window.ANBAN_BACKEND===true;
 let csrf='',conversationId='',account=null,health=null,reminders=[];
 const versions=new Map();let timer,pending=null,chain=Promise.resolve();
 async function raw(path,method='GET',body){
   const options={method,credentials:'same-origin',headers:{}};
   if(method!=='GET'){options.headers={'Content-Type':'application/json','X-CSRF-Token':csrf};options.body=JSON.stringify(body??{});}
   const response=await fetch('/api/v1'+path,options);
   const type=response.headers.get('content-type')||'';
   const data=type.includes('application/json')?await response.json():await response.blob();
   if(!response.ok)throw new Error(data?.error?.message||'服务暂时不可用，请稍后重试。');
   return data;
 }
 async function bootstrap(){
   const session=await raw('/session','POST',{});csrf=session.csrf;account=session.account;
   const [p,c,d,chat,h,r]=await Promise.all([raw('/profile'),raw('/cards'),raw('/drafts'),raw('/conversation'),raw('/health'),raw('/reminders')]);
   conversationId=chat.id;health=h;reminders=r.items;
   const draft=d.items[0]||null;if(draft)versions.set(draft.id,draft.revision);
   return {profile:p,cards:c.items,draft,messages:chat.messages,reportResult:null,pdfDocuments:{},remoteCatalog:[],scene:'home',activeId:'',query:'',note:'',reminder:r.items.some(x=>x.enabled)?r.items.find(x=>x.enabled).card_id:null};
 }
 const ready=enabled?bootstrap():Promise.resolve(null);
 // Keep the rejection available to the UI while avoiding an unhandled promise before app.js loads.
 ready.catch(()=>{});
 const fields=d=>({phase:d.phase,index:d.index,meds:d.meds.map(m=>({id:m.id,name:m.name||'',dose:m.dose||'',time:m.time||'',meal:m.meal||'',extra_doses:m.extra_doses||[],food_notes:m.food_notes||'',ok:!!m.ok}))});
 function queueDraft(d){if(!enabled||!d?.id)return;pending={id:d.id,data:fields(d)};clearTimeout(timer);timer=setTimeout(()=>flushDraft().catch(e=>window.dispatchEvent(new CustomEvent('anban:api-error',{detail:e.message}))),700);}
 function flushDraft(d){
   if(d?.id)pending={id:d.id,data:fields(d)};
   clearTimeout(timer);const snapshot=pending;pending=null;
   if(!snapshot)return chain;
   chain=chain.catch(()=>{}).then(async()=>{const result=await raw('/drafts/'+snapshot.id,'PUT',{...snapshot.data,revision:versions.get(snapshot.id)});versions.set(result.id,result.revision);return result;});
   return chain;
 }
 return {enabled,ready,raw,get account(){return account;},get health(){return health;},get reminders(){return reminders;},queueDraft,flushDraft,
   async chat(text,scene='chat'){await ready;return raw('/conversations/'+conversationId+'/messages','POST',{text,scene,request_id:crypto.randomUUID()});},
   async createDraft(demo=false){await flushDraft();const d=await raw('/drafts','POST',{demo});versions.set(d.id,d.revision);return d;},
   async photo(data_url,kind='medicine'){return raw('/uploads','POST',{data_url,kind});},
   async attach(draft,upload,medicationId){await flushDraft();const query=medicationId?'?medication_id='+encodeURIComponent(medicationId):'';const d=await raw('/drafts/'+draft.id+'/uploads/'+upload.id+query,'POST',{});versions.set(d.id,d.revision);return d;},
   async attachDocument(draft,documentId){await flushDraft();const d=await raw('/drafts/'+draft.id+'/documents/'+documentId,'POST',{});versions.set(d.id,d.revision);return d;},
   async generate(draft,cycle){await flushDraft(draft);return raw('/cards','POST',{draft_id:draft.id,revision:versions.get(draft.id),...cycle});},
   async setReminders(card,times){const r=await raw('/reminders','POST',{card_id:card.id,times,timezone:'Asia/Shanghai'});reminders=r.items;return r;},
   async toggleReminder(id,enabled){await raw('/reminders/'+id,'PATCH',{enabled});reminders=(await raw('/reminders')).items;},
   async auth(mode,data={}){await flushDraft();clearTimeout(timer);pending=null;const r=await raw('/auth/'+mode,'POST',data);csrf=r.csrf;account=r.account;conversationId='';reminders=[];versions.clear();window.dispatchEvent(new Event('anban:account-changed'));return bootstrap();},
 };
})();
