(() => {
  const schedule=window.AnbanSchedule, panel=document.getElementById('organizerDay');
  const body=document.getElementById('organizerDayBody'),actions=document.getElementById('organizerDayActions');
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let opened=false,lastKey='',returnFocus=null,closeTimer;
  function render({week,selection,ready}) {
    const day=week.days.find(d=>d.date===selection.date);if(!day)return;
    document.getElementById('organizerDayDate').textContent=day.fullLabel;
    document.getElementById('organizerDayTitle').textContent=day.label+'的用药';
    document.getElementById('previousOrganizerDay').disabled=day.date===week.days[0].date;
    document.getElementById('nextOrganizerDay').disabled=day.date===week.days[6].date;
    const key=JSON.stringify([day,selection.period,ready,week.cardId]);if(key===lastKey)return;lastKey=key;
    const scroll=body.scrollTop;
    body.innerHTML=!ready?'<p role="status">正在读取用药…</p>':day.slots.map((slot,i)=>
      '<section class="organizer-period" data-period="'+slot.id+'" data-selected="'+(slot.id===selection.period)+'">'+
      '<h3><span class="period-sun" aria-hidden="true">'+['☀','◐','☾'][i]+'</span>'+['早晨','中午','晚上'][i]+'</h3><div class="organizer-period-content">'+
      (slot.meds.length?slot.meds.map(m=>'<article class="organizer-medicine"><div class="organizer-dose-line"><time>'+escape(m.time)+'</time><strong>'+escape(/^[\d零一二两三四五六七八九十半.\/]+$/.test(m.dose.normalize('NFKC').trim())?'用量单位待核对':'每次 '+m.dose)+'</strong></div><h4>'+escape(m.name)+'</h4>'+
      (m.regimen?'<p class="organizer-meal">'+escape(window.AnbanRegimen.label(m))+'</p>':'')+
      (m.meal?'<p class="organizer-meal">'+escape(m.meal)+'</p>':'')+
      (m.food_notes?'<p class="organizer-notice"><b>须知</b>'+escape(m.food_notes)+'</p>':'')+'</article>').join(''):
      '<p class="organizer-empty">'+(week.cardId?'这个时段未安排用药':'未登记用药')+'</p>')+'</div></section>').join('');
    actions.innerHTML=!ready?'':week.cardId?'<button type="button" id="readOrganizerDay">朗读全天</button><button type="button" data-a="open-'+escape(week.cardId)+'">完整用药卡</button>':'<button type="button" class="primary" data-a="scene-card">登记我的药品</button>';
    document.getElementById('readOrganizerDay')?.addEventListener('click',()=>window.dispatchEvent(new Event('anban:read-day')));
    body.scrollTop=scroll;
  }
  function open() {
    const first=!opened;clearTimeout(closeTimer);opened=true;
    if(first)returnFocus=document.activeElement;
    render(schedule.getSnapshot());panel.inert=false;panel.setAttribute('aria-hidden','false');
    if(!panel.open)panel.showModal();
    panel.getBoundingClientRect();
    document.body.classList.add('day-expanded','scene-focused');
    window.dispatchEvent(new CustomEvent('anban:day-panel',{detail:{open:true}}));
    body.scrollTop=0;document.getElementById('world').scrollTop=0;
    if(first)document.getElementById('organizerDayTitle').focus({preventScroll:true});
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
      body.getAnimations().forEach(a=>a.cancel());body.animate([{opacity:.3,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:360,easing:'ease-out'});
    }
  }
  function close(restore=true){
    if(!opened)return;opened=false;panel.inert=true;panel.setAttribute('aria-hidden','true');
    document.body.classList.remove('day-expanded','scene-focused');document.getElementById('world').scrollTop=0;
    window.dispatchEvent(new CustomEvent('anban:day-panel',{detail:{open:false}}));
    window.dispatchEvent(new Event('anban:stop-day-voice'));
    const finish=()=>{
      if(opened)return;panel.close();
      if(restore)(returnFocus?.isConnected?returnFocus:document.getElementById('homeButton')).focus({preventScroll:true});
    };
    clearTimeout(closeTimer);
    if(restore&&!matchMedia('(prefers-reduced-motion: reduce)').matches)closeTimer=setTimeout(finish,280);else finish();
  }
  document.getElementById('closeOrganizerDay').onclick=()=>close();
  panel.addEventListener('cancel',e=>{e.preventDefault();close();});
  const outside=e=>{const r=panel.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
  let backdropDown=false;
  panel.addEventListener('pointerdown',e=>{backdropDown=e.target===panel&&outside(e);});
  panel.addEventListener('pointerup',e=>{if(backdropDown&&e.target===panel&&outside(e))close();backdropDown=false;});
  for(const [id,step] of [['previousOrganizerDay',-1],['nextOrganizerDay',1]])document.getElementById(id).onclick=()=>{
    const {week,selection}=schedule.getSnapshot(),index=week.days.findIndex(d=>d.date===selection.date),day=week.days[index+step];
    if(day){schedule.select(day.date);body.scrollTop=0;window.dispatchEvent(new Event('anban:stop-day-voice'));}
  };
  document.getElementById('resetView').addEventListener('click',()=>close(false));
  document.getElementById('homeButton').addEventListener('click',()=>close(false));
  window.addEventListener('anban:workspace',e=>{if(e.detail.open)close(false);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.getElementById('modal').open)close();});
  schedule.subscribe(render);window.AnbanDayPanel={open,close};
})();
