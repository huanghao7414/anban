(function(root){
 'use strict';
 const clean=value=>typeof value==='string'?value.trim():'';
 const validTime=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t||'');
 function inventory(cards=[],draft=null){
  const entries=[],seen=new Set(),card=cards.find(c=>!c.demo);
  const add=(name,status)=>{name=clean(name);const id=name.normalize('NFKC').toLowerCase();if(name&&!seen.has(id)){seen.add(id);entries.push({name,status});}};
  for(const med of card?.meds||[])if(med.ok!==false&&clean(med.dose)&&validTime(med.time))add(med.name,'confirmed');
  if(draft&&!draft.demo)for(const med of draft.meds||[])add(clean(med.name)||med.recognition?.fields?.name,med.ok===true?'reviewed':'pending');
  return entries;
 }
 function appearance(med){
  const name=clean(med.name),dose=clean(med.dose).normalize('NFKC').replace(/\s/g,'');
  if(/注射|滴眼|滴耳|外用|软膏|乳膏|口服液|糖浆|颗粒/.test(name))return null;
  const match=dose.match(/^(?:每次|一次)?(半|一|二|两|三|四|五|六|七|八|九|十|\d+(?:\.\d+)?)(片|粒|丸)$/);
  if(!match)return null;
  const numbers={半:.5,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
  const quantity=numbers[match[1]]??Number(match[1]);if(!(quantity>0&&quantity<=100))return null;
  const unit=match[2],type=unit==='片'?'tablet':unit==='丸'?'round':/胶囊/.test(name)?'capsule':'oval';
  if(!Number.isInteger(quantity)&&(type!=='tablet'||quantity%1!==.5))return null;
  return {name,quantity,type};
 }
 function pills(meds=[],limit=9){
  limit=Math.max(0,Math.min(9,Math.floor(limit)||0));const items=[];let total=0,unrepresented=0;
  for(const med of meds){
   const item=appearance(med);if(!item){unrepresented++;continue;}
   const full=Math.floor(item.quantity),count=Math.ceil(item.quantity);total+=count;
   for(let i=0;i<count&&items.length<limit;i++)items.push({name:item.name,type:i<full?item.type:'half-tablet'});
  }
  return {items,total,overflow:Math.max(0,total-items.length),unrepresented};
 }
 const api={inventory,appearance,pills};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.AnbanVisuals=api;
})(globalThis);
