(function (root) {
  'use strict';
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kinds = {official:'ETS', grammar:'Grammar', reason:'Reasoning', expression:'Style'};
  function renderParagraph(text, notes, plain = false) {
    if (plain) return esc(text);
    let result = '', cursor = 0;
    for (const n of [...notes].sort((a,b) => a.start-b.start)) {
      if (n.start < cursor || text.slice(n.start,n.end) !== n.quote) throw new Error('Annotation does not match original text');
      result += esc(text.slice(cursor,n.start));
      result += `<span role="button" tabindex="0" class="anchor ${n.kind}" id="anchor-${esc(n.id)}" data-note="${esc(n.id)}" aria-controls="card-${esc(n.id)}" aria-label="${esc(n.quote + ' — ' + kinds[n.kind]+ ': '+n.title)}">${esc(n.quote)}</span>`;
      cursor = n.end;
    }
    return result + esc(text.slice(cursor));
  }
  function matching(essays, topic, score, query) {
    const q=query.trim().toLowerCase();
    return essays.filter(e => (!topic || e.topic===topic) && (!score || String(e.score)===String(score)) && (!q || [e.title,e.prompt,e.topicLabel].join(' ').toLowerCase().includes(q)));
  }
  if (typeof module !== 'undefined' && module.exports) module.exports={esc,renderParagraph,matching};
  if (!root.document) return;
  const data = root.GRE_WRITING_DATA || [];
  const app = document.getElementById('writing-app');
  let topic='', score='', query='', plain=false, kind='', selected=null, current=null;
  const pdf = '<a class="button secondary" href="writing-assets/collection.pdf" download="GRE-Writing.pdf">Download PDF</a>';
  function cards() {
    const list=matching(data,topic,score,query);
    document.getElementById('essay-grid').innerHTML = list.length ? list.map(e=>`<a class="essay-card" href="#${e.id}"><h2>${esc(e.title)}</h2><span class="score">Score ${e.score}</span></a>`).join('') : '<p class="empty">No matching essays.</p>';
  }
  function library() {
    current=null;
    document.title='Writing | Mock Test';
    const topics=[...new Map(data.map(e=>[e.topic,e.topicLabel])).entries()];
    app.innerHTML=`<div class="collection"><header class="collection-header"><h1>Official Essays</h1>${pdf}</header><section class="filters" aria-label="Filter essays"><div class="topic-tabs"><button data-topic="" class="${!topic?'active':''}" aria-pressed="${!topic}">All topics</button>${topics.map(([key,label])=>`<button data-topic="${key}" class="${topic===key?'active':''}" aria-pressed="${topic===key}">${esc(label)}</button>`).join('')}</div><div class="filter-row"><label class="search"><input type="search" id="essay-search" placeholder="Search essays" aria-label="Search essays" value="${esc(query)}"></label><select id="score-filter" aria-label="Score"><option value="">All scores</option>${[4,5,6].map(s=>`<option ${String(s)===score?'selected':''} value="${s}">Score ${s}</option>`).join('')}</select></div></section><div id="essay-grid" class="essay-grid"></div></div>`;
    cards();
    document.getElementById('essay-search').addEventListener('input',e=>{query=e.target.value; cards();});
    document.getElementById('score-filter').addEventListener('change',e=>{score=e.target.value;cards();});
    window.scrollTo(0,0);
  }
  function notesPanel() {
    const notes = current.annotations.filter(n=>!kind||n.kind===kind);
    document.getElementById('notes-list').innerHTML=notes.map(n=>`<article class="note-card ${n.kind} ${selected===n.id?'selected':''}" id="card-${n.id}"><button class="note-heading" data-locate="${n.id}"><span class="note-type">${kinds[n.kind]}</span><strong>${esc(n.title)}</strong><span class="locate-icon" aria-hidden="true">↖</span></button><blockquote>${esc(n.quote)}</blockquote><p ${n.kind==='official'?'lang="en" class="official-note"':''}>${esc(n.body)}</p>${n.kind==='official'?'<a class="full-commentary-link" href="#official" data-jump="official">Full ETS commentary →</a>':''}${n.revision?`<div class="revision"><span>Revision</span><p lang="en">${esc(n.revision)}</p></div>`:''}</article>`).join('') || '<p class="empty">No notes in this category.</p>';
    document.querySelectorAll('[data-kind]').forEach(b=>{b.classList.toggle('active',b.dataset.kind===kind);b.setAttribute('aria-pressed',String(b.dataset.kind===kind));});
  }
  function reader(e) {
    current=e; selected=null; kind='';
    document.title=`${e.title} · Score ${e.score} | Writing`;
    app.innerHTML=`<header class="reader-toolbar"><a class="back" href="#">← Essays</a><div class="reader-switch"><label class="sr-only" for="essay-select">Choose an essay</label><select id="essay-select">${data.map(x=>`<option value="${x.id}" ${e.id===x.id?'selected':''}>${esc(x.title)} · Score ${x.score}</option>`).join('')}</select></div><div class="toolbar-actions"><a href="#official" data-jump="official">ETS Commentary</a><button id="reading-toggle" aria-pressed="${plain}">${plain?'Show notes':'Read only'}</button></div></header><div class="reader-layout ${plain?'plain':''}"><article class="document"><header class="document-heading"><div class="document-meta"><span class="score">Score ${e.score}</span></div><h1>${esc(e.title)}</h1></header><section class="prompt-section"><h2>Prompt</h2><p class="prompt" lang="en">${esc(e.prompt)}</p><p class="instructions" lang="en">${esc(e.instructions)}</p></section><section class="response-section"><h2>Response</h2><div class="response" lang="en">${e.paragraphs.map((p,i)=>`<p id="paragraph-${i}">${renderParagraph(p,e.annotations.filter(n=>n.paragraph===i),plain)}</p>`).join('')}</div></section><section class="official-section" id="official"><div class="section-heading"><h2>ETS Commentary</h2></div><div class="official-text" lang="en">${e.officialParagraphs.map(p=>`<p>${esc(p)}</p>`).join('')}</div></section><section class="brief-section" id="brief"><h2>Study Notes</h2><p>${esc(e.brief)}</p></section><nav class="essay-pager" aria-label="Other essays">${e.number>1?`<a href="#essay-${e.number-1}">← Previous</a>`:'<span></span>'}${e.number<data.length?`<a href="#essay-${e.number+1}">Next →</a>`:'<a href="#">All essays →</a>'}</nav></article><aside class="annotation-rail" aria-label="Notes"><div class="rail-heading"><div><h2>Notes</h2></div><div class="note-filters">${[['','All'],...Object.entries(kinds)].map(([key,label])=>`<button data-kind="${key}" aria-pressed="${!key}" class="${!key?'active':''}">${label}</button>`).join('')}</div></div><div id="notes-list"></div></aside></div>`;
    notesPanel();
    document.getElementById('essay-select').addEventListener('change',ev=>{location.hash=ev.target.value;});
    window.scrollTo(0,0);
  }
  function activate(id, locate) {
    const n=current.annotations.find(n=>n.id===id); if(!n)return;
    if (kind && kind!==n.kind) kind='';
    selected=id; notesPanel();
    document.querySelectorAll('.anchor').forEach(a=>a.classList.toggle('selected',a.dataset.note===id));
    const anchor=document.getElementById(`anchor-${id}`), card=document.getElementById(`card-${id}`), list=document.getElementById('notes-list');
    if(locate) {
      anchor.scrollIntoView({behavior:'smooth',block:'center'});
      anchor.focus({preventScroll:true});
    } else if (window.matchMedia('(max-width: 800px)').matches) {
      card.scrollIntoView({behavior:'smooth',block:'center'});
      card.querySelector('button').focus({preventScroll:true});
    } else {
      list.scrollTo({top:list.scrollTop+card.getBoundingClientRect().top-list.getBoundingClientRect().top-12,behavior:'smooth'});
    }
  }
  app.addEventListener('click',ev=>{
    const button=ev.target.closest('button,a,[data-note]'); if(!button)return;
    if(button.hasAttribute('data-topic')) {topic=button.dataset.topic; library();}
    if(button.hasAttribute('data-kind')) {kind=button.dataset.kind;notesPanel();}
    if(button.dataset.note)activate(button.dataset.note,false);
    if(button.dataset.locate)activate(button.dataset.locate,true);
    if(button.dataset.jump){ev.preventDefault();document.getElementById(button.dataset.jump).scrollIntoView({behavior:'smooth',block:'start'});}
    if(button.id==='reading-toggle') {
      const y=window.scrollY;plain=!plain;reader(current);window.scrollTo(0,y);
    }
  });
  app.addEventListener('keydown',ev=>{
    const anchor=ev.target.closest('[data-note]');
    if(anchor && (ev.key==='Enter' || ev.key===' ')){ev.preventDefault();activate(anchor.dataset.note,false);}
  });
  function route(){const essay=data.find(e=>`#${e.id}`===location.hash);essay?reader(essay):library();}
  window.addEventListener('hashchange',route);
  route();
})(typeof window==='undefined'?globalThis:window);
