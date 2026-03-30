import { useState, useEffect, useRef } from "react";

let API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || "";

function setApiKey(key) { API_KEY = key; }

const COMPANIES = ["L'Oréal", "P&G", "Unilever", "아모레퍼시픽", "Shiseido", "Kao", "한국콜마", "코스맥스"];
const COMPANY_AFFIL = {
  "L'Oréal": "L'Oreal OR Loreal",
  "P&G": "\"Procter & Gamble\" OR \"Procter and Gamble\"",
  "Unilever": "Unilever",
  "아모레퍼시픽": "Amorepacific",
  "Shiseido": "Shiseido",
  "Kao": "\"Kao Corporation\" OR \"Kao Corp\"",
  "한국콜마": "\"Kolmar Korea\" OR \"Korea Kolmar\"",
  "코스맥스": "\"Cosmax\" OR \"Cosmax BTI\"",
};
const SHOPS = ["올리브영", "Sephora", "Amazon"];
const SHOP_DOMAINS = { "올리브영": "oliveyoung.co.kr", "Sephora": "sephora.com", "Amazon": "amazon.com" };
const SOURCE_TYPES = ["논문", "특허", "뉴스/IR"];
const TABS = ["🔍 트렌드 검색", "🧪 성분 DB", "🚨 매칭 알림", "📊 보고서"];
const STORAGE_KEY = "haircare_db_v8";
const ALERT_KEY = "haircare_alerts_v8";

const TOPIC_CONFIG = {
  "두피케어": { color:"green", pubmed:"alopecia OR \"hair loss\" OR dandruff OR Malassezia OR \"scalp microbiome\" OR \"hair follicle\" OR \"dermal papilla\" OR \"seborrheic dermatitis\"", patent:"hair loss treatment OR scalp health OR alopecia OR anti-dandruff OR hair follicle regeneration", news:"hair loss research OR scalp treatment OR alopecia innovation", keywords:["androgenetic alopecia","hair loss","alopecia areata","DHT","hair follicle regeneration","dermal papilla","dandruff","Malassezia","scalp microbiome","seborrheic dermatitis","scalp inflammation","zinc pyrithione","stemoxydine","adenosine","redensyl","capixyl"] },
  "모발케어": { color:"blue", pubmed:"\"hair fiber\" OR \"hair damage\" OR \"hair repair\" OR keratin OR \"hair tensile\" OR \"disulfide bond\" OR \"hair bleaching\" OR \"hair porosity\"", patent:"hair repair OR keratin treatment OR hair damage OR bond repair OR hair fiber", news:"hair repair innovation OR keratin treatment OR hair damage research", keywords:["hair fiber structure","hair porosity","hair elasticity","hair tensile strength","cuticle structure","hair damage","bleaching damage","disulfide bond","bond repair","keratin repair","hydrolyzed keratin","18-MEA","ceramide hair","panthenol","olaplex"] },
  "성분혁신": { color:"purple", pubmed:"\"hair cosmetic\" AND (peptide OR exosome OR \"stem cell\" OR nanoparticle OR biosurfactant OR microencapsulation OR fermentation)", patent:"hair active ingredient OR cosmetic peptide hair OR hair exosome OR novel surfactant hair", news:"hair ingredient innovation OR new hair active ingredient OR cosmetic ingredient launch", keywords:["novel surfactant","biosurfactant","amino acid surfactant","stem cell extract hair","exosome hair","peptide hair","biomimetic peptide","microencapsulation hair","nanoparticle scalp","fermentation ingredient","postbiotic scalp"] },
  "디바이스": { color:"orange", pubmed:"\"low level laser\" hair OR \"LLLT\" hair OR \"red light therapy\" scalp OR \"microneedling\" hair OR \"LED\" hair OR \"photobiomodulation\" hair", patent:"hair growth device OR scalp laser device OR LED hair treatment OR microneedling hair", news:"hair device innovation OR scalp device launch OR hair growth technology", keywords:["LLLT hair loss","red light therapy scalp","microneedling hair","PRP hair","LED hair device","photobiomodulation hair","iontophoresis scalp","scalp cooling device","trichoscopy","AI hair diagnosis"] },
  "기타": { color:"gray", pubmed:"\"hair coloring\" OR \"hair dye\" OR \"hair straightening\" OR \"sustainable hair\" OR trichology", patent:"hair coloring OR hair dye innovation OR sustainable haircare", news:"sustainable haircare OR hair color innovation OR waterless shampoo", keywords:["hair coloring innovation","oxidative hair dye","hair bleaching chemistry","sustainable haircare","waterless haircare","solid shampoo","scalp microbiome diversity","probiotic shampoo","trichology","hair biomarker"] }
};
const TOPICS = Object.keys(TOPIC_CONFIG);

function Badge({ text, color="blue" }) {
  const c = { blue:"bg-blue-100 text-blue-700", green:"bg-green-100 text-green-700", purple:"bg-purple-100 text-purple-700", orange:"bg-orange-100 text-orange-700", red:"bg-red-100 text-red-700", gray:"bg-gray-100 text-gray-600" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c[color]||c.gray}`}>{text}</span>;
}
function Spinner({ text="검색 중..." }) {
  return <div className="flex flex-col items-center justify-center py-10 gap-2"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"/><div className="text-xs text-gray-400">{text}</div></div>;
}
function detectTopic(text) {
  const t=(text||"").toLowerCase();
  if(/(alopecia|hair loss|scalp|dandruff|follicle|dht)/.test(t)) return "두피케어";
  if(/(hair damage|keratin|cuticle|bleach|repair|tensile)/.test(t)) return "모발케어";
  if(/(surfactant|peptide|exosome|nanoparticle|encapsul)/.test(t)) return "성분혁신";
  if(/(laser|device|led|microneedling|ultrasound)/.test(t)) return "디바이스";
  return "기타";
}

async function callClaudeSearch(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model:"claude-sonnet-4-20250514", max_tokens:4000,
      system:"You are a professional haircare R&D research analyst. Use web search to find REAL, VERIFIED results only. Never fabricate. Return [] if nothing found. Return ONLY valid JSON array, no markdown.",
      messages:[{role:"user", content:prompt}],
      tools:[{type:"web_search_20250305", name:"web_search"}],
    }),
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data?.error?.message||`API 오류 ${res.status}`);
  return data.content?.map(b=>b.type==="text"?b.text:"").join("")||"";
}
async function callClaude(prompt, sys) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:4000, system:sys||"You are a helpful assistant.", messages:[{role:"user",content:prompt}] }),
  });
  const data = await res.json();
  return data.content?.map(b=>b.text||"").join("")||"";
}
function parseArr(raw) {
  const s=raw.replace(/```[\w]*\n?/g,"").replace(/```/g,"").trim();
  const m=s.match(/\[[\s\S]*\]/);
  if(!m) return [];
  return JSON.parse(m[0]);
}
function parseObj(raw) {
  const s=raw.replace(/```[\w]*\n?/g,"").replace(/```/g,"").trim();
  const m=s.match(/\{[\s\S]*\}/);
  if(!m) throw new Error("JSON 객체 없음");
  return JSON.parse(m[0]);
}

function buildSearchPrompt({company, topic, source, dateFrom, dateTo}) {
  const affil = COMPANY_AFFIL[company]||company;
  const cfg = topic==="전체"?null:TOPIC_CONFIG[topic];
  const fromYear = dateFrom?.slice(0,4)||"2022";
  const toYear = dateTo?.slice(0,4)||new Date().getFullYear();
  if(source==="논문") {
    const kw=cfg?cfg.pubmed:Object.values(TOPIC_CONFIG).map(c=>c.pubmed).join(" OR ");
    return `Search PubMed and Google Scholar for real peer-reviewed papers where at least one author affiliation includes "${affil}". PubMed query: ("${affil}"[Affiliation]) AND (${kw}) AND ("${fromYear}"[PDAT]:"${toYear}"[PDAT]). Find up to 5 real papers. Return JSON array only:
[{"title":"","date":"YYYY-MM","source":"논문","company":"${company}","topic":"","authors":"","journal":"","affiliation":"","abstract":"","pmid_or_doi":"","ingredients":[],"url":""}]
Return [] if none found.`;
  }
  if(source==="특허") {
    const kw=cfg?cfg.patent:"hair scalp treatment";
    return `Search Google Patents for real patents assigned to "${affil}". Search: https://patents.google.com/?assignee=${encodeURIComponent(affil)}&q=${encodeURIComponent(kw)}&before=priority:${toYear}1231&after=priority:${fromYear}0101. Find up to 5 real patents. Return JSON array only:
[{"title":"","date":"YYYY-MM","source":"특허","company":"${company}","topic":"","authors":"","journal":"patent number","affiliation":"${affil}","abstract":"","pmid_or_doi":"","ingredients":[],"url":"https://patents.google.com/patent/XX/en"}]
Return [] if none found.`;
  }
  const kw=cfg?cfg.news:"haircare research innovation";
  return `Search for real news or press releases from ${company} about haircare. Queries: "${affil}" hair research ${fromYear} site:${SHOP_DOMAINS["올리브영"]||"businesswire.com"} OR "${affil}" ${kw} ${fromYear}. Find up to 5 real articles. Return JSON array only:
[{"title":"","date":"YYYY-MM","source":"뉴스/IR","company":"${company}","topic":"","authors":"","journal":"media name","affiliation":"","abstract":"","pmid_or_doi":"","ingredients":[],"url":""}]
Return [] if none found.`;
}

async function summarizeItems(items) {
  if(!items.length) return items;
  const text = await callClaude(
    `아래 항목들의 abstract를 각각 한국어 3문장으로 요약하고, 헤어케어 핵심 성분명 2~4개를 추출하세요.\n입력: ${JSON.stringify(items.map((it,i)=>({i,title:it.title,abstract:it.abstract||""})))}\nJSON 배열만 반환. 마크다운 없음:\n[{"i":0,"summary":"한국어 3문장","ingredients":["성분1","성분2"]}]`,
    "JSON 배열만 반환. 마크다운 없음."
  );
  try {
    const summaries = parseArr(text);
    return items.map((it,idx)=>{ const sv=summaries.find(s=>s.i===idx); return sv?{...it,summary:sv.summary,ingredients:sv.ingredients?.length?sv.ingredients:it.ingredients}:{...it,summary:it.abstract||""}; });
  } catch { return items.map(it=>({...it,summary:it.abstract||""})); }
}

// ── Tab 1: 트렌드 검색 ──────────────────────────────────────────
function TrendSearch({ ingredientDB, setIngredientDB, setReportData }) {
  const curYear=new Date().getFullYear(), curMonth=String(new Date().getMonth()+1).padStart(2,"0");
  const [company,setCompany]=useState("L'Oréal");
  const [topic,setTopic]=useState("두피케어");
  const [source,setSource]=useState("논문");
  const [dateFrom,setDateFrom]=useState(`${curYear-2}-01`);
  const [dateTo,setDateTo]=useState(`${curYear}-${curMonth}`);
  const [loading,setLoading]=useState(false);
  const [loadingMsg,setLoadingMsg]=useState("");
  const [results,setResults]=useState([]);
  const [msg,setMsg]=useState("");
  const [savingMap,setSavingMap]=useState({});
  const [expandedIdx,setExpandedIdx]=useState(null);
  const allSources=SOURCE_TYPES.join(", ");

  async function search() {
    setLoading(true); setResults([]); setMsg(""); setExpandedIdx(null);
    try {
      const sources=source===allSources?SOURCE_TYPES:[source];
      let all=[];
      for(const src of sources) {
        setLoadingMsg({논문:"PubMed · Google Scholar 검색 중...",특허:"Google Patents 검색 중...","뉴스/IR":"뉴스 · IR 검색 중..."}[src]);
        const raw=await callClaudeSearch(buildSearchPrompt({company,topic,source:src,dateFrom,dateTo}));
        const items=parseArr(raw);
        all=[...all,...items.map(it=>({...it,topic:it.topic&&TOPIC_CONFIG[it.topic]?it.topic:(topic==="전체"?detectTopic(it.title):topic)}))];
      }
      if(!all.length){setMsg("⚠️ 검색된 결과가 없습니다. 기간을 넓히거나 다른 조건을 시도해보세요.");setLoading(false);setLoadingMsg("");return;}
      setLoadingMsg(`${all.length}건 발견 · AI 한국어 요약 중...`);
      const summarized=await summarizeItems(all);
      setResults(summarized);
      setReportData({company,topic,source,dateFrom,dateTo,results:summarized});
    } catch(e){setMsg("⚠️ 오류: "+e.message);}
    setLoading(false); setLoadingMsg("");
  }

  async function saveIng(ing,item) {
    const key=ing.toLowerCase();
    if(ingredientDB[key]){setMsg(`'${ing}' 이미 DB에 있음`);setTimeout(()=>setMsg(""),2000);return;}
    setSavingMap(p=>({...p,[key]:true}));
    try {
      const text=await callClaude(`헤어케어 성분 "${ing}"의 공식 INCI 명칭을 JSON으로만 반환: {"inci":"INCI명"}`,"Return only valid JSON. No markdown.");
      const obj=parseObj(text);
      setIngredientDB(prev=>({...prev,[key]:{name:ing,inci:obj.inci||ing,count:1,sources:[item.source||""],companies:[item.company||""],topics:[item.topic||""],lastSeen:item.date||""}}));
      setMsg(`✅ '${ing}' (${obj.inci||ing}) 저장 완료`);
    } catch{setMsg(`⚠️ '${ing}' 저장 실패`);}
    setSavingMap(p=>({...p,[key]:false}));
    setTimeout(()=>setMsg(""),3000);
  }
  function saveAllItem(item){(item.ingredients||[]).forEach(ing=>saveIng(ing,item));}

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        {[["기업",COMPANIES,company,setCompany,null],["토픽",TOPICS,topic,setTopic,"전체"],["소스",SOURCE_TYPES,source,setSource,allSources]].map(([label,opts,val,setter,allOpt])=>(
          <div key={label}>
            <label className="text-xs text-gray-500 font-medium mb-1 block">{label}</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={val} onChange={e=>setter(e.target.value)}>
              {allOpt&&<option value={allOpt}>전체</option>}
              {opts.map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
      </div>
      {topic!=="전체"&&(
        <div className="mb-3 rounded-xl p-3 bg-gray-50 border border-gray-100">
          <div className="text-xs font-semibold text-gray-500 mb-1.5">🔑 검색 키워드 ({TOPIC_CONFIG[topic].keywords.length}개)</div>
          <div className="flex flex-wrap gap-1">
            {TOPIC_CONFIG[topic].keywords.slice(0,10).map(kw=><span key={kw} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{kw}</span>)}
            {TOPIC_CONFIG[topic].keywords.length>10&&<span className="text-xs text-gray-400 px-1">+{TOPIC_CONFIG[topic].keywords.length-10}개</span>}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[["시작 연월",dateFrom,setDateFrom],["종료 연월",dateTo,setDateTo]].map(([label,val,setter])=>(
          <div key={label}><label className="text-xs text-gray-500 font-medium mb-1 block">{label}</label>
          <input type="month" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={val} onChange={e=>setter(e.target.value)}/></div>
        ))}
      </div>
      <button onClick={search} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition text-sm mb-4">🔍 실제 데이터 검색</button>
      {loading&&<Spinner text={loadingMsg}/>}
      {msg&&<div className="text-xs mb-3 px-3 py-2 rounded-lg border bg-amber-50 text-amber-700 border-amber-100">{msg}</div>}
      {results.length>0&&!loading&&(
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-700">검색 결과 {results.length}건 <span className="text-xs font-normal text-green-600 ml-1">● 실제 데이터</span></span>
            <button onClick={()=>results.forEach(r=>saveAllItem(r))} className="text-xs bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 transition">📥 전체 성분 저장</button>
          </div>
          <div className="space-y-3">
            {results.map((r,i)=>(
              <div key={i} className="border border-gray-100 rounded-xl p-4 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <a href={r.url} target="_blank" rel="noreferrer" className="font-semibold text-sm text-indigo-700 hover:underline leading-snug flex-1">{r.title}</a>
                  <div className="flex gap-1 shrink-0"><Badge text={r.source} color={{논문:"blue",특허:"purple","뉴스/IR":"green"}[r.source]||"gray"}/><Badge text={r.date} color="gray"/></div>
                </div>
                <div className="flex flex-wrap items-center gap-1 mb-2">
                  {r.topic&&<Badge text={r.topic} color={TOPIC_CONFIG[r.topic]?.color||"gray"}/>}
                  {r.journal&&<span className="text-xs text-gray-400 italic">{r.journal}</span>}
                  {r.pmid_or_doi&&<span className="text-xs text-gray-400">· {r.pmid_or_doi}</span>}
                </div>
                {r.authors&&<div className="text-xs text-gray-400 mb-1">👤 {r.authors}</div>}
                {r.affiliation&&<div className="text-xs text-gray-400 mb-2">🏢 {r.affiliation}</div>}
                <p className="text-xs text-gray-700 leading-relaxed mb-2">{r.summary}</p>
                {r.abstract&&(
                  <div className="mb-3">
                    <button onClick={()=>setExpandedIdx(expandedIdx===i?null:i)} className="text-xs text-indigo-400 hover:text-indigo-600">{expandedIdx===i?"▲ 원문 접기":"▼ 원문 Abstract 보기"}</button>
                    {expandedIdx===i&&<div className="mt-2 bg-gray-50 rounded-lg p-3 text-xs text-gray-500 leading-relaxed border border-gray-100">{r.abstract}</div>}
                  </div>
                )}
                {r.ingredients?.length>0&&(
                  <div className="mb-2">
                    <div className="text-xs text-gray-400 mb-1.5">🧬 주요 성분 — 클릭하면 DB에 저장</div>
                    <div className="flex flex-wrap gap-1">
                      {r.ingredients.map(ing=>{ const k=ing.toLowerCase(),inDB=!!ingredientDB[k],saving=!!savingMap[k]; return(
                        <button key={ing} onClick={()=>saveIng(ing,r)} disabled={saving||inDB}
                          className={`text-xs px-2.5 py-1 rounded-full border transition font-medium ${inDB?"bg-green-50 text-green-600 border-green-200 cursor-default":saving?"bg-gray-100 text-gray-400 border-gray-200 cursor-wait":"bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100 cursor-pointer"}`}>
                          {saving?"저장 중…":inDB?`✅ ${ing}`:`+ ${ing}`}
                        </button>);})}
                    </div>
                  </div>
                )}
                <div className="flex justify-end"><button onClick={()=>saveAllItem(r)} className="text-xs text-gray-400 hover:text-green-600 border border-gray-200 px-2 py-1 rounded-md transition">📥 전체 저장</button></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 2: 성분 DB ──────────────────────────────────────────────
function IngredientDB({ ingredientDB, setIngredientDB }) {
  const items=Object.values(ingredientDB).sort((a,b)=>b.count-a.count);
  if(!items.length) return(
    <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-3">🧪</div><div className="text-sm">아직 저장된 성분이 없습니다.</div><div className="text-xs mt-1">트렌드 검색에서 성분을 클릭해 저장해보세요.</div></div>
  );
  return(
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-gray-700">누적 성분 {items.length}종</span>
        <button onClick={()=>{if(confirm("초기화할까요?"))setIngredientDB({});}} className="text-xs text-red-400 border border-red-100 px-2 py-1 rounded-md">🗑 초기화</button>
      </div>
      <div className="space-y-2">
        {items.map((ing,i)=>(
          <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
            <div className="flex items-start justify-between mb-1.5">
              <div><div className="font-semibold text-sm text-gray-800">🧬 {ing.name}</div>
              {ing.inci&&ing.inci!==ing.name&&<div className="text-xs text-indigo-500 font-mono mt-0.5">INCI: {ing.inci}</div>}</div>
              <Badge text={`언급 ${ing.count}회`} color={ing.count>=3?"red":ing.count>=2?"orange":"blue"}/>
            </div>
            <div className="flex flex-wrap gap-1">
              {ing.companies?.map(c=><Badge key={c} text={c} color="purple"/>)}
              {ing.topics?.map(t=><Badge key={t} text={t} color={TOPIC_CONFIG[t]?.color||"gray"}/>)}
              {ing.sources?.map(s=><Badge key={s} text={s} color="gray"/>)}
            </div>
            {ing.lastSeen&&<div className="text-xs text-gray-400 mt-1.5">최근 발견: {ing.lastSeen}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab 3: 매칭 알림 ──────────────────────────────────────────────
function MatchAlert({ ingredientDB, matchAlerts, setMatchAlerts }) {
  const [mode, setMode] = useState("manual");
  const [company, setCompany] = useState("L'Oréal");
  const [shops, setShops] = useState(["올리브영"]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [scannedProducts, setScannedProducts] = useState([]);
  const [msg, setMsg] = useState("");
  const [productName, setProductName] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [shop, setShop] = useState("올리브영");
  const [ingText, setIngText] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  function toggleShop(s) { setShops(p => p.includes(s) ? p.filter(x=>x!==s) : [...p,s]); }

  async function analyzeManual() {
    if(!ingText.trim()){setMsg("⚠️ 전성분을 입력해주세요.");return;}
    const dbItems = Object.values(ingredientDB);
    if(!dbItems.length){setMsg("⚠️ 성분 DB가 비어있습니다.");return;}
    setManualLoading(true); setMsg("");
    try {
      const ingList = ingText.split(/[,\n]/).map(s=>s.trim()).filter(Boolean);
      const dbIngNames = dbItems.map(v=>v.name.toLowerCase());
      const dbMap = Object.fromEntries(dbItems.map(v=>[v.name.toLowerCase(),v]));
      const matched = ingList.filter(ing=>{
        const k=ing.toLowerCase();
        return dbIngNames.some(dbK=>k.includes(dbK)||dbK.includes(k));
      }).map(ing=>{
        const k=ing.toLowerCase();
        const dbKey=dbIngNames.find(dbK=>k.includes(dbK)||dbK.includes(k));
        return {ingredient:ing, dbEntry:dbMap[dbKey]||null};
      });
      const alert = {
        id: Date.now()+Math.random(),
        productName: productName||"이름 없는 제품",
        brand: company,
        shop,
        launchDate: new Date().toISOString().slice(0,7),
        productUrl,
        category: "",
        matched,
        totalIngredients: ingList.length,
        date: new Date().toLocaleDateString("ko-KR"),
      };
      setMatchAlerts(prev=>[alert,...prev]);
      setMsg(`✅ 분석 완료! 전성분 ${ingList.length}개 중 연구 성분 ${matched.length}개 감지`);
      setProductName(""); setProductUrl(""); setIngText("");
    } catch(e){setMsg("⚠️ 오류: "+e.message);}
    setManualLoading(false);
  }

  async function scanNewProducts() {
    if(!shops.length){setMsg("⚠️ 쇼핑몰을 하나 이상 선택해주세요.");return;}
    const dbItems = Object.values(ingredientDB);
    if(!dbItems.length){setMsg("⚠️ 성분 DB가 비어있습니다. 먼저 논문·특허를 검색하고 성분을 저장해주세요.");return;}
    setLoading(true); setScannedProducts([]); setMsg("");
    try {
      for(const sh of shops) {
        setLoadingMsg(`${sh}에서 ${company} 신제품 스캔 중...`);
        const domain = SHOP_DOMAINS[sh];
        const prompt = `Search ${sh} (${domain}) for the latest NEW haircare products launched by ${company} in the past 6 months. For each product found, get the full ingredient list. Return JSON array only. No markdown:
[{"productName":"제품명","brand":"${company}","shop":"${sh}","launchDate":"YYYY-MM","productUrl":"실제URL","ingredients":["Water","Glycerin","..."],"imageContext":"카테고리"}]
Return [] if no new products found.`;
        const raw = await callClaudeSearch(prompt);
        const products = parseArr(raw);
        const dbIngNames = dbItems.map(v=>v.name.toLowerCase());
        const dbMap = Object.fromEntries(dbItems.map(v=>[v.name.toLowerCase(),v]));
        for(const prod of products) {
          const ingList = prod.ingredients||[];
          const matched = ingList.filter(ing=>{
            const k=ing.toLowerCase();
            return dbIngNames.some(dbK=>k.includes(dbK)||dbK.includes(k));
          }).map(ing=>{
            const k=ing.toLowerCase();
            const dbKey=dbIngNames.find(dbK=>k.includes(dbK)||dbK.includes(k));
            return {ingredient:ing, dbEntry:dbMap[dbKey]||null};
          });
          if(matched.length>0) {
            setMatchAlerts(prev=>[{id:Date.now()+Math.random(),productName:prod.productName,brand:prod.brand,shop:sh,launchDate:prod.launchDate,productUrl:prod.productUrl,category:prod.imageContext,matched,totalIngredients:ingList.length,date:new Date().toLocaleDateString("ko-KR")},...prev]);
          }
          setScannedProducts(prev=>[...prev,{...prod,matchCount:matched.length}]);
        }
      }
      setMsg("✅ 스캔 완료!");
    } catch(e){setMsg("⚠️ 오류: "+e.message);}
    setLoading(false); setLoadingMsg("");
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {[["manual","✏️ 전성분 직접 입력"],["scan","🤖 쇼핑몰 자동 스캔"]].map(([m,label])=>(
          <button key={m} onClick={()=>setMode(m)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition ${mode===m?"bg-indigo-600 text-white border-indigo-600":"bg-white text-gray-500 border-gray-200 hover:border-indigo-300"}`}>
            {label}
          </button>
        ))}
      </div>

      {mode==="manual" && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-4">
          <div className="text-sm font-semibold text-indigo-700 mb-3">✏️ 신제품 전성분 직접 입력</div>
          <div className="text-xs text-gray-500 mb-3">올리브영·Sephora 등에서 제품 페이지의 전성분을 복사해서 붙여넣으세요.</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">제품명</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" placeholder="예: 려 자양윤모 샴푸" value={productName} onChange={e=>setProductName(e.target.value)}/>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">브랜드</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={company} onChange={e=>setCompany(e.target.value)}>
                {COMPANIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">쇼핑몰</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={shop} onChange={e=>setShop(e.target.value)}>
                {SHOPS.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">제품 URL (선택)</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" placeholder="https://..." value={productUrl} onChange={e=>setProductUrl(e.target.value)}/>
            </div>
          </div>
          <label className="text-xs text-gray-500 mb-1 block">전성분 (쉼표 또는 줄바꿈으로 구분)</label>
          <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white resize-none" rows={5}
            placeholder="예: Water, Glycerin, Niacinamide, Keratin, Panthenol, Caffeine, Biotin, Capixyl..."
            value={ingText} onChange={e=>setIngText(e.target.value)}/>
          <button onClick={analyzeManual} disabled={manualLoading}
            className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition text-sm">
            {manualLoading?"🔄 분석 중...":"🚨 연구성분 매칭 분석"}
          </button>
        </div>
      )}

      {mode==="scan" && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-4">
          <div className="text-sm font-semibold text-indigo-700 mb-3">🤖 신제품 자동 센싱</div>
          <div className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
            ⚠️ 쇼핑몰 크롤링 제한으로 전성분 수집이 불완전할 수 있어요. 중요한 분석은 직접 입력을 권장해요.
          </div>
          <div className="mb-3">
            <label className="text-xs text-gray-500 font-medium mb-1 block">모니터링 기업</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={company} onChange={e=>setCompany(e.target.value)}>
              {COMPANIES.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="mb-4">
            <label className="text-xs text-gray-500 font-medium mb-2 block">센싱 쇼핑몰</label>
            <div className="flex gap-2">
              {SHOPS.map(s=>(
                <button key={s} onClick={()=>toggleShop(s)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition ${shops.includes(s)?"bg-indigo-600 text-white border-indigo-600":"bg-white text-gray-500 border-gray-200 hover:border-indigo-300"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <button onClick={scanNewProducts} disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition text-sm">
            {loading?"🔄 스캔 중...":"🚨 신제품 성분 스캔"}
          </button>
        </div>
      )}

      {(loading||manualLoading) && <Spinner text={loadingMsg||"분석 중..."}/>}
      {msg && <div className={`text-xs mb-3 px-3 py-2 rounded-lg border ${msg.startsWith("✅")?"bg-green-50 text-green-700 border-green-100":"bg-amber-50 text-amber-700 border-amber-100"}`}>{msg}</div>}

      {scannedProducts.length>0&&!loading&&(
        <div className="mb-4 bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
          <div className="text-xs font-semibold text-gray-600 mb-2">📦 스캔된 신제품 {scannedProducts.length}건</div>
          <div className="space-y-1.5">
            {scannedProducts.map((p,i)=>(
              <div key={i} className="flex items-center justify-between text-xs">
                <a href={p.productUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline truncate flex-1">{p.productName}</a>
                <span className={`ml-2 px-2 py-0.5 rounded-full font-medium ${p.matchCount>0?"bg-red-100 text-red-600":"bg-gray-100 text-gray-400"}`}>
                  {p.matchCount>0?`🔴 매칭 ${p.matchCount}개`:"매칭 없음"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!matchAlerts.length&&!loading&&!manualLoading ? (
        <div className="text-center py-10 text-gray-400">
          <div className="text-4xl mb-2">🚨</div>
          <div className="text-sm">아직 매칭 알림이 없습니다.</div>
          <div className="text-xs mt-1">전성분을 입력하거나 자동 스캔을 실행해보세요.</div>
        </div>
      ) : (
        <div>
          {matchAlerts.length>0&&<div className="text-sm font-semibold text-gray-700 mb-3">🚨 연구성분 감지 알림 {matchAlerts.length}건</div>}
          <div className="space-y-4">
            {matchAlerts.map(alert=>(
              <div key={alert.id} className="border border-red-100 rounded-xl p-4 bg-white shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    {alert.productUrl
                      ? <a href={alert.productUrl} target="_blank" rel="noreferrer" className="font-semibold text-sm text-indigo-700 hover:underline">{alert.productName}</a>
                      : <div className="font-semibold text-sm text-gray-800">{alert.productName}</div>
                    }
                    <div className="text-xs text-gray-400 mt-0.5">{alert.brand} · {alert.shop} · {alert.date}</div>
                    {alert.totalIngredients>0&&<div className="text-xs text-gray-400">전성분 {alert.totalIngredients}개 중</div>}
                  </div>
                  <Badge text={`연구성분 ${alert.matched.length}개 감지`} color="red"/>
                </div>
                <div className="space-y-2 mt-2">
                  {alert.matched.map((m,i)=>(
                    <div key={i} className="flex gap-2 bg-red-50 border border-red-100 rounded-lg p-2.5">
                      <div className="text-red-500 text-sm shrink-0">🔴</div>
                      <div>
                        <div className="text-sm font-semibold text-gray-800">🧬 {m.ingredient}</div>
                        {m.dbEntry?.inci&&<div className="text-xs text-indigo-500 font-mono">INCI: {m.dbEntry.inci}</div>}
                        {m.dbEntry&&(
                          <div className="flex flex-wrap gap-1 mt-1">
                            {m.dbEntry.sources?.map(s=><Badge key={s} text={s} color="gray"/>)}
                            {m.dbEntry.topics?.map(t=><Badge key={t} text={t} color={TOPIC_CONFIG[t]?.color||"gray"}/>)}
                            {m.dbEntry.lastSeen&&<span className="text-xs text-gray-400">최초 연구: {m.dbEntry.lastSeen}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 4: 원페이지 보고서 ──────────────────────────────────────
function ReportTab({ reportData }) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const reportRef = useRef(null);

  async function generateReport() {
    if(!reportData?.results?.length){alert("먼저 트렌드 검색을 실행해주세요.");return;}
    setLoading(true); setReport(null);
    try {
      const indexedResults = reportData.results.map((r, i) => ({
        idx: i+1,
        title: r.title,
        date: r.date,
        source: r.source,
        topic: r.topic,
        authors: r.authors||"",
        journal: r.journal||"",
        url: r.url||"",
        summary: r.summary||"",
        ingredients: r.ingredients||[],
      }));

      const prompt = `아래 헤어케어 R&D 검색 결과(실제 문헌)를 바탕으로 원페이지 연구 트렌드 보고서를 작성하세요.

검색 조건: 기업=${reportData.company}, 토픽=${reportData.topic}, 소스=${reportData.source}, 기간=${reportData.dateFrom}~${reportData.dateTo}

[실제 검색된 문헌 목록 - 반드시 이 문헌들만 근거로 사용]
${JSON.stringify(indexedResults)}

[엄격한 규칙]
- 모든 발견(keyFindings), 성분(topIngredients), 인사이트는 반드시 위 문헌 중 실제 근거가 있는 것만 작성
- 각 항목에 근거 문헌의 idx 번호를 반드시 명시 (예: [1], [2,3])
- 위 문헌에 없는 내용은 절대 추가하지 말 것
- executiveSummary도 위 문헌 내용만 반영

JSON 형식으로만 반환. 마크다운 없음:
{
  "title": "보고서 제목",
  "subtitle": "부제목 (기업명, 기간, 토픽)",
  "executiveSummary": "핵심 요약 2~3문장 (근거 문헌 idx 인용 포함, 예: [1][3])",
  "keyFindings": [
    {"icon":"🔬","title":"발견 제목","desc":"2문장 설명","refs":[1,2],"refTitles":["논문제목1","논문제목2"]}
  ],
  "trendKeywords": ["키워드1","키워드2","키워드3","키워드4","키워드5"],
  "topIngredients": [
    {"name":"성분명","mentionCount":2,"desc":"한 줄 설명 (실제 언급된 문헌 기반)","refs":[1],"refTitles":["논문제목1"]}
  ],
  "sourceBreakdown": {"논문":0,"특허":0,"뉴스/IR":0},
  "insights": "연구 인사이트 및 시사점 3~4문장 (근거 idx 인용 포함)",
  "recommendation": "향후 주목할 연구 방향 2문장 (위 문헌 트렌드 기반으로만 작성)",
  "references": [
    {"idx":1,"title":"논문/특허 제목","source":"소스","date":"날짜","authors":"저자","url":"URL"}
  ]
}`;
      const text = await callClaude(prompt, "JSON만 반환. 마크다운 없음.");
      setReport(parseObj(text));
    } catch(e){alert("보고서 생성 오류: "+e.message);}
    setLoading(false);
  }

  function copyReport() {
    if(!reportRef.current) return;
    const text = reportRef.current.innerText;
    navigator.clipboard.writeText(text).then(()=>alert("📋 보고서가 클립보드에 복사되었습니다!"));
  }

  const topicColor = report ? (TOPIC_CONFIG[reportData?.topic]?.color || "indigo") : "indigo";
  const colorMap = { green:"#16a34a", blue:"#2563eb", purple:"#7c3aed", orange:"#ea580c", gray:"#6b7280", indigo:"#4f46e5" };
  const accent = colorMap[topicColor] || "#4f46e5";

  return (
    <div>
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-4">
        <div className="text-sm font-semibold text-indigo-700 mb-1">📊 원페이지 연구 트렌드 보고서</div>
        <div className="text-xs text-gray-500 mb-3">트렌드 검색 결과를 바탕으로 시각적 보고서를 자동 생성합니다.</div>
        {reportData?.results?.length > 0
          ? <div className="text-xs text-green-600 mb-3">✅ 검색 결과 {reportData.results.length}건 준비됨 ({reportData.company} · {reportData.topic} · {reportData.dateFrom}~{reportData.dateTo})</div>
          : <div className="text-xs text-amber-600 mb-3">⚠️ 먼저 트렌드 검색 탭에서 검색을 실행해주세요.</div>
        }
        <button onClick={generateReport} disabled={loading||!reportData?.results?.length}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition text-sm">
          {loading?"🔄 보고서 생성 중...":"📊 보고서 생성"}
        </button>
      </div>

      {loading && <Spinner text="AI가 보고서를 작성 중..."/>}

      {report && !loading && (
        <div ref={reportRef} className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
          <div style={{background:`linear-gradient(135deg, ${accent}, ${accent}cc)`}} className="px-5 py-5 text-white">
            <div className="text-xs font-medium opacity-75 mb-1">HAIRCARE R&D INTELLIGENCE REPORT</div>
            <div className="font-bold text-lg leading-tight">{report.title}</div>
            <div className="text-sm opacity-80 mt-1">{report.subtitle}</div>
            <div className="text-xs opacity-60 mt-2">{new Date().toLocaleDateString("ko-KR")} 기준</div>
          </div>

          <div className="p-5 space-y-5">
            <div className="bg-gray-50 rounded-xl p-4 border-l-4" style={{borderColor:accent}}>
              <div className="text-xs font-bold text-gray-500 mb-1.5">📋 EXECUTIVE SUMMARY</div>
              <p className="text-sm text-gray-700 leading-relaxed">{report.executiveSummary}</p>
            </div>

            <div>
              <div className="text-xs font-bold text-gray-500 mb-2">📂 소스 현황</div>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(report.sourceBreakdown||{}).map(([k,v])=>(
                  <div key={k} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                    <div className="font-bold text-xl" style={{color:accent}}>{v}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{k}</div>
                  </div>
                ))}
              </div>
            </div>

            {report.keyFindings?.length > 0 && (
              <div>
                <div className="text-xs font-bold text-gray-500 mb-2">🔍 주요 연구 발견</div>
                <div className="space-y-2">
                  {report.keyFindings.map((f,i)=>(
                    <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <div className="flex gap-3">
                        <div className="text-xl shrink-0">{f.icon}</div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-800">{f.title}</div>
                          <div className="text-xs text-gray-600 leading-relaxed mt-0.5">{f.desc}</div>
                          {f.refs?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {f.refs.map((r,j)=>(
                                <span key={j} className="text-xs px-1.5 py-0.5 rounded font-mono" style={{background:accent+"22",color:accent}}>
                                  [{r}] {f.refTitles?.[j]?.slice(0,30)}{f.refTitles?.[j]?.length>30?"...":""}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {report.trendKeywords?.length > 0 && (
              <div>
                <div className="text-xs font-bold text-gray-500 mb-2">🏷 트렌드 키워드</div>
                <div className="flex flex-wrap gap-2">
                  {report.trendKeywords.map((kw,i)=>(
                    <span key={kw} className="text-xs font-semibold px-3 py-1.5 rounded-full text-white" style={{background:accent, opacity: 1 - i*0.12}}>
                      #{kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {report.topIngredients?.length > 0 && (
              <div>
                <div className="text-xs font-bold text-gray-500 mb-2">🧬 주목 성분</div>
                <div className="space-y-2">
                  {report.topIngredients.map((ing,i)=>(
                    <div key={i} className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{background:accent}}>{ing.mentionCount||ing.count||1}</div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-800">{ing.name}</div>
                          <div className="text-xs text-gray-500">{ing.desc}</div>
                          {ing.refs?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {ing.refs.map((r,j)=>(
                                <span key={j} className="text-xs px-1.5 py-0.5 rounded font-mono" style={{background:accent+"22",color:accent}}>
                                  [{r}] {ing.refTitles?.[j]?.slice(0,25)}{ing.refTitles?.[j]?.length>25?"...":""}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl p-4 border" style={{borderColor:accent+"33", background:accent+"0d"}}>
              <div className="text-xs font-bold mb-1.5" style={{color:accent}}>💡 연구 인사이트</div>
              <p className="text-xs text-gray-700 leading-relaxed">{report.insights}</p>
            </div>

            <div className="bg-gray-800 rounded-xl p-4">
              <div className="text-xs font-bold text-gray-300 mb-1.5">🔭 향후 주목 방향</div>
              <p className="text-xs text-gray-100 leading-relaxed">{report.recommendation}</p>
            </div>

            {report.references?.length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <div className="text-xs font-bold text-gray-500 mb-2">📚 참고문헌 (실제 검색된 문헌)</div>
                <div className="space-y-1.5">
                  {report.references.map((ref,i)=>(
                    <div key={i} className="flex gap-2 text-xs">
                      <span className="font-mono font-bold shrink-0" style={{color:accent}}>[{ref.idx}]</span>
                      <div>
                        <a href={ref.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline font-medium">{ref.title}</a>
                        <span className="text-gray-400 ml-1">· {ref.source} · {ref.date}</span>
                        {ref.authors && <span className="text-gray-400"> · {ref.authors}</span>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
                  ⚠️ 보고서의 모든 발견과 인사이트는 위 문헌에 근거합니다. 중요한 결정 전 원문 링크를 통해 직접 확인하세요.
                </div>
              </div>
            )}
          </div>

          <div className="px-5 pb-5">
            <button onClick={copyReport} className="w-full border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium py-2 rounded-lg text-sm transition">
              📋 보고서 텍스트 복사
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── API 키 입력 화면 ────────────────────────────────────────────
function ApiKeyScreen({ onSubmit }) {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if(!key.trim()) return;
    onSubmit(key.trim());
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-700 to-purple-700 px-6 py-8 text-center">
            <div className="text-4xl mb-3">💇</div>
            <div className="text-white font-bold text-xl">헤어케어 리서치 센서</div>
            <div className="text-indigo-200 text-xs mt-1">PubMed · Google Patents · 올리브영 · Sephora · Amazon</div>
          </div>
          <form onSubmit={handleSubmit} className="p-6">
            <label className="text-sm font-semibold text-gray-700 mb-2 block">Anthropic API Key</label>
            <div className="relative mb-3">
              <input
                type={show?"text":"password"}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm bg-gray-50 pr-16 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="sk-ant-api03-..."
                value={key}
                onChange={e=>setKey(e.target.value)}
                autoFocus
              />
              <button type="button" onClick={()=>setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">
                {show?"숨기기":"보기"}
              </button>
            </div>
            <div className="text-xs text-gray-400 mb-4">
              API 키는 브라우저에만 저장되며 외부로 전송되지 않습니다.
            </div>
            <button type="submit" disabled={!key.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold py-3 rounded-lg transition text-sm">
              시작하기
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── App ─────────────────────────────────────────────────────────
export default function App() {
  const [apiKey, setApiKeyState] = useState(()=> API_KEY || localStorage.getItem("haircare_api_key") || "");
  const [tab,setTab]=useState(0);
  const [ingredientDB,setIngredientDB]=useState({});
  const [matchAlerts,setMatchAlerts]=useState([]);
  const [reportData,setReportData]=useState(null);

  function handleApiKeySubmit(key) {
    setApiKey(key);
    localStorage.setItem("haircare_api_key", key);
    setApiKeyState(key);
  }

  useEffect(()=>{
    if(apiKey) setApiKey(apiKey);
  },[apiKey]);

  useEffect(()=>{
    try{const r=localStorage.getItem(STORAGE_KEY);if(r)setIngredientDB(JSON.parse(r));}catch{}
    try{const r=localStorage.getItem(ALERT_KEY);if(r)setMatchAlerts(JSON.parse(r));}catch{}
  },[]);
  useEffect(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(ingredientDB));}catch{}},[ingredientDB]);
  useEffect(()=>{try{localStorage.setItem(ALERT_KEY,JSON.stringify(matchAlerts));}catch{}},[matchAlerts]);

  if(!apiKey) return <ApiKeyScreen onSubmit={handleApiKeySubmit}/>;

  const dbCount=Object.keys(ingredientDB).length;
  const alertCount=matchAlerts.length;

  return(
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="bg-gradient-to-r from-indigo-700 to-purple-700 px-5 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-white font-bold text-lg">💇 헤어케어 리서치 센서</div>
            <div className="text-indigo-200 text-xs mt-0.5">PubMed · Google Patents · 올리브영 · Sephora · Amazon</div>
          </div>
          <button onClick={()=>{localStorage.removeItem("haircare_api_key");setApiKey("");setApiKeyState("");}}
            className="text-indigo-200 hover:text-white text-xs border border-indigo-400 px-2 py-1 rounded-lg transition">
            🔑 키 변경
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <span className="bg-white/20 text-white text-xs px-2.5 py-1 rounded-full">🧬 DB {dbCount}종</span>
          <span className="bg-white/20 text-white text-xs px-2.5 py-1 rounded-full">🚨 알림 {alertCount}건</span>
        </div>
      </div>
      <div className="flex bg-white border-b border-gray-100">
        {TABS.map((t,i)=>(
          <button key={i} onClick={()=>setTab(i)} className={`flex-1 py-3 text-xs font-semibold transition border-b-2 ${tab===i?"border-indigo-600 text-indigo-700":"border-transparent text-gray-400 hover:text-gray-600"}`}>{t}</button>
        ))}
      </div>
      <div className="p-4 max-w-2xl mx-auto">
        {tab===0&&<TrendSearch ingredientDB={ingredientDB} setIngredientDB={setIngredientDB} setReportData={setReportData}/>}
        {tab===1&&<IngredientDB ingredientDB={ingredientDB} setIngredientDB={setIngredientDB}/>}
        {tab===2&&<MatchAlert ingredientDB={ingredientDB} matchAlerts={matchAlerts} setMatchAlerts={setMatchAlerts}/>}
        {tab===3&&<ReportTab reportData={reportData}/>}
      </div>
    </div>
  );
}
