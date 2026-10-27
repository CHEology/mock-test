const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../core.js');
function setup(local, disk) {
  const events={}, requests=[], timers=new Map();let next=0;
  const storage=new Map(local ? [['mock-test-v1',JSON.stringify(local)]] : []);
  const ctx=vm.createContext({
    window:{MockTestCore:C,MOCK_TEST_DATA:[],addEventListener:(n,fn)=>events[n]=fn},
    document:{querySelector:()=>({innerHTML:'',classList:{add(){},remove(){}}}),querySelectorAll:()=>[],addEventListener(){}},
    location:{hash:'',pathname:'/',search:''},history:{replaceState(){}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    setInterval(){},setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id),console,
    fetch:async(url,options)=>{
      requests.push({url,options});
      if(ctx.offline)throw Error('offline');
      if(options?.method==='PUT'){
        disk=C.mergeState(disk,JSON.parse(options.body));
        return {ok:true,json:async()=>({state:structuredClone(disk)})};
      }
      return {ok:true,json:async()=>structuredClone(disk)};
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../app.js'),'utf8').replace(/init\(\);\s*$/,''),ctx);
  ctx.syncLibrary=()=>{};ctx.renderHome=()=>{};ctx.acceptState=state=>vm.runInContext(`db=C.mergeState(db,${JSON.stringify(state)})`,ctx);
  return {ctx,events,requests,timers,storage,read:s=>vm.runInContext(s,ctx),disk:()=>disk};
}
const state=(updated,answer)=>({version:1,updated,library:[],deleted:{},attempts:[{id:'saved',updated,answers:{q:answer}}]});
test('startup schedules disk synchronization when browser answers are newer',async()=>{
  const x=setup(state(20,'B'),state(10,'A'));await x.ctx.init();
  assert.equal(x.read('dirty'),true);
  await x.ctx.flushDisk();assert.equal(x.disk().attempts[0].answers.q,'B');
});
test('initial connection failure recovers on refresh and persists local answers',async()=>{
  const x=setup(state(20,'B'),state(10,'A'));x.ctx.offline=true;await x.ctx.init();
  assert.equal(x.read('diskReady'),false);x.ctx.offline=false;
  await x.ctx.refreshState();assert.equal(x.read('diskReady'),true);
  await x.ctx.flushDisk();assert.equal(x.disk().attempts[0].answers.q,'B');
});
test('startup caches newer disk answers in the browser without changing the attempt',async()=>{
  const x=setup(state(10,'A'),state(20,'B'));await x.ctx.init();
  const saved=JSON.parse(x.storage.get('mock-test-v1'));
  assert.equal(saved.attempts[0].answers.q,'B');assert.equal(saved.attempts[0].updated,20);
});
test('study links work when the page is already open and do not interrupt an exam',()=>{
  const x=setup(null,state(10,'A'));let writing=0,vocab=0,home=0;
  x.ctx.renderWriting=()=>writing++;x.ctx.renderVocabulary=()=>vocab++;x.ctx.renderHome=()=>home++;
  assert.equal(typeof x.events.hashchange,'function');
  x.ctx.location.hash='#writing';x.events.hashchange();assert.equal(writing,1);
  x.ctx.location.hash='#vocabulary';x.events.hashchange();assert.equal(vocab,1);
  x.read("screen='writing'");x.ctx.location.hash='';x.events.hashchange();assert.equal(home,1);
  x.read("screen='test'");x.ctx.location.hash='#writing';x.events.hashchange();assert.equal(writing,1);
});
