'use strict';
const api=window.AnbanAPI;
const schedule=window.AnbanSchedule;
let backendReady=!api?.enabled,networkBusy=false,networkStatus='';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
 chat:'<path d="M3 4h18v13H9l-6 4z"/><path d="M7 9h10m-10 4h6"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 card:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h5m-5 5h10"/>',
 camera:'<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="3.4"/>',
 report:'<path d="M5 3h11l3 3v15H5zM8 9h7m-7 5h2l1-2 2 5 1-3h2"/>',
 med:'<path d="m5 11 6-6a5.65 5.65 0 0 1 8 8l-6 6a5.65 5.65 0 0 1-8-8zM8 8l8 8"/>',
 bell:'<path d="M4 17h16l-2-4V9a6 6 0 0 0-12 0v4zM10 20q2 3 4 0"/>',
 book:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18m3-12h5"/>',
 audio:'<path d="M3 9h4l5-4v14l-5-4H3zM16 8q4 4 0 8m3-11q7 7 0 14"/>',
 photo:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m4 18 6-6 3 3 3-5 5 6"/>',
 send:'<path d="m3 10 17-7-6 18-3-8zM11 13l9-10"/>',
 check:'<path d="m4 12 5 5L20 6"/>',plus:'<path d="M12 4v16M4 12h16"/>',
 mic:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0m-7 7v4"/>'
};
const ico=n=>'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+paths[n]+'</svg>';
const b=(a,t,cl='',icon='')=>'<button type="button" data-a="'+a+'" class="btn '+cl+'">'+(icon?ico(icon):'')+esc(t)+'</button>';
const scenes={card:['做用药卡','card',''],report:['看体检报告','report','sage'],drug:['查药品资料','med','sand'],alarm:['设定时提醒','bell','rose']};
const tabs={chat:['对话','chat','健康对话'],tools:['功能','grid','健康功能'],me:['个人','user','个人画像']};
const key='anban.prototype.v1',legal='不替代执业医师诊断与处方调整';
const sample=[{name:'示例药甲',dose:'1片',time:'08:00',meal:'早餐后'},{name:'示例药乙',dose:'1粒',time:'18:00',meal:'随晚餐'}];
const blankMed=()=>({name:'',dose:'',time:'',meal:''});
const blankDraft=()=>({phase:'photos',index:0,meds:[],demo:false});
let state={profile:{name:'',age:'',diet:''},draft:null,cards:[],scene:'home',activeId:'',query:'',note:'',reminder:null,messages:[]};
let storageFailed=false;
try{Object.assign(state,JSON.parse(localStorage.getItem(key)||'{}'));}catch{storageFailed=true;}
let tab=Object.hasOwn(tabs,location.hash.slice(1))?location.hash.slice(1):'chat',picturePending=false,voiceSession=null;
const dateFmt=d=>new Intl.DateTimeFormat('zh-CN',{timeZone:schedule.timeZone,month:'long',day:'numeric',weekday:'long'}).format(d);
const save=()=>{if(api?.enabled&&backendReady)api.queueDraft(state.draft);try{localStorage.setItem(key,JSON.stringify(state));}catch{toast('这台设备没有足够的存储空间，当前进度仅在本页保留。');}};
function toast(text){const t=$('toast');($('modal').open?$('modal'):document.body).append(t);t.textContent=text;t.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.hidden=true,4800);}
function speak(text){if(!window.speechSynthesis){toast('设备没有可用的语音服务。');return;}stopVoice();const u=new SpeechSynthesisUtterance(text);u.lang='zh-CN';u.rate=.9;u.onerror=e=>{if(!['interrupted','canceled'].includes(e.error))toast('语音暂时无法播放，请检查中文语音设置。');};speechSynthesis.speak(u);}
function stopVoice(){document.querySelector('audio')?.pause();window.speechSynthesis?.cancel();voiceSession?.abort();voiceSession=null;}
function showModal(content){$('modalContent').innerHTML=content;if(!$('modal').open)$('modal').showModal();}
$('closeModal').onclick=()=>$('modal').close();
$('modal').onclose=()=>{if($('toast').parentNode===$('modal'))document.body.append($('toast'));};
function logMessage(role, text, cardId) {
  state.messages.push({role,text,cardId});
}
function positionChat() {
  const pane=document.querySelector('.page-scroll');
  const task=$('activeTask');
  pane.scrollTop=tab==='chat' ? (task ? pane.scrollTop+task.getBoundingClientRect().top-pane.getBoundingClientRect().top-10 : pane.scrollHeight) : 0;
}
function animateSheet() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $('view').getAnimations().forEach(animation=>animation.cancel());
  $('view').animate([
    {opacity:.25,transform:'translateY(24px) scale(.985)',filter:'blur(2px)'},
    {opacity:1,transform:'translateY(0) scale(1)',filter:'blur(0)'}
  ],{duration:420,easing:'cubic-bezier(.22,.8,.2,1)'});
}
function goto(t,scene) {
  stopVoice();
  const changed=tab!==t || (scene && state.scene!==scene);
  tab=t;history.replaceState(null,'','#'+t);
  if(scene){state.scene=scene;state.note='';}
  save();render();openWorkspace();positionChat();
  if(changed)animateSheet();
}
const prompts={card:'请帮我做一张用药卡。',report:'我想看懂体检报告。',drug:'帮我查药品资料。',alarm:'我想设一个每日提醒。'};
async function start(s,request=prompts[s]) {
  if(api?.enabled){if(!backendReady||networkBusy)return toast('正在准备，请稍等。');try{if(s==='card'&&!state.draft)state.draft=await api.createDraft();await liveMessage(request,s);}catch(e){toast(e.message);}return;}
  if(s==='card'&&!state.draft)state.draft=blankDraft();
  logMessage('user',request);
  logMessage('assistant',({card:'好，我们把药按盒整理。',drug:'好，我们一起查目录。',report:'好，我们一起看报告。',alarm:'好，我们根据已核对的用药安排来设提醒。'})[s]);
  goto('chat',s);
}
const activeCard=()=>state.cards.find(x=>x.id===state.activeId)||state.cards[0];
const titleCard=c=>(c.demo?'示例用药卡':(c.person?c.person+'的用药卡':'我的用药卡'));
const currentMed=()=>state.draft.meds[state.draft.index];
const progress=n=>'<div class="stepbar" aria-hidden="true">'+[1,2,3].map(i=>'<i class="'+(i<=n?'on':'')+'"></i>').join('')+'</div>';
const bubble=t=>'<div class="dialogline"><span class="avatar">'+ico('chat')+'</span><p class="bubble">'+esc(t)+'</p></div>';
const toolTiles=()=>'<div class="actions">'+Object.entries(scenes).map(([s,[t,i,col]])=>'<button data-a="scene-'+s+'" class="tile '+(s==='card'?'picked':'')+'"><span class="badgeicon '+col+'">'+ico(i)+'</span>'+t+'</button>').join('')+'</div>';
const emptyLabel=()=>state.draft&&state.draft.meds.length?'继续核对药盒':'拍药盒做卡';
function composer() {
  return '<form id="composer" class="composer"><button type="button" data-a="dictate" aria-label="说句话">'+ico('mic')+'</button>'+
    '<input autocomplete="off" aria-label="对安伴说" placeholder="跟安伴说说您的问题" id="utterance" maxlength="160">'+
    '<button class="primary" aria-label="发送">'+ico('send')+'</button></form>';
}
function home() {
  const latest=state.cards[0];
  if(state.messages.length) return state.draft ? b('scene-card','继续核对药盒','','camera') : '';
  return '<div class="starter"><button class="photo-action" data-a="scene-card"><img src="medicine-still-life.jpg" alt=""><span>'+ico('camera')+emptyLabel()+'</span></button>'+
    b('scene-report','看体检报告','','report')+(latest?b('latest','打开上次的卡','','card'):'')+'</div>';
}
function toolsPage() {return '<div class="grid">'+toolTiles()+'</div>';}
const portraitFields=[
  ['name','称呼'],['age','年龄'],['health','健康状况'],['allergy','过敏史'],['diet','饮食忌口']
];
function profile() {
  const p=state.profile;
  const detail=portraitFields.slice(1).map(([key,label])=>'<div><dt>'+label+'</dt><dd>'+
    esc(p[key]?(p[key]+(key==='age'?' 岁':'')):'未填写')+'</dd></div>').join('');
  const cards=state.cards.map(c=>b('open-'+c.id,titleCard(c)+' · '+c.date,'saved','card')).join('');
  return '<div class="grid"><section class="panel portrait"><div class="row"><div class="identity"><span class="person-icon">'+ico('user')+'</span><div><h2>'+
    esc(p.name||'我的健康档案')+'</h2><p>'+esc(api?.enabled?(api.account?.username||'本机访客'):'本机访客')+'</p></div></div>'+b('profile-edit','编辑画像')+'</div><dl>'+detail+'</dl></section>'+
    (api?.enabled?'<div class="buttons">'+(api.account?.username?b('account-logout','退出登录'):b('account-login','登录')+b('account-register','注册账户'))+'</div>':'')+'<details class="panel personal-records"><summary>我的用药卡（'+state.cards.length+'）</summary><div class="stack">'+
    (cards||b('scene-card','做第一张用药卡'))+'</div></details><details class="panel personal-records"><summary>提醒管理</summary><p>'+
    esc(state.reminder?'已设置每日提醒':'还没有设置提醒')+'</p>'+(api?.enabled?api.reminders.map(r=>'<div class="rowline row"><strong>'+esc(r.at)+'</strong>'+b('reminder-'+r.id,r.enabled?'暂停提醒':'开启提醒')+'</div>').join(''):'')+b('scene-alarm','管理提醒','','bell')+'</details></div>';
}
function sceneShell(title,body) {
  return '<section class="stack active-task" id="activeTask" aria-label="'+esc(title)+'"><div class="flowhead"><span class="scene">'+esc(title)+'</span>'+b('back-home','收起任务')+'</div>'+body+'</section>';
}
function transcript() {
  const p=state.profile;
  const greeting=(p.name?p.name+'，您好！':'您好，我是安伴。')+'您可以拍下药盒和我一起核对吃法，也可以告诉我想了解什么。';
  return '<div class="thread" role="log" aria-label="与安伴的对话">'+bubble(greeting)+state.messages.map(m=>{
    if(m.role==='user')return '<div class="userline" aria-label="我">'+esc(m.text)+'</div>';
    return bubble(m.text)+(m.cardId?b('open-'+m.cardId,'打开这张用药卡','chat-card','card'):'');
  }).join('')+'</div>';
}
const mockBox=i=>'<span class="demo-box '+(i%2?'warm':'')+'">'+esc(sample[i%2].name)+'</span>';
function source(m,i){return m.photo?'<img src="'+esc(m.photo)+'" alt="第 '+(i+1)+' 盒药的原图">':mockBox(m.exampleIndex??i);}
function cardTask(){const d=state.draft||blankDraft();if(d.phase==='photos'){
 const slots=Array.from({length:Math.max(2,d.meds.length)},(_,i)=>{const m=d.meds[i];return '<div class="slot">'+(m?source(m,i):ico('camera'))+'<span>第 '+(i+1)+' 盒'+(m?'':' · 待拍')+'</span>'+(m?(d.demo?'':b('remove-'+i,'移除')):'')+'</div>';}).join('');
 return sceneShell('做用药卡',bubble('把每天吃的药逐盒拍下来，也可以选相册里的照片。')+'<section class="workflow">'+progress(1)+'<div class="row"><h2>添加药盒照片</h2><span>'+d.meds.length+' / 5 盒</span></div><div class="slots">'+slots+'</div><div class="buttons">'+(d.demo?b('real-photos','改用自己的照片'):b('camera','拍一盒','primary','camera')+b('album','选照片','','photo')+(api?.enabled?b('medicine-pdf','上传说明书 PDF','','report'):''))+(!d.meds.length?b('demo','用两盒示例体验'):'')+'</div>'+(d.meds.length?b('review-start','逐盒核对','primary','check'):'')+'</section>'+(api?.enabled&&!d.demo?pdfPicker('medicine'):''));}
 if(d.phase==='review'){
 const i=d.index,m=currentMed();const fields='<div class="fields">'+field('name','药名',m.name)+field('dose','医嘱每次用量',m.dose)+field('time','每日服用时间',m.time,'time')+field('meal','与吃饭的关系',m.meal,'text','如：早餐后')+'</div>';
 const photo='<figure class="photo">'+source(m,i)+'<figcaption>'+(d.demo?'示例药盒':m.document_id?'说明书原页':'药盒原图')+' · 第 '+(i+1)+' 盒</figcaption>'+(m.sources?'<div class="buttons">'+m.sources.map(p=>b('med-page-'+i+'-'+p.page,'查看第 '+p.page+' 页')).join('')+'</div>':'')+'</figure>';
 const notice=m.recognition?.reason||(m.recognition?.fields?.uncertain?'部分药品文字看不清，请对照原图核对。':'');
 return sceneShell('逐盒核对',bubble(d.demo?'这是虚构示例，请逐盒核对示例吃法。':'请按药袋或医嘱填写。看不清的用量可以留到下次核对。')+'<form id="reviewForm" class="workflow">'+progress(2)+'<h2>核对第 '+(i+1)+' 盒，共 '+d.meds.length+' 盒</h2>'+photo+(notice?'<p role="status">'+esc(notice)+'</p>':'')+fields+'<p class="error" id="reviewError" role="alert" hidden></p><div class="buttons">'+b('review-prev',i?'上一盒':'返回照片')+b('later','稍后再核对')+'<button class="primary">'+(i+1===d.meds.length?'确认这盒，查看汇总':'确认这盒，核对下一盒')+'</button></div></form>',false);}
 return sceneShell('用药卡汇总',bubble('这几盒药都已核对。再看一遍，就可以生成大字卡和语音。')+'<section class="workflow">'+progress(3)+'<h2>已核对 '+d.meds.length+' 盒药</h2>'+d.meds.map((m,i)=>'<div class="rowline row"><div><strong>'+esc(m.name)+'</strong><p>'+esc([m.time,m.dose,m.meal].filter(Boolean).join(' · '))+'</p></div>'+b('edit-'+i,'修改')+'</div>').join('')+b('generate','生成大字卡和语音','primary','card')+'</section>');}
function field(id,label,val,type='text',placeholder=''){return '<label>'+label+'<input id="f-'+id+'" name="'+id+'" type="'+type+'" value="'+esc(val)+'" placeholder="'+esc(placeholder)+'" maxlength="'+(id==='name'?40:80)+'" '+(type==='number'?'min="1" max="120"':'')+'></label>';}
function ordered(c){return [...c.meds].sort((a,b)=>a.time.localeCompare(b.time));}
const narration=c=>(c.demo?'这是示例用药卡。':'这是您核对的每日用药。')+ordered(c).map(m=>{const[h,min]=m.time.split(':').map(Number);return h+'点'+(min?min+'分':'整')+'，'+m.name+'，每次'+m.dose+'。'+(m.meal?m.meal+'。':'');}).join('');
const exactDemo=c=>c.demo&&JSON.stringify(c.meds)===JSON.stringify(sample);
function cardResult(){const c=activeCard();if(!c)return home();
 const sheet='<article class="card"><h2>'+esc(titleCard(c))+'</h2><strong>'+esc(c.date)+'</strong>'+ordered(c).map(m=>'<div class="medrow"><b>'+esc(m.time)+'</b><h2>'+esc(m.name)+'</h2><p>每次 '+esc(m.dose)+(m.meal?'　'+esc(m.meal):'')+'</p></div>').join('')+'<p class="legal">'+legal+'</p></article>';
 const voice='<section class="panel voice"><h2 class="mini-title">'+ico('audio')+'语音叮嘱</h2>'+(c.audio_url?'<audio controls preload="metadata" src="'+esc(c.audio_url)+'" aria-label="播放用药叮嘱"></audio>':exactDemo(c)?'<audio controls preload="metadata" src="demo.m4a" aria-label="播放示例用药叮嘱"></audio>':'<div class="buttons">'+b('speak-card','播放语音','primary','audio')+b('stop','停止')+'</div>')+'</section>';
 return sceneShell('已存入我的手记',sheet+voice+'<div class="buttons">'+b('png','保存大字图片','primary','card')+b('print','打印')+b('scene-card','再做一张')+'</div>');}
function selectedPlan(){
 const {week,selection}=schedule.getSnapshot(),day=week.days.find(d=>d.date===selection.date);
 return {week,day,slots:day.slots.filter(s=>!selection.period||s.id===selection.period),period:selection.period};
}
function dailyPlan(){
 const {week,day,slots,period}=selectedPlan();
 const filters='<div class="period-picker" role="group" aria-label="用药时段">'+[{id:'all',label:'全天'},...schedule.periods].map(p=>'<button data-a="period-'+p.id+'" aria-pressed="'+((period||'all')===p.id)+'">'+p.label+'</button>').join('')+'</div>';
 const rows=slots.map(s=>'<section class="day-slot"><h3>'+s.label+'</h3>'+(s.meds.length?s.meds.map(m=>'<div class="medrow"><b>'+esc(m.time)+'</b><h2>'+esc(m.name)+'</h2><p>每次 '+esc(m.dose)+'</p>'+(m.meal?'<p>'+esc(m.meal)+'</p>':'')+'</div>').join(''):'<p class="empty-slot">这个时段未登记用药</p>')+'</section>').join('');
 const actions=week.cardId?b('speak-day','听这份安排','','audio')+b('open-'+week.cardId,'查看大字用药卡','','card'):b('scene-card','拍药盒做卡','primary','camera');
 return sceneShell('每日用药','<article class="card day-plan"><h2>'+esc(day.fullLabel)+'</h2>'+filters+rows+'</article><div class="buttons">'+actions+'</div>');
}
function readDailyPlan(){
 const {day,slots}=selectedPlan();
 speak(day.fullLabel+'的用药安排。'+slots.map(s=>s.label+'。'+(s.meds.length?s.meds.map(m=>m.time+'，'+m.name+'，每次'+m.dose+'。'+(m.meal?m.meal+'。':'')).join(''):'这个时段未登记用药。')).join(''));
}
function publishWeek(){return schedule.update(backendReady?state.cards:[],{ready:backendReady});}
function drugScene(){const q=state.query.trim(),found=q?(api?.enabled?(state.remoteCatalog||[]):catalog.filter(c=>c[0].includes(q)).slice(0,12)):[];return sceneShell('查药品资料',bubble('把药盒上的药名告诉我，我帮您找目录里的规格和厂家。')+'<form id="searchForm" class="panel"><label>药品名称<input id="q" required value="'+esc(q)+'" placeholder="输入药名"></label><button class="primary">查药品</button></form>'+(q?'<div class="panel">'+(found.length?found.map(([n,s,m,url])=>'<section class="rowline"><h3>'+esc(n)+'</h3><p>'+esc(s)+' · '+esc(m)+'</p><a class="sourcelink" target="_blank" rel="noreferrer" href="'+esc(url)+'">查看目录来源</a></section>').join(''):'<p>目录中没有查到这个药名，请对照药盒核对全名。</p>')+'</div>':''));}
const reportMeaning='箭头表示这一项高于或低于这张报告给出的参考范围。判断原因，还需要医生结合您的身体情况和其他检查一起看。';
function reportScene(){if(api?.enabled)return liveReportScene();return sceneShell('看体检报告',bubble('您想先了解报告上的哪一项？')+'<div class="panel"><h2>报告里的箭头</h2>'+b('report-read','查看大白话解读','','report')+'</div>'+(state.note==='report'?'<article class="card"><h2>向上和向下是什么意思？</h2><p>'+reportMeaning+'</p><p>就诊时带上报告，请医生一起核对项目、单位和参考范围。</p><a class="sourcelink" href="https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/" target="_blank" rel="noreferrer">资料来源 · MedlinePlus</a><p class="legal">'+legal+'</p>'+b('speak-report','听解读','','audio')+'</article>':''));}
function alarmScene(){const c=state.cards.find(x=>!x.demo);return sceneShell('设定时提醒',bubble(c?'这是您最近核对的用药卡。把提醒导入手机日历后，每天会按这些时间提醒。':'先做好并核对您自己的用药卡，再选时间设置提醒。')+'<section class="panel"><h2>每日用药提醒</h2>'+(c?ordered(c).map((m,i)=>field('alarm'+i,m.name,m.time,'time')).join('')+b('export-alarm','导出日历提醒','primary','bell'):b('scene-card','做用药卡','primary','card'))+'</section>');}
async function searchInChat(query,utterance=query) {
  if(api?.enabled){try{state.query=query.trim();if(!state.query)return;const r=await api.raw('/catalog?q='+encodeURIComponent(state.query));state.remoteCatalog=r.items.map(m=>[m.name,m.spec,m.maker,m.evidence.url]);logMessage('user',utterance);logMessage('assistant','目录中找到 '+r.total+' 条记录，请核对厂家与规格。');goto('chat','drug');}catch(e){toast(e.message);}return;}
  state.query=query.trim();if(!state.query)return;
  logMessage('user',utterance);
  const count=catalog.filter(row=>row[0].includes(state.query)).length;
  logMessage('assistant',count?'目录中有 '+count+' 条与“'+state.query+'”匹配的记录，请按厂家和规格核对。':'还没查到“'+state.query+'”。请看看药盒上的完整名称。');
  goto('chat','drug');
}
function textReply(text,reply) {
  logMessage('user',text);logMessage('assistant',reply);
  save();render();
  const pane=document.querySelector('.page-scroll'),last=document.querySelector('.thread > :last-child');
  pane.scrollTop+=last.getBoundingClientRect().bottom-pane.getBoundingClientRect().bottom+16;
  if(last.getBoundingClientRect().top<pane.getBoundingClientRect().top)pane.scrollTop+=last.getBoundingClientRect().top-pane.getBoundingClientRect().top-10;
}
function answerChat(text) {
  if(api?.enabled)return liveMessage(text);
  const p=state.profile;
  if(/我的.*(忌口|过敏|年龄|健康状况|画像)/.test(text)) {
    const keys=/忌口/.test(text)?['diet']:/过敏/.test(text)?['allergy']:/年龄/.test(text)?['age']:['age','health','allergy','diet'];
    const lines=portraitFields.filter(([k])=>keys.includes(k)).map(([k,label])=>label+'：'+(p[k]?p[k]+(k==='age'?' 岁':''):'未填写'));
    return textReply(text,'您的画像里记着：'+lines.join('；')+'。可以在「个人」里修改。');
  }
  if(/(几片|几粒|多少剂量|加量|减量|停药|补服)/.test(text))return textReply(text,'个人剂量需要按药袋或处方核对。拿不准时请问开药医生或药师。');
  if(/(我的|今天|上次).*(吃法|用药安排|用药卡)/.test(text)&&state.cards.some(c=>!c.demo)) {
    const c=state.cards.find(c=>!c.demo);logMessage('user',text);logMessage('assistant','这是您最近核对的用药安排。',c.id);return openCard(c.id);
  }
  if(/箭头|参考范围/.test(text)) {
    logMessage('user',text);logMessage('assistant',reportMeaning);goto('chat','report');state.note='report';update();positionChat();return;
  }
  if(/体检|报告|指标/.test(text))return start('report',text);
  if(/提醒|闹钟/.test(text)&&!/卡/.test(text))return start('alarm',text);
  if(/拍照|药盒|用药卡|做卡|核对/.test(text))return start('card',text);
  const name=catalog.find(([n])=>text.includes(n))?.[0];
  if(name)return searchInChat(name,text);
  const term=text.replace(/^(?:请|帮我|查一下|查查|查询|查找|查)+/,'').replace(/(?:的资料|说明书|怎么查|[。？?！!])$/,'').trim();
  if(term.length>=2 && catalog.some(([n])=>n.includes(term)))return searchInChat(term,text);
  if(/查药|药品资料|说明书/.test(text)&&text.length<=8)return start('drug',text);
  if(state.scene==='drug'&&text.length<=30&&!/[？?]/.test(text))return searchInChat(text);
  if(/你好|您好|早上好|晚上好/.test(text))return textReply(text,(p.name?p.name+'，':'')+'您好。今天想一起看看药盒，还是聊聊体检报告？');
  if(/谢谢/.test(text))return textReply(text,'不客气。需要的时候，您可以回来翻看这段对话。');
  if(state.scene==='card'&&state.draft?.phase==='review')return textReply(text,'我们正在核对第 '+(state.draft.index+1)+' 盒药。请对着原图和医嘱逐项填写，拿不准可以点“稍后再核对”。');
  return textReply(text,'这条我还不能准确解答。我可以帮您查药品目录、解释报告上的箭头，或把您已核对的吃法整理成卡。您想先做哪件事？');
}
function render(){publishWeek();const handlers={home,card:cardTask,result:cardResult,report:reportScene,drug:drugScene,alarm:alarmScene,schedule:dailyPlan};$('nav').innerHTML=Object.entries(tabs).map(([k,[label,icon]])=>'<button data-a="nav-'+k+'" '+(workspaceOpen&&tab===k?'aria-current="page"':'')+'>'+ico(icon)+label+'</button>').join('');$('pageTitle').textContent=tabs[tab][2];$('date').textContent=dateFmt(new Date());$('view').innerHTML=tab==='tools'?toolsPage():tab==='me'?profile():'<div class="grid conversation">'+transcript()+(networkStatus?'<p role="status">'+esc(networkStatus)+'</p>':'')+(handlers[state.scene]||home)()+'</div>';
const dock=$('composeDock');dock.hidden=tab!=='chat';if(!dock.firstChild)dock.innerHTML=composer();dock.querySelectorAll('button,input').forEach(e=>e.disabled=networkBusy||!backendReady);}
function update(){save();render();if(tab==='chat'&&state.scene!=='home')positionChat();animateSheet();}
function validate(m){if(!m.name.trim()||!m.dose.trim()||!/^\d{2}:\d{2}$/.test(m.time))return '请按医嘱核对药名、每次用量和每日时间。';if(/不清楚|忘了|不知道|不确定|记不清|可能|好像|隔天|每周|按需/.test(m.name+m.dose+m.meal))return '这份药的每日吃法还不能确定，请先保存进度，再核对医嘱。';return '';}
function openCard(id){state.activeId=id;goto('chat','result');}
async function emitCard(){if(api?.enabled)return liveGenerate();const d=state.draft;if(!d||d.phase!=='summary'||d.meds.some(m=>!m.ok||validate(m)))return;
 const c={id:globalThis.crypto?.randomUUID?.()||'c'+Date.now(),date:new Date().toLocaleDateString('zh-CN'),person:state.profile.name,demo:d.demo,meds:d.meds.map(({name,dose,time,meal})=>({name,dose,time,meal}))};state.cards.unshift(c);state.draft=null;logMessage('assistant','已把这 '+c.meds.length+' 盒药整理成大字卡，您可以随时打开并听语音。',c.id);openCard(c.id);}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function drawCard(c){const cn=document.createElement('canvas'),g=cn.getContext('2d'),items=[];const font=(size,weight)=>weight+' '+size+'px "PingFang SC","Microsoft YaHei",sans-serif';
 function add(text,size,weight,space,color='#172f2c'){g.font=font(size,weight);let line='';for(const ch of text){if(line&&g.measureText(line+ch).width>840){items.push({line,size,weight,space:3,color});line='';}line+=ch;}items.push({line,size,weight,space,color});}
 add('安伴 · 健康手记',36,650,20);add(titleCard(c),65,750,10);add(c.date,40,500,35);
 for(const m of ordered(c)){add(m.time,62,750,3,'#175c50');add(m.name,62,750,5);add('每次 '+m.dose,52,650,4);if(m.meal)add(m.meal,46,600,12);items[items.length-1].space+=24;}
 add(legal,38,500,15);cn.width=960;cn.height=100+items.reduce((n,r)=>n+r.size*1.32+r.space,0);g.fillStyle='#fcfcf5';g.fillRect(0,0,cn.width,cn.height);g.fillStyle='#16483f';g.fillRect(0,0,cn.width,16);let y=55;g.textBaseline='top';for(const r of items){g.fillStyle=r.color;g.font=font(r.size,r.weight);g.fillText(r.line,58,y);y+=r.size*1.32+r.space;}return cn;}
async function savePNG(){if(api?.enabled){try{const c=activeCard(),url='/api/v1/cards/'+c.id+'/image.png';const blob=await api.raw('/cards/'+c.id+'/image.png');download(blob,titleCard(c)+'.png');showModal('<h2>用药卡图片</h2><img alt="每日用药卡" style="width:100%" src="'+url+'">');}catch(e){toast(e.message);}return;}const cn=drawCard(activeCard());cn.toBlob(blob=>{if(!blob){toast('图片生成失败，请再试一次。');return;}download(blob,titleCard(activeCard())+'.png');const img=new Image();img.src=cn.toDataURL();img.alt='可长按保存的每日用药卡';img.style.width='100%';showModal('<h2>用药卡图片</h2><p>手机可长按图片保存。</p>');$('modalContent').append(img);});}
async function calendar(){if(api?.enabled)return liveCalendar();const c=state.cards.find(x=>!x.demo);if(!c)return;const rows=ordered(c).map((m,i)=>({...m,at:$('f-alarm'+i).value}));if(rows.some(x=>!x.at))return toast('请先选好每项提醒的时间。');const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Anban//Calendar//ZH-CN'];
 rows.forEach((m,i)=>{const now=new Date(),when=new Date(),[h,min]=m.at.split(':').map(Number);when.setHours(h,min,0,0);if(when<now)when.setDate(when.getDate()+1);const date=[when.getFullYear(),String(when.getMonth()+1).padStart(2,'0'),String(when.getDate()).padStart(2,'0')].join('');lines.push('BEGIN:VEVENT','UID:'+c.id+'-'+i+'@anban.local','DTSTAMP:'+stamp,'DTSTART:'+date+'T'+m.at.replace(':','')+'00','DURATION:PT1M','RRULE:FREQ=DAILY','SUMMARY:查看安伴用药卡','BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:PT0M','DESCRIPTION:查看已核对的用药卡','END:VALARM','END:VEVENT');});lines.push('END:VCALENDAR');download(new Blob([lines.join('\r\n')+'\r\n'],{type:'text/calendar'}),'安伴每日提醒.ics');state.reminder=c.id;save();showModal('<h2>日历文件已生成</h2><p>打开文件，加入手机日历并开启日历通知。改药或停药时，请同步修改日历里的旧提醒。</p>');}
async function readPhoto(file){if(file.size>25*1024*1024)throw Error('照片超过 25 MB，请换一张。');const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();const scale=Math.min(1,1400/Math.max(img.width,img.height)),cn=document.createElement('canvas');cn.width=Math.max(1,Math.round(img.width*scale));cn.height=Math.max(1,Math.round(img.height*scale));const g=cn.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,cn.width,cn.height);g.drawImage(img,0,0,cn.width,cn.height);return cn.toDataURL('image/jpeg',.77);}finally{URL.revokeObjectURL(url);}}
for(const id of ['album','camera']) $(id).onchange=async e=>{const files=[...e.target.files];e.target.value='';const d=state.draft;if(!files.length||picturePending||!d||d.demo)return;if(api?.enabled)return livePhotos(files,d);if(files.length+d.meds.length>5)return toast('一次最多整理五盒药，请减少所选照片。');picturePending=true;try{const photos=[];for(const f of files)photos.push(await readPhoto(f));if(state.draft===d&&d.phase==='photos'){d.meds.push(...photos.map(photo=>({...blankMed(),photo,ok:false})));logMessage('user','添加了 '+photos.length+' 张药盒照片。');update();}}catch(err){toast(err.message.includes('25 MB')?err.message:'照片打不开，请选 JPG、PNG 或换一张照片。');}finally{picturePending=false;}};
document.addEventListener('input',e=>{if(e.target.closest('#reviewForm')){const m=currentMed();m[e.target.name]=e.target.value;m.ok=false;save();}});
document.addEventListener('submit',async e=>{e.preventDefault();if(api?.enabled&&!backendReady)return toast('正在连接本机服务。');if(e.target.id==='accountForm')return liveAccount(e.target);switch(e.target.id){
case 'reviewForm':{
 if(networkBusy)return;
 const d=state.draft,m=currentMed(),oldIndex=d.index,oldPhase=d.phase;
 Object.assign(m,Object.fromEntries(new FormData(e.target)));const problem=validate(m);
 if(problem){$('reviewError').hidden=false;$('reviewError').textContent=problem;return;}
 m.ok=true;
 if(d.index+1<d.meds.length)d.index++;else{const i=d.meds.findIndex(m=>!m.ok);if(i<0)d.phase='summary';else d.index=i;}
 if(api?.enabled){
  networkBusy=true;const submit=e.target.querySelector('.primary');submit.disabled=true;submit.textContent='正在保存…';
  try{await api.flushDraft(d);}catch(err){m.ok=false;d.index=oldIndex;d.phase=oldPhase;$('reviewError').hidden=false;$('reviewError').textContent=err.message;submit.disabled=false;submit.textContent='重新确认这盒';return;}finally{networkBusy=false;}
 }
 logMessage('user','已核对第 '+(oldIndex+1)+' 盒：'+m.name+'，'+m.time+'，每次 '+m.dose+(m.meal?'，'+m.meal:'')+'。');
 update();positionChat();break;
}
case 'profileForm':{const data=Object.fromEntries(new FormData(e.target));try{state.profile=api?.enabled?await api.raw('/profile','PUT',data):data;$('modal').close();update();}catch(err){toast(err.message);}break;}
case 'searchForm':searchInChat($('q').value);break;
case 'composer':{const text=$('utterance').value.trim();if(text){$('utterance').value='';answerChat(text);}break;}
}});
document.addEventListener('click',async e=>{const target=e.target.closest('[data-a]');if(!target)return;const a=target.dataset.a,d=state.draft;if(api?.enabled&&(!backendReady||networkBusy||picturePending)&&!a.startsWith('nav-')&&!['stop','print'].includes(a))return toast('正在处理，请稍等。');
 if(a.startsWith('period-')){const period=a.slice(7);schedule.select(schedule.getSnapshot().selection.date,period==='all'?null:period);stopVoice();render();positionChat();return;}
 if(api?.enabled&&await liveAction(a))return;
 if(a.startsWith('nav-'))return goto(a.slice(4));if(a.startsWith('scene-'))return start(a.slice(6));if(a.startsWith('open-')){$('modal').close();return openCard(a.slice(5));}
 if(a.startsWith('remove-')){d.meds.splice(Number(a.slice(7)),1);if(d.demo){d.meds=[];d.demo=false;}update();return;}
 if(a.startsWith('edit-')){d.phase='review';d.index=Number(a.slice(5));update();return;}
 switch(a){
 case 'unfold':goto('chat');break;
 case 'back-home':goto('chat','home');break;
 case 'latest':if(state.cards[0])openCard(state.cards[0].id);break;
 case 'camera':case 'album':if(d.meds.length>=5)return toast('已经添加五盒药了。');$(a).click();break;
 case 'real-photos':try{state.draft=api?.enabled?await api.createDraft():blankDraft();update();}catch(err){toast(err.message);}break;
 case 'demo':if(api?.enabled){try{state.draft=await api.createDraft(true);update();}catch(err){toast(err.message);}break;}logMessage('user','用两盒示例药来体验。');d.demo=true;d.meds=sample.map((m,i)=>({...m,exampleIndex:i,ok:false}));update();break;
 case 'review-start':if(picturePending)return toast('照片正在准备中。');if(d.meds.length<2)return toast('请再添加一盒药的照片。');d.phase='review';d.index=0;update();break;
 case 'review-prev':if(d.index)d.index--;else d.phase='photos';update();break;
 case 'later':if(api?.enabled){try{await api.flushDraft(d);}catch(err){toast(err.message);break;}}logMessage('assistant','这份用药卡已存为草稿，下次可以继续核对。');goto('chat','home');toast('已保存核对进度。');break;
 case 'generate':emitCard();break;
 case 'speak-card':speak(narration(activeCard()));break;
 case 'speak-day':readDailyPlan();break;
 case 'stop':stopVoice();break;
 case 'print':window.print();break;
 case 'png':savePNG();break;
 case 'profile-edit':{const p=state.profile;showModal('<h2>编辑健康画像</h2><form id="profileForm" class="stack">'+portraitFields.map(([key,label])=>field(key,label,p[key],key==='age'?'number':'text')).join('')+'<button class="primary">保存档案</button></form>');break;}
 case 'report-read':logMessage('user','报告里的箭头是什么意思？');logMessage('assistant',reportMeaning);state.note='report';update();positionChat();break;
 case 'speak-report':speak(reportMeaning);break;
 case 'export-alarm':calendar();break;
 case 'dictate':{const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return toast('此浏览器没有语音输入，可用键盘上的麦克风。');stopVoice();const r=new R();voiceSession=r;r.lang='zh-CN';r.onresult=e=>{if($('utterance'))$('utterance').value=e.results[0][0].transcript;};r.onerror=e=>{if(e.error!=='aborted')toast('没有收到语音，请检查麦克风权限或输入文字。');};try{r.start();toast('正在听，请说。');}catch{toast('麦克风暂时无法使用。');}break;}
 }});
let workspaceOpen=false;
let lastWorkspaceFocus=null;
function openWorkspace(){
  if(!workspaceOpen)lastWorkspaceFocus=document.activeElement;
  workspaceOpen=true;
  $('workspace').inert=false;
  $('workspace').setAttribute('aria-hidden','false');
  $('workspace').classList.add('is-open');
  $('workspaceShade').hidden=false;
  $('world').inert=true;
  document.body.classList.add('workspace-open');
  document.querySelectorAll('#nav button').forEach(el=>{if(el.dataset.a==='nav-'+tab)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  $('closeWorkspace').focus({preventScroll:true});
  window.dispatchEvent(new CustomEvent('anban:workspace',{detail:{open:true,tab}}));
}
function closeWorkspace(){
  stopVoice();workspaceOpen=false;
  $('workspace').inert=true;
  $('workspace').setAttribute('aria-hidden','true');
  $('workspace').classList.remove('is-open');
  $('workspaceShade').hidden=true;
  $('world').inert=false;
  document.body.classList.remove('workspace-open');
  document.querySelectorAll('#nav button').forEach(el=>el.removeAttribute('aria-current'));
  if(lastWorkspaceFocus?.isConnected)lastWorkspaceFocus.focus({preventScroll:true});else $('homeButton').focus({preventScroll:true});
  window.dispatchEvent(new CustomEvent('anban:workspace',{detail:{open:false}}));
}
$('closeWorkspace').onclick=closeWorkspace;
$('workspaceShade').onclick=closeWorkspace;
$('homeButton').onclick=closeWorkspace;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('modal').open&&workspaceOpen)closeWorkspace();});
window.addEventListener('anban:open-day',e=>{
  if(!backendReady)return toast('正在读取用药，请稍等。');
  publishWeek();
  if(!schedule.select(e.detail.date,e.detail.period??null))return;
  goto('chat','schedule');
});
// Roll the date while open, and immediately after returning from a sleeping tab.
function refreshDay(){if(publishWeek()&&state.scene==='schedule')render();}
setInterval(refreshDay,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDay();});
render();
if(storageFailed)toast('上次的本机记录暂时无法读取。');

async function liveMessage(text,scene='chat'){
 if(!backendReady||networkBusy)return toast('正在处理，请稍等。');
 networkBusy=true;networkStatus='正在回复…';render();positionChat();
 try{
  const result=await api.chat(text,scene);
  logMessage('user',text);state.messages.push(result);
  const next=result.scene==='chat'?(state.scene||'home'):result.scene;
  if(next==='card'&&!state.draft)state.draft=await api.createDraft();
  if(result.query){state.query=result.query;const r=await api.raw('/catalog?q='+encodeURIComponent(result.query));state.remoteCatalog=r.items.map(m=>[m.name,m.spec,m.maker,m.evidence.url]);}
  goto('chat',next);
 }catch(e){if($('utterance'))$('utterance').value=text;toast(e.message);}
 finally{networkBusy=false;networkStatus='';render();positionChat();}
}
async function livePhotos(files,d){
 if(files.length+d.meds.length>5)return toast('一次最多整理五盒药。');
 picturePending=true;networkStatus='正在保存药盒照片…';render();
 try{
  await api.flushDraft(d);
  for(const file of files){
   const uploaded=await api.photo(await readPhoto(file));
   if(api.health?.capabilities.vision){networkStatus='正在读取药盒文字…';render();try{const result=await api.raw('/uploads/'+uploaded.id+'/analyze','POST',{});if(result.status==='manual_required')toast(result.reason);}catch(e){toast(e.message);}}
   state.draft=await api.attach(state.draft,uploaded);
  }
  if(!api.health?.capabilities.vision)toast('照片已保存。模型尚未配置，请对照原图核对吃法。');
  logMessage('user','添加了 '+files.length+' 张药盒照片。');update();
 }catch(e){toast(e.message);}
 finally{picturePending=false;networkStatus='';render();positionChat();}
}
async function liveGenerate(){
 if(networkBusy)return;
 networkBusy=true;networkStatus='正在生成用药卡…';render();
 try{
  const c=await api.generate(state.draft);state.cards=state.cards.filter(x=>x.id!==c.id);state.cards.unshift(c);state.draft=null;
  logMessage('assistant','用药卡已经保存。',c.id);openCard(c.id);
  const voice=await api.raw('/cards/'+c.id+'/audio','POST',{});c.audio_url=voice.audio_url;save();
 }catch(e){toast(e.message);}
 finally{networkBusy=false;networkStatus='';render();positionChat();}
}
async function liveCalendar(){
 const c=state.cards.find(x=>!x.demo);if(!c)return;
 const meds=ordered(c),times=meds.map((m,i)=>$('f-alarm'+i).value);
 if(times.some(t=>!t))return toast('请先选好提醒时间。');
 try{await api.setReminders(c,c.meds.map(m=>times[meds.indexOf(m)]));state.reminder=c.id;save();const blob=await api.raw('/reminders/calendar.ics');download(blob,'安伴每日提醒.ics');showModal('<h2>提醒已保存</h2><p>网页打开时会弹出提醒。将日历文件加入手机日历后，关闭网页也能按日历设置提醒。修改安排后，请同步更新手机日历中的旧提醒。</p>');}
 catch(e){toast(e.message);}
}
function liveReportScene(){
 const doc=currentPDF('report'),r=state.reportResult,rows=r?.fields?.indicators||[];
 let result='';
 if(r){
  const reason=r.reason||(!rows.length?'没有读到体检指标，请重新拍清项目、结果、单位和参考范围。':r.fields?.unreadable?'部分报告内容看不清，请补拍并核对缺失字段。':'');
  const marks={high:'↑',low:'↓',normal:'原图标记：正常',unknown:''};
  result='<article class="panel"><h2>'+(rows.length?'报告识别结果 · 待核对':'请重新拍摄报告')+'</h2>'+(reason?'<p role="status">'+esc(reason)+'</p>':'')+rows.map(i=>'<div class="rowline"><h3>'+esc(i.name)+'</h3><p>'+esc([i.value,i.unit,marks[i.flag]].filter(Boolean).join(' '))+'</p><p>参考范围 '+esc(i.reference||'原图未识别')+'</p></div>').join('')+(rows.length?'<p>'+esc(r.explanation)+'</p><a class="sourcelink" href="https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/" target="_blank" rel="noreferrer">资料来源 · MedlinePlus</a><p>'+legal+'</p>':'')+'</article>';
 }
 return sceneShell('看体检报告',b('report-upload','选择报告图片或 PDF','primary','report')+(doc?pdfPicker('report')+pdfResult(doc):result));
}
async function liveAction(a){
 if(await pdfAction(a))return true;
 if(a==='report-upload'){$('reportAlbum').click();return true;}
 if(a.startsWith('account-')){
  const mode=a.slice(8);
  if(mode==='logout'){try{Object.assign(state,await api.auth('logout'));update();}catch(e){toast(e.message);}return true;}
  showModal('<h2>'+(mode==='login'?'登录账户':'注册账户')+'</h2><form id="accountForm" data-mode="'+mode+'" class="stack"><label>用户名<input name="username" required minlength="3" maxlength="40" autocomplete="username"></label><label>密码<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="'+(mode==='login'?'current-password':'new-password')+'"></label><button class="primary">'+(mode==='login'?'登录':'注册')+'</button></form>');return true;
 }
 if(a.startsWith('reminder-')){try{const r=api.reminders.find(x=>x.id===a.slice(9));await api.toggleReminder(r.id,!r.enabled);render();}catch(e){toast(e.message);}return true;}
 if(a.startsWith('ack-')){try{await api.raw('/reminder-events/'+a.slice(4)+'/ack','POST',{});$('modal').close();}catch(e){toast(e.message);}return true;}
 return false;
}
async function liveAccount(form){
 const button=form.querySelector('button');button.disabled=true;
 try{const data=Object.fromEntries(new FormData(form));Object.assign(state,await api.auth(form.dataset.mode,data));$('modal').close();update();}
 catch(e){toast(e.message);}finally{button.disabled=false;}
}
$('reportAlbum').onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file||networkBusy||picturePending)return;
 if(isPDF(file))return uploadPDF(file,'report');
 networkBusy=true;networkStatus='正在读取报告…';render();
 try{const photo=await api.photo(await readPhoto(file),'report');setPDF('report',null);state.reportResult=await api.raw('/reports','POST',{upload_id:photo.id});}
 catch(err){toast(err.message);}finally{networkBusy=false;networkStatus='';update();positionChat();}
};
if(api?.enabled){
 window.addEventListener('anban:account-changed',()=>{stopVoice();Object.assign(state,{profile:{},draft:null,cards:[],messages:[],reportResult:null,pdfDocuments:{},remoteCatalog:[],scene:'home',activeId:'',query:'',note:'',reminder:null});save();render();});
 api.ready.then(data=>{Object.assign(state,data);backendReady=true;render();}).catch(e=>{toast(e.message+' 请确认本机后端仍在运行。');});
 window.addEventListener('anban:api-error',e=>toast(e.detail));
 const shownEvents=new Set();
 setInterval(async()=>{
  if(!backendReady||document.hidden||$('modal').open)return;
  try{const r=await api.raw('/reminder-events');const event=r.items.find(x=>!shownEvents.has(x.id));if(!event)return;shownEvents.add(event.id);showModal('<h2>'+esc(event.at)+' · 用药提醒</h2><p>请查看已经核对的用药卡。</p>'+b('open-'+event.card_id,'查看用药卡','primary')+b('ack-'+event.id,'我知道了'));}
  catch{/* A transient polling failure does not interrupt active editing. */}
 },30000);
}
