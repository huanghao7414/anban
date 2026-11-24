
'use strict';

const reportMark = {
 high:'原报告标记：偏高', low:'原报告标记：偏低',
 normal:'原报告标记：正常'
};

function reportKey(name){
 return name.normalize('NFKC').toLowerCase().replace(/[\s-]/g,'');
}

const reportIndex = new Map(reportKnowledge.flatMap(entry =>
 [entry.name,...entry.aliases].map(name=>[reportKey(name),entry])
));

const reportNumber = '[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
const reportValuePattern = new RegExp('^'+reportNumber+'$');
const reportIntervalPattern = new RegExp('^('+reportNumber+')\\s*[-~—–至到]\\s*('+reportNumber+')$');
const reportLimitPattern = new RegExp('^(<=|>=|≤|≥|<|>)\\s*('+reportNumber+')$');

function normalizedReportNumberText(text){
 return (text||'').normalize('NFKC').replace(/−/g,'-').trim();
}

function reportRangeStatus(row){
 const valueText=normalizedReportNumberText(row.value);
 if(!reportValuePattern.test(valueText))return '';
 const value=Number(valueText);
 if(!Number.isFinite(value))return '';
 let reference=normalizedReportNumberText(row.reference);
 const unit=normalizedReportNumberText(row.unit);
 if(unit&&!reportIntervalPattern.test(reference)&&!reportLimitPattern.test(reference)&&reference.endsWith(unit)){
  const rangeText=reference.slice(0,-unit.length);
  if(!/^\d/.test(unit)||/\s$/.test(rangeText))reference=rangeText.trimEnd();
 }
 const interval=reference.match(reportIntervalPattern);
 if(interval){
  const low=Number(interval[1]),high=Number(interval[2]);
  if(!Number.isFinite(low)||!Number.isFinite(high)||low>high)return '';
  return value>=low&&value<=high?'normal':'abnormal';
 }
 const limit=reference.match(reportLimitPattern);
 if(!limit)return '';
 const bound=Number(limit[2]);
 if(!Number.isFinite(bound))return '';
 const inside={
  '<':value<bound,'<=':value<=bound,'≤':value<=bound,
  '>':value>bound,'>=':value>=bound,'≥':value>=bound
 };
 return inside[limit[1]]?'normal':'abnormal';
}

function reportReading(row){
 const mark=reportMark[row.flag];
 const status=reportRangeStatus(row);
 const rangeMark=status==='normal'?'按参考范围：正常。':status==='abnormal'?'按参考范围：异常。':'';
 const conflicting=mark&&status&&(row.flag==='normal')!==(status==='normal');
 return '结果：'+([row.value,row.unit].filter(Boolean).join(' ')||'原报告未识别')+
  '。参考范围：'+(row.reference||'原报告未识别')+'。'+rangeMark+(mark?mark+'。':'')+(conflicting?'与原报告标记不一致，请核对。':'');
}

function reportCardFacts(row){
 const range=reportRangeStatus(row),mark=reportMark[row.flag];
 const conflict=mark&&range&&(row.flag==='normal')!==(range==='normal');
 const status=conflict?'标记不一致，请核对':range==='normal'?'在参考范围内':range==='abnormal'?'超出参考范围':(mark||'请对照原报告');
 return {value:[row.value,row.unit].filter(Boolean).join(' ')||'原报告未识别',
  reference:row.reference||'原报告未识别',status,mark,
  tone:conflict||range==='abnormal'||row.flag==='high'||row.flag==='low'?'attention':range==='normal'?'within':'neutral'};
}

const lifestyleReportSource='https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/';
const lifestyleTopics=[
 {keys:['空腹血糖','空腹葡萄糖','血糖','糖化血红蛋白','葡萄糖','fpg','fbg','hba1c'],
  title:'饮品怎么选',text:'如果医生没有特殊饮食要求，可以把甜饮料换成白水或无糖茶。',
  url:'https://www.cdc.gov/diabetes/prevention-type-2/type-2-diabetes-prevention-guide.html',source:'美国 CDC'},
 {keys:['总胆固醇','低密度脂蛋白胆固醇','低密度脂蛋白','tc','ldl','ldl-c'],
  title:'吃饭时留意油脂',text:'按医生给的饮食要求，平时可多选全谷物、豆类和鱼，少吃肥肉。',
  url:'https://www.heart.org/en/health-topics/cholesterol/prevention-and-treatment-of-high-cholesterol-hyperlipidemia/',source:'美国心脏协会'}
];

function lifestyleIndicators(rows){
 const seen=new Set();
 return rows.flatMap(row=>{
  const name=row.name.trim(),range=reportRangeStatus(row);
  if(!name)return [];
  const flag=reportMark[row.flag]?row.flag:null;
  const conflict=flag&&range&&(flag==='normal')!==(range==='normal');
  const status=conflict?'conflict':flag==='high'?'high':flag==='low'?'low':range==='abnormal'?'outside':range==='normal'?'within':'unmarked';
  const {value='',unit='',reference=''}=row;
  const key=JSON.stringify([name,status,value,unit,reference]);
  if(seen.has(key))return [];
  seen.add(key);
  return [{name,status,value,unit,reference}];
 });
}

const lifestyleStatusLabels={within:'在参考范围内',high:'原报告标记偏高',low:'原报告标记偏低',
 outside:'超出参考范围',conflict:'标记不一致，待核对',review:'待核对',unmarked:'暂无法判断'};
const lifestyleNeedsReview=item=>!['within','unmarked'].includes(item.status);
function lifestyleOverview(indicators){
 const within=indicators.filter(i=>i.status==='within').length;
 const uncertain=indicators.filter(i=>i.status==='unmarked').length;
 const attention=indicators.length-within-uncertain;
 const allInRange=within>0&&within===indicators.length;
 return '<section class="report-card-entry"><h3>本次报告小结</h3>'+
  (allInRange?'<p><strong>这次核对的指标都在参考范围内，目前没有需要针对这些指标特别注意的生活事项。</strong></p>':'')+
  '<p>已核对 '+indicators.length+' 项 · '+within+' 项在参考范围内 · '+attention+' 项需关注 · '+uncertain+' 项暂无法判断</p>'+
  (uncertain?'<p>暂无法判断的项目，请对照原报告上的结果、单位和参考范围。</p>':'')+'</section>';
}

function lifestyleContent(summary){
 if(!summary)return '<p>还没有生活注意事项。上传体检报告、核对指标并生成大字解读后，这里会显示相关提示。</p>'+
  '<div class="buttons">'+b('lifestyle-report','去看体检报告','primary','report')+b('medication-history','用药记录')+'</div>';
 const {indicators,updated}=summary;
 const note=(title,text,url,source)=>'<section class="report-card-entry"><h3>'+esc(title)+'</h3>'+text+
  '<a class="sourcelink" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">资料来源 · '+esc(source)+'</a></section>';
 const flagged=indicators.filter(lifestyleNeedsReview);
 const notes=note(flagged.length?'带着这些项目去复诊':'留好这次报告',
  (flagged.length?'<ul class="lifestyle-indicators">'+flagged.map(item=>'<li>'+esc(item.name+' · '+lifestyleStatusLabels[item.status])+'</li>').join('')+'</ul>':'')+
  '<p>把这次和以往的报告一起带去就诊，请医生确认哪些项目需要复查。</p>',lifestyleReportSource,'MedlinePlus');
 const topicNotes=lifestyleTopics.map(topic=>{
  const keys=topic.keys.map(reportKey);
  const matches=indicators.filter(item=>item.status==='high'&&keys.includes(reportKey(item.name)));
  if(!matches.length)return '';
  const names=[...new Set(matches.map(item=>item.name))];
  return note(topic.title,'<p class="report-card-reference">相关指标：'+esc(names.join('、'))+'</p><p>'+esc(topic.text)+'</p>',topic.url,topic.source);
 }).join('');
 return '<p class="report-card-reference">根据 '+esc(dateFmt(new Date(updated*1000)))+' 核对的报告指标整理。</p>'+
  lifestyleOverview(indicators)+notes+topicNotes+'<p class="report-card-reference">这些是一般生活提示。饮食、活动或用药有医嘱时，请按医嘱执行。</p>'+
  '<div class="buttons">'+b('lifestyle-report','看体检报告','','report')+
  b('report-history','体检查询记录')+b('medication-history','用药记录')+'</div>';
}

async function openLifestyle(){
 showModal('<div class="report-card-sheet"><header class="report-card-header"><h2>生活注意事项</h2></header>'+
  '<div id="lifestyleContent" class="report-card-sheet"><p role="status">正在读取…</p></div></div>');
 const content=document.getElementById('lifestyleContent');
 try{
  const {summary}=api?.enabled?await api.raw('/reports/lifestyle'):{summary:null};
  if(content.isConnected)content.innerHTML=lifestyleContent(summary);
 }catch(e){
  if(content.isConnected)content.innerHTML='<p class="error" role="alert">'+esc(e.message)+'</p>'+b('show-lifestyle','重新加载');
 }
}

const recordDate=seconds=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'numeric',day:'numeric',
 hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(seconds*1000));
function reportHistoryEntry(item){
 const rows=item.indicators.map(i=>'<li><strong>'+esc(i.name)+'</strong> · '+esc(lifestyleStatusLabels[i.status])+
  (i.value?' · '+esc([i.value,i.unit].filter(Boolean).join(' ')):'')+
  (i.reference?' · 参考范围 '+esc(i.reference):'')+'</li>').join('');
 return '<details class="report-card-entry"><summary>'+esc(recordDate(item.updated))+' · 核对 '+item.indicators.length+' 项</summary><ul>'+rows+'</ul></details>';
}
function medicationHistoryEntry(item){
 return '<section class="report-card-entry"><h3>'+esc(item.name)+'</h3><p>'+esc(doseLabel(item.dose))+' · 安排时间 '+esc(item.time)+'</p>'+
  '<p>登记于 '+esc(recordDate(item.recorded_at))+'</p></section>';
}
async function openHealthHistory(kind){
 const medicine=kind==='medication';
 const path=medicine?'/medication-log':'/reports/lifestyle/history';
 const renderEntry=medicine?medicationHistoryEntry:reportHistoryEntry;
 const title=medicine?'用药记录':'体检查询记录';
 showModal('<div class="report-card-sheet"><header class="report-card-header"><h2>'+title+'</h2></header>'+
  (medicine?'<p>这里显示你手动登记的实际服用记录。'+(state.cards.some(c=>!c.demo)?' 服用后可到大字用药卡登记。':'')+'</p>':'')+
  '<div id="healthHistory" class="report-card-sheet"></div><p id="historyStatus" role="status"></p>'+
  '<button type="button" id="healthHistoryMore" hidden>查看更多</button>'+b('show-lifestyle','返回生活注意事项')+'</div>');
 const content=document.getElementById('healthHistory'),status=document.getElementById('historyStatus');
 const more=document.getElementById('healthHistoryMore');
 let next=null;
 async function load(){
  more.disabled=true;status.textContent='正在读取记录…';
  try{
   const result=await api.raw(path+(next===null?'':'?before='+encodeURIComponent(next)));
   if(!content.isConnected)return;
   content.insertAdjacentHTML('beforeend',result.items.map(renderEntry).join(''));
   status.textContent=content.children.length?'':'暂无记录。';
   next=result.next;more.textContent='查看更多';more.hidden=next===null;
  }catch(e){status.textContent=e.message;more.textContent='重试';more.hidden=false;}
  finally{more.disabled=false;}
 }
 more.onclick=load;await load();
}

let reportSelectionScope='';
const selectedReportIndicators=new Set();

function reportSelection(scope){
 if(scope!==reportSelectionScope){
  reportSelectionScope=scope;
  selectedReportIndicators.clear();
 }
}

function reportIndicatorKey(row,index,page){
 return JSON.stringify([page,index,row.name,row.value,row.unit,row.reference,row.flag]);
}

function renderReportIndicators(rows,page=null){
 return rows.map((row,index)=>{
  const key=reportIndicatorKey(row,index,page);
  return '<label class="report-indicator-option"><input type="checkbox" name="indicator" value="'+esc(key)+'" '+
   (selectedReportIndicators.has(key)?'checked':'')+'>'+
   '<span><strong>'+esc(row.name)+'</strong><span>'+esc(reportReading(row))+'</span></span></label>';
 }).join('');
}

function reportIndicatorForm(content,count){
 return count?'<form id="reportIndicators" class="stack">'+content+
  '<button type="submit" class="primary" '+(networkBusy?'disabled':'')+'>生成大字版解读</button></form>':content;
}

function submitReportIndicators(form){
 if(networkBusy)return;
 const keys=new Set(new FormData(form).getAll('indicator'));
 const doc=currentPDF('report');
 const source=doc?doc.pages.filter(p=>doc.selected.includes(p.page)&&!p.error)
  .map(p=>({page:p.page,rows:p.result?.fields?.indicators||[]})):
  [{page:null,rows:state.reportResult?.fields?.indicators||[]}];
 const rows=source.flatMap(({page,rows})=>rows.filter((row,index)=>keys.has(reportIndicatorKey(row,index,page))));
 if(!rows.length)return toast('请先勾选要解读的指标。');
 const indicators=lifestyleIndicators(rows);
 if(api?.enabled&&indicators.length)api.raw('/reports/lifestyle','PUT',{indicators})
  .catch(()=>toast('这次生活注意事项未能保存，请稍后重新生成解读。'));
 prepareReportCard(rows);
}

document.addEventListener('change',event=>{
 const checkbox=event.target.closest('#reportIndicators input[name="indicator"]');
 if(!checkbox)return;
 if(checkbox.checked)selectedReportIndicators.add(checkbox.value);
 else selectedReportIndicators.delete(checkbox.value);
});

async function prepareReportCard(rows){
 const entries=rows.map(row=>({row,entry:reportIndex.get(reportKey(row.name))}));
 const missing=new Map();
 entries.forEach((item,index)=>{
  const key=reportKey(item.row.name);
  if(item.entry||!key)return;
  item.lookupMessage='等待联网查询…';
  item.pending=true;
  if(!missing.has(key))missing.set(key,[]);
  missing.get(key).push(index);
 });
 const card=showReportCard(entries,missing.size);
 if(!missing.size)return;
 const queue=[...missing.values()];
 let completed=0;
 async function lookup(){
  while(card.isOpen()&&queue.length){
   const indices=queue.shift();
   for(const index of indices)entries[index].lookupMessage='正在联网查询…';
   card.refresh(indices,completed);
   let record;
   try{
    const {entry}=await api.raw('/reports/indicator','POST',{name:entries[indices[0]].row.name});
    record=entry?{entry}:{lookupMessage:'未找到可核实的公开资料，可请医生解释。'};
   }catch{
    record={lookupMessage:'联网解读暂时不可用，可稍后重试。'};
   }
   if(!card.isOpen())return;
   for(const index of indices)Object.assign(entries[index],record,{pending:false});
   card.refresh(indices,++completed);
  }
 }
 await Promise.all(Array.from({length:Math.min(3,queue.length)},lookup));
}

function showReportCard(entries,total){
 const next='把这次和以往的报告一起带去就诊，问医生哪些项目需要复查。';
 const age=Number(state.profile?.age);
 const diet=state.profile?.diet?.trim();
 const activity=age>=65?'身体允许且医生未限制活动时，可以从自己能安全完成的轻度活动开始，逐步增加。':'';
 const activitySource='https://www.cdc.gov/physical-activity-basics/adding-older-adults/';
 const dietNote=diet?'档案中记录的忌口：'+diet+'。饮食有疑问时，可带着报告和忌口记录一起咨询。':'';
 const sources=[...new Set(entries.flatMap(({entry})=>entry?[entry.source]:[]))];
 const meaning=(entry,message)=>entry?.meaning||message||'这个项目暂未收录，可请医生解释。';
 const publisher=entry=>({
  'medlineplus.gov':'MedlinePlus',
  'www.cdc.gov':'美国 CDC',
  'www.radiologyinfo.org':'RadiologyInfo'
 })[new URL(entry.source).hostname];
 const sourceLabel=entry=>{
  if(!sources.includes(entry.source))sources.push(entry.source);
  return '资料 '+(sources.indexOf(entry.source)+1);
 };
 const title='体检报告大字解读卡';
 const renderEntry=({row,entry,lookupMessage,pending})=>{
  const facts=reportCardFacts(row);
  return '<h3>'+esc(row.name)+'</h3><div class="report-card-measure"><div><span>检查结果</span><strong>'+esc(facts.value)+'</strong></div>'+
   '<span class="report-card-status '+facts.tone+'">'+esc(facts.status)+'</span></div>'+
   '<p class="report-card-reference">参考范围：'+esc(facts.reference)+(facts.mark&&facts.mark!==facts.status?' · '+esc(facts.mark):'')+'</p>'+
   '<div class="report-card-explanation"><h4>怎么看</h4><p class="report-plain-meaning'+(pending?' report-meaning-pending':'')+'">'+esc(meaning(entry,lookupMessage))+
   '</p>'+(entry?.note?'<p>'+esc(entry.note)+'</p>':'')+'</div>'+
   (entry?'<a class="sourcelink" target="_blank" rel="noopener noreferrer" href="'+esc(entry.source)+'">'+sourceLabel(entry)+' · '+esc(publisher(entry))+(entry.online?' · 联网解读':'')+'</a>':'');
 };
 showModal('<div class="report-card-sheet"><header class="report-card-header"><h2>'+title+'</h2><p>已核对 '+entries.length+' 项指标</p></header><p id="reportLookupStatus" role="status">'+
  (total?'联网查询中 · 0 / '+total+' 项':'')+'</p>'+entries.map((item,index)=>
   '<section class="report-card-entry" id="reportEntry'+index+'">'+renderEntry(item)+'</section>'
 ).join('')+'<section class="report-card-entry"><h3>日常生活与复查</h3><p>'+next+'</p>'+
 (activity?'<p>'+activity+'</p><a class="sourcelink" target="_blank" rel="noopener noreferrer" href="'+activitySource+'">活动资料 · CDC</a>':'')+
 (dietNote?'<p>'+esc(dietNote)+'</p>':'')+'<p class="report-card-reference">'+legal+'</p><p class="report-card-reference">指标词典 v'+reportKnowledgeVersion+'</p></section>'+
 '<div class="buttons"><button type="button" class="primary" id="reportSave" '+(total?'disabled':'')+'>下载 PNG</button><button type="button" id="reportPreview" '+(total?'disabled':'')+'>预览大字图片</button>'+
 '<button type="button" id="reportSpeak" '+(total?'disabled':'')+'>听语音摘要</button></div></div>');
 const status=document.getElementById('reportLookupStatus');
 const modal=document.getElementById('modal');
 const saveButton=document.getElementById('reportSave');
 const previewButton=document.getElementById('reportPreview');
 const speakButton=document.getElementById('reportSpeak');
 const isOpen=()=>status.isConnected&&modal.open;
 function prepareAudio(){
 const summary=entries.filter(({entry})=>entry).slice(0,2)
  .map(({entry})=>entry.name+'。'+entry.meaning).join('');
 const text='这是您核对的体检报告解读。'+(summary.length<=175?summary:'')+'完整内容请看大字卡。'+next;
 speakButton.onclick=()=>speak(text,55);
 api.raw('/reports/voice','POST',{text}).then(blob=>{
  if(!speakButton.isConnected||!document.getElementById('modal').open)return;
  const url=URL.createObjectURL(blob);
  const player=document.createElement('audio');
  player.controls=true;player.src=url;player.setAttribute('aria-label','体检报告语音摘要');
  speakButton.replaceWith(player);
  player.addEventListener('error',()=>{
   if(player.isConnected)player.replaceWith(speakButton);
   URL.revokeObjectURL(url);
  },{once:true});
  const modal=document.getElementById('modal');
  const observer=new MutationObserver(()=>{
   if(!player.isConnected||!modal.open){
    player.pause();URL.revokeObjectURL(url);observer.disconnect();
   }
  });
  observer.observe(modal,{attributes:true,attributeFilter:['open'],childList:true,subtree:true});
 }).catch(()=>{/* Browser speech remains available. */});
 }
 function renderReportImages(){
  const pages=[];
  for(let start=0;start<entries.length;start+=4){
   const batch=entries.slice(start,start+4);
   pages.push(renderLargeCard(add=>{
    add(title,60,750,24);
    if(entries.length>4)add('第 '+(pages.length+1)+' / '+Math.ceil(entries.length/4)+' 张',36,500,24);
    for(const {row,entry,lookupMessage} of batch){
     const facts=reportCardFacts(row);
     add(row.name,51,750,8);
     add(facts.value,65,750,8,'#143e43');
     add(facts.status,39,700,8,facts.tone==='attention'?'#8a441e':'#175448');
     add('参考范围：'+facts.reference+(facts.mark&&facts.mark!==facts.status?' · '+facts.mark:''),36,500,16);
     add('怎么看：'+meaning(entry,lookupMessage),43,600,12,'#175448');
     if(entry?.note)add(entry.note,41,500,8);
     if(entry)add(sourceLabel(entry)+' · '+publisher(entry)+(entry.online?' · 联网解读':''),34,500,25);
    }
    add('日常生活与复查',49,750,10);
    add(next,42,600,20);
    if(activity){add(activity,42,500,10);add(activitySource,30,500,10);}
    if(dietNote)add(dietNote,42,500,10);
    add(legal,36,500,12);
    add('指标词典 v'+reportKnowledgeVersion,32,500,10);
    for(const {entry} of batch.filter(({entry},i)=>entry&&batch.findIndex(item=>item.entry?.source===entry.source)===i)){
     add(sourceLabel(entry)+' '+entry.source,30,500,10);
    }
   }));
  }
  return pages;
 }
 function showImagePreview(pages){
  showModal('<h2>'+title+'</h2><p>手机可长按图片保存。</p>');
  pages.forEach((canvas,index)=>{
   const name=title+(pages.length>1?' '+(index+1):'')+'.png';
   const save=document.createElement('button');
   save.type='button';save.textContent='下载'+(pages.length>1?'第 '+(index+1)+' 张':'图片');
   save.onclick=()=>canvas.toBlob(blob=>blob?download(blob,name):toast('图片生成失败，请再试一次。'));
   const preview=document.createElement('img');
   preview.src=canvas.toDataURL('image/png');preview.alt=name;preview.className='pdf-original';
   document.getElementById('modalContent').append(save,preview);
  });
 }
 previewButton.onclick=()=>showImagePreview(renderReportImages());
 saveButton.onclick=()=>{
  const images=renderReportImages();
  if(images.length>1){showImagePreview(images);return;}
  images[0].toBlob(blob=>blob?download(blob,title+'.png'):toast('图片生成失败，请再试一次。'));
 };
 if(entries.length>4)saveButton.textContent='选择图片下载';
 if(!total)prepareAudio();
 return {
  isOpen,
  refresh(indices,completed){
   for(const index of indices)document.getElementById('reportEntry'+index).innerHTML=renderEntry(entries[index]);
   status.textContent=completed===total?'联网查询完成 · '+total+' 项':'联网查询中 · '+completed+' / '+total+' 项';
   if(completed!==total)return;
   saveButton.disabled=false;
   previewButton.disabled=false;
   speakButton.disabled=false;
   prepareAudio();
  },
 };
}
