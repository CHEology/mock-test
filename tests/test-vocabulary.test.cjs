const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../test-vocabulary.js');
const C = require('../core.js');
test('review includes every verbal source and all choices, even when answered correctly',()=>{
  const q={id:'v1',number:1,type:'single',text:'Passage',labels:['lucid','evasive'],key:'A'};
  const image={id:'v2',number:2,type:'single',image:'assets/page.webp',key:'B'};
  const reading={id:'v3',number:3,type:'sentence',sentences:['Sentence one.','Sentence two.'],prompt:'Choose',key:'A'};
  const result=V.collect({sections:[{label:'Language 1',questions:[q,image]}, {label:'Quant 1',calculator:true,questions:[{...q,id:'math'}]}, {label:'Reading',questions:[reading]}]}, {answers:{v1:'A',v2:'A'}},C.grade);
  assert.deepEqual(result.map(q=>q.id),['v1','v2','v3']);
  assert.equal(result[0].correct,true);
  assert.deepEqual(result[0].labels,['lucid','evasive']);
  assert.equal(result[1].image,'assets/page.webp');
  assert.deepEqual(result[2].sentences,reading.sentences);
  assert.equal(result[2].si,2);
  assert.equal(result[2].answer,null);
});
test('math-only and writing-only tests do not offer a vocabulary job',()=>{
  assert.equal(V.slot({sections:[]}), '');
  assert.equal(V.slot({sections:[{label:'Math',questions:[]}]}),'');
  assert.match(V.slot({sections:[{label:'Verbal',questions:[]}]}),/test-vocabulary/);
});
