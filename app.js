// 학년·단원 선택, 영어 연습, 오답 복습과 개인 본문 저장을 처리합니다.
'use strict';
const B = window.BOOK;
const $ = s => document.querySelector(s);
const escapeHTML = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const h = escapeHTML;
const storageKey = `english-haru-${B.code}-v1`;
let saved = {};
let storageProblem = false;
try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { storageProblem = true; }
let state = {known:{}, wrong:{}, attempts:0, correct:0, texts:{}, activity:{}, wordReview:{}, last:'1/1/home', ...saved};
if (!state.known || !state.wrong || !state.texts) state = {known:{},wrong:{},attempts:0,correct:0,texts:{},activity:{},wordReview:{},last:'1/1/home'};
let route = {grade:1, number:1, tab:'words'};
let quiz = null;
let speechIndex = 0;
let speechToken = 0;
let translations = true;
let readingSpeed = 1;
let recorder = null;
let recordingStream = null;
let recordingUrl = null;
let recordingToken = 0;
let recordingBusy = false;
let toastTimer;
let pendingFlashIndex=null;
const tabs = [['home','⌂','학습 홈'],['words','Aa','단어'],['grammar','≋','문법'],['reading','▤','읽기'],['quiz','✓','문제풀기'],['speaking','◌','말하기'],['review','↺','오답노트'],['text','＋','내 본문'],['resources','↗','교과서 자료']];
const units = B.units;
B.texts=prepareTexts(B.texts||{});
function unit(){return units.find(u=>u.grade===route.grade&&u.number===route.number);}
function save(){
  try { localStorage.setItem(storageKey,JSON.stringify(state)); return true; }
  catch { toast('저장 공간 또는 브라우저 설정 때문에 저장하지 못했습니다. 백업을 내려받아 주세요.'); return false; }
}
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>{$('#toast').hidden=true;},4500);}
function setRoute(grade,number,tab){location.hash=`${grade}/${number}/${tab}`;}
function parseRoute(){
  const raw=(location.hash.slice(1)||state.last||'1/1/words').split('/');
  const grade=[1,2].includes(Number(raw[0]))?Number(raw[0]):1;
  const number=Number(raw[1])>=1&&Number(raw[1])<=8?Number(raw[1]):1;
  const tab=tabs.some(t=>t[0]===raw[2])?raw[2]:'words';
  return {grade,number,tab};
}
function stopAudio(){speechToken++;stopNativeAudio();}
function stopRecording(){
  recordingToken++;
  if(recorder?.state==='recording')recorder.stop();
  recordingStream?.getTracks().forEach(t=>t.stop());
  recordingStream=null;recorder=null;recordingBusy=false;
  if(recordingUrl){URL.revokeObjectURL(recordingUrl);recordingUrl=null;}
}
function speak(text,rate=readingSpeed,onEnd=null){stopAudio();speakNative(text,rate,onEnd);}
function speakAll(reading){
  stopAudio();let index=0;
  function next(){
    if(index>=reading.length)return;
    const current=index++;
    speak(reading[current].en,readingSpeed,()=>{if(speechToken===token)next();});
    token=speechToken;
  }
  let token=speechToken;next();
}
function stats(){
 $('#wordCount').innerHTML=`${B.units.reduce((n,u)=>n+u.words.filter((_,i)=>state.known[`${u.id}:${i}`]).length,0)}<span>/ ${B.units.reduce((n,u)=>n+u.words.length,0)}개</span>`;
 $('#attemptCount').innerHTML=`${state.attempts}<span>문제</span>`;
 $('#accuracy').textContent=state.attempts?`${Math.round(state.correct/state.attempts*100)}%`:'—';
 $('#wrongCount').innerHTML=`${Object.keys(state.wrong).length}<span>문제</span>`;
}
function render(){
 const u=unit();document.body.classList.toggle('ybm',B.code==='y');
 document.title=`영어하루 · ${B.publisher} ${B.author}`;
 $('#bookLabel').innerHTML=`${h(B.publisher)} · ${h(B.author)}<strong>중학 영어 1·2</strong>`;
 $('#footerBook').textContent=`${B.publisher} ${B.author} · 2022 개정`;
 $('#grades').innerHTML=[1,2].map(g=>`<button class="grade ${g===route.grade?'active':''}" data-grade="${g}" aria-pressed="${g===route.grade}">중${g}</button>`).join('');
 $('#lessons').innerHTML=units.filter(v=>v.grade===route.grade).map(v=>`<button class="lesson-button ${v.number===u.number?'active':''}" data-unit="${v.number}" ${v.number===u.number?'aria-current="true"':''}><span class="num">${String(v.number).padStart(2,'0')}</span><span>${h(v.pending?(state.texts[v.id]?.title||v.title):v.title)}<small>${h(v.topic)}</small></span></button>`).join('');
 $('#eyebrow').textContent=`${B.publisher.toUpperCase()} · GRADE ${route.grade}`;
 $('#unitNumber').textContent=`중${u.grade} · LESSON ${String(u.number).padStart(2,'0')}`;
 $('#unitTitle').textContent=u.pending?(state.texts[u.id]?.title||u.title):u.title;
 $('#unitTopic').textContent=u.topic;
 $('#contentNote').textContent=state.texts[u.id]?'이 브라우저에 등록한 개인 자료로 학습합니다. 읽기에서 본문 전체와 대화·활동 자료를 확인하세요.':B.texts[u.id]?'2022 개정 교과서 본문과 대화·활동 자료를 바로 읽고 들을 수 있습니다.':u.verified?'공식 2022 개정 단원명을 확인했습니다. 교과서 자료에서 원본을 확인하고 내 본문에 등록해 학습하세요.':u.pending?'2022 개정 교과서의 단원명·본문 대조 전입니다. 내 본문에서 개인 자료를 등록해 학습하세요.':'단원 주제에 맞춰 별도로 만든 연습 자료입니다. 교과서 원문·전체 어휘 목록은 포함하지 않습니다.';
 $('#tabs').innerHTML=tabs.map(([id,icon,name])=>`<button class="tab ${route.tab===id?'active':''}" data-tab="${id}" aria-current="${route.tab===id?'page':'false'}"><span class="tab-icon" aria-hidden="true">${icon}</span>${name}</button>`).join('');
 stats();renderPanel();renderDashboard();
}
function wordPanel(){return wordMode==='cards'?flashcardPanel():`<div class="section-top"><h3>한눈에 보는 단어</h3><div class="segmented"><button data-action="word-cards" aria-pressed="false">카드</button><button class="selected" data-action="word-list" aria-pressed="true">목록</button></div></div>`+wordListPanel();}
function wordListPanel(){const u=unit();return `<div class="section-top"><h3>오늘의 주제 어휘 <span class="chip">${u.words.length} WORDS</span></h3><span class="subtle">들어 보고, 아는 단어를 표시해요.</span></div><div class="word-grid">${u.words.map((w,i)=>`<article class="word-card ${state.known[`${u.id}:${i}`]?'known':''}"><span class="word-index">WORD ${String(i+1).padStart(2,'0')}</span><span class="mini-picture" role="img" aria-label="${h(w.ko)} 그림 힌트">${window.WORD_DETAILS[w.en].picture}</span><h4 lang="en">${h(w.en)}</h4><p>${h(w.ko)}</p><div class="word-controls"><button class="icon-button" data-word-speak="${i}" aria-label="${h(w.en)} 듣기">▷</button><button class="know-button" data-known="${i}" aria-pressed="${!!state.known[`${u.id}:${i}`]}">${state.known[`${u.id}:${i}`]?'✓ 외웠어요':'○ 외웠어요'}</button></div><details><summary>예문 3개 보기</summary>${wordExampleHTML(w)}</details></article>`).join('')}</div><p class="private-note">교과서 전체 단어장이 아닌 주제별 자체 선정 어휘입니다.</p>`;}
function grammarPanel(){return expandedGrammarPanel();}
function readerHTML(reading,prefix='reading'){return reading.map((r,i)=>`<article class="sentence"><span class="sentence-number">${String(i+1).padStart(2,'0')}</span><div class="sentence-text"><p class="en" lang="en">${h(r.en)}</p>${translations&&r.ko?`<p class="ko">${h(r.ko)}</p>`:''}</div><button class="icon-button" data-${prefix}-speak="${i}" aria-label="${i+1}번 문장 듣기">▷</button></article>`).join('');}
function readingTools(kind){return `<div class="reading-tools"><button class="outline-button" data-action="${kind==='text'?'text-all':'reading-all'}">▷ 전체 듣기</button><button class="outline-button" data-action="stop-audio">정지</button><button class="outline-button" data-action="toggle-translations" aria-pressed="${translations}">${translations?'해석 숨기기':'해석 보기'}</button><label><span class="screen-reader">듣기 속도</span><select id="speedSelect">${[.65,.85,1].map(s=>`<option value="${s}" ${s===readingSpeed?'selected':''}>${s}배속</option>`).join('')}</select></label></div>`;}
function readingPanel(){return expandedReadingPanel();}
function normalize(v){return String(v).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');}
function cloze(r,id,label){
 const words=r.en.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)||[];
 const candidates=words.filter(w=>w.length>=4);
 const answer=candidates[Math.floor(candidates.length/2)]||words[words.length-1];
 if(!answer)return null;
 const prompt=r.en.replace(new RegExp(`\\b${answer.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`),'_____');
 return {id,type:'blank',label,prompt,ko:r.ko||'',answer,why:r.en};
}
function questions(u){
 const out=u.words.map((w,i)=>{
 const options=[w.ko,...u.words.filter((_,j)=>j!==i).slice(0,3).map(w=>w.ko)];
 const shift=i%4;const rotated=options.slice(shift).concat(options.slice(0,shift));
 return {id:`${u.id}:w${i}`,type:'choice',label:'어휘',prompt:`${w.en}의 뜻은 무엇인가요?`,options:rotated,answer:rotated.indexOf(w.ko),why:`${w.en} = ${w.ko}`};
 });
 u.grammar.forEach((g,i)=>out.push({id:`${u.id}:g${i}`,type:'choice',label:'문법',prompt:g.question,options:g.options,answer:g.answer,why:g.why}));
 u.grammar.forEach((g,i)=>{const topic=window.GRAMMAR_LIBRARY.find(t=>t.title===g.title);out.push(...grammarQuestions([topic],`${u.id}:gx${i}`).slice(1));});
 (B.texts[u.id]?.reading||u.reading).forEach((r,i)=>{const q=cloze(r,`${u.id}:${B.texts[u.id]?'book:':''}r${i}`,'문장 빈칸');if(q)out.push(q);});return out;
}
function startQuiz(mode='unit'){
 let qs=mode==='grammar'?grammarQuestions(grammarTopics(),'grammar'):mode==='review'?Object.values(state.wrong).map(w=>w.question):mode==='text'?(personalText()?.reading||[]).map((r,i)=>cloze(r,`${unit().id}:personal:${(state.texts[unit().id]||B.texts[unit().id]).updated}:${route.tab==='text'?'body':readingSection}:${i}`,state.texts[unit().id]?'내 본문 빈칸':'교과서 본문 빈칸')).filter(Boolean):questions(unit());
 if(!qs.length){toast(mode==='review'?'복습할 오답이 아직 없습니다.':'학습할 문장이 아직 없습니다.');return;}
 quiz={items:qs,index:0,right:0,answered:false,feedback:null,mode,complete:false};
 if(route.tab!=='quiz'){route.tab='quiz';history.pushState(null,'',`#${route.grade}/${route.number}/quiz`);state.last=`${route.grade}/${route.number}/quiz`;save();}
 render();
}
function quizPanel(){
 if(!quiz)return `<div class="quiz-intro"><span class="chip">SMALL STEPS, REAL PROGRESS</span><h3 style="margin-top:15px">배운 내용을 확인해 볼까요?</h3><p class="subtle">바로 채점하고 틀린 문제는 오답노트에 모아 드려요.</p><div class="quiz-types"><span>어휘 ${unit().words.length}문제</span><span>문법 ${unit().grammar.length*3}문제</span><span>문장 빈칸 ${questions(unit()).filter(q=>q.id.includes(':book:')||/:r\d+$/.test(q.id)).length}문제</span></div><button class="primary-button" data-action="begin-quiz">${questions(unit()).length}문제 시작하기 →</button></div>`;
 if(quiz.complete)return `<div class="result"><span class="chip">오늘의 연습 완료</span><h3>${quiz.mode==='review'?'오답을 다시 살펴봤어요.':'한 걸음 더 가까워졌어요.'}</h3><strong>${Math.round(quiz.right/quiz.items.length*100)}<span style="font-size:22px">점</span></strong><p>${quiz.items.length}문제 중 ${quiz.right}문제 정답 · 틀린 문제는 오답노트에서 복습하세요.</p><div class="actions"><button class="primary-button" data-action="review-start">오답 다시 풀기</button><button class="outline-button" data-action="quiz-retry">한 번 더 연습</button><button class="outline-button" data-tab="words">단어로 돌아가기</button></div></div>`;
 const q=quiz.items[quiz.index];
 return `<div class="quiz-card"><div class="quiz-meta"><span>${h(q.label)} · ${quiz.mode==='review'?'전체 학년 오답 복습':quiz.mode==='text'?'본문 연습':'단원 연습'}</span><span>${quiz.index+1} / ${quiz.items.length}</span></div><progress value="${quiz.index}" max="${quiz.items.length}" aria-label="문제 진행률"></progress><h3>${h(q.prompt)}</h3>${q.type==='blank'&&q.ko?`<p class="prompt-ko">${h(q.ko)}</p>`:''}${q.type==='choice'?`<div class="options">${q.options.map((option,i)=>`<button class="option ${quiz.answered&&i===q.answer?'correct':''} ${quiz.answered&&quiz.selected===i&&i!==q.answer?'incorrect':''}" data-answer="${i}" ${quiz.answered?'disabled':''}><span>${i+1}</span>${h(option)}</button>`).join('')}</div>`:`<form id="blankForm" class="blank-form"><label class="screen-reader" for="blankAnswer">빈칸에 들어갈 영어 단어</label><input id="blankAnswer" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="빈칸에 들어갈 단어" ${quiz.answered?'disabled':''} required><button class="primary-button" ${quiz.answered?'disabled':''}>정답 확인</button></form>`}${quiz.answered?`<div class="feedback ${quiz.feedback.correct?'':'bad'}" role="status"><strong>${quiz.feedback.correct?'✓ 정답이에요!':'다시 기억해 두세요.'}</strong><p>${q.type==='blank'?`정답 · ${h(q.answer)}<br>`:''}${h(q.why)}</p></div>`:''}<div class="quiz-bottom"><button class="text-button" data-action="quiz-exit">연습 종료</button>${quiz.answered?`<button class="primary-button" data-action="quiz-next">${quiz.index===quiz.items.length-1?'결과 보기':'다음 문제 →'}</button>`:'<span class="subtle">차근차근 풀어 보세요.</span>'}</div></div>`;
}
function answer(value){
 if(!quiz||quiz.answered||quiz.complete)return;
 const q=quiz.items[quiz.index];const correct=q.type==='choice'?Number(value)===q.answer:normalize(value)===normalize(q.answer);
 quiz.answered=true;quiz.selected=q.type==='choice'?Number(value):value;quiz.feedback={correct};
 recordActivity('answers');state.attempts++;if(correct){quiz.right++;state.correct++;delete state.wrong[q.id];}else state.wrong[q.id]={question:q,unitId:unit().id,at:new Date().toISOString()};
 save();stats();renderPanel();renderDashboard();
}
function reviewPanel(){const wrong=Object.values(state.wrong);return `<div class="section-top"><h3>나의 오답노트 <span class="chip">${wrong.length}문제</span></h3><span class="subtle">이 앱의 전체 학년 오답</span></div>${wrong.length?`<button class="primary-button" data-action="review-start">오답 ${wrong.length}문제 다시 풀기 →</button><div class="review-list">${wrong.map(w=>`<article class="review-item"><span class="chip">${h(w.question.label)}</span><p>${h(w.question.prompt)}</p><small>정답을 맞히면 오답노트에서 빠집니다.</small></article>`).join('')}</div>`:'<div class="empty"><h3>다시 볼 문제가 아직 없어요.</h3><p>문제를 풀다 틀리면 이곳에 모입니다. 복습에서 정답을 맞히면 목록에서 빠집니다.</p><button class="primary-button" data-action="quiz-start">단원 문제 풀기</button></div>'}`;}
function speakingPanel(){
 const textReading=personalText()?.reading;const source=textReading?.length?textReading:unit().reading;
 if(!source.length)return pendingPanel();
 speechIndex%=source.length;const r=source[speechIndex];
 return `<div class="section-top"><h3>듣고, 따라 말하고, 비교해요.</h3><span class="chip">${textReading?.length?(state.texts[unit().id]?'내 본문':'교과서 본문·대화'):'자체 예문'} ${speechIndex+1} / ${source.length}</span></div><div class="speaking-card"><p class="en" lang="en">${h(r.en)}</p>${r.ko?`<p class="ko">${h(r.ko)}</p>`:''}<div class="speaking-controls"><button class="outline-button" data-action="speak-model">▷ 문장 듣기</button><button class="outline-button" data-action="speak-slow">▷ 천천히 듣기</button><button class="primary-button" id="recordButton" data-action="record">● 내 목소리 녹음</button></div><p class="record-state" id="recordState">녹음 후 내 목소리를 들어 보세요. 자동 발음 채점은 하지 않습니다.</p><div id="recordPlayback"></div><div class="quiz-bottom"><button class="text-button" data-action="speaking-prev">← 이전 문장</button><button class="text-button" data-action="speaking-next">다음 문장 →</button></div></div><p class="private-note">녹음은 이 화면에서만 재생되며 화면을 벗어나면 사라집니다. 서버로 업로드하지 않습니다.</p>`;
}
function pendingPanel(){return `<div class="empty"><h3>학습할 본문을 등록해 주세요.</h3><button class="primary-button" data-tab="text">내 본문 등록하기 →</button></div>`;}
function textPanel(){
 const t=state.texts[unit().id];return `<div class="import-card"><span class="chip">나만의 본문</span><h3 style="margin-top:10px">나만의 본문을 추가하세요.</h3><p>영어 본문을 붙여 넣으면 문장을 나눠 듣기와 빈칸 연습을 만듭니다. 해석을 함께 넣으려면 한 줄에 <b>영어 문장 || 한국어 해석</b> 형식으로 입력하세요.</p><label for="textTitle">본문 제목</label><input id="textTitle" value="${h(t?.title||'')}" placeholder="예. 1과 본문"><label for="textContent">영어 본문 · 해석은 선택</label><textarea id="textContent" placeholder="English sentence. || 한국어 해석\n다음 문장은 새 줄에 입력하세요.">${h(t?.raw||'')}</textarea><p class="private-note">해석은 입력한 내용만 표시합니다. 자동 번역은 하지 않습니다.</p><div class="import-actions"><button class="primary-button" data-action="save-text">본문 저장하기</button><button class="outline-button" data-action="export-data">내 자료 백업</button><button class="outline-button" data-action="import-data">자료·백업 불러오기</button>${t?'<button class="danger-button" data-action="delete-text">이 본문 삭제</button>':''}</div><input type="file" id="backupFile" class="backup-file" accept="application/json,.json"><p class="private-note">등록한 본문·오답·학습 기록은 이 브라우저에 저장됩니다. 자료 파일은 학습 기록을 유지하며 추가합니다. 다른 기기로 옮길 때는 백업 파일을 이용하세요. 브라우저 데이터를 지우면 사라집니다.</p><p id="importStatus" class="import-status" role="status"></p></div>${t?`<section class="import-reader"><div class="section-top"><h3>${h(t.title)} <span class="chip">${t.reading.length}문장</span></h3><button class="outline-button" data-action="text-quiz">본문 빈칸 연습 →</button></div>${readingTools('text')}${readerHTML(t.reading,'text')}</section>`:''}`;
}
function renderPanel(){
 const u=unit();
 const unavailable=u.pending&&!['home','text','review','speaking','resources'].includes(route.tab)&&!(route.tab==='quiz'&&quiz);
 $('#panel').innerHTML=unavailable?pendingPanel():({home:homePanel,words:wordPanel,grammar:grammarPanel,reading:readingPanel,quiz:quizPanel,speaking:speakingPanel,review:reviewPanel,text:textPanel,resources:resourcesPanel}[route.tab])();
}
function splitText(raw){
 return raw.split(/\r?\n/).flatMap(line=>{
   const [en,...ko]=line.split('||');const english=en.trim();if(!english)return[];
   if(ko.length)return[{en:english,ko:ko.join('||').trim()}];
   const segments=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('en',{granularity:'sentence'}).segment(english)].map(s=>s.segment.trim()):english.split(/(?<=[.!?])\s+/);
   return segments.filter(Boolean).map(en=>({en,ko:''}));
 });
}
function saveText(){
 const raw=$('#textContent').value.trim();if(!raw){toast('영어 본문을 입력해 주세요.');return;}
 const reading=splitText(raw);if(!reading.length||!reading.some(r=>/[A-Za-z]/.test(r.en))){toast('영어 문장을 포함한 본문을 입력해 주세요.');return;}
 const id=unit().id;const previous=state.texts[id];
 const title=$('#textTitle').value.trim()||`${route.number}과 개인 본문`;
 state.texts[id]={...previous,title,raw,reading,updated:Date.now()};
 if(!save()){if(previous)state.texts[id]=previous;else delete state.texts[id];return;}
 const obsolete=Object.keys(state.wrong).filter(k=>k.startsWith(`${id}:personal:`));obsolete.forEach(k=>delete state.wrong[k]);save();render();$('#importStatus').textContent=`${reading.length}문장을 이 기기에 저장했습니다.`;
}
function exportData(){
 const blob=new Blob([JSON.stringify({app:'english-haru',publisher:B.code,version:1,state},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${B.repo}-개인학습-백업-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function prepareTexts(texts){
 if(!texts||typeof texts!=='object'||Array.isArray(texts))throw Error('본문 데이터가 올바르지 않습니다.');
 const result={};
 for(const [id,t] of Object.entries(texts)){
  if(!units.some(u=>u.id===id)||!t||typeof t.raw!=='string'||typeof t.title!=='string')throw Error('본문 데이터가 올바르지 않습니다.');
  const item={...t,reading:splitText(t.raw),updated:Number(t.updated)||Date.now()};
  if(t.activities){
   if(typeof t.activities.raw!=='string'||typeof t.activities.title!=='string')throw Error('대화·활동 데이터가 올바르지 않습니다.');
   item.activities={...t.activities,reading:splitText(t.activities.raw).filter(r=>/[A-Za-z]/.test(r.en))};
  }
  result[id]=item;
 }
 return result;
}
async function importData(file){
 if(!file)return;
 try{
  const backup=JSON.parse(await file.text());
  if(backup.app!=='english-haru'||backup.publisher!==B.code||backup.version!==1)throw Error('이 출판사의 백업 파일이 아닙니다.');
  if(backup.kind==='materials'){
   const texts=prepareTexts(backup.texts);
   const previous=state;state={...state,texts:{...state.texts,...texts}};
   if(!save()){state=previous;return;}
   quiz=null;readingSection='body';render();toast(`${Object.keys(texts).length}개 단원 자료를 등록했습니다. 기존 학습 기록은 유지했습니다.`);return;
  }
  const s=backup.state;
  if(!s||typeof s!=='object'||!s.texts||typeof s.texts!=='object'||!s.wrong||!s.known||!Number.isFinite(s.attempts)||!Number.isFinite(s.correct)||s.attempts<0||s.correct<0||s.correct>s.attempts)throw Error('백업 형식이 올바르지 않습니다.');
  s.texts=prepareTexts(s.texts);
  for(const w of Object.values(s.wrong)){
    const q=w?.question;
    if(!q||typeof q.id!=='string'||typeof q.prompt!=='string'||typeof q.why!=='string'||!['choice','blank'].includes(q.type)||(q.type==='choice'&&(!Array.isArray(q.options)||q.options.length!==4||!q.options.every(x=>typeof x==='string')||!Number.isInteger(q.answer)||q.answer<0||q.answer>3))||(q.type==='blank'&&typeof q.answer!=='string'))throw Error('오답 데이터가 올바르지 않습니다.');
  }
  if(!confirm('현재 개인 본문과 학습 기록을 이 백업의 내용으로 바꿀까요?'))return;
  const previous=state;state={...s,activity:s.activity||{},wordReview:s.wordReview||{},last:state.last};if(!save()){state=previous;return;}
  quiz=null;render();toast('개인 본문과 학습 기록을 불러왔습니다.');
 }catch(e){toast(e instanceof SyntaxError?'백업 JSON 파일을 읽지 못했습니다.':e.message);}
}
async function record(){
 if(recordingBusy)return;
 if(recorder?.state==='recording'){recorder.stop();return;}
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('이 브라우저는 녹음을 지원하지 않습니다. Chrome 또는 Safari에서 열어 주세요.');return;}
 stopAudio();recordingBusy=true;const token=++recordingToken;
 const btn=$('#recordButton');btn.disabled=true;$('#recordState').textContent='마이크 권한을 기다리고 있습니다.';
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  if(token!==recordingToken||route.tab!=='speaking'){stream.getTracks().forEach(t=>t.stop());return;}
  recordingStream=stream;const rec=new MediaRecorder(stream);recorder=rec;const chunks=[];
  rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  rec.onstop=()=>{
    stream.getTracks().forEach(t=>t.stop());
    if(token!==recordingToken||route.tab!=='speaking')return;
    if(recordingUrl)URL.revokeObjectURL(recordingUrl);
    const blob=new Blob(chunks,{type:rec.mimeType||'audio/webm'});recordingUrl=URL.createObjectURL(blob);
    const audio=document.createElement('audio');audio.controls=true;audio.src=recordingUrl;audio.setAttribute('aria-label','내 목소리 재생');$('#recordPlayback').replaceChildren(audio);
    $('#recordButton').textContent='● 다시 녹음';$('#recordButton').classList.remove('recording');$('#recordState').textContent='녹음을 마쳤습니다. 내 목소리와 예문을 비교해 보세요.';
  };
  rec.start();btn.disabled=false;btn.textContent='■ 녹음 마치기';btn.classList.add('recording');$('#recordState').textContent='녹음 중입니다. 문장을 읽은 뒤 녹음 마치기를 누르세요.';
 }catch{recordingStream?.getTracks().forEach(t=>t.stop());if(token===recordingToken&&$('#recordState')){$('#recordState').textContent='마이크를 사용할 수 없습니다. 브라우저의 마이크 권한을 확인해 주세요.';btn.disabled=false;}}
 finally{recordingBusy=false;}
}
function resourcesPanel(){
 const u=unit();const resources=B.resources.filter(r=>r.grade===u.grade&&(r.number===null||r.number===u.number));
 return `<div class="section-top"><h3>중${u.grade} · ${u.number}과 교과서 자료</h3><span class="chip">${resources.length}개 링크</span></div><p class="private-note">확인일 ${h(B.checkedAt)} · 자료는 원본 사이트에서 열립니다. 공식 자료 일부는 로그인·교사 인증이 필요합니다.</p>${resources.map(r=>`<article class="source-link"><span class="chip">${r.kind==='official'?'출판사 공식':r.kind==='textbook'?'본문·대화문 모음':'학습 자료'}</span> <a href="${h(r.url)}" target="_blank" rel="noopener noreferrer">${h(r.label)} ↗</a><small>${h(r.note)}</small></article>`).join('')}<p class="private-note">받은 영어 본문은 내 본문에 등록하면 문장 듣기·빈칸 연습·말하기에 사용할 수 있습니다.</p><button class="primary-button" data-tab="text">내 본문 등록하기 →</button>`;
}
function sourceDialog(){
 $('#sourceBody').innerHTML=`<div class="source-info"><p><b>${h(B.publisher)} ${h(B.author)} · ${h(B.edition)}</b></p><p>중1·중2의 일반 단원 8개씩을 구성했습니다. 중1·중2만 학습 범위에 포함합니다. 특별 단원은 미수록입니다.</p><p>제공된 2022 개정 자료의 본문·대화문을 사이트에서 직접 학습할 수 있습니다. 어휘·문법 설명은 자체 연습 자료이며, 빈칸 퀴즈는 본문에서 생성합니다. 삽화·전체 단어장·출판사 녹음 음원은 포함하지 않습니다. 문법은 자체 선정했으며 교과서 단원별 문법과의 일치 여부는 대조 전입니다.</p><p>듣기는 Kokoro의 미국식 영어 여성 AI 음성입니다. 교과서 본문과 직접 입력한 문장을 기기 안에서 음성으로 만들며 첫 이용에 약 90MB의 모델을 내려받습니다.</p><p>기본 교과서 자료는 사이트에 포함되어 있습니다. 직접 추가한 개인 본문과 학습 기록은 브라우저에만 저장됩니다. 이 앱은 출판사 공식 앱이 아닙니다.</p><p>자료 경로 확인일 · ${h(B.checkedAt)}</p><p>교과서 자료 탭에서 학년·단원별 공식 자료, 본문 PDF 모음과 공개 학습 자료 ${B.resources.filter(r=>r.kind==='practice').length}개를 확인하세요. 링크 목록이며 파일별 내용 검수는 하지 않았습니다.</p></div>${B.sources.map(s=>`<div class="source-link"><a href="${h(s.url)}" target="_blank" rel="noopener noreferrer">${h(s.label)} ↗</a><small>${h(s.note)}</small></div>`).join('')}`;
 $('#sourceDialog').showModal();
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 const action=b.dataset.action;
 if(b.dataset.say){speak(b.dataset.say);return;}
 if(b.dataset.grammarMode){grammarMode=b.dataset.grammarMode;renderPanel();return;}
 if(b.dataset.readingSection){stopAudio();readingSection=b.dataset.readingSection;speechIndex=0;renderPanel();return;}
 if(b.dataset.readingLayout){readingLayout=b.dataset.readingLayout;renderPanel();return;}
 if(action==='grammar-quiz'){startQuiz('grammar');return;}
 if(action==='word-cards'||action==='word-list'){wordMode=action==='word-cards'?'cards':'list';renderPanel();return;}
 if(action==='flash-flip'){flashRevealed=true;renderPanel();return;}
 if(action==='flash-known'||action==='flash-again'){if(flashRevealed)reviewWord(action==='flash-known');return;}
 if(action==='flash-next'||action==='flash-prev'){moveWord(action==='flash-next'?1:-1);return;}
 if(action==='due-review'){
  const due=dueWords()[0];const target=due?.u||unit();wordMode='cards';flashIndex=due?.i||0;flashRevealed=false;
  const tab=target.pending?'text':'words';
  if(route.grade===target.grade&&route.number===target.number&&route.tab===tab)render();else{pendingFlashIndex=flashIndex;setRoute(target.grade,target.number,tab);}return;
 }
 if(b.dataset.grade){setRoute(Number(b.dataset.grade),1,route.tab==='home'?'home':'words');return;}
 if(b.dataset.unit){setRoute(route.grade,Number(b.dataset.unit),'words');return;}
 if(b.dataset.tab){if(b.dataset.tab!==route.tab){stopRecording();quiz=null;setRoute(route.grade,route.number,b.dataset.tab);}return;}
 if(b.dataset.wordSpeak!==undefined){speak(unit().words[Number(b.dataset.wordSpeak)].en);return;}
 if(b.dataset.grammarSpeak!==undefined){speak(unit().grammar[Number(b.dataset.grammarSpeak)].en);return;}
 if(b.dataset.readingSpeak!==undefined){speak(unit().reading[Number(b.dataset.readingSpeak)].en);return;}
 if(b.dataset.textSpeak!==undefined){speak(personalText().reading[Number(b.dataset.textSpeak)].en);return;}
 if(b.dataset.known!==undefined){const id=`${unit().id}:${b.dataset.known}`;state.known[id]=!state.known[id];save();stats();renderPanel();renderCoach();return;}
 if(b.dataset.answer!==undefined){answer(Number(b.dataset.answer));return;}
 if(action==='sources')sourceDialog();
 if(action==='close-dialog')$('#sourceDialog').close();
 if(['begin-quiz','quiz-start'].includes(action))startQuiz();
 if(action==='review-start')startQuiz('review');
 if(action==='text-quiz')startQuiz('text');
 if(action==='quiz-next'&&quiz?.answered){if(quiz.index===quiz.items.length-1)quiz.complete=true;else{quiz.index++;quiz.answered=false;quiz.feedback=null;}renderPanel();}
 if(action==='quiz-retry'&&quiz){const mode=quiz.mode;startQuiz(mode);}
 if(action==='quiz-exit'){quiz=null;renderPanel();}
 if(action==='toggle-translations'){translations=!translations;renderPanel();}
 if(action==='stop-audio')stopAudio();
 if(action==='reading-all')speakAll(unit().reading);
 if(action==='text-all')speakAll(personalText()?.reading||[]);
 if(['speak-model','speak-slow'].includes(action)){const rs=readingSource();speak(rs[speechIndex].en,action==='speak-slow'?.65:1);}
 if(['speaking-next','speaking-prev'].includes(action)){const rs=readingSource();stopAudio();stopRecording();speechIndex=(speechIndex+(action==='speaking-next'?1:rs.length-1))%rs.length;renderPanel();}
 if(action==='record')record();
 if(action==='save-text')saveText();
 if(action==='export-data')exportData();
 if(action==='import-data')$('#backupFile').click();
 if(action==='delete-text'&&confirm('이 단원에 저장한 개인 본문을 삭제할까요?')){const id=unit().id;delete state.texts[id];Object.keys(state.wrong).filter(k=>k.startsWith(`${id}:personal:`)).forEach(k=>delete state.wrong[k]);save();render();}
});
document.addEventListener('submit',e=>{if(e.target.id==='blankForm'){e.preventDefault();const value=$('#blankAnswer').value.trim();if(value)answer(value);}});
document.addEventListener('change',e=>{if(e.target.id==='speedSelect'){readingSpeed=Number(e.target.value);if(nativePlayer)nativePlayer.playbackRate=readingSpeed;}if(e.target.id==='backupFile')importData(e.target.files[0]);});
window.addEventListener('hashchange',()=>{stopAudio();stopRecording();route=parseRoute();quiz=null;speechIndex=0;flashIndex=pendingFlashIndex??0;pendingFlashIndex=null;flashRevealed=false;state.last=`${route.grade}/${route.number}/${route.tab}`;save();render();if(window.innerWidth<=720&&route.tab!=='home')$('.study-area').scrollIntoView({block:'start'});});
window.addEventListener('popstate',()=>{stopAudio();stopRecording();route=parseRoute();quiz=null;speechIndex=0;render();});
window.addEventListener('pagehide',()=>{stopAudio();stopRecording();});
if(window.innerWidth<=720)document.querySelector('.lesson-disclosure').open=false;
route=parseRoute();render();
if(window.innerWidth<=720&&route.tab!=='home')document.querySelector('.study-area').scrollIntoView({block:'start'});
if(storageProblem)toast('저장된 학습 기록을 읽지 못했습니다.');
