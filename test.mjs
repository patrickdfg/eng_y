// 학습 자료와 채점·개인 본문 분리·오답 복습 동작을 검증합니다.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
function context() {
  const nodes=new Map();
  const node=()=>({dataset:{},innerHTML:'',textContent:'',hidden:true,disabled:false,classList:{toggle(){},remove(){},add(){}},showModal(){},close(){},replaceChildren(){},click(){},setAttribute(){}});
  const document={body:node(),querySelectorAll:()=>[],querySelector:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);},addEventListener(){},createElement:node};
  const stored=new Map();
  const c=vm.createContext({window:{addEventListener(){}},document,location:{hash:''},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},history:{pushState(){}},console,Intl,URL,Blob,Date,setTimeout(){},clearTimeout(){},confirm:()=>true,navigator:{}});
  vm.runInContext(readFileSync('content.js','utf8'),c);
  for(const file of ['learning-data.js','learning.js','translations.js','audio-manifest.js','native-audio.js','dashboard.js'])vm.runInContext(readFileSync(file,'utf8'),c);
  vm.runInContext(readFileSync('app.js','utf8'),c);
  return {run:s=>vm.runInContext(s,c),nodes,stored};
}
test('중1·중2의 16단원과 수록 내용이 일치한다',()=>{
 const {run}=context();
 assert.equal(run('B.units.length'),16);
 assert.equal(run('new Set(B.units.map(u=>u.id)).size'),16);
 assert.equal(run('B.units.reduce((n,u)=>n+u.words.length,0)'),96);
 assert.ok(run('B.units.reduce((n,u)=>n+questions(u).length,0)')>700);
 assert.equal(run('Object.keys(B.texts).length'),16);
 assert.equal(run('B.units.every(u=>u.reading.length===4&&u.grammar.length===2&&u.words.length===6)'),true);
 assert.equal(run('B.units.every(u=>questions(u).every(q=>q.type!=="choice"||(q.options.length===4&&new Set(q.options).size===4&&q.answer>=0&&q.answer<4)))'),true);
});
test('어휘·문법·빈칸 문제 ID가 겹치지 않는다',()=>{
 const {run}=context();assert.equal(run('new Set(B.units.flatMap(questions).map(q=>q.id)).size'),run('B.units.flatMap(questions).length'));
 assert.equal(run('B.units.flatMap(questions).filter(q=>q.type==="blank").every(q=>q.prompt.includes("_____")&&q.answer.length>0)'),true);
});
test('오답을 저장하고 중복 클릭은 중복 채점하지 않는다',()=>{
 const {run,stored}=context();
 run('startQuiz(); answer((quiz.items[0].answer+1)%4); answer(quiz.items[0].answer)');
 assert.equal(run('activity().answers'),1);assert.equal(run('state.attempts'),1);assert.equal(run('state.correct'),0);assert.equal(run('Object.keys(state.wrong).length'),1);assert.equal(stored.size,1);
 assert.equal(run('JSON.parse(localStorage.getItem(storageKey)).attempts'),1);
});
test('복습에서 맞힌 문제만 오답노트에서 빠진다',()=>{
 const {run}=context();run('startQuiz(); answer((quiz.items[0].answer+1)%4); startQuiz("review"); answer(quiz.items[0].answer)');
 assert.equal(run('state.attempts'),2);assert.equal(run('state.correct'),1);assert.equal(run('Object.keys(state.wrong).length'),0);
});
test('영어 문단과 직접 입력한 해석을 보존하며 문장을 나눈다',()=>{
 const {run}=context();
 assert.equal(run('splitText("Hello there. I like coding!").length'),2);
 assert.equal(run('splitText("Hello there. || 안녕하세요.\\nI like coding! || 코딩을 좋아합니다.")[1].ko'),'코딩을 좋아합니다.');
 assert.equal(run('splitText("   ").length'),0);
 assert.equal(run('splitText("Hello <script>alert(1)</script>.")[0].en.includes("<script>")'),true);
 assert.equal(run('h("<img src=x onerror=alert(1)>").includes("<img")'),false);
});
test('빈칸 채점은 대소문자와 끝의 문장부호를 무시한다',()=>{
 const {run}=context();
 run('quiz={items:[cloze({en:"We always protect the forest.",ko:"숲을 지킵니다."},"x","문장")],index:0,right:0,answered:false,mode:"unit"}; answer(quiz.items[0].answer.toUpperCase()+".")');
 assert.equal(run('quiz.right'),1);assert.equal(run('state.correct'),1);
});
test('중1 개인 본문으로 문제를 만든다',()=>{
 const {run}=context();run('route={grade:1,number:1,tab:"text"}; state.texts[unit().id]={title:"내 자료",updated:1,reading:[{en:"We explore the universe.",ko:"우주는 넓습니다."}]}; startQuiz("text")');
 assert.equal(run('unit().grade'),1);assert.equal(run('quiz.items.length'),1);assert.equal(run('quiz.items[0].label'),'내 본문 빈칸');
});
test('잘못된 주소는 유효한 학년·단원·메뉴로 돌아간다',()=>{
 const {run}=context();run('location.hash="#9/99/unknown"');assert.equal(run('JSON.stringify(parseRoute())'),JSON.stringify({grade:1,number:1,tab:'words'}));
});

test('자료 탭은 출판사·학년·단원에 맞는 링크만 표시한다',()=>{
 const {run,nodes}=context();
 assert.equal(run('B.resources.filter(r=>r.kind==="practice").length'),67);
 assert.equal(run('B.resources.every(r=>new URL(r.url).protocol==="https:")'),true);
 run('route={grade:1,number:1,tab:"resources"}; renderPanel()');
 const html=nodes.get('#panel').innerHTML;
 assert.ok(html.includes('전 단원 본문·대화문 PDF 모음'));
 assert.ok(!html.includes('2과 본문 빈칸'));
 assert.ok(run('B.resources.filter(r=>r.kind==="practice"&&r.grade===1&&r.number===1).every(r=>resourcesPanel().includes(h(r.url)))'));
 assert.equal(run('parseRoute.call(null,location.hash="#1/1/resources").tab'),'resources');
});
test('중3 경로는 중1로 돌아가며 학년 선택은 중1·중2뿐이다',()=>{
 const {run,nodes}=context();run('location.hash="#3/1/home";route=parseRoute();render()');
 assert.equal(run('route.grade'),1);assert.equal(run('units.length'),16);
 assert.ok(!nodes.get('#grades').innerHTML.includes('data-grade="3"'));
});

test('카드는 뜻을 확인한 뒤 평가하고 복습 날짜와 실제 활동을 기록한다',()=>{
 const {run}=context();run('route={grade:1,number:1,tab:"words"}; flashRevealed=false');
 assert.ok(!run('flashcardPanel()').includes('class="flash-meaning"'));
 run('flashRevealed=true');assert.ok(run('flashcardPanel()').includes('class="flash-meaning"'));
 run('reviewWord(true)');assert.equal(run('state.wordReview[unit().id+":0"].interval'),1);
 assert.equal(run('state.known[unit().id+":0"]'),true);assert.equal(run('activity().cards'),1);
 assert.equal(run('dueWords().length'),0);
 run('flashIndex=0; reviewWord(true)');assert.equal(run('state.wordReview[unit().id+":0"].interval'),3);
 run('flashIndex=0; reviewWord(false)');assert.equal(run('state.known[unit().id+":0"]'),false);
 assert.equal(run('dueWords().length'),1);assert.equal(run('streak()'),1);
});
test('홈 방문만으로 활동을 만들지 않으며 단원과 주간 기록을 표시한다',()=>{
 const {run,nodes}=context();run('route={grade:1,number:1,tab:"home"}; render()');
 assert.equal(run('Object.keys(state.activity).length'),0);
 assert.equal((nodes.get('#panel').innerHTML.match(/class="course-card/g)||[]).length,8);
 assert.ok(nodes.get('#coachRail').innerHTML.includes('0일 연속'));
 assert.equal(run('daysAgo(0)'),run('studyDay()'));
 run('state.activity[daysAgo(1)]={answers:2,cards:0};state.activity[daysAgo(2)]={answers:1,cards:0}');
 assert.equal(run('streak()'),2);
});
test('이전 버전 백업은 새로운 복습 필드 없이도 불러올 수 있다',async()=>{
 const {run}=context();
 await run('importData({text:async()=>JSON.stringify({app:"english-haru",publisher:B.code,version:1,state:{known:{},wrong:{},texts:{},attempts:0,correct:0}})})');
 assert.equal(run('Object.keys(state.activity).length'),0);assert.equal(run('Object.keys(state.wordReview).length'),0);
 assert.ok(run('homePanel().includes("나의 교과서 코스")'));
});

test('모든 단어에 그림과 예문 3개가 있고 등록한 본문을 우선한다',()=>{
 const {run}=context();assert.equal(run('B.units.every(u=>u.words.every(w=>window.WORD_DETAILS[w.en]?.examples.length===3&&window.WORD_DETAILS[w.en].picture))'),true);
 run('route={grade:1,number:1,tab:"words"};state.texts[unit().id]={reading:[{en:"We use "+unit().words[0].en+" in this sentence.",ko:"직접 등록한 문장"}]}');
 assert.equal(run('wordExamples(unit().words[0])[0].source'),'등록한 본문에서');assert.equal(run('wordExamples(unit().words[0]).length'),3);
 run('state.texts[unit().id].reading=[{en:"unrelated sentence",ko:""}]');assert.equal(run('wordExamples(unit().words[0])[0].source'),'자체 예문');
});
test('스와이프는 가로 이동만 처리하고 단어 순환은 학습 완료로 기록하지 않는다',()=>{
 const {run}=context();assert.equal(run('swipeDirection(-90,10)'),1);assert.equal(run('swipeDirection(90,10)'),-1);assert.equal(run('swipeDirection(40,90)'),0);
 run('flashIndex=0;moveWord(-1)');assert.equal(run('flashIndex'),5);assert.equal(run('activity().cards'),0);run('moveWord(1)');assert.equal(run('flashIndex'),0);
});
test('전체 문법 37개는 각 3문제이며 단원 문법은 6문제로 확장된다',()=>{
 const {run}=context();assert.equal(run('window.GRAMMAR_LIBRARY.length'),37);
 assert.equal(run('grammarQuestions(window.GRAMMAR_LIBRARY,"all").length'),111);
 assert.equal(run('grammarQuestions(grammarTopics(),"unit").length'),6);
 assert.equal(run('window.GRAMMAR_LIBRARY.every(g=>g.extra.length===2&&g.extra.every(r=>r.en.includes(r.blank)))'),true);
 run('grammarMode="all";startQuiz("grammar")');assert.equal(run('quiz.items.length'),111);
});
test('등록한 긴 본문 전체를 독해 화면에 표시하고 원문 링크는 16단원에 있다',()=>{
 const {run}=context();run('state.texts[unit().id]={title:"내 본문",reading:Array.from({length:80},(_,i)=>({en:"Sentence number "+i+".",ko:"문장 "+i}))}');
 assert.ok(run('readingPanel().includes("Sentence number 79.")'));assert.equal(run('Object.keys(window.ORIGINAL_LINKS).length'),16);
 assert.equal(run('B.units.every(u=>window.ORIGINAL_LINKS[u.id].every(r=>r.url.startsWith("https://")))'),true);
});
test('단어·추가 예문·전체 문법·독해 음성 파일이 모두 존재한다',()=>{
 const {run}=context();const paths=run('[...B.units.flatMap(u=>[...u.words,...u.grammar,...u.reading].map(r=>r.en)),...Object.values(window.WORD_DETAILS).flatMap(w=>w.examples.map(r=>r.en)),...window.GRAMMAR_LIBRARY.flatMap(g=>[g.en,...g.extra.map(r=>r.en)])].map(en=>window.NATIVE_AUDIO[en])');
 assert.ok(paths.every(Boolean));for(const path of paths){const bytes=readFileSync(path);assert.ok(bytes.length>1000);}
});
test('새 음성은 속도를 유지하고 정지 뒤 이전 콜백을 실행하지 않는다',async()=>{
 const {run}=context();run('class Audio {constructor(){this.src="";}play(){return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){this.src="";}load(){}};let ended=0;speak(unit().words[0].en,.65,()=>ended++);let oldEnd=nativePlayer.onended;');
 assert.equal(run('nativePlayer.playbackRate'),.65);assert.equal(run('nativePlayer.preservesPitch'),true);
 run('stopAudio();oldEnd()');assert.equal(run('ended'),0);assert.equal(run('nativePlayer.paused'),true);
 run('speakAll(unit().reading);nativePlayer.onended()');assert.equal(run('nativePlayer.src'),run('window.NATIVE_AUDIO[unit().reading[1].en]'));
});

test('문법 오답 ID는 단원 선택에 따라 같은 다른 개념으로 덮어쓰이지 않는다',()=>{
 const {run}=context();assert.notEqual(run('grammarQuestions([window.GRAMMAR_LIBRARY[0]],"grammar")[0].id'),run('grammarQuestions([window.GRAMMAR_LIBRARY[1]],"grammar")[0].id'));
 assert.equal(run('grammarQuestions([window.GRAMMAR_LIBRARY[1]],"grammar")[0].id'),run('grammarQuestions(window.GRAMMAR_LIBRARY,"grammar")[3].id'));
});

test('자료 묶음은 학습 기록과 다른 단원 자료를 유지하며 본문·대화를 등록한다',async()=>{
 const {run}=context();
 run('startQuiz();answer((quiz.items[0].answer+1)%4);state.known["kept"]=true;state.texts[units[1].id]={title:"기존 자료",raw:"Keep this sentence.",reading:splitText("Keep this sentence.")};');
 const before=run('JSON.stringify({wrong:state.wrong,known:state.known,activity:state.activity,attempts:state.attempts})');
 await run('importData({text:async()=>JSON.stringify({app:"english-haru",publisher:B.code,version:1,kind:"materials",texts:{[units[0].id]:{title:"본문",raw:"We explore the garden.\\nThe final sentence stays.",activities:{title:"대화",raw:"대화문\\nB: Where is the library?\\nG: It is next to the park."}}}})})');
 assert.equal(run('JSON.stringify({wrong:state.wrong,known:state.known,activity:state.activity,attempts:state.attempts})'),before);
 assert.equal(run('state.texts[units[1].id].title'),'기존 자료');
 assert.equal(run('state.texts[units[0].id].activities.reading.length'),2);
 assert.equal(run('state.texts[units[0].id].reading.at(-1).en'),'The final sentence stays.');
 run('route={grade:1,number:1,tab:"reading"};readingSection="activities";startQuiz("text")');
 assert.equal(run('quiz.items.length'),2);assert.ok(run('quiz.items[0].id.includes(":activities:")'));
 assert.ok(run('speakingPanel().includes("Where is the library?")'));
});

test('자료의 출판사 또는 마지막 단원이 잘못되면 일부만 등록하지 않는다',async()=>{
 const {run}=context();const before=run('JSON.stringify(state)');
 await run('importData({text:async()=>JSON.stringify({app:"english-haru",publisher:B.code,version:1,kind:"materials",texts:{[units[0].id]:{title:"자료",raw:"Some text."},invalid:{title:"자료",raw:"Wrong unit."}}})})');
 assert.equal(run('JSON.stringify(state)'),before);
 await run('importData({text:async()=>JSON.stringify({app:"english-haru",publisher:"other",version:1,kind:"materials",texts:{}})})');
 assert.equal(run('JSON.stringify(state)'),before);
});

test('대화 선택 뒤 본문 편집·백업 복원은 대화를 보존한다',async()=>{
 const {run,nodes}=context();
 run('state.texts[unit().id]={title:"본문",raw:"Original paragraph.",reading:splitText("Original paragraph."),activities:{title:"대화",raw:"B: Good morning.",reading:splitText("B: Good morning.")}};readingSection="activities";route.tab="text";renderPanel()');
 run('$("#textTitle").value="수정 본문";$("#textContent").value="Edited paragraph.";saveText()');
 assert.equal(run('personalText().reading[0].en'),'Edited paragraph.');
 assert.equal(run('state.texts[unit().id].activities.raw'),'B: Good morning.');
 await run('importData({text:async()=>JSON.stringify({app:"english-haru",publisher:B.code,version:1,state})})');
 assert.equal(run('state.texts[unit().id].activities.reading[0].en'),'B: Good morning.');
 run('route.tab="reading";readingSection="body"');
 assert.ok(run('expandedReadingPanel().includes("Edited paragraph.")'));assert.ok(!run('expandedReadingPanel().includes("B: Good morning.")'));
});

test('개인 자료 등록 없이 모든 단원의 본문·활동 전체를 읽고 문제를 푼다',()=>{
 const {run,stored}=context();
 assert.equal(run('Object.keys(state.texts).length'),0);assert.equal(stored.size,0);
 assert.equal(run(`units.every(u=>{
  route={grade:u.grade,number:u.number,tab:'reading'};readingSection='body';
  const body=B.texts[u.id];if(!body||body.reading.length<15||!expandedReadingPanel().includes(h(body.reading.at(-1).en)))return false;
  readingSection='activities';return personalText()===body.activities&&expandedReadingPanel().includes(h(body.activities.raw.split('\\n').at(-1)));
 })`),true);
 run('route={grade:1,number:1,tab:"reading"};readingSection="body";startQuiz("text")');
 assert.ok(run('quiz.items.length')>15);assert.equal(run('quiz.items[0].label'),'교과서 본문 빈칸');
 assert.ok(run('questions(unit()).filter(q=>q.id.includes(":book:")).length')>15);
 assert.equal(run('Object.keys(state.texts).length'),0);
});

test('기본 본문은 등록 안내나 PDF 대신 전체 글과 원문 예문을 표시한다',()=>{
 const {run}=context();run('route={grade:1,number:1,tab:"reading"}');
 const panel=run('expandedReadingPanel()');
 assert.ok(panel.includes('교과서 본문·대화 자료'));assert.ok(!panel.includes('교과서 원문으로 연결'));
 assert.ok(!panel.includes('내 본문 등록'));assert.ok(!panel.includes('<iframe'));
 assert.equal(run('units.some(u=>{route={grade:u.grade,number:u.number,tab:"words"};return u.words.some(w=>wordExamples(w)[0].source==="교과서 본문에서")})'),true);
});


test('첫 단원 본문은 해석 보기와 전체 글 모두 한국어 해석을 제공한다',()=>{
 const {run}=context();
 assert.equal(run('B.texts[units[0].id].reading.every(r=>Boolean(translationFor(r)))'),true);
 run('route={grade:1,number:1,tab:"reading"};readingSection="body";readingLayout="sentences";translations=true');
 assert.ok(run('expandedReadingPanel().includes("class=\\"ko\\"")'));
 run('readingLayout="passage"');
 assert.ok(run('expandedReadingPanel().includes("passage-translation")'));
 run('translations=false');
 assert.ok(!run('expandedReadingPanel().includes("passage-translation")'));
});
test('인물 호칭 뒤에서 문장을 잘못 나누지 않는다',()=>{
 const {run}=context();
 assert.equal(run('splitText("Mrs. Schmidt is kind. I know her.").length'),2);
 assert.equal(run('splitText("Mrs. Schmidt is kind.")[0].en'),'Mrs. Schmidt is kind.');
});

test('전체 16단원 본문·활동 자료는 미리 저장된 한국어 해석을 표시한다',()=>{
 const {run}=context();
 assert.equal(run('units.every(u=>{const t=B.texts[u.id];return !!t&&[t.reading,t.activities.reading].every(lines=>lines.filter(r=>/[A-Za-z]/.test(r.en)&&!/[가-힣]/.test(r.en)).every(r=>!!translationFor(r)))})'),true);
 const app=readFileSync('app.js','utf8');
 assert.ok(!app.includes('mymemory.translated.net'));
 assert.ok(!app.includes('translationQueue'));
});

test('교과서 원문에 MP3가 없으면 기기 영어 음성으로 읽고 정지한다',()=>{
 const {run}=context();
 run(`let played=null;let cancels=0;
   window.SpeechSynthesisUtterance=function(text){this.text=text;};
   window.speechSynthesis={getVoices:()=>[{name:'기기 영어',lang:'en-US',localService:true}],cancel(){cancels++;},speak(u){played=u;}};
 `);
 const sentence=run('B.texts[units[0].id].reading[0].en');
 assert.equal(run('window.NATIVE_AUDIO[B.texts[units[0].id].reading[0].en]'),undefined);
 run('speak(B.texts[units[0].id].reading[0].en,.85)');
 assert.equal(run('played.text'),sentence);
 assert.equal(run('played.lang'),'en-US');
 assert.equal(run('played.rate'),.85);
 assert.equal(run('played.voice.name'),'기기 영어');
 run('let finished=0;speak(B.texts[units[0].id].reading[0].en,1,()=>finished++);let past=played.onend;stopAudio();past();');
 assert.equal(run('finished'),0);
 run('speakAll(B.texts[units[0].id].reading.slice(0,2));let first=played;first.onend();');
 assert.equal(run('played.text'),run('B.texts[units[0].id].reading[1].en'));
});
test('단어 뜻을 뒤집기 전에도 예문 세 개를 같은 학습 화면에 표시한다',()=>{
 const {run}=context();
 run('route={grade:1,number:1,tab:"words"};flashRevealed=false;');
 const panel=run('flashcardPanel()');
 assert.ok(panel.includes('word-study-layout'));
 assert.equal((panel.match(/class="word-example"/g)||[]).length,3);
 assert.ok(panel.includes('문장 속에서 기억해요'));
});
