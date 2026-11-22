'use strict';

function isPDF(file){return file.type==='application/pdf'||/\.pdf$/i.test(file.name);}
function currentPDF(kind){return state.pdfDocuments?.[kind];}
function setPDF(kind,doc){state.pdfDocuments??={};state.pdfDocuments[kind]=doc;}
function pdfStatus(page){
 if(page.error)return '识别失败';
 if(!page.result)return '';
 return page.result.status==='manual_required'?'需要核对':'已识别';
}
function pdfPicker(kind){
 const doc=currentPDF(kind);if(!doc)return '';
 const selected=doc.selected||[],busy=networkBusy||picturePending;
 return '<section class="panel pdf-picker" aria-label="PDF 页面选择"><h2>'+esc(kind==='medicine'?'选择同一种药的说明书页':'选择要解读的报告页')+'</h2><p class="pdf-filename">'+esc(doc.filename)+'</p><div class="row"><span>共 '+doc.page_count+' 页</span><strong id="pdf-count">已选 '+selected.length+' / 5 页</strong></div><div class="pdf-pages">'+doc.pages.map(p=>'<div class="pdf-page"><label><img loading="lazy" src="'+esc(p.preview_url)+'" alt="第 '+p.page+' 页预览"><span><input type="checkbox" data-pdf-kind="'+kind+'" data-pdf-page="'+p.page+'" '+(selected.includes(p.page)?'checked ':'')+(busy?'disabled':'')+'>第 '+p.page+' 页</span></label>'+b('pdf-view-'+kind+'-'+p.page,'放大查看')+(pdfStatus(p)?'<span class="pdf-status">'+esc(pdfStatus(p))+'</span>':'')+'</div>').join('')+'</div><button type="button" class="primary" data-a="pdf-process-'+kind+'" '+(!selected.length||busy?'disabled':'')+'>'+(busy?networkStatus:kind==='medicine'?'识别并加入核对':'识别所选页面')+'</button>'+(doc.uiError?'<p class="error" role="alert">'+esc(doc.uiError)+'</p>':'')+'</section>';
}
function pdfResult(doc){
 const pages=doc.pages.filter(p=>doc.selected.includes(p.page));
 if(!pages.some(p=>p.result||p.error))return '';
 const marks={high:'↑',low:'↓',normal:'原图标记：正常',unknown:''};
 const hasRows=pages.some(p=>p.result?.fields?.indicators?.length);
 return '<article class="panel pdf-results"><h2>'+(hasRows?'报告识别结果 · 待核对':'暂未读到体检指标')+'</h2>'+pages.map(p=>{
  const r=p.result,rows=r?.fields?.indicators||[],reason=p.error||r?.reason||(!r?'这一页尚未识别。':!rows.length?'这一页没有读到体检指标，请核对原页或换页。':'');
  return '<section class="stack rowline"><div class="row"><h3>第 '+p.page+' 页</h3>'+b('pdf-view-report-'+p.page,'查看原页')+'</div>'+(reason?'<p'+(p.error?' class="error" role="alert"':'')+'>'+esc(reason)+'</p>':'')+rows.map(i=>'<div class="report-indicator"><h3>'+esc(i.name)+'</h3><p>'+esc([i.value,i.unit,marks[i.flag]].filter(Boolean).join(' '))+'</p><p>参考范围 '+esc(i.reference||'原页未识别')+'</p></div>').join('')+(p.error?b('pdf-retry-'+p.page,'重试这一页'):'')+'</section>';
 }).join('')+(hasRows?'<p>'+esc(reportMeaning)+'</p><a class="sourcelink" href="https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/" target="_blank" rel="noreferrer">资料来源 · MedlinePlus</a><p>'+legal+'</p>':'')+'</article>';
}
function focusPDF(selector){const pane=document.querySelector('.page-scroll'),element=document.querySelector(selector);if(pane&&element)pane.scrollTop+=element.getBoundingClientRect().top-pane.getBoundingClientRect().top-10;}
function pdfOriginal(url,title){showModal('<h2>'+esc(title)+'</h2><a class="pdf-original-link" href="'+esc(url)+'" target="_blank" rel="noopener">打开完整图片</a><img class="pdf-original" src="'+esc(url)+'" alt="'+esc(title)+'">');}
async function uploadPDF(file,kind){
 if(networkBusy||picturePending)return;
 if(file.size>8*1024*1024)return toast('PDF 不能超过 8 MB。');
 networkBusy=true;networkStatus='正在准备 PDF 页面…';render();
 try{
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('文件读取失败，请重新选择。'));reader.readAsDataURL(file);});
  const doc=await api.raw('/documents','POST',{filename:file.name,kind,data_url:'data:application/pdf;base64,'+data.split(',')[1]});
  setPDF(kind,doc);if(kind==='report')state.reportResult=null;
  logMessage('user','上传了 '+file.name+'。');
 }catch(e){toast(e.message);}
 finally{networkBusy=false;networkStatus='';update();focusPDF('.pdf-picker');}
}
async function processPDF(kind,onlyPage=null){
 const doc=currentPDF(kind);if(!doc||!doc.selected.length||networkBusy)return;
 networkBusy=true;doc.uiError='';networkStatus='正在保存所选页面…';render();
 try{
  let current=await api.raw('/documents/'+doc.id+'/selection','PUT',{pages:doc.selected});setPDF(kind,current);
  const pages=current.selected.filter(n=>onlyPage===null||n===onlyPage);
  for(const page of pages){
   const existing=current.pages.find(p=>p.page===page);
   if(!onlyPage&&!existing.error&&existing.result&&(existing.result.status!=='manual_required'||existing.result.reason_code==='image_unreadable'))continue;
   networkStatus='正在识别第 '+page+' 页…';render();
   try{current=await api.raw('/documents/'+doc.id+'/pages/'+page+'/analyze','POST',{});}
   catch(e){current=await api.raw('/documents/'+doc.id);current.uiError=e.message;}
   setPDF(kind,current);render();
  }
  if(kind==='medicine'){
   state.draft=await api.attachDocument(state.draft,doc.id);
   setPDF(kind,null);logMessage('assistant','说明书已作为一种药加入，请按医嘱核对吃法。');
  }else{
   const reports=await api.raw('/reports');state.reportResult=reports.items.find(r=>r.document_id===doc.id)||state.reportResult;
  }
 }catch(e){const current=currentPDF(kind);if(current)current.uiError=e.message;else toast(e.message);}
 finally{networkBusy=false;networkStatus='';update();if(kind==='report')focusPDF('.pdf-results');else if(currentPDF(kind))focusPDF('.pdf-picker');}
}
async function pdfAction(a){
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
document.addEventListener('change',e=>{
 const checkbox=e.target.closest('[data-pdf-page]');if(!checkbox)return;
 const doc=currentPDF(checkbox.dataset.pdfKind),number=Number(checkbox.dataset.pdfPage);
 if(!doc)return;
 if(checkbox.checked&&doc.selected.length>=5){checkbox.checked=false;return toast('每次最多识别五页，请减少所选页面。');}
 doc.selected=checkbox.checked?[...doc.selected,number].sort((a,b)=>a-b):doc.selected.filter(n=>n!==number);
 document.getElementById('pdf-count').textContent='已选 '+doc.selected.length+' / 5 页';
 const process=document.querySelector('[data-a="pdf-process-'+doc.kind+'"]');if(process)process.disabled=!doc.selected.length;
});
document.getElementById('medicinePdf').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file&&state.draft&&!state.draft.demo)uploadPDF(file,'medicine');};
