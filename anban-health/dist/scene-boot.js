const colors=['#d6e7c9','#d9e6f1','#f2d5ce','#f4e9b9','#d5e8d9','#cbdfee','#ead4d8'];
const schedule=window.AnbanSchedule,picker=document.getElementById('weekPicker');
const primary=document.querySelector('.hero-action'),fallbackEl=document.getElementById('sceneFallback');
let fallbackActive=false,lastDates='';
document.getElementById('medicineNoteAccess').onclick=()=>window.dispatchEvent(new Event('anban:open-medicine-note'));
// Date controls and the accessible fallback use the same selection as the 3D scene.
function openDay(){
  const {selection}=schedule.getSnapshot();
  window.dispatchEvent(new CustomEvent('anban:open-day',{detail:{...selection}}));
}
function render({week,selection,ready}){
  if(lastDates!==week.startDate){
    picker.innerHTML=week.days.map((d,i)=>`<button type="button" data-day="${i}" aria-label="${d.fullLabel}${i===0?'，今天':''}"><span>${d.label}</span><time datetime="${d.date}">${d.shortDate}</time></button>`).join('');
    lastDates=week.startDate;
  }
  const selected=week.days.find(d=>d.date===selection.date);
  picker.querySelectorAll('button').forEach((b,i)=>{b.setAttribute('aria-pressed',String(week.days[i].date===selection.date));if(i===0)b.setAttribute('aria-current','date');});
  document.getElementById('selectionLabel').textContent=selected.shortDate+' · '+selected.label+(selection.period?' · '+schedule.periods.find(p=>p.id===selection.period).label:'');
  primary.textContent=ready?'查看'+selected.label+'用药':'正在读取用药';primary.disabled=!ready;
  primary.removeAttribute('data-a');
  if(fallbackActive){
    fallbackEl.innerHTML=week.days.map((d,i)=>`<div class="fallback-day" style="--tint:${colors[i]}" data-selected="${d.date===selection.date}">${d.slots.map(s=>`<button class="fallback-cell" aria-label="${d.fullLabel}，${s.label}，${s.meds.length?'已登记'+s.meds.length+'种药':'未登记用药'}" data-fallback-day="${i}" data-period="${s.id}"><span>${s.label}</span><span>${s.meds.length?s.meds.length+'种':'空'}</span></button>`).join('')}</div>`).join('');
  }
}
schedule.subscribe(render);
picker.addEventListener('click',e=>{const b=e.target.closest('[data-day]');if(b){schedule.select(schedule.getSnapshot().week.days[+b.dataset.day].date);openDay();}});
primary.addEventListener('click',openDay);
fallbackEl.addEventListener('click',e=>{const b=e.target.closest('[data-fallback-day]');if(!b)return;schedule.select(schedule.getSnapshot().week.days[+b.dataset.fallbackDay].date,b.dataset.period);openDay();});
function fallback(){
  const note=document.getElementById('medicineNoteAccess');note.hidden=false;note.classList.add('is-fallback');
  fallbackActive=true;render(schedule.getSnapshot());
  fallbackEl.hidden=false;document.getElementById('sceneLoading').hidden=true;
  document.getElementById('scene').hidden=true;
  document.getElementById('lidToggle').hidden=true;
  document.getElementById('resetView').hidden=true;
}
window.addEventListener('anban:gl-lost',fallback,{once:true});
try{const scene=await import('./scene.js?v=sticky-pills-6');await scene.initScene();}catch(error){console.warn('3D view unavailable; using accessible organizer.',error);fallback();}
