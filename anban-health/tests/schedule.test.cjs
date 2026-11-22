const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildWeek,todayISO,periodFor,createStore}=require('../dist/schedule.js');
const now=new Date('2026-11-21T04:00:00Z');
const med=(time,name='核对药甲')=>({name,time,dose:'半片',meal:'饭后',ok:true});
const card={id:'current',demo:false,meds:[med('18:30','核对药乙'),med('08:00')]};
test('Shanghai calendar starts today even when the UTC date differs',()=>{
 assert.equal(todayISO(new Date('2026-11-20T16:00:00Z')),'2026-11-21');
 assert.equal(todayISO(new Date('2026-11-20T15:59:59Z')),'2026-11-20');
 const w=buildWeek([card],now);assert.equal(w.days.length,7);
 assert.deepEqual(w.days.map(d=>d.date),Array.from({length:7},(_,i)=>'2026-11-'+(21+i)));
 assert.equal(w.days[0].weekday,'周六');assert.equal(w.days[0].label,'今天');
});
test('rolling dates cross month, year and leap day correctly',()=>{
 for(const [start,end] of [['2026-11-28','2026-12-04'],['2026-12-29','2027-01-04'],['2028-02-27','2028-03-04']]){
  const w=buildWeek([],new Date(start+'T04:00:00Z'));assert.equal(w.startDate,start);assert.equal(w.endDate,end);assert.equal(new Set(w.days.map(d=>d.date)).size,7);
 }
 assert(buildWeek([],new Date('2028-02-27T04:00:00Z')).days.some(d=>d.date==='2028-02-29'));
});
test('every date projects only the latest real daily card, preserving exact dose and meal',()=>{
 const w=buildWeek([{id:'demo',demo:true,meds:[med('12:00')]},card,{id:'old',meds:[med('12:00')]}],now);
 assert.equal(w.cardId,'current');
 for(const day of w.days){assert.deepEqual(day.slots.map(s=>s.meds.length),[1,0,1]);assert.deepEqual(day.slots[0].meds[0],{name:'核对药甲',time:'08:00',dose:'半片',meal:'饭后'});}
 assert.deepEqual(card.meds.map(m=>m.time),['18:30','08:00']);
});
test('no fabricated medicines for empty accounts, examples or unconfirmed entries',()=>{
 for(const cards of [[],[{...card,demo:true}],[{...card,meds:[{...med('08:00'),ok:false},med('25:00'),{...med('08:00'),dose:''}]}]]){
  assert(buildWeek(cards,now).days.every(d=>d.slots.every(s=>s.meds.length===0)));
 }
});
test('dayparts use clock time; meal relationship is not inferred or rewritten',()=>{
 for(const [t,p] of [['00:00','morning'],['10:59','morning'],['11:00','noon'],['16:59','noon'],['17:00','evening'],['23:59','evening'],['24:00',null],['08:60',null],['8:00',null]])assert.equal(periodFor(t),p);
 const w=buildWeek([{...card,meds:[{...med('12:30'),meal:'医嘱：不随餐'}]}],now);assert.equal(w.days[0].slots[1].meds[0].meal,'医嘱：不随餐');
});
test('selection survives a render; midnight and replacement card reset to today',()=>{
 const store=createStore();store.update([card],{now});assert.deepEqual(store.getSnapshot().selection,{date:'2026-11-21',period:null});
 assert(store.select('2026-11-23','evening'));assert.equal(store.update([card],{now}),false);assert.equal(store.getSnapshot().selection.date,'2026-11-23');
 assert.equal(store.select('2026-12-01','morning'),false);assert.equal(store.select('2026-11-21','bad'),false);
 store.update([card],{now:new Date('2026-11-21T16:00:00Z')});assert.deepEqual(store.getSnapshot().selection,{date:'2026-11-22',period:null});
 store.select('2026-11-23');store.update([{...card,id:'replacement'}],{now});assert.equal(store.getSnapshot().selection.date,'2026-11-21');
});
test('loading and logout clear medicines and notify both renderers',()=>{
 const store=createStore(),calls=[];const off=store.subscribe(s=>calls.push(s));
 store.update([card],{now});store.select('2026-11-24','evening');store.update([],{now,ready:false});
 assert.equal(calls.length,4);assert.equal(store.getSnapshot().ready,false);assert.equal(store.getSnapshot().week.cardId,null);
 assert(store.getSnapshot().week.days.every(d=>d.slots.every(s=>s.meds.length===0)));off();store.update([card],{now});assert.equal(calls.length,4);
});
