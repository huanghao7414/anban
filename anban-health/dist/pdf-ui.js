'use strict';

function isPDF(file){return file.type==='application/pdf'||/\.pdf$/i.test(file.name);}
function currentPDF(kind){return state.pdfDocuments?.[kind];}
function setPDF(kind,doc){
 state.pdfDocuments??={};
 const previous=state.pdfDocuments[kind];
 if(doc&&previous?.id===doc.id)doc.searchQuery=previous.searchQuery;
 state.pdfDocuments[kind]=doc;
}
function pdfStatus(page){
 if(page.error)return '识别失败';
 if(!page.result)return '';
 return page.result.status==='manual_required'?'需要核对':'已识别';
}
function reportPageAction(selected,busy){
 return '<div class="pdf-selection-actions"><strong id="pdf-count">已选 '+selected.length+' / 5 页</strong>'+
  '<button type="button" class="primary" data-a="pdf-process-report" '+(!selected.length||busy?'disabled':'')+'>'+
  (busy?'正在处理…':selected.length?'识别所选 '+selected.length+' 页':'开始识别')+'</button>'+
  '<p id="pdf-selection-hint"'+(selected.length||busy?' hidden':'')+'>先勾选包含检查结果的页面。</p></div>';
}
let pdfWork=null;
let pdfWorkTimer;
function pdfWorkView(){
 if(!pdfWork)return '';
 const {started,completed,total}=pdfWork;
 return '<div class="pdf-progress" role="status"><strong>'+esc(networkStatus)+'</strong>'+
  '<progress aria-label="PDF 处理进度"'+(total?' max="'+total+'" value="'+completed+'"':'')+'></progress>'+
  '<span>'+(total?'已处理 '+completed+' / '+total+' 页 · ':'')+
  '已等待 <span id="pdfElapsed">'+Math.floor((Date.now()-started)/1000)+'</span> 秒</span></div>';
}
function beginPDFWork(status){
 networkBusy=true;
 networkStatus=status;
 pdfWork={started:Date.now(),completed:0,total:0};
 pdfWorkTimer=setInterval(()=>{
  const elapsed=document.getElementById('pdfElapsed');
  if(elapsed)elapsed.textContent=Math.floor((Date.now()-pdfWork.started)/1000);
 },1000);
 render();
}
function endPDFWork(){
 clearInterval(pdfWorkTimer);
 pdfWork=null;
 networkBusy=false;
 networkStatus='';
}
function reportPageMatches(page,query){
 const key=query.normalize('NFKC').toLowerCase().replace(/\s/g,'');
 if(!key)return true;
 const pageNumber=key.match(/^(?:第)?(\d+)(?:页)?$/);
 if(pageNumber)return Number(pageNumber[1])===page.page;
 return (page.search_text||'').normalize('NFKC').toLowerCase().replace(/\s/g,'').includes(key);
}
function reportSearchMessage(doc){
 if(!doc.searchQuery?.trim())return '';
 const count=doc.pages.filter(p=>reportPageMatches(p,doc.searchQuery)).length;
 return count?'找到 '+count+' 页':'未找到匹配页，可试试页码。';
}
function searchReportPages(doc,input){
 doc.searchQuery=input.value;
 const pages=new Map(doc.pages.map(page=>[page.page,page]));
 for(const card of document.querySelectorAll('.pdf-page[data-report-page]')){
  card.hidden=!reportPageMatches(pages.get(Number(card.dataset.reportPage)),doc.searchQuery);
 }
 document.getElementById('reportPageSearchStatus').textContent=reportSearchMessage(doc);
}
function pdfPicker(kind){
 const doc=currentPDF(kind);if(!doc)return '';
 const selected=doc.selected||[],busy=networkBusy||picturePending;
 return '<section class="panel pdf-picker" aria-label="PDF 页面选择"><h2>'+esc(kind==='medicine'?'选择同一种药的说明书页':'选择要识别的报告页')+'</h2><p class="pdf-filename">'+esc(doc.filename)+'</p><div class="row"><span>共 '+doc.page_count+' 页</span>'+(kind==='medicine'?'<strong id="pdf-count">已选 '+selected.length+' / 5 页</strong>':'')+'</div>'+
 (kind==='report'?'<label class="pdf-search">查找报告页<input type="search" id="reportPageSearch" placeholder="输入页码或关键词，如血常规" value="'+esc(doc.searchQuery||'')+'"></label>'+
  '<p id="reportPageSearchStatus" role="status">'+esc(reportSearchMessage(doc))+'</p>':'')+
 '<div class="pdf-pages">'+doc.pages.map(p=>'<div class="pdf-page"'+(kind==='report'?' data-report-page="'+p.page+'"'+(reportPageMatches(p,doc.searchQuery||'')?'':' hidden'):'')+'><label><img loading="lazy" src="'+esc(p.preview_url)+'" alt="第 '+p.page+' 页预览"><span><input type="checkbox" data-pdf-kind="'+kind+'" data-pdf-page="'+p.page+'" '+(selected.includes(p.page)?'checked ':'')+(busy?'disabled':'')+'>第 '+p.page+' 页</span></label>'+b('pdf-view-'+kind+'-'+p.page,'放大查看')+(pdfStatus(p)?'<span class="pdf-status">'+esc(pdfStatus(p))+'</span>':'')+'</div>').join('')+'</div>'+
 (kind==='report'?reportPageAction(selected,busy):'<button type="button" class="primary" data-a="pdf-process-medicine" '+(!selected.length||busy?'disabled':'')+'>'+
  (busy?esc(networkStatus):'识别并加入核对')+'</button>')+(doc.uiError?'<p class="error" role="alert">'+esc(doc.uiError)+'</p>':'')+'</section>';
}
function pdfResult(doc){
 reportSelection(doc.id);
 const pages=doc.pages.filter(p=>doc.selected.includes(p.page));
 if(!pages.some(p=>p.result||p.error))return '';
 const count=pages.reduce((sum,p)=>sum+(p.error?0:p.result?.fields?.indicators?.length||0),0);
 const groups=pages.map(p=>{
  const result=p.result, rows=p.error?[]:result?.fields?.indicators||[];
  const reason=p.error||result?.reason||(!result?'等待识别。':!rows.length?'这一页没有读到体检指标，请核对原页或换页。':'');
  return '<section class="stack rowline"><div class="row"><h3>第 '+p.page+' 页</h3>'+b('pdf-view-report-'+p.page,'查看原页')+'</div>'+
   (reason?'<p'+(p.error?' class="error" role="alert"':'')+'>'+esc(reason)+'</p>':'')+
   renderReportIndicators(rows,p.page)+(p.error?b('pdf-retry-'+p.page,'重试这一页'):'')+'</section>';
 }).join('');
 return '<article class="panel pdf-results"><div class="row"><h2>'+(count?'勾选要解读的指标':'报告页识别结果')+'</h2>'+b('pdf-choose-report','返回选页')+'</div>'+
  (count?'<p>对照原报告，只勾选识别正确的项目。</p>':'')+reportIndicatorForm(groups,count)+'</article>';
}
function focusPDF(selector){const pane=document.querySelector('.page-scroll'),element=document.querySelector(selector);if(pane&&element)pane.scrollTop+=element.getBoundingClientRect().top-pane.getBoundingClientRect().top-10;}
function pdfOriginal(url,title){showModal('<h2>'+esc(title)+'</h2><a class="pdf-original-link" href="'+esc(url)+'" target="_blank" rel="noopener">打开完整图片</a><img class="pdf-original" src="'+esc(url)+'" alt="'+esc(title)+'">');}
async function uploadPDF(file,kind){
 if(networkBusy||picturePending)return;
 if(file.size>8*1024*1024)return toast('PDF 不能超过 8 MB。');
 beginPDFWork('正在读取 PDF 文件…');
 try{
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('文件读取失败，请重新选择。'));reader.readAsDataURL(file);});
  networkStatus='正在生成页面预览，页数较多时需要更久…';render();
  const doc=await api.raw('/documents','POST',{filename:file.name,kind,data_url:'data:application/pdf;base64,'+data.split(',')[1]});
  setPDF(kind,doc);if(kind==='report')state.reportResult=null;
  logMessage('user','上传了 '+file.name+'。');
 }catch(e){toast(e.message);}
 finally{endPDFWork();update();focusPDF('.pdf-picker');}
}
async function processPDF(kind,onlyPage=null){
 const doc=currentPDF(kind);if(!doc||!doc.selected.length||networkBusy)return;
 doc.uiError='';beginPDFWork('正在保存所选页面…');
 try{
  let current=await api.raw('/documents/'+doc.id+'/selection','PUT',{pages:doc.selected});setPDF(kind,current);
  const pages=current.selected.filter(n=>onlyPage===null||n===onlyPage);
  pdfWork.total=pages.length;
  for(const page of pages){
   const existing=current.pages.find(p=>p.page===page);
   if(!onlyPage&&!existing.error&&existing.result&&(existing.result.status!=='manual_required'||existing.result.reason_code==='image_unreadable')){
    pdfWork.completed++;
    continue;
   }
   networkStatus='正在识别第 '+page+' 页…';render();
   try{current=await api.raw('/documents/'+doc.id+'/pages/'+page+'/analyze','POST',{});}
   catch(e){current=await api.raw('/documents/'+doc.id);current.uiError=e.message;}
   pdfWork.completed++;
   setPDF(kind,current);render();
  }
  networkStatus='正在整理识别结果…';render();
  if(kind==='medicine'){
   state.draft=await api.attachDocument(state.draft,doc.id);
   setPDF(kind,null);logMessage('assistant','说明书已作为一种药加入，请按医嘱核对吃法。');
  }else{
   const reports=await api.raw('/reports');state.reportResult=reports.items.find(r=>r.document_id===doc.id)||state.reportResult;
  }
 }catch(e){const current=currentPDF(kind);if(current)current.uiError=e.message;else toast(e.message);}
 finally{endPDFWork();update();if(kind==='report')focusPDF('.pdf-results');else if(currentPDF(kind))focusPDF('.pdf-picker');}
}
async function pdfAction(a){
 if(a==='pdf-choose-report'){focusPDF('.pdf-picker');return true;}
 if(a==='medicine-pdf'){if(state.draft?.meds.length>=5)toast('已经添加五种药了。');else document.getElementById('medicinePdf').click();return true;}
 if(a.startsWith('pdf-process-')){await processPDF(a.slice(12));return true;}
 if(a.startsWith('pdf-retry-')){await processPDF('report',Number(a.slice(10)));return true;}
 if(a.startsWith('pdf-view-')){
  const [, ,kind,number]=a.split('-'),doc=currentPDF(kind),page=doc?.pages.find(p=>p.page===Number(number));
  if(page)pdfOriginal(page.image_url,doc.filename+' · 第 '+number+' 页');return true;
 }
 if(a.startsWith('med-page-')){
  const [, ,index,number]=a.split('-'),page=state.draft?.meds[Number(index)]?.sources?.find(p=>p.page===Number(number));
  if(page)pdfOriginal(page.image_url,page.filename+' · 第 '+number+' 页');return true;
 }
 return false;
}
document.addEventListener('input',event=>{
 if(event.target.id==='reportPageSearch'&&currentPDF('report'))searchReportPages(currentPDF('report'),event.target);
});
document.addEventListener('change',e=>{
 const checkbox=e.target.closest('[data-pdf-page]');if(!checkbox)return;
 const doc=currentPDF(checkbox.dataset.pdfKind),number=Number(checkbox.dataset.pdfPage);
 if(!doc)return;
 if(checkbox.checked&&doc.selected.length>=5){checkbox.checked=false;return toast('每次最多识别五页，请减少所选页面。');}
 doc.selected=checkbox.checked?[...doc.selected,number].sort((a,b)=>a-b):doc.selected.filter(n=>n!==number);
 document.getElementById('pdf-count').textContent='已选 '+doc.selected.length+' / 5 页';
 const process=document.querySelector('[data-a="pdf-process-'+doc.kind+'"]');if(process)process.disabled=!doc.selected.length;
 if(doc.kind!=='report')return;
 if(process)process.textContent=doc.selected.length?'识别所选 '+doc.selected.length+' 页':'开始识别';
 document.getElementById('pdf-selection-hint').hidden=!!doc.selected.length;
 document.getElementById('reportPDFResults').innerHTML=pdfResult(doc);
});
document.getElementById('medicinePdf').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file&&state.draft&&!state.draft.demo)uploadPDF(file,'medicine');};
