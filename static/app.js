"use strict";
const $ = (id) => document.getElementById(id);
const selected = new Map();
let page = 1, version = "", query = "", catalogRequest = 0, checkRequest = 0, detailRequest = 0;
let currentRows = new Map();
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, fn, className) {
  const b = el("button", text, className);
  b.onclick = fn;
  return b;
}
function error(message = "") {
  $("error").textContent = message;
  $("error").hidden = !message;
}
async function api(path, params = {}, body) {
  if (version) params.version = version;
  const options = body ? {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)} : {};
  let response;
  try { response = await fetch(path + "?" + new URLSearchParams(params), options); }
  catch { throw new Error("连接失败，请确认本机服务已启动。"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}
function cite(source) {
  const a = el("a", source.title + " · " + source.locator);
  a.href = source.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}
function productRow(p) {
  const row = el("article", undefined, "row");
  const title = button(p.name, () => showDetail(p.id), "link");
  const main = el("div");
  main.append(title, el("div", [p.spec,p.approval].join(" · "), "meta"), el("div",p.maker,"meta"));
  const added = selected.has(p.id);
  const add = button(added ? "已加入" : "加入清单", () => {
    if (selected.size >= 30) { error("清单最多容纳 30 个产品"); return; }
    selected.set(p.id,p);
    selectionChanged();
  });
  add.disabled = added;
  row.append(main, add);
  return row;
}
function renderList() {
  $("list").replaceChildren(...Array.from(currentRows.values(), productRow));
  if (!currentRows.size) $("list").append(el("p","没有符合条件的产品","card"));
}
async function loadCatalog() {
  const request = ++catalogRequest;
  try {
    const data = await api("/api/catalog", {q:query,page,mapped:$("mapped").checked ? "1":"0"});
    if (request !== catalogRequest) return;
    error();
    version = data.summary.version;
    page = data.page;
    $("totalStat").textContent = data.summary.products + " 个产品";
    $("resultCount").textContent = "共 " + data.total + " 条";
    const pages = Math.max(1,Math.ceil(data.total / data.per_page));
    $("page").textContent = page + " / " + pages;
    $("prev").disabled = page <= 1;
    $("next").disabled = page >= pages;
    currentRows = new Map(data.items.map(p => [p.id,p]));
    renderList();
  } catch (e) { if (request === catalogRequest) error(e.message); }
}
function selectionChanged() {
  ++checkRequest;
  error();
  $("report").replaceChildren();
  $("selectedCount").textContent = selected.size;
  $("selected").replaceChildren();
  for (const [id,p] of selected) {
    const div = el("div", undefined, "pick");
    div.append(button("移除", () => {selected.delete(id); selectionChanged();}),
      el("strong", p.name), el("div", p.spec + " · " + p.id, "meta"));
    $("selected").append(div);
  }
  $("check").disabled = selected.size < 2;
  $("check").textContent = "核查用药";
  renderList();
}
async function showDetail(id) {
  const request = ++detailRequest;
  try {
    const p = await api("/api/product", {id});
    if (request !== detailRequest) return;
    const body = $("detailBody"), dl = el("dl");
    const fields = [["批准文号",p.approval],["生产企业",p.maker],["目录规格",p.spec],["给药途径",p.route || "待核对"],
      ["成分映射",({complete:"已映射",partial:"部分已映射",unknown:"待补充"})[p.mapping]]];
    for (const [k,v] of fields) dl.append(el("dt",k),el("dd",v));
    for (const comp of p.components) dl.append(el("dt","活性成分"),el("dd",[comp.name,comp.strength].filter(Boolean).join(" · ")));
    body.replaceChildren(el("h3",p.name),dl,el("h3","渠道销售记录"));
    if (!p.availability.length) body.append(el("p","暂无渠道确认记录"));
    for (const a of p.availability) {
      body.append(el("p",[a.region,a.channel,a.status,a.current?"当前有效":"历史记录"].join(" · ")),
        el("p",a.observed_on+" 至 "+a.valid_until),cite(a.evidence));
    }
    body.append(el("h3","产品来源"),el("p",p.evidence.publisher+" · "+p.evidence.date),cite(p.evidence));
    if (!$("detail").open) $("detail").showModal();
  } catch (e) {error(e.message);}
}
function showReport(r) {
  const out = $("report");
  const names = new Map(r.products.map(p=>[p.id,p.name+"（"+p.id+"）"]));
  const productNames = (ids) => ids.map(id=>names.get(id)).join("、");
  out.replaceChildren(el("h3","核查结果"));
  for (const d of r.duplicates) {
    const section = el("div",undefined,"result");
    section.append(el("strong","成分重叠 · "+d.ingredient),el("p",productNames(d.products)));
    for (const src of d.evidence) section.append(cite(src));
    out.append(section);
  }
  for (const x of [...r.interactions,...r.candidates]) {
    const section = el("div",undefined,"result");
    section.append(el("strong",x.status === "draft" ? "待药师复核的说明书线索" : "已审核相互作用"),
      el("p",x.finding),el("p",productNames(x.products)),cite(x.evidence));
    out.append(section);
  }
  if (r.incomplete.length) out.append(el("p","成分资料不足："+productNames(r.incomplete),"notice"));
  if (r.missing_route.length) out.append(el("p","给药途径待补："+productNames(r.missing_route),"notice"));
  if (!r.duplicates.length) out.append(el("p","已映射成分中未发现重叠。"));
  if (!r.reviewed_rule_count) out.append(el("p","本版已审核相互作用规则为 0 条，联合用药风险尚未评估。","notice"));
  else if (!r.interactions.length) out.append(el("p","当前已审核规则未命中。"));
  out.append(el("p","范围：同时使用的产品。剂量、患者禁忌和注射配伍未评估。"),el("p","知识库版本 "+r.version,"meta"));
}
$("check").onclick = async () => {
  const request = ++checkRequest;
  $("check").disabled=true;
  $("check").textContent="核查中…";
  try {
    const r=await api("/api/check",{}, {products:[...selected.keys()]});
    if (request === checkRequest) {error(); showReport(r);}
  } catch(e) {if(request === checkRequest) error(e.message);}
  finally {if(request === checkRequest){$("check").disabled=false; $("check").textContent="核查用药";}}
};
async function switchTab(rules) {
  $("catalog").hidden=rules;
  $("rules").hidden=!rules;
  $("navCatalog").toggleAttribute("aria-current",!rules);
  $("navRules").toggleAttribute("aria-current",rules);
  if (!rules) return;
  try {
    const items = await api("/api/rules");
    $("ruleList").replaceChildren();
    for (const r of items) {
      const node=el("article",undefined,"card");
      node.append(el("div",r.status==="draft"?"待药师审核":"已审核 · "+r.reviewer+" · "+r.reviewed_on,"pill"),
        el("h2",r.product_name+" × "+r.ingredient_name),el("p",r.product+" · 对方给药途径："+r.route),
        el("p",r.finding),cite(r.evidence));
      $("ruleList").append(node);
    }
    if (!items.length) $("ruleList").append(el("p","此版本暂无相互作用规则。","card"));
  } catch(e){error(e.message);}
}
$("search").onsubmit=e=>{e.preventDefault(); query=$("q").value; page=1; loadCatalog();};
$("mapped").onchange=()=>{page=1; loadCatalog();};
$("prev").onclick=()=>{page--;loadCatalog();};
$("next").onclick=()=>{page++;loadCatalog();};
$("close").onclick=()=>$("detail").close();
$("navRules").onclick=()=>switchTab(true);
$("navCatalog").onclick=()=>switchTab(false);
loadCatalog();
