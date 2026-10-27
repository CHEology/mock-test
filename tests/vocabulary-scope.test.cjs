const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../vocabulary.html'),'utf8');
const data=id=>JSON.parse(html.match(new RegExp(`<script id="${id}" type="application/json">(.*?)</script>`,'s'))[1]);
const words=data('vocab-data').map(({audio,...word})=>word), bank=data('quiz-data');
const code=html.match(/<script>\s*('use strict';.*?)<\/script>/s)[1].replace(/initVocabulary\(\);\s*$/,'');
function setup(storage=new Map()){
 const nodes=new Map();
 const get=id=>{
  if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',style:{setProperty(){}},classList:{toggle(){},remove(){},add(){}},querySelectorAll:()=>[],querySelector:()=>null,showModal(){this.open=true;},close(){this.open=false;},setAttribute(){},addEventListener(name,fn){this["on"+name]=fn;}});
  return nodes.get(id);
 };
 get('vocab-data').textContent=JSON.stringify(words);get('quiz-data').textContent=JSON.stringify(bank);
 const ctx=vm.createContext({document:{getElementById:get,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}},window:{addEventListener(){},scrollTo(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},console,setTimeout(){},clearTimeout(){}});
 vm.runInContext(code,ctx);
 const run=s=>vm.runInContext(s,ctx),read=s=>JSON.parse(JSON.stringify(run(s)));
 return {ctx,run,read,get,storage};
}
function completeRound(t,n=20){t.run(`reviewSize=${n};startReview();`);const expected=t.read('review.words');for(let i=0;i<n;i++)t.ctx.gradeReview('good');return expected;}
test('default pool accumulates all visited words across study rounds and ignores library filters',()=>{
 const t=setup();t.ctx.recordStudyWord('ambivalent','library');t.ctx.beginStudy('review');t.ctx.recordStudyWord('inimical','review');
 t.run("store.prefs.tier='extra';store.prefs.status='new';startQuiz();");
 assert.equal(t.read('quizScope'),'learned');assert.deepEqual(t.read('quiz.questions.map(q=>q.word).sort()'),['ambivalent','inimical']);
});
test('review-to-quiz uses cumulative history, and samples the requested number without duplicates',()=>{
 const t=setup();t.ctx.recordVisit('censor');const round=completeRound(t,30);t.get('reviewToQuiz').onclick();
 assert.equal(t.read('quizScope'),'learned');assert.equal(t.read('quizWords().length'),31);
 t.run("quizSize=10;startQuiz();");const tested=t.read('quiz.questions.map(q=>q.word)');assert.equal(tested.length,10);assert.equal(new Set(tested).size,10);assert.ok(tested.every(w=>[...round,'censor'].includes(w)));
});
test('explicit recent-only scope still limits the quiz to that round',()=>{
 const t=setup();t.ctx.recordVisit('censor');const round=completeRound(t,10);t.run("quizScope='recent';startQuiz();");assert.deepEqual(t.read('quiz.questions.map(q=>q.word).sort()'),round.sort());
});
test('only displayed review cards count as visited, not upcoming cards',()=>{
 const t=setup();t.ctx.startReview();const first=t.read('review.words[0]');assert.deepEqual(t.read('quizWords()'),[first]);
 t.get('reveal').onclick();t.ctx.gradeReview('mid');const second=t.read('review.words[1]');t.ctx.switchView('quiz');t.ctx.startQuiz();
 assert.deepEqual(t.read('quiz.questions.map(q=>q.word).sort()'),[first,second].sort());assert.ok(t.read(`state('${first}').lastReviewed`)>0);
});
test('opening a library card counts, but the other words rendered in its sidebar do not',()=>{
 const t=setup();t.ctx.renderLibrary();assert.deepEqual(t.read('quizWords()'),['ambivalent']);assert.equal(t.read("state('ambivalent').status"),'new');
 t.ctx.selectWord('inimical');assert.deepEqual(t.read('quizWords().sort()'),['ambivalent','inimical']);
 const fresh=setup(t.storage);assert.deepEqual(fresh.read('quizWords().sort()'),['ambivalent','inimical']);
});
test('opening a related word records it and progress-table inspection does not mark every row',()=>{
 const t=setup();t.ctx.showProgress();assert.equal(t.read('quizWords().length'),0);t.ctx.peek('inimical');assert.deepEqual(t.read('quizWords()'),['inimical']);
 assert.match(t.get('main').innerHTML,/<strong>1<\/strong>看过/);
});
test('missing antonym questions never pull in an unseen word',()=>{
 const t=setup();t.ctx.recordVisit('censor');t.ctx.recordVisit('ambivalent');t.run("quizMode='ant';renderQuiz();");
 assert.match(t.get('main').innerHTML,/1 个词暂无反义题/);t.ctx.startQuiz();assert.deepEqual(t.read('quiz.questions.map(q=>q.word)'),['ambivalent']);
});
test('quiz answers record last-tested time without claiming a review or changing eligibility',()=>{
 const t=setup();t.ctx.recordVisit('inimical');t.ctx.startQuiz();t.run('answerQuestion(quiz.questions[0].answer);');
 assert.ok(t.read("state('inimical').lastTested")>0);assert.equal(t.read("state('inimical').lastReviewed"),0);assert.deepEqual(t.read('quizWords()'),['inimical']);
});
test('legacy progress joins the default pool, but a favorite alone does not',()=>{
 const t=setup();t.run("store=sanitize({words:{ambivalent:{status:'mastered',seen:100},inimical:{status:'new',seen:50},censor:{status:'new',star:true}}});startQuiz();");
 assert.deepEqual(t.read('quiz.questions.map(q=>q.word).sort()'),['ambivalent','inimical']);assert.equal(t.read("state('ambivalent').lastReviewed"),0);
});
test('old local study-list migration preserves known visits without inventing dates',()=>{
 const storage=new Map([['mock-test-vocabulary-v1.study',JSON.stringify({kind:'review',words:['inimical','unknown','inimical']})]]);
 const t=setup(storage);t.ctx.migrateStudyVisits();assert.deepEqual(t.read('quizWords()'),['inimical']);assert.equal(t.read("state('inimical').lastVisited"),0);
});
test('empty pool stays empty instead of falling back to the full bank',()=>{
 const t=setup();t.ctx.renderQuiz();t.ctx.startQuiz();assert.equal(t.read('quiz'),null);assert.match(t.get('main').innerHTML,/id="startQuiz" disabled/);
});
test('progress table filters, search and cumulative counts agree with quiz eligibility',()=>{
 const t=setup();t.ctx.recordVisit('inimical');t.run("store.words.ambivalent={status:'mastered',seen:100,wrong:0};showProgress();");
 assert.equal(t.read('progressRows().length'),400);assert.match(t.get('main').innerHTML,/<strong>2<\/strong>看过/);
 t.run("progressFilter='visited';");assert.deepEqual(t.read('progressRows().map(w=>w.word).sort()'),t.read('quizWords().sort()'));
 t.run("progressFilter='unvisited';");assert.equal(t.read('progressRows().length'),398);
 t.run("progressFilter='all';progressQuery='inim';");assert.deepEqual(t.read('progressRows().map(w=>w.word)'),['inimical']);
});
test('remote and legacy-tab updates cannot erase cumulative visits or activity dates',()=>{
 const t=setup();const merged=t.read("mergeWordRecords({updated:10,visited:true,lastVisited:10,lastReviewed:9},{updated:20,visited:false,status:'new',lastTested:15})");
 assert.equal(merged.visited,true);assert.equal(merged.lastVisited,10);assert.equal(merged.lastReviewed,9);assert.equal(merged.lastTested,15);assert.equal(merged.status,'new');
});
test('optional memory aids contain sourced origins only, including laudable',()=>{
 assert.equal(words.length,400);
 const t=setup();
 for(const w of words){
  assert.ok(!w.memory || (!('hook' in w.memory) && w.memory.origin.trim() && /^https:\/\//.test(w.memory.source)),w.word);
  const card=t.ctx.detail(w);
  assert.equal(card.includes('class="memory-aid"'),!!w.memory,w.word);
  assert.doesNotMatch(card,/记忆联想/);
 }
 for(const family of [['lucid','elucidate'],['tacit','reticent','taciturn'],['onerous','exonerate']]){
  for(const word of family)assert.ok(words.find(w=>w.word===word).memory,word);
 }
 const laudable=words.find(w=>w.word==='laudable');
 assert.match(laudable.memory.origin,/laud（赞扬）.*-able.*laudare/);
 assert.match(t.ctx.detail(laudable),/构词与词源/);
 assert.equal(t.ctx.memoryAid({}), '');
 assert.equal(t.ctx.memoryAid({memory:{hook:'an unsupported association'}}), '');
 assert.equal(words.find(w=>w.word==='flout').memory,null);
});
test('review hints are revealed only with the definition',()=>{
 const t=setup();t.ctx.startReview();const word=words.find(w=>w.word===t.read('review.words[0]'));
 assert.ok(!t.get('main').innerHTML.includes(word.memory.origin));assert.doesNotMatch(t.get('main').innerHTML,/memory-aid/);
 t.get('reveal').onclick();assert.ok(t.get('main').innerHTML.includes(word.memory.origin));
});
test('all quiz modes withhold memory hints until the answer is submitted',()=>{
 for(const mode of ['meaning','syn','ant']){
  const t=setup();t.ctx.recordVisit('intransigent');t.run(`quizMode='${mode}';startQuiz();`);
  const word=words.find(w=>w.word==='intransigent');const before=t.get('main').innerHTML;
  assert.ok(!before.includes(word.memory.origin));assert.doesNotMatch(before,/memory-aid/);
  if(mode==='meaning')assert.doesNotMatch(before,/class="example"/);
  t.run('answerQuestion(quiz.questions[0].answer)');assert.ok(t.get('main').innerHTML.includes(word.memory.origin));
 }
});
