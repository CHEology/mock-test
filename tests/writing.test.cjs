const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {renderParagraph, matching} = require('../writing.js');
test('annotations retain original text and escape markup', () => {
  const text='A < B & "C". More words.';
  const n={id:'one',kind:'grammar',title:'Test',start:2,end:11,quote:text.slice(2,11)};
  const html=renderParagraph(text,[n]);
  const restored=html.replace(/<[^>]*>/g,'').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  assert.equal(restored,text);
  assert.throws(()=>renderParagraph(text,[{...n,quote:'wrong'}]));
  assert.throws(()=>renderParagraph(text,[n,n]));
});
test('filters combine topic, score and search',()=>{
  const rows=[{topic:'tech',score:4,title:'Technology',prompt:'thinking',focus:'Mechanism',topicLabel:'科技'},{topic:'coop',score:5,title:'Cooperation',prompt:'leaders',focus:'Conditions',topicLabel:'合作'}];
  assert.deepEqual(matching(rows,'tech','4','THINK'),[rows[0]]);
  assert.equal(matching(rows,'tech','5','').length,0);
  assert.equal(matching(rows,'','','合作').length,1);
});
const bank=path.join(__dirname,'../writing-data.js');
test('local official bank has all ten responses and exact, nonoverlapping anchors',{skip:!fs.existsSync(bank)},()=>{
  const context={window:{}};vm.runInNewContext(fs.readFileSync(bank,'utf8'),context);
  const essays=context.window.GRE_WRITING_DATA;
  assert.equal(essays.length,10);
  for(const e of essays){
    assert.equal(e.paragraphs.join(' ').replace(/\s+/g,' ').trim(),e.body);
    assert.equal(e.officialParagraphs.join(' ').replace(/\s+/g,' ').trim(),e.official);
    assert.ok(e.official.length>900);
    for(let p=0;p<e.paragraphs.length;p++) renderParagraph(e.paragraphs[p],e.annotations.filter(n=>n.paragraph===p));
  }
});
