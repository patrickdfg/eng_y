// 학습 자료와 채점·개인 본문 분리·오답 복습 동작을 검증합니다.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
function context() {
  const nodes=new Map();
  const node=()=>({innerHTML:'',textContent:'',hidden:true,disabled:false,classList:{toggle(){},remove(){},add(){}},showModal(){},close(){},replaceChildren(){},click(){},setAttribute(){}});
  const document={body:node(),querySelector:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);},addEventListener(){},createElement:node};
  const stored=new Map();
  const c=vm.createContext({window:{addEventListener(){}},document,location:{hash:''},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},history:{pushState(){}},console,Intl,URL,Blob,Date,setTimeout(){},clearTimeout(){},confirm:()=>true,navigator:{}});
  vm.runInContext(readFileSync('content.js','utf8'),c);
  vm.runInContext(readFileSync('app.js','utf8'),c);
  return {run:s=>vm.runInContext(s,c),nodes,stored};
}
test('중1·중2의 16단원과 수록 내용이 일치한다',()=>{
 const {run}=context();
 assert.equal(run('B.units.length'),16);
 assert.equal(run('new Set(B.units.map(u=>u.id)).size'),16);
 assert.equal(run('B.units.reduce((n,u)=>n+u.words.length,0)'),96);
 assert.equal(run('B.units.reduce((n,u)=>n+questions(u).length,0)'),192);
 assert.equal(run('B.units.every(u=>u.reading.length===4&&u.grammar.length===2&&u.words.length===6)'),true);
 assert.equal(run('B.units.every(u=>questions(u).every(q=>q.type!=="choice"||(q.options.length===4&&new Set(q.options).size===4&&q.answer>=0&&q.answer<4)))'),true);
});
test('어휘·문법·빈칸 문제 ID가 겹치지 않는다',()=>{
 const {run}=context();assert.equal(run('new Set(B.units.flatMap(questions).map(q=>q.id)).size'),192);
 assert.equal(run('B.units.flatMap(questions).filter(q=>q.type==="blank").every(q=>q.prompt.includes("_____")&&q.answer.length>0)'),true);
});
test('오답을 저장하고 중복 클릭은 중복 채점하지 않는다',()=>{
 const {run,stored}=context();
 run('startQuiz(); answer((quiz.items[0].answer+1)%4); answer(quiz.items[0].answer)');
 assert.equal(run('state.attempts'),1);assert.equal(run('state.correct'),0);assert.equal(run('Object.keys(state.wrong).length'),1);assert.equal(stored.size,1);
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
test('중3은 구판 없이 개인 본문으로 문제를 만든다',()=>{
 const {run}=context();run('route={grade:3,number:1,tab:"text"}; state.texts[unit().id]={title:"내 자료",updated:1,reading:[{en:"We explore the universe.",ko:"우주는 넓습니다."}]}; startQuiz("text")');
 assert.equal(run('unit().pending'),true);assert.equal(run('quiz.items.length'),1);assert.equal(run('quiz.items[0].label'),'내 본문 빈칸');
});
test('잘못된 주소는 유효한 학년·단원·메뉴로 돌아간다',()=>{
 const {run}=context();run('location.hash="#9/99/unknown"');assert.equal(run('JSON.stringify(parseRoute())'),JSON.stringify({grade:1,number:1,tab:'words'}));
});
