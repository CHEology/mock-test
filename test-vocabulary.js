/* Test vocabulary uses the same local Codex queue and word-progress store. */
const TestVocabulary = (() => {
  let generation = 0, records = [], progress = {words:{}}, filter = "learning", error = "", sending = false;
  const pending = r => r && ["queued", "running"].includes(r.status);
  const verbal = s => !s.calculator && !/\b(math|quant|arithmetic|geometry|algebra)\b/i.test(`${s.label} ${s.title || ""}`);
  function collect(t, attempt, grade) {
    return t.sections.flatMap((s, si) => verbal(s) ? s.questions.map((q, qi) => {
      const item = {id:q.id, section:s.title || s.label, number:q.number,
        answer:attempt.answers[q.id] ?? null, correct:grade(q, attempt.answers[q.id]), si, qi};
      for (const k of ["text","prompt","sentences","labels","options","type","key","disputed","image"])
        if (q[k] !== undefined) item[k] = q[k];
      return item;
    }) : []);
  }
  async function api(path, value, method = "POST") {
    const response = await fetch(path, value === undefined ? {} : {
      method, headers:{"Content-Type":"application/json"}, body:JSON.stringify(value)
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw Error(body.error || "Could not load vocabulary. Please retry.");
    }
    return response.json();
  }
  const slot = t => t.sections.some(verbal) ? '<section id="test-vocabulary" class="test-vocabulary" aria-label="Test vocabulary"></section>' : "";
  const current = () => records.find(r => r.attempt === active?.id);
  function paint() {
    const el = document.getElementById("test-vocabulary");
    if (!el || screen !== "results") return;
    const record = current(), busy = sending || pending(record), words = record?.words || [];
    const signature = JSON.stringify([record, progress.words, filter, error, sending, settings.aiEnabled]);
    if (el.dataset.signature === signature) return;
    el.dataset.signature = signature;
    const shown = words.filter(w => filter === "all" || (progress.words[w.lemma || w.word]?.status === "mastered") === (filter === "known"));
    el.innerHTML = `<div class="row spread"><h2>Vocabulary</h2><div class="row"><button data-vocab="saved">Saved reviews</button>${busy ? `<button data-vocab="stop" ${!record ? "disabled" : ""}>Stop</button>` : settings.aiEnabled ? `<button data-vocab="build" ${sending ? "disabled" : ""}>${record?.status === "error" ? "Retry" : record ? "Refresh with Codex" : "Build with Codex"}</button>` : ""}</div></div>
      <div role="status">${busy ? `<p>${record?.status === "queued" ? "Queued…" : "Reading Verbal materials…"}</p>` : ""}${error || record?.error ? `<p class="vocab-error">${esc(error || record.error)}</p>` : ""}</div>
      ${words.length ? `<div class="row vocab-filters" aria-label="Vocabulary filter">${[["learning","Learning"],["known","Known"],["all","All"]].map(([key,label]) => `<button data-vocab-filter="${key}" aria-pressed="${filter === key}">${label}</button>`).join("")}</div><div class="vocab-words">${shown.map(w => {
        const source = collect(test(), active, C.grade).find(q => q.id === w.question);
        return `<article class="vocab-word"><div class="row spread"><h3>${esc(w.word)}</h3><button data-vocab-known="${esc(w.lemma || w.word)}" aria-pressed="${progress.words[w.lemma || w.word]?.status === "mastered"}">${progress.words[w.lemma || w.word]?.status === "mastered" ? "Known ✓" : "Mark known"}</button></div><p>${esc(w.meaning)}</p>${w.quote.toLowerCase() !== w.word.toLowerCase() ? `<blockquote>${esc(w.quote)}</blockquote>` : ""}<p>${esc(w.note)}</p>${source ? `<button class="quiet" data-vocab-source="${source.si},${source.qi}">${esc(source.section)} · Q${source.number} ↗</button>` : ""}</article>`;
      }).join("")}</div>${shown.length ? "" : `<p>${filter === "known" ? "No words marked known yet." : "All words in this review are known."}</p>`}` : record?.status === "done" ? '<p>No new words to review.</p>' : ""}`;
    el.querySelector('[data-vocab="build"]')?.addEventListener("click", build);
    el.querySelector('[data-vocab="saved"]').onclick = showSaved;
    el.querySelector('[data-vocab="stop"]')?.addEventListener("click", async () => {
      try { if (!current()?.id) return; await api("/api/ai/stop", {attempt:active.id, id:current().id}); await refresh(); }
      catch (e) { error = e.message; paint(); }
    });
    el.querySelectorAll("[data-vocab-filter]").forEach(b => b.onclick = () => {filter=b.dataset.vocabFilter; paint();});
    el.querySelectorAll("[data-vocab-known]").forEach(b => b.onclick = () => mark(b));
    el.querySelectorAll("[data-vocab-source]").forEach(b => b.onclick = () => {
      const [si,qi] = b.dataset.vocabSource.split(",").map(Number);
      const row = document.getElementById(`result-detail-${si}-${qi}`);
      if (row.hidden || row.dataset.mode !== "question") toggleResultQuestion(si, qi);
      row.scrollIntoView({behavior:"smooth", block:"center"});
    });
  }
  async function refresh() {
    const [reviews, state] = await Promise.all([api("/api/ai/vocabulary"), api("/api/vocabulary")]);
    records = reviews; progress = state; paint();
  }
  async function mount() {
    const token = ++generation;
    if (!document.getElementById("test-vocabulary")) return;
    error = ""; filter = "learning";
    paint();
    async function poll() {
      if (token !== generation || screen !== "results" || !document.getElementById("test-vocabulary")) return;
      try { await refresh(); }
      catch (e) { error = e.message; paint(); }
      if (token === generation && screen === "results") setTimeout(poll, 2500);
    }
    await poll();
  }
  async function build() {
    if (sending || pending(current()) || active?.status !== "done") return;
    const attempt = active;
    const questions = collect(test(), attempt, C.grade);
    sending = true; error = ""; paint();
    try {
      await flushDisk();
      await api("/api/ai/explain", {attempt:attempt.id, question:"@vocabulary", mode:"vocabulary",
        provider:"codex", tier:settings.aiTier, language:"en", refresh:!!current(), context:{questions}});
      await refresh();
    } catch (e) { error=e.message; }
    finally { sending=false; paint(); }
  }
  async function mark(button) {
    button.disabled = true;
    const word = button.dataset.vocabKnown, now = Date.now(), previous = progress.words[word] || {};
    try {
      const saved = await api("/api/vocabulary", {version:1, updated:now, prefs:progress.prefs || {},
        words:{[word]:{...previous, status:previous.status === "mastered" ? "learning" : "mastered",
          star:previous.star || false, visited:true, lastReviewed:now, updated:now}}}, "PUT");
      progress=saved.state; error="";
    } catch(e) {error=e.message;}
    paint();
  }
  async function showSaved() {
    ++generation;
    leaveFocusMode(); closeModal(); closeTools();
    active=null; reviewing=false; screen="test-vocabulary";
    history.replaceState(null,"","#test-vocabulary");
    document.title="Test vocabulary | Mock Test";
    app.innerHTML=libraryShell('<main class="vocab-saved"><div class="row spread"><h1>Test vocabulary</h1><div class="row"><button id="vocab-attempts">Completed tests</button><button id="vocab-bank">Word bank</button></div></div><div id="vocab-reviews" role="status">Loading…</div></main>', "vocabulary");
    document.getElementById("vocab-bank").onclick=renderVocabulary;
    document.getElementById("vocab-attempts").onclick=()=>{
      historyGroup="all"; historyTest="all"; historyStatus="done"; selectedAttempts.clear();
      history.replaceState(null,"",location.pathname + location.search); renderHistory();
    };
    const panel=document.getElementById("vocab-reviews");
    try {
      records=await api("/api/ai/vocabulary");
      if (screen !== "test-vocabulary") return;
      const available=records.filter(r=>db.attempts.some(a=>a.id===r.attempt && a.status==="done") && !db.deleted?.[r.attempt]).sort((a,b)=>b.updated-a.updated);
      panel.innerHTML=available.length ? available.map(r=>{
        const attempt=db.attempts.find(a=>a.id===r.attempt), t=DATA.find(t=>t.id===attempt.test);
        return `<button class="vocab-saved-item" data-vocab-attempt="${esc(r.attempt)}"><strong>${esc(t ? testName(t) : "Test")}</strong><span>${new Date(attempt.finished || attempt.created).toLocaleDateString("en-US")} · ${r.status === "done" ? `${r.words?.length || 0} words` : pending(r) ? "In progress" : "Retry"} ↗</span></button>`;
      }).join("") : '<p>No saved reviews yet.</p>';
      panel.querySelectorAll("[data-vocab-attempt]").forEach(b=>b.onclick=()=>{
        active=db.attempts.find(a=>a.id===b.dataset.vocabAttempt); renderResults();
        document.getElementById("test-vocabulary")?.scrollIntoView();
      });
    } catch(e) {panel.innerHTML=`<p>${esc(e.message)}</p><button id="vocab-retry">Retry</button>`;panel.querySelector("button").onclick=showSaved;}
  }
  return {collect, verbal, slot, mount, showSaved};
})();
if (typeof module !== "undefined") module.exports = TestVocabulary;
