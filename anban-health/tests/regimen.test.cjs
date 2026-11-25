const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildWeek}=require('../dist/schedule.js');
const {activeOn,validate,blank,label,nextOccurrence,recurrenceRule}=require('../dist/regimen.js');
const r=(patch={})=>({frequency:'daily',course:'fixed',start_date:'2026-11-25',end_date:'2026-11-29',interval_days:2,weekdays:[],...patch});
const med=(name,regimen,time='08:00')=>({name,regimen,time,dose:'1片'});
test('each medicine has its own inclusive course and recurrence across the month boundary',()=>{
 const card={id:'a',meds:[med('短疗程',r({end_date:'2026-11-26'})),med('隔日药',r({frequency:'interval',end_date:'2026-12-01'})),med('周一周五',r({frequency:'weekly',weekdays:[1,5],course:'long_term',end_date:null}))]};
 const week=buildWeek([card],new Date('2026-11-25T00:00:00Z'));
 assert.deepEqual(week.days.map(d=>d.slots[0].meds.map(m=>m.name)),[['短疗程','隔日药'],['短疗程'],['隔日药','周一周五'],[],['隔日药'],['周一周五'],['隔日药']]);
 assert.equal(week.days[0].slots[0].meds[0].regimen.end_date,'2026-11-26');
});
test('unconfirmed schedules stay out of the pillbox; existing cards retain their original date bounds',()=>{
 assert(validate(blank()));assert(!activeOn(med('待核对',blank()),'2026-11-25'));
 assert.equal(activeOn({name:'旧药'},'2026-11-25',{start_date:'2026-11-26'}),false);
 assert.equal(activeOn(med('甲',r()),'2026-11-30'),false);
 assert(validate(r({frequency:'weekly'})));assert(validate(r({end_date:null})));assert(validate(r({end_date:'2026-11-24'})));
 assert.equal(validate(r({course:'long_term',end_date:null})), '');
 assert.match(label({...med('甲',r()),daily_count:4}),/4 次/);
});

test('offline calendar uses the same finite interval and weekly recurrence',()=>{
 const m=med('甲',r({frequency:'interval'}));
 assert.equal(nextOccurrence(m,{},'08:00',new Date('2026-11-25T01:00:00Z')),'20261127T080000');
 assert.equal(nextOccurrence(m,{},'08:00',new Date('2026-11-30T01:00:00Z')),null);
 assert.equal(recurrenceRule(m),'FREQ=DAILY;INTERVAL=2;UNTIL=20261129T155959Z');
 assert.equal(recurrenceRule(med('乙',r({frequency:'weekly',weekdays:[1,5],course:'long_term',end_date:null}))),'FREQ=WEEKLY;BYDAY=MO,FR');
});
