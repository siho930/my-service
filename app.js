const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const types={speed:'스피드',stamina:'스태미나',power:'파워',guts:'근성',wisdom:'지능',friend:'친구'};
const rarity={unique:'고유',unique_upgraded:'고유',inherited_unique:'계승',evolution:'진화',gold:'레어',rare:'레어',normal:'일반',white:'일반'};
const itemIconKinds = {character:'육성마',support:'서포트',skill:'스킬'};
function itemIcon(kind, item) {
  const mark = Array.from(String(item.name ?? '').trim().replace(/\s/g, '')).slice(0, 2).join('');
  const label = kind === 'support' ? types[item.type] || itemIconKinds[kind] : itemIconKinds[kind];
  return `<span class="item-icon item-icon--${kind}" aria-hidden="true"><span>${esc(mark || label)}</span><small>${esc(label)}</small></span>`;
}
let data,plan,mode='factor',targetId='',teamId='',worker=null,requestNumber=0,toastTimer,collectionDirty=false;
let veteranData={records:[],factorTypes:{},g1Races:[]},editingVeteran=null;
function factorRow(f={type:'blue',name:'',stars:3}){
  const row=document.createElement('div');row.className='factor-row';
  row.innerHTML=`<select aria-label="인자 종류">${Object.entries(veteranData.factorTypes).map(([k,v])=>`<option value="${k}" ${f.type===k?'selected':''}>${esc(v)}</option>`).join('')}</select><input aria-label="인자 이름" placeholder="예: 스태미나 / 장거리" maxlength="120" value="${esc(f.name)}" required><select aria-label="인자 별 수">${[1,2,3].map(n=>`<option value="${n}" ${f.stars===n?'selected':''}>${n}★</option>`).join('')}</select><button class="subtle" type="button" aria-label="인자 삭제">×</button>`;
  row.querySelector('button').onclick=()=>row.remove();$('vet-factors').append(row);
}
function editVeteran(id=null){
  editingVeteran=id;const r=veteranData.records.find(r=>r.id===id);
  $('veteran-heading').textContent=r?'육성 개체 수정':'육성 개체 등록';
  $('vet-name').value=r?.name||'';$('vet-character').value=r?.characterId||plan?.target?.id||data.characters[0].id;
  $('vet-notes').value=r?.notes||'';$('vet-races-complete').checked=r?.racesComplete||false;
  $('vet-factors').replaceChildren();for(const f of r?.factors||[])factorRow(f);
  $('vet-races').innerHTML=veteranData.g1Races.map((name,i)=>`<label><input type="checkbox" value="${esc(name)}" ${r?.g1Wins.includes(name)?'checked':''}>${esc(name)}</label>`).join('');
  for(const [i,key] of ['vet-parent1','vet-parent2'].entries()){$(key).innerHTML='<option value="">미등록 / 연결 안 함</option>'+veteranData.records.filter(v=>v.id!==id).map(v=>`<option value="${esc(v.id)}">${esc(v.name)} · ${esc(data.characters.find(c=>c.id===v.characterId)?.name)}</option>`).join('');$(key).value=r?.parentIds[i]||'';}
}
function renderVeterans(){
  const q=$('vet-search').value.toLowerCase();$('vet-count').textContent=veteranData.records.length+'개체';
  $('veteran-list').innerHTML=veteranData.records.filter(r=>(r.name+' '+data.characters.find(c=>c.id===r.characterId)?.name).toLowerCase().includes(q)).map(r=>{const c=data.characters.find(c=>c.id===r.characterId);return `<article class="saved-card"><b>${esc(r.name)}</b><p>${esc(c?.name)} · ${esc(c?.title)}</p><p>${r.factors.map(f=>`${esc(veteranData.factorTypes[f.type])} ${esc(f.name)} ${f.stars}★`).join(' · ')||'인자 미입력'}</p><p>G1 ${r.g1Wins.length}종 · ${r.racesComplete?'기록 확인 완료':'미확인 / 일부 입력'} · 부모 ${r.parentIds.filter(Boolean).length}/2 연결</p><button class="subtle" data-edit-vet="${esc(r.id)}">수정</button><button class="subtle" data-delete-vet="${esc(r.id)}">삭제</button></article>`;}).join('')||'<p class="caption">저장된 개체가 없습니다.</p>';
}
async function loadVeterans(){veteranData=await api('/api/veterans');renderVeterans();}
const styleLabels={front_runner:'도주',pace_chaser:'선행',late_surger:'선입',end_closer:'추입'};
let snapshot;
async function api(path, body) {
  if (body !== undefined) throw Error('공개용 스냅샷은 읽기 전용입니다.');
  if (!snapshot) {
    const response = await fetch('./snapshot.json');
    if (!response.ok) throw Error('공개 데이터 파일을 불러오지 못했습니다.');
    snapshot = await response.json();
  }
  const { pathname, searchParams } = new URL(path, location.origin);
  if (pathname === '/api/data') return { ...snapshot.catalog, collection: [], preferences: {} };
  if (pathname === '/api/support-guides') return snapshot.guides;
  if (pathname === '/api/veterans') return { records: [], g1Races: [], factorTypes: {} };
  if (pathname === '/api/plan') {
    const [course, mode, team, target] = ['courseId', 'mode', 'teamId', 'targetId']
      .map(key => searchParams.get(key) || '');
    const savedPlan = snapshot.plans[[course, mode, team, target].join('/')]
      ?? snapshot.plans[`${course}/${mode}//`];
    if (savedPlan) return savedPlan;
  }
  throw Error('공개 스냅샷에 없는 데이터입니다.');
}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function selectedEvent(){return data?.nextEvents?.events.find(e=>e.courseId===+$('courseId').value);}
function config(){return {...Object.fromEntries(new FormData($('config'))),eventId:selectedEvent()?.id,ownedOnly:$('ownedOnly').checked,mode,targetId,teamId};}
function applyEventDefaults(){const event=selectedEvent();if(!event)return;for(const id of ['fieldSize','season','weather','trackCondition'])$(id).value=event[id];}
function renderEventNote(){
  const event=selectedEvent();
  if(!event){$('event-note').textContent='다음 대회의 확인된 코스가 아직 등록되지 않았습니다.';return;}
  const modified=['fieldSize','season','weather','trackCondition'].some(k=>String($(k).value)!==String(event[k]));
  $('event-note').innerHTML=`${esc(data.nextEvents.asOf)} KST 기준 · ${esc(event.startDate)} 개최 예정 · ${event.conditionsRandom?'여름 / 12인 · 날씨·마장 랜덤. 아래 날씨·마장은 계산용 가정입니다.':'가을 / 맑음 / 양호 / 9인'}${modified?' · 사용자 변경 조건 적용 중':''} · <a href="${esc(event.sourceUrl)}" target="_blank" rel="noreferrer">${esc(event.sourceLabel)} ↗</a> <span>(확인 ${esc(data.nextEvents.verifiedOn)})</span>`;
}
function stopSimulation(message=true){if(worker){worker.terminate();worker=null;if(message)toast('계산을 중단했습니다. 완료되지 않은 결과는 저장하지 않았습니다.');}setBusy(false);}
function setBusy(busy){$('run-sim').disabled=busy;$('run-build-sim').disabled=busy;$('cancel-sim').hidden=!busy;$('progress').hidden=!busy;}
async function refresh(){
  const number=++requestNumber;stopSimulation(false);
  renderEventNote();
  if(!selectedEvent()){$('empty').hidden=false;$('empty').textContent='다음 한국 서버 대회 코스 공지가 아직 등록되지 않았습니다.';$('plan-content').hidden=true;return;}
  try{const p=await api('/api/plan?'+new URLSearchParams(config()));if(number!==requestNumber)return;plan=p;renderPlan();}catch(e){toast(e.message);}
}
function renderPlan(){
  renderTeams();
  $('empty').hidden=!plan.empty;$('plan-content').hidden=!!plan.empty;
  if(plan.empty){$('empty').textContent=plan.message;return;}
  targetId=plan.target.id;teamId=plan.selectedTeamId||'';$('style').value=plan.config.style;
  const owned=new Set(data.collection.filter(x=>x.kind==='character').map(x=>x.id));
  const pool=data.characters.filter(c=>!$('ownedOnly').checked||owned.has(c.id));
  $('targetId').innerHTML=pool.map(c=>`<option value="${c.id}">${esc(c.name)} · ${esc(c.title)}</option>`).join('');$('targetId').value=plan.target.id;
  $('lineage').innerHTML=`<div class="lineage-grid">${plan.lineage.map((p,i)=>`<div><div class="parent-label">PARENT 0${i+1}</div><div class="parent">${itemIcon('character',p)}<div><b>${esc(p.name)}</b><small>${esc(p.title)}</small><small>${p.veteran?esc(p.veteran.name):p.guideRecommended?'공략 기반 후보':'자동 후보'} · 기초 ${p.relation??'미확인'}</small>${p.veteran?`<small>${esc(p.veteran.factors.map(f=>f.name+' '+f.stars+'★').join(' · '))}</small>`:''}</div></div><div class="grandparents">${p.grandparents.map(g=>`<div class="grand">${itemIcon('character',g)}<div>${esc(g.name)}<small>${esc(g.title)}</small><small>${g.veteran?esc(g.veteran.name):'조부모 후보'}${g.relation!==undefined?' · 부모 기초 '+(g.relation??'미확인'):''}</small></div></div>`).join('')}</div></div>`).join('')}</div>`;
  renderParentOptions();
  const calc=plan.inheritanceCalculation;
  if(calc)$('inheritance-calculation').innerHTML=`${calc.guide?`<p><b>한국 + 일본 공략 기반 계승 준비</b></p><p>${esc(calc.guide.note)}</p><p>적색: ${esc(calc.guide.redFactor)} · 청색: ${esc(calc.guide.blueFactor)}</p><p>${esc(calc.guide.notice)}</p>${calc.guide.sources.map(s=>`<p><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.label)} ↗</a> · ${esc(s.scope)}</p>`).join('')}`:''}<p><b>확인된 상성 ${calc.knownTotal}점 ${calc.symbol||'(일부 기록 미확인)'}</b> · 기초 ${calc.baseKnown} + G1 ${calc.raceKnown}</p><details><summary>상성 계산 내역과 조건</summary><p>${esc(calc.formula)}</p><ul>${calc.terms.map(t=>`<li>${esc(t.label)}: ${t.points??'미확인'}</li>`).join('')}${calc.raceTerms.map(t=>`<li>${esc(t.label)} G1: +${t.points} (${t.shared.length}종${t.complete?'':' · 일부/미확인'})${t.shared.length?' · '+esc(t.shared.join(', ')):''}</li>`).join('')}</ul><p>${esc(calc.note)}</p><a href="${esc(calc.sourceUrl)}" target="_blank" rel="noreferrer">상성 계산 근거 · 확인 ${esc(calc.verifiedOn)} ↗</a></details>`;
  const cards=plan.decks[mode];
  const guidance=plan.deckGuidance?.[mode];
  $('deck-note').textContent=(guidance?.scenario?guidance.scenario+' · ':'')+(guidance?.basis||'기본 효과 참고 후보')+($('ownedOnly').checked?' · 보유 레벨 / 최대 1장 대여':' · 최대 레벨 / 한국 사용 가능 여부 확인');
  $('deck').innerHTML=cards.map(c=>c.missing?`<div class="deck-card missing"><b>${esc(c.guideRole||types[c.type]||c.type)}</b><p>공략 후보 부족</p><small>보유 등록·대여 구성을 확인하세요.</small></div>`:`<div class="deck-card">${itemIcon('support',c)}<b>${esc(c.name)}</b><small>${esc(c.title)}</small><small>${c.rarity} · ${types[c.type]||c.type} · Lv.${c.level}</small>${c.guideRole?`<span class="support-role">${esc(c.guideRole)}</span><small class="support-reason">${esc(c.reason)}</small>`:''}<div class="card-bottom"><span>${c.borrowed?'대여 후보':$('ownedOnly').checked?'보유 카드':'준비 후보'}</span><span>${c.guideRank?c.guideRank===1?'기본 후보':'대체 후보':'참고'}</span></div>${c.recommendedChoices?.length?`<small class="support-choice">추천 선택: ${esc(c.recommendedChoices.join(' + '))}</small>`:''}${c.missingSkills?.length?`<small class="error">대체 시 미포함: ${esc(c.missingSkills.join(' · '))}</small>`:''}${c.alternatives?.length?`<details><summary>대체 카드 ${c.alternatives.length}장</summary>${c.alternatives.map(a=>`<p>${esc(a.name)} · ${esc(a.title)} (${esc(types[a.type]||a.type)})${a.selfExcluded?' · 육성마 중복 제외':a.owned===true?' · 보유':a.owned===false?' · 미보유':''}</p>`).join('')}</details>`:''}</div>`).join('');
  $('deck-guidance').innerHTML=guidance?`<div class="support-guidance"><p><b>${esc(guidance.goal||'공략 미등록')}</b>${guidance.scenario?' · '+esc(guidance.scenario):''}${guidance.raceBonus!==undefined?' · 편성 레이스 보너스 '+guidance.raceBonus+'%':''}</p>${guidance.note?`<p>${esc(guidance.note)}</p>`:''}${guidance.warnings.length?`<ul class="support-warnings">${guidance.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}<details><summary>추천 근거 · 주요 스킬 경로</summary><p>${esc(guidance.method||'')}</p>${guidance.covered.map(r=>`<p>${r.covered?'경로 있음':'추가 준비'} · ${esc(r.label)}: ${esc(r.routes.map(s=>s.name+' ← '+s.from).join(' / ')||r.names.join(' / '))}</p>`).join('')}${guidance.sources.map(source=>`<p><a href="${esc(source.url)}" target="_blank" rel="noreferrer">${esc(source.label)} ↗</a> · ${esc(source.scope)}${source.publishedOn?' · 작성 '+esc(source.publishedOn):''}</p>`).join('')}<p>확인 ${esc(guidance.verifiedOn||'미등록')} · 힌트/이벤트는 획득 가능 경로이며 취득 보장이 아닙니다. 대체 카드는 같은 스킬을 주지 않을 수 있습니다.</p></details></div>`:'';
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));renderSkills();
}
function renderParentOptions(){
  for(const key of ['parent1Id','parent2Id']){
    const selected=$(key).dataset.saved??plan?.config?.[key]??$(key).value;
    $(key).innerHTML='<option value="">자동 추천 후보 (실제 기록 미선택)</option>'+veteranData.records.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');$(key).value=selected;delete $(key).dataset.saved;
  }
}
function renderTeams(){
  const r=plan.teamRecommendations||{teams:[]};
  $('team-title').textContent=r.basisLabel||'공략 기반 3인 조합';
  $('team-count').textContent=(r.goal?r.goal.label+' · ':'')+r.teams.length+'개 조합';
  $('ranking-note').textContent=(r.event?r.event+' · ':'')+(r.goal?r.goal.note+' ':'')+(r.notice||'이 코스의 일본 대회 실적 자료가 아직 등록되지 않았습니다.');
  $('teams').innerHTML=r.teams.map((t,i)=>`<article class="team-card ${plan.selectedTeamId===t.id?'active':''}"><div class="team-heading"><span class="horse-rank">TEAM 0${i+1}</span><span class="team-result">${esc(t.result)}</span></div><h3>${esc(t.title)}</h3><div class="team-members">${t.members.map(c=>`<button class="team-member ${plan.target?.id===c.id?'active':''}" data-member="${c.id}" data-style="${c.style}" data-team="${t.id}" ${c.owned===false?'disabled':''}>${itemIcon('character',c)}<b>${esc(c.name)}</b><small>${esc(c.variant)}</small><span>${esc(c.role)} · ${styleLabels[c.style]}${c.styleAssumed?' (가정)':''}</span>${c.owned!==null?`<small class="${c.owned?'owned':'unowned'}">${c.owned?'보유':'미보유'}</small>`:''}</button>`).join('')}</div><p class="team-summary">${esc(t.summary)}</p><details><summary>조합 운용과 주의점</summary>${t.reportedResult?`<p><b>원문 성적: ${esc(t.reportedResult)}</b></p>`:''}<p>${esc(t.caution)}</p>${t.evidenceSources?`<ul class="team-sources">${t.evidenceSources.map(e=>`<li><a href="${esc(e.url)}" target="_blank" rel="noreferrer">${esc(e.label)} ↗</a> · ${esc(e.scope)}</li>`).join('')}</ul>`:''}<p>의상: ${t.members.map(c=>esc(c.name+' ['+c.title+']')).join(' · ')}</p></details>${t.missingNames.length?`<p class="team-missing">보유 ${t.ownedCount}/3 · 필요: ${esc(t.missingNames.join(', '))}</p>`:''}<div class="team-footer"><a href="${esc(t.sourceUrl)}" target="_blank" rel="noreferrer">${esc(t.sourceLabel||t.author+' 성적 후기')} ↗</a><span>${esc(t.publishedOn)}</span><button class="subtle" data-select-team="${t.id}" ${t.ownedCount===0?'disabled':''}>${t.ownedCount===0?'보유 등록 필요':'이 조합 선택'}</button></div><p class="team-evidence">${esc(t.evidenceType)} · 한섭 출시·보유 확인 필요</p></article>`).join('')||'<p class="caption">해당 코스의 일본 3인 조합 자료가 아직 없습니다.</p>';
}
function skillCost(s){const cost=s.cost??s.simulation?.baseCost;if(cost==null||cost<=0)return null;const discount=[0,.1,.2,.3,.35,.4][+$('hint-level').value];return Math.floor(cost*(1-discount)+1e-8);}
function renderSkills(){
  if(!plan||plan.empty)return;
  const query=$('skill-search').value.toLowerCase(),sort=$('skill-sort').value;
  const scope=$('skill-scope').value;
  const filtered=plan.skills.filter(s=>s.result&&!s.result.error&&Number.isFinite(s.result.m)&&s.result.m>0&&(scope==='all'||(scope==='build'?s.inCurrentBuild:!s.inCurrentBuild))&&(s.name+' '+s.sources.join(' ')).toLowerCase().includes(query));
  const metric=s=>{const r=s.result;if(!r||r.error)return -Infinity;return sort==='useful'?(Number.isFinite(r.u)?r.u:-Infinity):sort==='gain'?r.m:skillCost(s)?r.m*100/skillCost(s):-Infinity;};
  filtered.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'ko'):metric(b)-metric(a)||a.id-b.id);
  $('skill-count').textContent=filtered.length+'개 · 편성 경로 '+filtered.filter(s=>s.inCurrentBuild).length+'개';
  $('skills').innerHTML=filtered.map(s=>{
    const cost=skillCost(s),r=s.result,valid=r&&!r.error;
    const status=r?.error?'계산 오류':s.simulation?'계산 전':'엔진 미지원';
    const assumed=s.simulationAssumptions||[];
    const assumptionText=assumed.length?'조건 충족·상대 행동 가정 포함'+(assumed.includes('is_used_skill_id')?' · 선행 스킬 발동 가정':''):'';
    return `<tr><td><div class="skill-name">${itemIcon('skill',s)}<div><strong>${esc(s.name)}</strong><span class="skill-route ${s.inCurrentBuild?'in-build':'extra-route'}">${s.inCurrentBuild?'현재 편성 경로':'추가 준비'}</span><small>${esc(s.sources.join(' · '))}</small></div></div><small>${esc(s.description)}</small>${s.simulationUnsupportedReason&&!s.simulation?`<small class="error">미지원 이유: ${esc(s.simulationUnsupportedReason)}</small>`:''}${s.courseUncertain?'<small class="simulation-assumption">코스 조건 일부 미확인</small>':''}${assumptionText?`<small class="simulation-assumption">${esc(assumptionText)}</small>`:''}${r?.error?`<small class="error">${esc(r.error)}</small>`:''}</td><td>${esc(rarity[s.rarity]||s.rarity)}</td><td>${cost??'—'}</td><td>${valid&&Number.isFinite(r.u)?`<strong>${(r.u*100).toFixed(0)}%</strong>${Number.isFinite(r.au)?`<small>가속 유효 ${(r.au*100).toFixed(0)}%</small>`:''}`:`<span class="not-computed">${valid?'유효율 재계산 필요':status}</span>`}</td><td class="gain">${valid?r.m.toFixed(3)+' 마신':'—'}</td><td class="gain">${valid&&cost?(r.m*100/cost).toFixed(3):'—'}</td></tr>`;
  }).join('')||'<tr><td colspan="6">이 편성의 조건에 맞는 저장된 계산 결과가 없습니다.</td></tr>';
}
async function simulate(scope='all'){
  if(!plan||plan.empty||worker)return;
  const ids=plan.skills.filter(s=>s.simulation&&(scope==='all'||s.inCurrentBuild)&&(!s.result||s.result.error||!Number.isFinite(s.result.u))).map(s=>s.id);
  if(!ids.length)return toast('계산할 새 지원 스킬이 없습니다. 이미 저장된 결과를 확인하세요.');
  const captured={...plan.config};setBusy(true);$('progress-text').textContent=scope==='all'?'코스 전체 스킬 비교 중':'현재 편성 경로 스킬 비교 중';$('progress-count').textContent='0 / '+ids.length;$('progress-bar').value=0;
  const w=new Worker('/simulation.worker.js');worker=w;
  w.onerror=()=>{if(worker!==w)return;stopSimulation(false);toast('시뮬레이터 오류가 발생했습니다. 페이지를 새로 열고 다시 시도하세요.');};
  w.onmessage=async({data:r})=>{
    if(worker!==w)return;
    if(r.type==='progress'){$('progress-count').textContent=`${r.done} / ${r.total}`;$('progress-bar').value=r.done/r.total*100;}
    if(r.type==='error'){stopSimulation(false);toast(r.message);}
    if(r.type==='done'){
      try{await api('/api/simulations',{config:captured,results:r.results});if(worker!==w)return;stopSimulation(false);await refresh();toast('계산 결과를 SQLite에 저장했습니다.');}catch(e){stopSimulation(false);toast(e.message);}
    }
  };
  w.postMessage({...captured,skillIds:ids});
}
function collection(){
  const kind=$('collection-kind').value,query=$('collection-search').value.toLowerCase(),type=$('collection-type').value;
  $('collection-type').hidden=kind!=='support';
  $('owned-count').textContent='육성마 '+data.collection.filter(c=>c.kind==='character').length+' · 카드 '+data.collection.filter(c=>c.kind==='support').length;
  const items=(kind==='character'?data.characters:kind==='support'?data.supports:data.skills).filter(c=>(c.name+' '+(c.title||'')+' '+c.id).toLowerCase().includes(query)&&(kind!=='support'||!type||c.type===type));
  $('collection-list').innerHTML = items.map(item => {
    const detail = kind === 'support'
      ? [item.rarity, types[item.type] || item.type, '최대 Lv. ' + item.maxLevel].join(' · ')
      : kind === 'skill' ? (item.supported ? '엔진 지원' : '엔진 미지원') : item.title || '';
    return '<div class="collection-item">' + itemIcon(kind, item) + '<div class="copy"><b>' + esc(item.name) +
      '</b><small>' + esc(detail) + '</small><small>' + esc(item.id) + '</small></div></div>';
  }).join('') || '<p class="caption">검색 결과가 없습니다.</p>';
}
async function saveCollection(id,owned,level){
  const kind=$('collection-kind').value;await api('/api/collection',{kind,id,owned,level});
  data.collection=data.collection.filter(x=>x.kind!==kind||x.id!==id);if(owned)data.collection.push({kind,id,level:level||1});collectionDirty=true;collection();
}
const titles={veterans:['인자와 우승 기록을 모아요.','육성 개체별 인자·G1·부모 연결을 이 PC의 DB에 저장합니다.'],planner:['다음 레이스를 준비해요.','한국 공략과 일본 대회 자료로 조합부터 계승과 편성까지 한눈에.'],collection:['육성마 · 카드 · 스킬','공개 스냅샷에서 데이터를 검색하세요.'],saved:['육성 계획을 모아두세요.','준비한 조합과 계산 결과를 다음 육성에서도.'],sources:['숫자의 출처를 확인해요.','가져온 데이터, 라이선스와 계산의 범위를 투명하게.']};
async function page(name){
  document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==name);document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===name));$('page-title').textContent=titles[name][0];$('page-subtitle').textContent=titles[name][1];
  if(name==='collection')collection();
  if(name==='veterans'){await loadVeterans();editVeteran();collectionDirty=true;}
  if(name==='planner'){await loadVeterans();renderParentOptions();}
  if(name==='planner'&&collectionDirty){collectionDirty=false;await refresh();}
  if(name==='saved'){
    const saved=await api('/api/plans');
    $('saved-list').innerHTML=saved.map(p=>`<div class="saved-card"><b>${esc(p.name)}</b><p>${esc(p.plan.course.label)} · ${p.created_at} UTC · ${p.plan.mode==='score'?'고점작':'인자작'}</p><p>${p.plan.decks[p.plan.mode].filter(c=>!c.missing).map(c=>esc(c.name)).join(' · ')}</p><button class="subtle" data-load="${p.id}">설정 불러오기 ↗</button><button class="subtle" data-download="${p.id}">저장 당시 결과 JSON</button></div>`).join('')||'<div class="empty">아직 저장한 계획이 없습니다.</div>';
    $('saved-list').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const p=saved.find(p=>p.id===+(b.dataset.load||b.dataset.download));if(b.dataset.download){const blob=new Blob([JSON.stringify(p.plan,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`uma_helper2-plan-${p.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}else{applyConfig({...p.plan.config,mode:p.plan.mode,targetId:p.plan.target.id,ownedOnly:p.plan.collectionLimited});await page('planner');await refresh();}};
  }
}
function applyConfig(c){
  const event=data.nextEvents.events.find(e=>e.courseId===+c.courseId)||data.nextEvents.events[0];
  if(event)$('courseId').value=event.courseId;
  applyEventDefaults();
  if(event&&c.eventId===event.id)for(const id of ['fieldSize','season','weather','trackCondition'])if(c[id]!=null)$(id).value=c[id];
  if(c.style)$('style').value=c.style;
  for(const key of ['parent1Id','parent2Id'])$(key).dataset.saved=c[key]||'';
  $('ownedOnly').checked=!!c.ownedOnly;mode=c.mode==='score'?'score':'factor';teamId=c.teamId||'';targetId=c.teamId?c.targetId||'':'';
}
async function init(){
  data=await api('/api/data');$('db-state').textContent='공개 데이터 · 읽기 전용';
  $('courseId').innerHTML=data.nextEvents.events.map(e=>`<option value="${e.courseId}">${esc(e.name)} · ${esc(e.startDate)} · ${esc(e.courseLabel)}</option>`).join('')||'<option value="">예정 코스 미등록</option>';
  $('courseId').disabled=!data.nextEvents.events.length;
  applyConfig(data.preferences.config||{});
  $('source-list').innerHTML=data.sources.map(s=>`<div class="source-card"><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.id)} ↗</a> <span class="pill">${esc(s.license)}</span><p>${esc(s.role)}</p><code>${esc(s.commit)}</code></div>`).join('');
  const supportGuides=await api('/api/support-guides');
  const supportSources=[...new Map(supportGuides.profiles.flatMap(p=>p.sources).map(s=>[s.id,s])).values()];
  $('support-guide-sources').innerHTML='<h3>서포트 공략 DB · '+supportGuides.profiles.length+'개 편성 규칙</h3><p class="caption">무인도 · 대회/각질/인자작·고점작/지원역별로 저장합니다. 원문 6장과 공략 카드풀로 재구성한 편성을 구분합니다.</p>'+supportSources.map(s=>`<p class="caption"><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.label)} ↗</a> · ${esc(s.scope)} · 확인 ${esc(s.verifiedOn)}</p>`).join('');
  $('data-notes').innerHTML=data.notes.map(n=>`<li>${esc(n)}</li>`).join('');$('import-date').textContent='DB 가져온 시각: '+new Date(data.importedAt).toLocaleString('ko-KR')+' · 코스 '+data.counts.courses+'개 · 계산 지원 '+data.counts.simulatedSkills+'개';
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>page(b.dataset.page).catch(e=>toast(e.message)));
  $('config').onsubmit=e=>e.preventDefault();$('config').onchange=e=>{if(e.target.id==='courseId'){targetId='';teamId='';for(const k of ['parent1Id','parent2Id'])$(k).value='';applyEventDefaults();}refresh();};
  $('teams').onclick = e => {
    const button = e.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.member) {
      teamId = button.dataset.team;
      targetId = button.dataset.member;
    } else if (button.dataset.selectTeam) {
      teamId = button.dataset.selectTeam;
      targetId = plan.teamRecommendations.teams.find(team => team.id === teamId)?.members[0]?.id || '';
    } else return;
    return refresh();
  };
  $('style').onchange=()=>refresh();
  $('targetId').onchange=()=>{targetId=$('targetId').value;for(const key of ['parent1Id','parent2Id'])$(key).value='';refresh();};
  for(const key of ['parent1Id','parent2Id'])$(key).onchange=()=>refresh();
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;refresh();});
  for(const id of ['skill-search','hint-level','skill-sort','skill-scope'])$(id).addEventListener(id==='skill-search'?'input':'change',renderSkills);
  $('run-sim').onclick=()=>simulate('all');$('run-build-sim').onclick=()=>simulate('build');$('cancel-sim').onclick=()=>stopSimulation();
  for(const id of ['collection-kind','collection-type','collection-search'])$(id).addEventListener(id==='collection-search'?'input':'change',collection);
  $('collection-list').onchange=async e=>{try{if(e.target.dataset.own){const row=e.target.closest('.collection-item');await saveCollection(+e.target.dataset.own,e.target.checked,+row.querySelector('[data-level]')?.value||1);}else if(e.target.dataset.level){const row=e.target.closest('.collection-item');const input=e.target;if(!input.checkValidity()){toast('카드 최대 레벨 이내로 입력하세요.');collection();return;}if(row.querySelector('[data-own]').checked)await saveCollection(+input.dataset.level,true,+input.value);}}catch(e){toast(e.message);collection();}};
  $('save-plan').onclick=async()=>{try{await api('/api/plans',config());toast('현재 계획과 계산 결과를 저장했습니다.');}catch(e){toast(e.message);}};
  $('restore').onchange=async()=>{try{const file=$('restore').files[0];if(!file)return;if(file.size>30_000_000)throw Error('30MB 이하의 백업 파일을 선택하세요.');await api('/api/restore',JSON.parse(await file.text()));data=await api('/api/data');if(data.preferences.config)applyConfig(data.preferences.config);await refresh();collection();toast('보유 목록·개체 기록·설정을 병합하고 계획을 가져왔습니다.');}catch(e){toast(e.message);}$('restore').value='';};
  $('vet-character').innerHTML=data.characters.map(c=>`<option value="${c.id}">${esc(c.name)} · ${esc(c.title)}</option>`).join('');
  $('add-factor').onclick=()=>factorRow();$('vet-new').onclick=()=>editVeteran();$('vet-search').oninput=renderVeterans;
  $('veteran-form').onsubmit=async e=>{e.preventDefault();try{
    const factors=[...$('vet-factors').children].map(row=>({type:row.children[0].value,name:row.children[1].value,stars:+row.children[2].value}));
    const {record}=await api('/api/veterans',{id:editingVeteran,characterId:+$('vet-character').value,name:$('vet-name').value,factors,g1Wins:[...$('vet-races').querySelectorAll('input:checked')].map(i=>i.value),racesComplete:$('vet-races-complete').checked,parentIds:[$('vet-parent1').value||null,$('vet-parent2').value||null],notes:$('vet-notes').value});
    await loadVeterans();editVeteran(record.id);toast('인자·G1 기록을 DB에 저장했습니다.');
  }catch(e){toast(e.message);}};
  $('veteran-list').onclick=async e=>{const b=e.target.closest('button');if(!b)return;try{if(b.dataset.editVet)editVeteran(b.dataset.editVet);if(b.dataset.deleteVet){await api('/api/veterans',{action:'delete',id:b.dataset.deleteVet});await loadVeterans();editVeteran();toast('개체 기록을 삭제했습니다.');}}catch(e){toast(e.message);}};
  await loadVeterans();renderParentOptions();
  await refresh();
}
init().catch(e=>{$('db-state').textContent='데이터 불러오기 실패';toast(e.message);});
