(function(root){
  'use strict';
  // Display projection only: preserve confirmed times/doses; never infer a prescription.
  const timeZone='Asia/Shanghai';
  const periods=[{id:'morning',label:'早'},{id:'noon',label:'中'},{id:'evening',label:'晚'}];
  function todayISO(now=new Date()){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const get=type=>parts.find(p=>p.type===type).value;
    return get('year')+'-'+get('month')+'-'+get('day');
  }
  function periodFor(time){
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return null;
    const hour=Number(time.slice(0,2));return hour<11?'morning':hour<17?'noon':'evening';
  }
  function buildWeek(cards=[],now=new Date()){
    const startDate=todayISO(now),card=cards.find(c=>!c.demo)||null;
    const meds=(card?.meds||[]).filter(m=>m.name?.trim()&&m.dose?.trim()&&m.ok!==false&&periodFor(m.time))
      .map(m=>({name:m.name,dose:m.dose,time:m.time,meal:m.meal||''})).sort((a,b)=>a.time.localeCompare(b.time));
    const days=Array.from({length:7},(_,i)=>{
      const date=new Date(startDate+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+i);
      const iso=date.toISOString().slice(0,10),weekday='周'+['日','一','二','三','四','五','六'][date.getUTCDay()];
      const shortDate=(date.getUTCMonth()+1)+'/'+date.getUTCDate();
      return {date:iso,weekday,shortDate,label:i===0?'今天':weekday,fullLabel:(date.getUTCMonth()+1)+'月'+date.getUTCDate()+'日 '+weekday,
        slots:periods.map(p=>({...p,meds:meds.filter(m=>periodFor(m.time)===p.id)}))};
    });
    return {startDate,endDate:days[6].date,cardId:card?.id||null,days};
  }
  function createStore(){
    let week=buildWeek(),ready=false,selection={date:week.startDate,period:null};
    const listeners=new Set(),snapshot=()=>({week,ready,selection});
    const emit=()=>listeners.forEach(fn=>fn(snapshot()));
    return {getSnapshot:snapshot,subscribe(fn){listeners.add(fn);fn(snapshot());return()=>listeners.delete(fn);},
      update(cards,options={}){
        const next=buildWeek(cards,options.now),nextReady=options.ready??true;
        if(JSON.stringify(next)===JSON.stringify(week)&&nextReady===ready)return false;
        if(next.startDate!==week.startDate||next.cardId!==week.cardId)selection={date:next.startDate,period:null};
        week=next;ready=nextReady;emit();return true;
      },
      select(date,period=null){
        if(!week.days.some(d=>d.date===date)||(period!==null&&!periods.some(p=>p.id===period)))return false;
        if(date===selection.date&&period===selection.period)return true;
        selection={date,period};emit();return true;
      }
    };
  }
  const api={timeZone,periods,todayISO,periodFor,buildWeek,createStore,...createStore()};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AnbanSchedule=api;
})(globalThis);
