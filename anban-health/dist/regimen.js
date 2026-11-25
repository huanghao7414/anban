(function(root){
 'use strict';
 const blank=()=>({frequency:'unknown',interval_days:2,weekdays:[],course:'unknown',start_date:null,end_date:null});
 function validate(r){
  if(!r||!['daily','interval','weekly'].includes(r.frequency))return '请先核对这盒药的服用频率。';
  if(!['fixed','long_term'].includes(r.course)||!r.start_date)return '请核对这盒药的开始日期和使用期限。';
  if(r.course==='fixed'&&!r.end_date)return '请填写这盒药的结束日期。';
  if(r.end_date&&r.end_date<r.start_date)return '结束日期不能早于开始日期。';
  if(r.frequency==='interval'&&(!Number.isInteger(r.interval_days)||r.interval_days<2||r.interval_days>30))return '请填写每隔几天服用，范围为 2 至 30 天。';
  if(r.frequency==='weekly'&&!r.weekdays?.length)return '请选择每周服用的星期。';
  return '';
 }
 function activeOn(m,day,card={}){
  const r=m.regimen||{};
  if([r.start_date,card.start_date].some(d=>d&&day<d)||[r.end_date,card.end_date].some(d=>d&&day>d))return false;
  if(!m.regimen)return true;
  if(r.frequency==='interval')return !!r.start_date&&Math.round((Date.parse(day+'T00:00:00Z')-Date.parse(r.start_date+'T00:00:00Z'))/86400000)%r.interval_days===0;
  if(r.frequency==='weekly')return r.weekdays.includes(new Date(day+'T00:00:00Z').getUTCDay()||7);
  return r.frequency==='daily';
 }
 function label(m){
  const r=m.regimen;if(!r)return '';
  const frequency=r.frequency==='daily'?'每天':r.frequency==='interval'?'每 '+r.interval_days+' 天':r.frequency==='weekly'?'每周'+r.weekdays.map(d=>'一二三四五六日'[d-1]).join('、'):'频率待核对';
  const count=m.daily_count||1+(m.extra_doses?.length||0);
  return frequency+' · 服用日 '+count+' 次 · '+(r.end_date?r.start_date+' 至 '+r.end_date:(r.start_date||'')+' 起长期服用');
 }

 function nextOccurrence(m,card,at,now=new Date()){
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const start=[day,m.regimen?.start_date,card.start_date].filter(Boolean).sort().at(-1);
  for(let i=0;i<32;i++){
   const d=new Date(start+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);const date=d.toISOString().slice(0,10),when=new Date(date+'T'+at+':00+08:00');
   if(when>now&&activeOn(m,date,card))return date.replaceAll('-','')+'T'+at.replace(':','')+'00';
  }
  return null;
 }
 function recurrenceRule(m,card={}){
  const r=m.regimen||{};let rule=r.frequency==='weekly'?'FREQ=WEEKLY;BYDAY='+r.weekdays.map(d=>['MO','TU','WE','TH','FR','SA','SU'][d-1]).join(','):'FREQ=DAILY';
  if(r.frequency==='interval')rule+=';INTERVAL='+r.interval_days;
  const end=[r.end_date,card.end_date].filter(Boolean).sort()[0];
  if(end)rule+=';UNTIL='+new Date(end+'T23:59:59+08:00').toISOString().replace(/[-:]/g,'').replace('.000','');
  return rule;
 }
 const api={blank,validate,activeOn,label,nextOccurrence,recurrenceRule};if(typeof module==='object'&&module.exports)module.exports=api;else root.AnbanRegimen=api;
})(globalThis);
