const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inventory,appearance,pills}=require('../dist/organizer-visuals.js');
const {createStore}=require('../dist/schedule.js');
const med=(name,dose='1片',time='08:00')=>({name,dose,time});
test('inventory uses latest real card, deduplicates daily doses and marks draft names',()=>{
 const cards=[{demo:true,meds:[med('示例')]},{id:'new',meds:[med('甲片'),med('甲片','1片','18:00')]},{id:'old',meds:[med('旧药')]}];
 const draft={meds:[{name:'甲片',ok:false},{name:'乙胶囊',ok:false},{recognition:{fields:{name:'丙片'}},ok:true}]};
 assert.deepEqual(inventory(cards,draft),[{name:'甲片',status:'confirmed'},{name:'乙胶囊',status:'pending'},{name:'丙片',status:'reviewed'}]);
 assert.deepEqual(inventory([],{demo:true,meds:[med('示例')]}),[]);
 assert.deepEqual(inventory([{meds:[{...med('未确认'),ok:false},med('错时间','1片','99:00')]}]),[]);
});
test('draft updates notify 3D without inventing any scheduled pills, removal and logout clear notes',()=>{
 const store=createStore(),seen=[];store.subscribe(s=>seen.push(s.inventory));
 const draft={meds:[{name:'待核对甲片'}]};store.update([],{draft});
 assert.equal(store.getSnapshot().inventory[0].status,'pending');
 assert(store.getSnapshot().week.days.every(d=>d.slots.every(s=>s.meds.length===0)));
 assert.equal(store.update([],{draft}),false);
 store.update([],{draft:{meds:[]}});assert.deepEqual(store.getSnapshot().inventory,[]);
 store.update([{id:'a',meds:[med('甲片')]}]);
 store.update([{id:'a',meds:[med('甲片')]}],{ready:false,draft});
 assert.deepEqual(store.getSnapshot().inventory,[]);assert.equal(store.getSnapshot().week.cardId,null);
 assert(seen.length>=5);
});
test('explicit tablet, half-tablet, capsule and pill units produce deterministic visual tokens',()=>{
 assert.deepEqual(pills([med('甲片','2片'),med('乙胶囊','1粒'),med('丙片','半片')]).items.map(p=>p.type),['tablet','tablet','capsule','half-tablet']);
 assert.equal(appearance(med('甲片','1.5片')).quantity,1.5);
 assert.equal(pills([med('甲片','1.5片')]).items[1].type,'half-tablet');
 assert.equal(appearance(med('普通药','１粒')).type,'oval');
 assert.equal(appearance(med('普通药','二丸')).type,'round');
});
test('ambiguous and non-solid dosages never become invented pill counts',()=>{
 for(const [name,dose] of [['甲片','1~2片'],['甲片','四分之一片'],['甲片','1/4片'],['乙胶囊','半粒'],['药','5mL'],['口服液','1片'],['注射液','1粒'],['甲片','0片'],['甲片','999片']])assert.equal(appearance(med(name,dose)),null);
 const result=pills([med('口服液','5mL')]);assert.equal(result.items.length,0);assert.equal(result.unrepresented,1);
});
test('visible population has a fixed capacity and does not rewrite confirmed dose',()=>{
 const source=[med('甲片','12片')],result=pills(source);
 assert.equal(result.items.length,9);assert.equal(result.total,12);assert.equal(result.overflow,3);assert.equal(source[0].dose,'12片');
 assert.equal(pills(source,0).items.length,0);assert.equal(pills(source,50).items.length,9);
});
