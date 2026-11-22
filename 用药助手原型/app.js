"use strict";
const $ = id => document.getElementById(id);
const icons = {
  camera:'<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="3.5"/>',
  photo:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m4 18 6-6 3 3 3-5 5 6"/>',
  chat:'<path d="M4 4h16v13H9l-5 4z"/><path d="M8 9h8m-8 4h5"/>',
  bell:'<path d="M4 17h16l-2-4V9a6 6 0 0 0-12 0v4zM10 20q2 3 4 0"/>'
};
for (const n of document.querySelectorAll('[data-icon]')) n.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+icons[n.dataset.icon]+'</svg>';
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function btn(label, fn, cls) {
  const n = el('button', label, cls);
  n.onclick = fn;
  return n;
}
function buttons(...items) {
  const n = el('div', undefined, 'buttons');
  n.append(...items);
  return n;
}
const pad = n => String(n).padStart(2,'0');
const day = (d = new Date()) => [d.getFullYear(), pad(d.getMonth()+1), pad(d.getDate())].join('-');
const hour = d => pad(d.getHours())+':'+pad(d.getMinutes());
const dateText = () => new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date());
let data = {meds:[], logs:{}, fired:{}, enabled:false, name:'', pending:null};
const key = 'anxin-med-prototype-v1';
let storageError = '';
try { Object.assign(data,JSON.parse(localStorage.getItem(key) || '{}')); }
catch {storageError = '本机记录无法读取。';}
let timer;
function notice(msg) {
  clearTimeout(timer);
  const n = $('notice');
  ($('dlg').open ? $('dlg') : document.body).append(n);
  n.textContent = msg;
  n.hidden = false;
  timer = setTimeout(()=>n.hidden=true,5000);
}
function save() {
  try {localStorage.setItem(key,JSON.stringify(data));}
  catch {notice('本机无法保存，关闭后记录会丢失。');}
}
function speak(words) {
  if (!window.speechSynthesis) {notice('这台设备暂时无法朗读。');return;}
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(words);
  u.lang = 'zh-CN'; u.rate = .85;
  u.onerror = e => {if (!['interrupted','canceled'].includes(e.error)) notice('朗读失败，请检查设备的中文语音。');};
  speechSynthesis.speak(u);
}
const dialog = $('dlg'), content = $('content');
let photoUrl = '', recognition;
function screen(title,...nodes) {
  if (recognition) {recognition.abort();recognition=null;}
  window.speechSynthesis?.cancel();
  $('dlgTitle').textContent=title;
  content.replaceChildren(...nodes);
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop=0;
}
$('close').onclick = ()=>dialog.close();
dialog.addEventListener('close',()=>{
  window.speechSynthesis?.cancel();
  recognition?.abort();
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl='';
  if ($('notice').parentNode===dialog) document.body.append($('notice'));
});
const sample = [{id:'sample',name:'示例药 A',dose:'1 片',times:['08:00'],food:'随早餐一起吃。'}];
function entries(meds = data.meds) {
  return meds.flatMap(m=>m.times.map(t=>({m,t}))).sort((a,b)=>a.t.localeCompare(b.t));
}
const uncertain = v => /不知道|不清楚|不确定|忘了|记不清|好像|大概|可能|待核对|有时候|按需|隔天|每周/.test(v);
const slot = ({m,t}) => [day(),m.id,t].join('/');
const line = ({m,t}) => t+'，'+m.name+'，'+m.dose;
function todayVoice() {
  if (!data.meds.length) return '今天还没有登记用药。您可以拍药盒，或者和我聊一聊。';
  return '今天的用药安排。'+entries().map(e=>line(e)+(e.m.food?'，'+e.m.food:'')+(data.logs[slot(e)]?'，已记为吃过。':'，还没记为吃过。')).join('');
}
function render() {
  $('today').textContent=dateText();
  $('today').dateTime=day();
  const all=entries(), pending=all.filter(e=>!data.logs[slot(e)]);
  const next=pending.find(e=>e.t>=hour(new Date()));
  $('nextLabel').textContent='下一次用药';
  $('nextLabel').hidden=!next;
  $('nextTitle').textContent=next?next.t+'　'+next.m.name:!all.length?'还没有登记用药':pending.length?'今天还有未确认的记录':'今天的用药都记好了';
  $('nextDetail').hidden=!next;
  $('nextDetail').textContent=next?'每次 '+next.m.dose:'';
  $('heroAction').textContent=all.length?'看今天的清单':'登记第一种药';
  $('heroAction').onclick=all.length?()=>$('daily').scrollIntoView({block:'center'}):choose;
  $('daily').hidden=!all.length;
  $('draftSection').hidden=!data.pending;
  $('draftRow').replaceChildren();
  $('card').textContent=all.length?'打开用药卡':'看示例卡';
  $('remState').textContent=data.enabled?'页面打开时提醒已开启':'页面提醒未开启';
  $('rows').replaceChildren();
  if (data.pending) {
    const row=el('div',undefined,'item');
    row.append(el('strong',(data.pending.name || '这份药')+' · 待核对'),btn('继续核对',()=>review({...data.pending,fromPending:true})));
    $('draftRow').append(row);
  }
  for (const e of all) {
    const row=el('div',undefined,'item'), details=el('div'), done=!!data.logs[slot(e)];
    details.append(el('time',e.t),el('p',e.m.name+' · '+e.m.dose));
    row.append(details,buttons(btn(done?'已吃过 · 撤销':'我吃过了',()=>{
      if (done) delete data.logs[slot(e)]; else data.logs[slot(e)]=true;
      save();render();
    },done?'done':'primary'),btn('修改',()=>review(e.m))));
    $('rows').append(row);
  }
}
function choose() {
  screen('怎么登记这份药？',btn('拍药盒或药袋',()=>$('cameraFile').click(),'primary'),btn('从相册选照片',()=>$('albumFile').click()),btn('聊天登记',startChat),btn('体验药袋识别示例',photoExample));
}
$('take').onclick=()=>$('cameraFile').click();
$('upload').onclick=()=>$('albumFile').click();
$('chat').onclick=startChat;
$('read').onclick=()=>speak(todayVoice());
for (const id of ['cameraFile','albumFile']) $(id).onchange=async e=>{
  const file=e.target.files[0]; e.target.value='';
  if (!file) return;
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl=URL.createObjectURL(file);
  const img=new Image();
  img.src=photoUrl; img.alt='刚选择的药盒或药袋照片';
  try {await img.decode(); review({},img);}
  catch {URL.revokeObjectURL(photoUrl);photoUrl='';notice('这张照片打不开，请换一张或用聊天登记。');}
};
function photoExample() {
  const bag=el('article',undefined,'cardview');
  bag.append(el('h3','示例药袋'),el('section','药品名称　示例药 A'),el('p','用法　每日一次，每次 1 片'),el('p','服用时间　早上 8 点，随早餐服用'));
  const draft={...sample[0],example:true};
  screen('药袋识别示例',bag,el('p','示例药袋上的字已填入下一页，请核对。'),btn('核对识别结果',()=>review(draft),'primary'));
}
function field(label,value='',type='text') {
  const wrap=el('label',label),input=el('input');
  input.type=type;input.value=value;
  input.maxLength=type==='text'?100:200;
  wrap.append(input);
  return {wrap,input};
}
function review(draft={},image=null) {
  const name=field('药名（照药袋填写）',draft.name), dose=field('医生交代每次吃多少',draft.dose);
  const food=field('医生或药师交代的饮食事项（可跳过）',draft.food);
  const timeList=el('div');
  function addTime(time='') {
    const f=field('每天几点提醒',time,'time'),group=el('div',undefined,'item');
    group.append(f.wrap,btn('移除时间',()=>group.remove()));
    timeList.append(group);
  }
  (draft.times?.length?draft.times:['']).forEach(addTime);
  const heading=image?el('p','请对照照片，填上药名和医生交代的吃法。'):null;
  const err=el('p',undefined,'error');err.hidden=true;err.setAttribute('role','alert');
  function values() {
    return {name:name.input.value.trim(),dose:dose.input.value.trim(),food:food.input.value.trim(),
      times:[...new Set([...timeList.querySelectorAll('input')].map(i=>i.value))].sort()};
  }
  function commit() {
    const v=values();
    if (!v.name || !v.dose || !v.times.length || v.times.includes('')) {
      err.textContent='请核对药名、每次用量和每天的提醒时间。';
      err.hidden=false;return;
    }
    if (uncertain(v.name) || uncertain(v.dose)) {
      err.textContent='药名或用量还要核对。您可以先存下，问过药师再设提醒。';err.hidden=false;return;
    }
    if(draft.example) {
      const card=cardParts(true,[{...v,id:'preview'}]);showCard(card);return;
    }
    if (data.meds.some(m=>m.id!==draft.id && m.name===v.name)) {
      err.textContent='这份药已经登记过了，请回到清单点“修改”。';err.hidden=false;return;
    }
    if(draft.id) Object.assign(data.meds.find(m=>m.id===draft.id),v);
    else data.meds.push({...v,id:crypto.randomUUID()});
    if(draft.person) data.name=draft.person;
    if(draft.fromPending) data.pending=null;
    save();dialog.close();render();notice('已保存到每天的用药安排。');
  }
  const controls=[btn('听一遍',()=>{
    const v=values();
    speak([v.name||'药名待填写',v.dose||'用量待核对',v.times.join('、'),v.food].filter(Boolean).join('。'));
  }),btn(draft.example?'核对后看示例卡':'已核对，保存',commit,'primary')];
  const nodes=[image,heading,name.wrap,dose.wrap,timeList,btn('再加一个时间',()=>addTime()),food.wrap,err,buttons(...controls)].filter(Boolean);
  if (!draft.id && (!data.pending || draft.fromPending)) nodes.push(btn('还不确定，先存为待核对',()=>{
    data.pending={...values(),person:draft.person||''};save();dialog.close();render();notice('已存为待核对，暂不开提醒。');
  }));
  if (draft.id && !draft.example) nodes.push(btn('停止这份药的提醒',()=>screen('从每天的安排中移除？',el('p',draft.name),buttons(btn('返回',()=>review(draft)),btn('确认移除',()=>{
    data.meds=data.meds.filter(m=>m.id!==draft.id);save();dialog.close();render();
  })))));
  screen(draft.example?'核对示例药袋的吃法':'核对每天的吃法',...nodes);
}
function startChat() {
  const draft={person:data.name},history=el('div');
  const steps=[
    ['person','我怎么称呼您？'],['name','您每天吃什么药？记得吃法的话，也可以一起告诉我。'],
    ['dose','医生交代，这种药每次吃多少？'],['times','您每天想几点收到这份药的提醒？'],
    ['food','医生或药师交代过吃饭时要注意什么吗？']
  ];
  let idx=data.name?1:0;
  function ask() {
    const [k,q]=steps[idx];
    history.append(el('p',q,'question'));
    const f=field(k==='times'?'每天提醒时间':'您的回答','',k==='times'?'time':'text');
    const submit=btn('回答',()=>answer(f.input.value),'primary');
    f.input.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing) submit.click();};
    function answer(value,skip=false) {
      value=value.trim();
      if(!value&&!skip){notice('请先填写您的回答。');return;}
      if(k==='name' && !uncertain(value)) {
        const prescription=value.match(/^(.{2,40}?(?:片|胶囊|颗粒|滴剂|口服液|丸|散|糖浆))[，,。\s]+(?:每次|一次)\s*([半一二两三四五六七八九十0-9.]+\s*(?:片|粒|袋|丸|毫升|滴))[。.]?$/);
        if(prescription) {
          draft.name=prescription[1].replace(/^(?:我每天吃的是|我每天吃|我在吃|我吃的是|我吃)/,'');
          draft.dose=prescription[2];
          history.append(el('p',value,'response'));
          idx+=2;ask();return;
        }
      }
      draft[k]=k==='times'?[value]:value;
      history.append(el('p',skip?'跳过':value,'response'));
      idx++;
      if(idx<steps.length) ask(); else review(draft);
    }
    const actions=[btn('听问题',()=>speak(q)),submit];
    const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(Speech && k!=='times') actions.splice(1,0,btn('说出回答',()=>{
      recognition?.abort();
      const rec=new Speech();recognition=rec;rec.lang='zh-CN';
      rec.onresult=e=>{f.input.value=e.results[0][0].transcript;};
      rec.onerror=e=>{if(e.error!=='aborted')notice('没有听清，请再说一次或输入。');};
      rec.start();
    }));
    if(['name','dose','times'].includes(k)) actions.push(btn('我记不清了',()=>review(draft)));
    if(k==='person'||k==='food') actions.push(btn('跳过',()=>answer('',true)));
    screen('聊天登记',history,f.wrap,buttons(...actions));
    f.input.focus();
  }
  ask();
}
function cardParts(isSample,meds=isSample?sample:data.meds) {
  const rows=entries(meds).map(e=>[e.t,e.m.name+'　'+e.m.dose]);
  const food=meds.filter(m=>m.food).map(m=>m.name+'：'+m.food);
  return {title:isSample?'示例用药卡':(data.name?data.name+'的用药卡':'我的用药卡'),date:dateText(),rows,food:food.length?food:['还没有登记饮食交代。']};
}
function drawCard(c) {
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  const width=900,padX=65,blocks=[];
  function add(str,size,color,weight=500,space=12,x=padX) {
    ctx.font=weight+' '+size+'px "PingFang SC","Microsoft YaHei",sans-serif';
    let line='';
    for(const ch of str) {
      if(ctx.measureText(line+ch).width>width-padX-x&&line) {blocks.push({line,size,color,weight,x,space:4});line='';}
      line+=ch;
    }
    blocks.push({line,size,color,weight,x,space});
  }
  add('安心药本',31,'#375a47',650,24);
  add(c.title,55,'#253b30',750,12);
  add(c.date,34,'#425a48',500,36);
  for(const [time,med] of c.rows) {add(time,46,'#24513f',750,6);add(med,40,'#253b30',600,30);}
  add('饮食交代',41,'#24513f',750,14);
  c.food.forEach(f=>add(f,36,'#253b30'));
  canvas.width=width;
  canvas.height=110+blocks.reduce((s,b)=>s+b.size*1.35+b.space,0);
  ctx.fillStyle='#fff9e9';ctx.fillRect(0,0,width,canvas.height);
  ctx.fillStyle='#24513f';ctx.fillRect(0,0,width,16);
  let y=52;ctx.textBaseline='top';
  for(const b of blocks) {
    ctx.font=b.weight+' '+b.size+'px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle=b.color;ctx.fillText(b.line,b.x,y);
    y+=b.size*1.35+b.space;
  }
  return canvas;
}
function download(blob,name) {
  const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function showCard(preview) {
  const c=preview?.rows?preview:cardParts(!data.meds.length),paper=el('article',undefined,'cardview');
  paper.append(el('h3',c.title),el('p',c.date));
  for (const [t,m] of c.rows) {
    const s=el('section');s.append(el('time',t),el('p',m));paper.append(s);
  }
  const dietary=el('section');dietary.append(el('strong','饮食交代'),...c.food.map(f=>el('p',f)));paper.append(dietary);
  screen('每日用药卡',paper,buttons(btn('听这张卡',()=>speak([c.title,c.date,...c.rows.flat(),'饮食交代',...c.food].join('。'))),
    btn('保存为图片',()=>drawCard(c).toBlob(blob=>{
      if(blob) download(blob,c.title+'-'+day()+'.png');else notice('图片生成失败，请重试。');
    }),'primary')));
}
$('card').onclick=showCard;
function exportCalendar() {
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Anxin//Medication reminders//ZH-CN','CALSCALE:GREGORIAN'];
  for(const e of entries()) {
    const start=new Date(),[hh,mm]=e.t.split(':').map(Number);
    start.setHours(hh,mm,0,0);
    if(start.getTime()<Date.now()) start.setDate(start.getDate()+1);
    const localDate=day(start).replaceAll('-','')+'T'+e.t.replace(':','')+'00';
    lines.push('BEGIN:VEVENT','UID:'+e.m.id+'-'+e.t.replace(':','')+'@anxin.local','DTSTAMP:'+stamp,'DTSTART:'+localDate,'DURATION:PT1M','RRULE:FREQ=DAILY','SUMMARY:查看用药安排','BEGIN:VALARM','TRIGGER:PT0M','ACTION:DISPLAY','DESCRIPTION:请打开安心药本核对用药安排','END:VALARM','END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  download(new Blob([lines.join('\r\n')+'\r\n'],{type:'text/calendar;charset=utf-8'}),'每日用药提醒.ics');
  screen('把提醒加入手机日历',el('p','打开刚导出的日历文件，选“添加”，再检查第一条提醒的时间和闹钟。'),
    el('p','以后改药或停药时，也要在日历里改掉旧提醒。'),btn('知道了',()=>dialog.close(),'primary'));
}
function reminders() {
  if(!data.meds.length) {screen('每日提醒',el('p','先登记一份药，核对每天几点提醒。'),btn('登记第一种药',choose,'primary'));return;}
  const list=el('div');
  for(const e of entries()) list.append(el('p',e.t+'　'+e.m.name));
  screen('每日提醒',list,btn(data.enabled?'关闭页面提醒':'开启页面内的提醒',()=>{
    data.enabled=!data.enabled;save();render();reminders();
    if(data.enabled) speak('页面打开时，会按登记的时间提醒您。');
  },'primary'),btn('试听提醒',()=>speak('到了您登记的用药时间，请查看今天的用药卡。')),btn('锁屏提醒：导出到手机日历',exportCalendar));
}
$('reminders').onclick=reminders;
let lastDate=day(), lastMinute='';
function tick() {
  const now=new Date(),current=hour(now);
  if(lastDate!==day(now)) {lastDate=day(now);lastMinute='';}
  if(lastMinute!==current) {lastMinute=current;render();}
  if(!data.enabled || document.hidden) return;
  const due=entries().filter(e=>e.t===current&&!data.logs[slot(e)]&&!data.fired[slot(e)]);
  if(!due.length) return;
  due.forEach(e=>data.fired[slot(e)]=true);save();
  const message='到了您登记的用药时间。'+due.map(line).join('。')+'。请核对用药卡。';
  if(dialog.open) notice(message);
  else screen('用药时间到了',...due.map(e=>el('p',line(e))),buttons(btn('听一遍',()=>speak(message)),btn('查看用药卡',showCard,'primary')));
  speak(message);
}
render();tick();setInterval(tick,5000);document.addEventListener('visibilitychange',tick);
if(storageError)notice(storageError);

if(location.hash==='#photo-example')photoExample();
