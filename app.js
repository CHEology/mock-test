"use strict";
const BASE_DATA = window.MOCK_TEST_DATA;
let DATA = [...BASE_DATA];
const C = window.MockTestCore,
  $ = (s) => document.querySelector(s),
  app = $("#app"),
  modal = $("#modal");
let db = { version: 1, attempts: [], deleted: {} },
  historyTest = "all",
  historyGroup = "all",
  historyStatus = "all",
  selectedAttempts = new Set(),
  pendingDelete = null,
  active = null,
  screen = "home",
  reviewing = false,
  testHelpOpen = false,
  zoom = 100,
  hideTime = false,
  diskReady = false,
  dirty = false,
  saveChain = Promise.resolve(),
  saveTimer,
  calcValue = "",
  calcMemory = 0,
  settings = C.preferences(),
  focusOwned = false;
try {
  settings = C.preferences(
    JSON.parse(localStorage.getItem("mock-test-settings")),
  );
} catch (_) {}
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const test = () => DATA.find((t) => t.id === active.test),
  section = () => (active.section < 0 ? null : test().sections[active.section]),
  question = () => section()?.questions[active.question];
const letters = (n) =>
  Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
const formatTime = (n) => {
  n = Math.max(0, Math.ceil(n));
  return `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
};
function notify(t) {
  $("#toast").textContent = t;
  $("#toast").classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => $("#toast").classList.remove("show"), 2700);
}
function save(touchActive = true) {
  dirty = true;
  db.updated = Date.now();
  if (active && touchActive) active.updated = db.updated;
  try {
    localStorage.setItem("mock-test-v1", JSON.stringify(db));
  } catch (e) {
    notify("Browser storage is full. Export your progress.");
  }
  if (diskReady) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushDisk, 350);
  }
}
function flushDisk() {
  if (!diskReady) return;
  clearTimeout(saveTimer);
  const snapshot = JSON.stringify(db);
  saveChain = saveChain
    .catch(() => {})
    .then(async () => {
      const r = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: snapshot,
      });
      if (!r.ok) throw Error("Save failed");
      const response = await r.json();
      if (response.state) acceptState(response.state);
      return true;
    })
    .catch(() => {
      notify("Disk save failed. Keep this tab open and export your progress.");
      return false;
    });
  return saveChain;
}
async function init() {
  let local;
  try {
    local = JSON.parse(localStorage.getItem("mock-test-v1"));
  } catch (e) {}
  let disk;
  try {
    const r = await fetch("/api/state");
    if (r.ok) {
      disk = await r.json();
      diskReady = true;
    }
  } catch (e) {}
  const candidates = [local, disk].filter(
    (x) => x?.version === 1 && Array.isArray(x.attempts),
  );
  db = C.mergeState(...candidates);
  const oldLibrary = JSON.stringify(db.library);
  syncLibrary();
  renderHome();
  if (oldLibrary !== JSON.stringify(db.library)) save(false);
}
function acceptState(state, persist = true) {
  const previous = active;
  db = C.mergeState(db, state);
  syncLibrary();
  if (previous) active = db.attempts.find((a) => a.id === previous.id) || null;
  if (persist) {
    try {
      localStorage.setItem("mock-test-v1", JSON.stringify(db));
    } catch (_) {}
  }
  if (previous && !active) {
    closeModal();
    renderHome();
    notify("This attempt was cleared.");
  } else if (
    screen === "home" &&
    !modal.open &&
    document.activeElement?.id !== "library-search"
  )
    renderHome();
  else if (screen === "history" && !modal.open) renderHistory();
  else if (active && active.updated > (previous?.updated || 0)) {
    closeModal();
    if (active.status === "done") renderResults();
    else if (active.status === "between") renderBetween();
    else renderTest();
  }
}
async function refreshState() {
  if (!diskReady) return;
  try {
    const r = await fetch("/api/state");
    if (r.ok) acceptState(await r.json());
  } catch (_) {}
}
function closeModal() {
  modal.close();
  modal.innerHTML = "";
}
function dialog(html) {
  modal.innerHTML = html;
  if (!modal.open) modal.showModal();
  modal.querySelector("[autofocus]")?.focus();
}
function homeButton() {
  return '<button data-action="home">← Test library</button>';
}
function testName(t) {
  return (
    db.library?.find((r) => r.kind === "test" && r.testId === t.id)?.name ||
    t.title ||
    `Test ${String(t.id).padStart(2, "0")}`
  );
}
function attemptScore(a) {
  const t = DATA.find((t) => t.id === a.test);
  const questions = t.sections
    .flatMap((s) => s.questions)
    .filter((q) => !q.disputed);
  if (!questions.length)
    return t.sections.length ? "Unscored" : "Writing saved";
  return `${questions.filter((q) => C.grade(q, a.answers[q.id])).length} / ${questions.length}`;
}
function attemptStatus(a) {
  if (a.status === "done") return attemptScore(a);
  const t = DATA.find((t) => t.id === a.test);
  const s = t.sections[a.section];
  if (!s) return "Writing";
  return a.status === "between"
    ? `Next: ${s.label}`
    : `${s.label} · ${a.question + 1}/${s.questions.length}`;
}
function renderHome() {
  testHelpOpen = false;
  leaveFocusMode();
  screen = "home";
  active = null;
  reviewing = false;
  closeTools();
  document.title = "Mock Test";
  renderLibrary();
}
function historyTests() {
  const ids = L.testIds(db.library, historyGroup);
  return DATA.filter((t) => ids.has(t.id));
}
function historyAttempts() {
  const tests = historyTests();
  return db.attempts
    .filter(
      (a) =>
        tests.some((t) => t.id === a.test) &&
        (historyTest === "all" || a.test === Number(historyTest)) &&
        (historyStatus === "all" ||
          (historyStatus === "done"
            ? a.status === "done"
            : a.status !== "done")),
    )
    .sort((a, b) => b.created - a.created);
}
function historyDialog(scope = "all") {
  const item = db.library.find(
    (r) => r.kind === "test" && r.testId === Number(scope),
  );
  historyGroup = scope === "all" ? "all" : item?.parent || "all";
  historyTest = String(scope);
  historyStatus = "all";
  selectedAttempts.clear();
  renderHistory();
}
function groupHistory(group) {
  historyGroup = group;
  libraryLocation = group;
  historyTest = "all";
  historyStatus = "all";
  selectedAttempts.clear();
  renderHistory();
}
function renderHistory() {
  testHelpOpen = false;
  leaveFocusMode();
  closeModal();
  closeTools();
  screen = "history";
  active = null;
  reviewing = false;
  const tests = historyTests();
  if (historyTest !== "all" && !tests.some((t) => String(t.id) === historyTest))
    historyTest = "all";
  const attempts = historyAttempts();
  selectedAttempts = new Set(
    [...selectedAttempts].filter((id) => attempts.some((a) => a.id === id)),
  );
  const group = libItem(historyGroup);
  const title = group?.name || "Attempts";
  document.title = `${group ? title + " · " : ""}Attempts | Mock Test`;
  app.innerHTML = libraryShell(
    `<header class="library-heading row spread"><h1>${esc(title)}</h1><div class="row"><button data-action="export-history">Export</button>${historyTest !== "all" ? `<button class="primary" data-start="${historyTest}">New attempt</button>` : ""}</div></header>${libraryTabs(historyGroup, true)}<div class="history-tools row spread"><div class="row"><select id="history-test" aria-label="Filter by test"><option value="all">All tests</option>${tests.map((t) => `<option value="${t.id}" ${String(t.id) === historyTest ? "selected" : ""}>${esc(testName(t))}</option>`).join("")}</select><select id="history-status" aria-label="Filter by status"><option value="all">All attempts</option><option value="done" ${historyStatus === "done" ? "selected" : ""}>Results</option><option value="open" ${historyStatus === "open" ? "selected" : ""}>In progress</option></select></div><div class="row"><button class="danger ${selectedAttempts.size ? "" : "hidden"}" id="delete-selected" data-action="delete-selected">Delete selected (${selectedAttempts.size})</button>${attempts.some((a) => a.status === "done") ? '<button class="danger quiet" data-action="clear-results">Clear results</button>' : ""}</div></div>${attempts.length ? `<div class="history-table"><table><thead><tr><th><input id="select-attempts" type="checkbox" aria-label="Select all visible attempts" ${selectedAttempts.size === attempts.length ? "checked" : ""}></th><th>Test</th><th>Started</th><th>Mode</th><th>Result / progress</th><th></th></tr></thead><tbody>${attempts.map((a) => `<tr><td><input type="checkbox" data-select-attempt="${a.id}" aria-label="Select attempt from ${esc(new Date(a.created).toLocaleString())}" ${selectedAttempts.has(a.id) ? "checked" : ""}></td><td>${esc(testName(DATA.find((t) => t.id === a.test)))}</td><td>${esc(new Date(a.created).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))}</td><td>${a.mode === "timed" ? "Timed" : "Untimed"}</td><td>${esc(attemptStatus(a))}</td><td><div class="row"><button ${a.status === "done" ? "data-results" : "data-resume"}="${a.id}">${a.status === "done" ? "Review" : "Resume"}</button><button class="quiet danger" data-delete="${a.id}">Delete</button></div></td></tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">No attempts.</p>'}`,
    historyGroup,
  );
}
function updateSelection() {
  const attempts = historyAttempts();
  const button = $("#delete-selected");
  button.textContent = `Delete selected (${selectedAttempts.size})`;
  button.classList.toggle("hidden", !selectedAttempts.size);
  const selectAll = $("#select-attempts");
  if (selectAll) {
    selectAll.checked = selectedAttempts.size === attempts.length;
    selectAll.indeterminate =
      selectedAttempts.size > 0 && selectedAttempts.size < attempts.length;
  }
}
function deleteDialog(ids, returnTo = screen) {
  const existing = ids.filter((id) => db.attempts.some((a) => a.id === id));
  if (!existing.length) return;
  pendingDelete = { ids: existing, returnTo };
  const current =
    active && existing.includes(active.id) && active.status !== "done";
  dialog(
    `<h2>${current ? "Clear this attempt?" : `Delete ${existing.length === 1 ? "this attempt" : `${existing.length} attempts`}?`}</h2><p>Answers, writing, and notes will be removed.</p><div class="dialog-actions"><button data-action="close">Cancel</button><button class="danger" data-action="confirm-delete">${current ? "Clear attempt" : "Delete"}</button></div>`,
  );
}
async function deleteAttempts() {
  if (!pendingDelete) return;
  const { ids, returnTo } = pendingDelete;
  pendingDelete = null;
  db.deleted ||= {};
  for (const id of ids) db.deleted[id] = Date.now();
  db.attempts = db.attempts.filter((a) => !ids.includes(a.id));
  if (active && ids.includes(active.id)) active = null;
  selectedAttempts.clear();
  closeModal();
  save(false);
  if (returnTo === "history" || returnTo === "results") renderHistory();
  else renderHome();
  const saved = await flushDisk();
  if (saved !== false)
    notify(
      ids.length === 1 ? "Attempt cleared." : `${ids.length} attempts cleared.`,
    );
}
function startDialog(id) {
  const t = DATA.find((x) => x.id === id);
  dialog(
    `<h2>Start ${esc(testName(t))}</h2><label class="radio-card"><input type="radio" name="mode" value="timed" ${settings.mode === "timed" ? "checked" : ""}><span><strong>Timed test</strong><br>Each section ends when time runs out.</span></label><label class="radio-card"><input type="radio" name="mode" value="practice" ${settings.mode === "practice" ? "checked" : ""}><span><strong>Untimed practice</strong><br>Work at your own pace.</span></label>${t.essay ? `<label class="radio-card"><input id="include-essay" type="checkbox" ${settings.includeWriting || !t.sections.length ? "checked" : ""} ${!t.sections.length ? "disabled" : ""}><span>Include writing · ${t.essayMinutes ?? 30} minutes</span></label>` : ""}<label class="radio-card"><input id="start-focus" type="checkbox" ${settings.focusMode ? "checked" : ""}><span>Focus mode · full screen</span></label><div class="section-track">${t.sections.map((s) => `<span>${esc(s.label)} · ${s.questions.length} questions · ${s.minutes}m</span>`).join("")}</div><div class="dialog-actions"><button data-action="close">Cancel</button><button class="primary" data-begin="${id}">Begin</button></div>`,
  );
}
function begin(id) {
  testHelpOpen = false;
  historyGroup =
    db.library.find((r) => r.kind === "test" && r.testId === id)?.parent ||
    "all";
  historyTest = String(id);
  const mode = $("input[name=mode]:checked").value,
    essay = !!$("#include-essay")?.checked;
  active = {
    id: crypto.randomUUID(),
    test: id,
    mode,
    includeEssay: essay,
    focusMode: !!$("#start-focus")?.checked,
    status: "running",
    section: essay ? -1 : 0,
    question: 0,
    answers: {},
    flags: {},
    essay: "",
    notes: {},
    drawings: {},
    times: {},
    created: Date.now(),
  };
  db.attempts.push(active);
  hideTime = !settings.showTimer;
  reviewing = false;
  closeModal();
  startClock();
  save();
  renderTest();
  if (active.focusMode) enterFocusMode();
}
function startClock() {
  active.started = Date.now();
  active.deadline =
    active.mode === "timed"
      ? Date.now() + (section()?.minutes ?? test().essayMinutes ?? 30) * 60000
      : null;
}
function resume(id) {
  testHelpOpen = false;
  active = db.attempts.find((a) => a.id === id);
  reviewing = false;
  if (!active) return;
  closeModal();
  hideTime = !settings.showTimer;
  if (
    active.status !== "done" &&
    settings.focusMode &&
    active.focusMode !== false
  )
    enterFocusMode();
  if (active.status === "between") {
    renderBetween();
    return;
  }
  if (active.status === "done") {
    renderResults();
    return;
  }
  if (active.mode === "timed" && active.deadline <= Date.now()) {
    finishSection(true);
    return;
  }
  renderTest();
}
function answerValue() {
  return active.answers[question().id];
}
function choicesHTML(q, a) {
  const selected = (v) => (Array.isArray(a) ? a.includes(v) : a === v);
  return letters(q.count)
    .map(
      (v, i) =>
        `<button class="choice ${q.type === "multi" ? "multi" : ""} ${selected(v) ? "selected" : ""}" data-choice="${v}" aria-pressed="${selected(v)}" ${reviewing ? "disabled" : ""}><span class="letter">${v}</span><span class="position">${esc(q.labels?.[i] || `${i + 1}${i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th"} choice`)}</span></button>`,
    )
    .join("");
}
function controls(q) {
  const a = answerValue();
  let body = "";
  const disabled = reviewing ? "disabled" : "";
  if (q.type === "blanks")
    body = Array.from(
      { length: q.count },
      (_, i) =>
        `<div class="blank-group"><h4>Blank (${["i", "ii", "iii"][i]})</h4><div class="choices">${letters(
          3,
        )
          .map(
            (v) =>
              `<button class="choice ${a?.[i] === v ? "selected" : ""}" data-blank="${i}" data-value="${v}" aria-pressed="${a?.[i] === v}" ${disabled}><span class="letter">${v}</span></button>`,
          )
          .join("")}</div></div>`,
    ).join("");
  else if (q.type === "numeric")
    body = `<input class="numeric" id="numeric-answer" aria-label="Numeric answer" inputmode="decimal" autocomplete="off" value="${esc(a || "")}" ${disabled}>`;
  else if (q.type === "fraction")
    body = `<div class="fraction"><input class="numeric" data-fraction="0" aria-label="Numerator" inputmode="decimal" autocomplete="off" value="${esc(a?.[0] || "")}" ${disabled}><hr><input class="numeric" data-fraction="1" aria-label="Denominator" inputmode="decimal" autocomplete="off" value="${esc(a?.[1] || "")}" ${disabled}></div>`;
  else if (q.type === "sentence")
    body = "<p>Click a sentence in the passage.</p>";
  else body = `<div class="choices">${choicesHTML(q, a)}</div>`;
  const title =
    q.type === "blanks"
      ? "One choice per blank"
      : q.type === "multi"
        ? q.limit === 2
          ? "Select two choices"
          : "Select all that apply"
        : q.type === "numeric"
          ? "Enter your answer"
          : q.type === "fraction"
            ? "Enter a fraction"
            : q.type === "sentence"
              ? "Select a sentence"
              : "Select one choice";
  return `<h3>${title}</h3>${body}${!reviewing ? '<button class="quiet" style="margin-top:24px;width:100%" data-action="clear-answer">Clear answer</button>' : feedback(q)}`;
}
function feedback(q) {
  const a = answerValue(),
    g = C.grade(q, a);
  return `<div class="answer-feedback ${g === true ? "correct" : g === false ? "incorrect" : ""}"><strong>${g === null ? "Disputed · unscored" : g ? "Correct" : "Incorrect"}</strong><p>Your answer: ${esc(C.display(q, a))}<br>${g === null ? "Reviewed key" : "Correct answer"}: ${esc(q.key)}</p>${q.explanation ? `<p>${esc(q.explanation)}</p>` : ""}</div>`;
}
function textQuestion(q) {
  return `<div class="text-question"><p>${esc(q.text).replace(/\n/g, "<br>")}</p>${q.options ? `<div class="demo-options">${q.options.map((column, i) => `<div><strong>Blank (${["i", "ii", "iii"][i]})</strong>${column.map((v, j) => `<p>${letters(3)[j]}. ${esc(v)}</p>`).join("")}</div>`).join("")}</div>` : ""}</div>`;
}
function testHeader() {
  const s = section();
  return `<header class="test-top"><div class="brand"><b>M</b>Mock Test <span class="sub">${esc(testName(test()))} · ${esc(s?.title || s?.label || "Writing")}</span></div><div class="row">${reviewing ? "<strong>Answer review</strong>" : `<span id="timer" class="timer"></span><button data-action="time">${hideTime ? "Show" : "Hide"} time</button>`}${focusButton()}</div></header>`;
}
function renderTest() {
  screen = "test";
  closeTools();
  if (testHelpOpen) {
    app.innerHTML = `<div class="test-shell">${testHeader()}<main class="test-help"><div class="content-page"><div class="library-heading row spread"><h1>Help</h1><button data-action="back-to-test">Back to test</button></div>${helpContent(true)}</div></main></div>`;
    updateTimer();
    return;
  }
  const s = section(),
    q = question(),
    essay = !s;
  document.title = `${testName(test())} · ${s?.label || "Writing"} | Mock Test`;
  app.innerHTML = `<div class="test-shell">${testHeader()}<div class="toolbar"><h2>${essay ? "Writing" : `${esc(s.label)} · Question ${q.number} of ${s.questions.length}`}</h2><div class="row">${s?.calculator ? '<button data-action="calculator">Calculator</button>' : ""}<button data-action="scratch">Scratchpad</button>${!essay ? `<button data-action="flag" class="${active.flags[q.id] ? "marked" : ""}" aria-pressed="${!!active.flags[q.id]}">${active.flags[q.id] ? "★ Marked" : "☆ Mark"}</button><button data-action="review">Review</button>` : ""}<button data-action="help">Help</button></div></div><div class="workspace"><main class="question-pane">${essay ? essayHTML() : q.type === "sentence" ? `<div class="sentence-layout"><div class="passage">${q.sentences.map((x, i) => `<button class="sentence ${answerValue() === letters(q.count)[i] ? "selected" : ""}" data-choice="${letters(q.count)[i]}" aria-pressed="${answerValue() === letters(q.count)[i]}" ${reviewing ? "disabled" : ""}>${esc(x)}</button> `).join("")}</div><div class="sentence-prompt">${esc(q.prompt)}</div></div>` : q.text ? textQuestion(q) : `<div class="image-frame" style="width:${zoom}%"><img class="question-image" style="max-width:${(1100 * zoom) / 100}px" src="${q.image}" alt="Test ${active.test}, ${esc(s.label)}, question ${q.number}" draggable="false"></div>`}</main>${essay ? "" : `<aside class="answer-panel">${controls(q)}</aside>`}</div><nav class="bottom-nav"><div class="row">${reviewing ? '<button data-action="results">← Results</button>' : '<button data-action="leave">Save & exit</button>'}${!essay ? `<div class="zoom-controls"><button data-zoom="-10" aria-label="Zoom out">−</button><span>${zoom}%</span><button data-zoom="10" aria-label="Zoom in">+</button></div>` : ""}</div><div class="row">${!essay ? `<button data-action="back" ${active.question === 0 ? "disabled" : ""}>← Back</button>` : ""}<button class="primary" data-action="next">${essay ? "Finish writing" : active.question === s.questions.length - 1 ? (reviewing ? "Results" : "Finish section") : "Next →"}</button></div></nav></div>`;
  updateTimer();
  if (essay) {
    $("#essay").addEventListener("input", () => {
      if (reviewing) return;
      active.essay = $("#essay").value;
      $("#word-count").textContent = wordCount(active.essay) + " words";
      save();
    });
  }
  $("#numeric-answer")?.addEventListener("input", (e) => {
    active.answers[q.id] = e.target.value;
    save();
  });
  document.querySelectorAll("[data-fraction]").forEach((el) =>
    el.addEventListener("input", () => {
      const a = active.answers[q.id] || ["", ""];
      a[+el.dataset.fraction] = el.value;
      active.answers[q.id] = a;
      save();
    }),
  );
}
function wordCount(t) {
  return t.trim() ? t.trim().split(/\s+/).length : 0;
}
function essayHTML() {
  const prompt = test().essay.replace(/ (Write a response|Reason:)/g, "\n\n$1");
  return `<div class="essay-layout"><div class="essay-prompt">${esc(prompt).replace(/\n/g, "<br>")}</div><div class="essay-editor"><div class="row spread"><strong>Your response</strong><span id="word-count" class="muted">${wordCount(active.essay)} words</span></div><textarea id="essay" aria-label="Writing response" spellcheck="false" autocorrect="off" autocomplete="off" ${reviewing ? "readonly" : ""}>${esc(active.essay)}</textarea></div></div>`;
}
function choose(value, blank) {
  if (reviewing || screen !== "test" || active.status !== "running") return;
  const q = question();
  if (blank !== undefined) {
    const a = active.answers[q.id] || Array(q.count).fill("");
    a[blank] = value;
    active.answers[q.id] = a;
  } else if (q.type === "multi") {
    let a = active.answers[q.id] || [];
    if (a.includes(value)) a = a.filter((x) => x !== value);
    else {
      if (q.limit && a.length >= q.limit) {
        notify(`Select exactly ${q.limit} choices. Deselect one to change it.`);
        return;
      }
      a.push(value);
    }
    active.answers[q.id] = a;
  } else active.answers[q.id] = value;
  save();
  refreshControls();
}
function refreshControls() {
  const q = question();
  const pos = $(".answer-panel")?.scrollTop;
  if (q.type === "sentence") {
    document.querySelectorAll(".sentence").forEach((el) => {
      const yes = el.dataset.choice === answerValue();
      el.classList.toggle("selected", yes);
      el.setAttribute("aria-pressed", yes);
    });
  }
  $(".answer-panel").innerHTML = controls(q);
  $(".answer-panel").scrollTop =
    pos; /* Numeric inputs are mounted by renderTest, selection controls use delegation. */
}
function reviewDialog() {
  const s = section();
  dialog(
    `<h2>${esc(s.label)} · Review section</h2><div class="review-grid">${s.questions
      .map((q, i) => {
        const yes = C.answered(q, active.answers[q.id]),
          flag = active.flags[q.id];
        return `<button class="review-cell ${yes ? "answered" : ""} ${flag ? "flagged" : ""}" data-jump="${i}"><strong>${q.number}${flag ? " ★" : ""}</strong><span class="status">${yes ? "Answered" : "Unanswered"}</span></button>`;
      })
      .join(
        "",
      )}</div><div class="dialog-actions"><button data-action="close">Return</button>${reviewing ? "" : '<button class="primary" data-action="finish">Finish section</button>'}</div>`,
  );
}
function finishDialog() {
  const s = section(),
    missing = s
      ? s.questions.filter((q) => !C.answered(q, active.answers[q.id])).length
      : 0;
  dialog(
    `<h2>${s ? "Finish " + esc(s.label) + "?" : "Finish writing?"}</h2><p>${missing ? `${missing} question${missing > 1 ? "s are" : " is"} unanswered. ` : ""}You cannot return to this section after finishing.</p><div class="dialog-actions"><button data-action="close">Keep working</button><button class="primary" data-action="confirm-finish">Finish section</button></div>`,
  );
}
function finishSection(expired = false) {
  if (!active || active.status !== "running" || reviewing) return;
  closeTools();
  closeModal();
  const elapsed = Math.max(
    0,
    (Math.min(Date.now(), active.deadline || Date.now()) - active.started) /
      1000,
  );
  active.times[active.section] = elapsed;
  active.expired = expired;
  active.section++;
  active.question = 0;
  active.deadline = null;
  active.status = active.section >= test().sections.length ? "done" : "between";
  if (active.status === "done") active.finished = Date.now();
  save();
  if (active.status === "done") renderResults();
  else renderBetween();
}
function renderBetween() {
  testHelpOpen = false;
  screen = "between";
  const s = section();
  app.innerHTML = `<main class="center-screen"><div class="eyebrow">${esc(testName(test()))}</div><h1 style="margin-top:22px">${active.expired ? "Time is up." : "Section complete."}</h1><p>Your answers have been saved.</p><div class="card" style="margin:32px 0"><h2>Next: ${esc(s.title || s.label)}</h2><div class="section-track"><span>${s.questions.length} questions</span><span>${active.mode === "timed" ? s.minutes + " minutes" : "Untimed"}</span></div></div><div class="row spread">${homeButton()}<button class="primary" data-action="next-section">Start ${esc(s.label)}</button></div></main>`;
}
function updateTimer() {
  if (screen !== "test" || reviewing || !active) return;
  const el = $("#timer");
  if (!el) return;
  let remaining =
    active.mode === "timed"
      ? (active.deadline - Date.now()) / 1000
      : (Date.now() - active.started) / 1000;
  el.textContent = hideTime ? "— —" : formatTime(remaining);
  el.classList.toggle("low", active.mode === "timed" && remaining <= 300);
  if (active.mode === "timed" && remaining <= 0) finishSection(true);
}
function renderResults() {
  testHelpOpen = false;
  leaveFocusMode();
  closeModal();
  screen = "results";
  reviewing = false;
  closeTools();
  const t = test();
  document.title = `${testName(t)} results | Mock Test`;
  let total = 0,
    correct = 0,
    excluded = 0;
  const cards = t.sections
    .map((s) => {
      const scored = s.questions.filter((q) => !q.disputed),
        right = scored.filter((q) => C.grade(q, active.answers[q.id])).length;
      total += scored.length;
      correct += right;
      excluded += s.questions.length - scored.length;
      return `<div class="score-card"><span>${esc(s.title || s.label)}</span><strong>${right} <span class="muted" style="font-size:21px">/ ${scored.length}</span></strong><span class="muted">${formatTime(active.times[t.sections.indexOf(s)] || 0)}</span></div>`;
    })
    .join("");
  app.innerHTML = `<main class="results"><div class="row spread"><button data-action="results-history">← Attempts</button><div class="row"><button data-action="export-attempt">Export</button><button class="danger quiet" data-action="delete-current">Delete result</button></div></div><div style="margin-top:40px"><div class="eyebrow">${esc(testName(t))} · ${active.mode === "timed" ? "Timed" : "Untimed"}</div><h1 style="margin-top:16px">${total ? `${correct} of ${total} correct` : t.sections.length ? "No scored questions" : "Writing complete"}</h1>${excluded ? `<p class="muted">${excluded} disputed question${excluded > 1 ? "s" : ""} excluded from scoring.</p>` : ""}</div><div class="results-summary">${cards}</div><div class="row spread"><h2 style="margin:0">${t.sections.length ? "Review your answers" : "Your writing"}</h2>${active.includeEssay ? '<button data-action="review-essay">Read your essay</button>' : ""}</div>${t.sections
    .map(
      (s, si) =>
        `<h3 style="margin-top:32px">${esc(s.label)}</h3><table><thead><tr><th>Question</th><th>Your answer</th><th>Key</th><th>Result</th></tr></thead><tbody>${s.questions
          .map((q, qi) => {
            const g = C.grade(q, active.answers[q.id]);
            return `<tr tabindex="0" data-review="${si},${qi}"><td>${q.number}${active.flags[q.id] ? " ★" : ""}</td><td>${esc(C.display(q, active.answers[q.id]))}</td><td>${esc(q.key)}</td><td class="${g === null ? "tag-dispute" : g ? "tag-correct" : "tag-incorrect"}">${g === null ? "Disputed" : g ? "Correct" : C.answered(q, active.answers[q.id]) ? "Incorrect" : "Unanswered"} →</td></tr>`;
          })
          .join("")}</tbody></table>`,
    )
    .join("")}</main>`;
}
function enterReview(si, qi) {
  reviewing = true;
  active.section = si;
  active.question = qi;
  renderTest();
}
function closeTools() {
  document.querySelectorAll(".tool-window").forEach((x) => x.remove());
}
function calculator() {
  if ($("#calculator")) {
    $("#calculator").remove();
    return;
  }
  if (!section()?.calculator) return;
  const el = document.createElement("section");
  el.id = "calculator";
  el.className = "tool-window";
  el.setAttribute("aria-label", "Calculator");
  el.innerHTML = `<div class="tool-head"><strong>Calculator</strong><button data-action="close-calc" aria-label="Close calculator">×</button></div><input id="calc-display" class="calc-display" aria-label="Calculator display" value="${esc(calcValue)}" autocomplete="off"><div class="calc-grid">${["MR", "MC", "M+", "C", "(", ")", "√", "⌫", "7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "±", "0", ".", "+"].map((v) => `<button data-calc="${v}">${v}</button>`).join("")}<button data-calc="=" class="primary" style="grid-column:span 4">=</button></div>`;
  document.body.append(el);
  $("#calc-display").addEventListener(
    "input",
    (e) => (calcValue = e.target.value),
  );
  $("#calc-display").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      calc("=");
    }
  });
}
function calc(v) {
  try {
    if (v === "C") calcValue = "";
    else if (v === "⌫") calcValue = calcValue.slice(0, -1);
    else if (v === "MC") calcMemory = 0;
    else if (v === "MR") calcValue += String(calcMemory);
    else if (v === "M+") calcMemory += C.calculate(calcValue);
    else if (v === "=") calcValue = String(C.calculate(calcValue));
    else if (v === "√") {
      const n = C.calculate(calcValue);
      if (n < 0) throw Error();
      calcValue = String(Number(Math.sqrt(n).toPrecision(12)));
    } else if (v === "±") calcValue = String(-C.calculate(calcValue));
    else calcValue += v === "−" ? "-" : v;
    $("#calc-display").value = calcValue;
  } catch (e) {
    notify("Check the calculator expression.");
  }
}
function scratch() {
  if ($("#scratchpad")) {
    $("#scratchpad").remove();
    return;
  }
  const key = String(active.section),
    el = document.createElement("section");
  el.id = "scratchpad";
  el.className = "tool-window scratch";
  el.innerHTML = `<div class="tool-head"><strong>Scratchpad · ${section()?.label || "Writing"}</strong><button data-action="close-scratch" aria-label="Close scratchpad">×</button></div><textarea id="notes" aria-label="Scratch notes" placeholder="Type your working here…">${esc(active.notes[key] || "")}</textarea><canvas id="drawing" width="1000" height="540" aria-label="Drawing scratchpad"></canvas><div class="row"><button id="undo-drawing">Undo stroke</button><button id="clear-drawing">Clear drawing</button></div>`;
  document.body.append(el);
  $("#notes").addEventListener("input", (e) => {
    active.notes[key] = e.target.value;
    save();
  });
  const canvas = $("#drawing"),
    ctx = canvas.getContext("2d");
  let drawing = false,
    undo = [];
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#17363d";
  function restore(url) {
    ctx.clearRect(0, 0, 1000, 540);
    if (url) {
      const im = new Image();
      im.onload = () => ctx.drawImage(im, 0, 0);
      im.src = url;
    }
  }
  restore(active.drawings[key]);
  function point(e) {
    const r = canvas.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * 1000) / r.width,
      ((e.clientY - r.top) * 540) / r.height,
    ];
  }
  canvas.onpointerdown = (e) => {
    undo.push(canvas.toDataURL("image/png"));
    if (undo.length > 15) undo.shift();
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(...point(e));
  };
  canvas.onpointermove = (e) => {
    if (drawing) {
      ctx.lineTo(...point(e));
      ctx.stroke();
    }
  };
  const end = () => {
    if (!drawing) return;
    drawing = false;
    active.drawings[key] = canvas.toDataURL("image/png");
    save();
  };
  canvas.onpointerup = end;
  canvas.onpointercancel = end;
  $("#undo-drawing").onclick = () => {
    if (!undo.length) return;
    active.drawings[key] = undo.pop();
    restore(active.drawings[key]);
    save();
  };
  $("#clear-drawing").onclick = () => {
    undo.push(canvas.toDataURL("image/png"));
    active.drawings[key] = "";
    restore("");
    save();
  };
}
function exportData(one = false) {
  const value = one ? { version: 1, attempt: active } : db,
    blob = new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = one
    ? `Mock-Test-${String(active.test).padStart(2, "0")}-attempt.json`
    : "Mock-Test-progress.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function focusButton() {
  const label = document.fullscreenElement
    ? "Exit focus mode"
    : "Enter focus mode";
  return `<button data-action="fullscreen" aria-label="${label}">${document.fullscreenElement ? "Exit focus" : "Focus mode"}</button>`;
}
function enterFocusMode() {
  if (document.fullscreenElement) return;
  if (!document.documentElement.requestFullscreen) {
    notify("Full screen is unavailable in this browser.");
    return;
  }
  // Called directly from Begin/Resume so browser user activation is retained.
  document.documentElement
    .requestFullscreen({ navigationUI: "hide" })
    .then(() => {
      focusOwned = true;
      if (!["test", "between"].includes(screen)) leaveFocusMode();
    })
    .catch(() =>
      notify(
        "Full screen was blocked. Use the Focus mode button to try again.",
      ),
    );
}
function leaveFocusMode() {
  if (!focusOwned) return;
  focusOwned = false;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) focusOwned = false;
  const button = $('[data-action="fullscreen"]');
  if (button) button.outerHTML = focusButton();
});
function renderInfoPage(name, content) {
  leaveFocusMode();
  closeModal();
  closeTools();
  active = null;
  reviewing = false;
  screen = name.toLowerCase();
  document.title = `${name} | Mock Test`;
  app.innerHTML = libraryShell(
    `<div class="content-page"><div class="library-heading"><h1>${name}</h1></div>${content}</div>`,
    screen,
  );
}
function renderSettings() {
  renderInfoPage(
    "Settings",
    `<form id="settings-form" class="settings-form"><section class="settings-section"><h2>Testing</h2><label class="setting-row"><span>Full-screen focus mode</span><input id="setting-focus" type="checkbox" ${settings.focusMode ? "checked" : ""}></label><label class="setting-row"><span>Default test mode</span><select id="setting-mode"><option value="timed" ${settings.mode === "timed" ? "selected" : ""}>Timed</option><option value="practice" ${settings.mode === "practice" ? "selected" : ""}>Untimed</option></select></label><label class="setting-row"><span>Include writing by default</span><input id="setting-writing" type="checkbox" ${settings.includeWriting ? "checked" : ""}></label></section><section class="settings-section"><h2>Display</h2><label class="setting-row"><span>Show timer</span><input id="setting-timer" type="checkbox" ${settings.showTimer ? "checked" : ""}></label><label class="setting-row"><span>Show sidebar</span><input id="setting-sidebar" type="checkbox" ${!sidebarHidden ? "checked" : ""}></label></section></form>`,
  );
  $("#settings-form").onsubmit = (e) => e.preventDefault();
  $("#settings-form").onchange = () => {
    settings = C.preferences({
      focusMode: $("#setting-focus").checked,
      mode: $("#setting-mode").value,
      includeWriting: $("#setting-writing").checked,
      showTimer: $("#setting-timer").checked,
    });
    const hideSidebar = !$("#setting-sidebar").checked;
    try {
      localStorage.setItem("mock-test-settings", JSON.stringify(settings));
    } catch (_) {
      notify("Settings could not be saved in this browser.");
    }
    if (hideSidebar !== sidebarHidden) toggleLibrarySidebar();
  };
}
function helpContent(inTest = false) {
  return `<div class="help-content">${inTest ? "" : "<section><h2>Your library</h2><p>Organize tests into categories and folders. Use the ··· menu to rename, move, or create a practice copy. Restore removed items from Trash.</p></section>"}<section><h2>Answering questions</h2><p>Select answers on the right. Unlabelled choices follow their order in the question; each blank starts at A. Numeric answers accept decimals or fractions. For sentence-selection questions, click the passage directly.</p><p>Use Mark and Review to revisit questions within the current section. Calculator and Scratchpad are available from the test toolbar.</p></section><section><h2>Timing and progress</h2><p>Progress saves automatically. Timed sections keep counting while you read Help or leave the test. Save &amp; exit lets you return later; finishing a section moves you forward.</p></section><section><h2>Attempts and results</h2><p>Each category and folder has its own Attempts tab. Resume, review, export, or delete attempts there. Results use the supplied answer key; writing is saved without automatic grading.</p></section><section><h2>Focus mode</h2><p>Tests open full screen by default. Press Esc or Exit focus to leave full screen. Change the default in Settings or turn it off before starting a test.</p></section></div>`;
}
function help() {
  if (screen === "test") {
    testHelpOpen = true;
    renderTest();
  } else renderInfoPage("Help", helpContent());
}
async function action(name) {
  switch (name) {
    case "close":
      closeModal();
      break;
    case "back-to-test":
      testHelpOpen = false;
      renderTest();
      break;
    case "help":
      help();
      break;
    case "history":
      historyDialog();
      break;
    case "home":
      closeModal();
      renderHome();
      break;
    case "time":
      hideTime = !hideTime;
      renderTest();
      break;
    case "settings":
      renderSettings();
      break;
    case "fullscreen":
      if (document.fullscreenElement) {
        focusOwned = false;
        document
          .exitFullscreen()
          .catch(() => notify("Use Esc to leave full screen."));
      } else enterFocusMode();
      break;
    case "flag":
      if (!reviewing) {
        const q = question();
        active.flags[q.id] = !active.flags[q.id];
        save();
        renderTest();
      }
      break;
    case "review":
      reviewDialog();
      break;
    case "clear-answer":
      if (!reviewing) {
        delete active.answers[question().id];
        save();
        renderTest();
      }
      break;
    case "back":
      if (active.question > 0) {
        active.question--;
        if (!reviewing) save();
        renderTest();
      }
      break;
    case "next":
      if (!section() || active.question === section().questions.length - 1) {
        if (reviewing) renderResults();
        else finishDialog();
      } else {
        active.question++;
        if (!reviewing) save();
        renderTest();
      }
      break;
    case "finish":
      finishDialog();
      break;
    case "confirm-finish":
      finishSection();
      break;
    case "next-section":
      active.status = "running";
      startClock();
      save();
      renderTest();
      break;
    case "leave":
      dialog(
        `<h2>Leave this attempt?</h2>${active.mode === "timed" ? "<p>The clock continues while you are away.</p>" : ""}<div class="dialog-actions"><button class="danger quiet" data-action="delete-current">Clear attempt</button><button data-action="close">Keep working</button><button class="primary" data-action="save-exit">Save & exit</button></div>`,
      );
      break;
    case "save-exit":
      save();
      closeModal();
      renderHome();
      break;
    case "results-history":
      if (historyTests().some((t) => t.id === active.test)) renderHistory();
      else historyDialog(active.test);
      break;
    case "delete-current":
      deleteDialog([active.id]);
      break;
    case "delete-selected":
      deleteDialog([...selectedAttempts]);
      break;
    case "clear-results":
      deleteDialog(
        historyAttempts()
          .filter((a) => a.status === "done")
          .map((a) => a.id),
      );
      break;
    case "confirm-delete":
      await deleteAttempts();
      break;
    case "results":
      renderResults();
      break;
    case "review-essay":
      enterReview(-1, 0);
      break;
    case "calculator":
      calculator();
      break;
    case "close-calc":
      $("#calculator")?.remove();
      break;
    case "scratch":
      scratch();
      break;
    case "close-scratch":
      $("#scratchpad")?.remove();
      break;
    case "export-history":
      downloadJSON(
        { version: 1, attempts: historyAttempts() },
        "Mock-Test-attempts.json",
      );
      break;
    case "export":
      exportData();
      break;
    case "export-attempt":
      exportData(true);
      break;
  }
}
document.addEventListener("click", (e) => {
  const el = e.target.closest("button,[data-review]");
  if (!el || el.disabled) return;
  if (el.dataset.action) action(el.dataset.action);
  else if (el.dataset.history) historyDialog(el.dataset.history);
  else if (el.dataset.delete) deleteDialog([el.dataset.delete]);
  else if (el.dataset.start) startDialog(+el.dataset.start);
  else if (el.dataset.begin) begin(+el.dataset.begin);
  else if (el.dataset.resume) resume(el.dataset.resume);
  else if (el.dataset.results) {
    active = db.attempts.find((a) => a.id === el.dataset.results);
    renderResults();
  } else if (el.dataset.choice) choose(el.dataset.choice);
  else if (el.dataset.blank !== undefined)
    choose(el.dataset.value, +el.dataset.blank);
  else if (el.dataset.jump !== undefined) {
    active.question = +el.dataset.jump;
    closeModal();
    if (!reviewing) save();
    renderTest();
  } else if (el.dataset.zoom) {
    zoom = Math.min(180, Math.max(70, zoom + +el.dataset.zoom));
    const pane = $(".question-pane"),
      scroll = pane.scrollTop;
    renderTest();
    $(".question-pane").scrollTop = scroll;
  } else if (el.dataset.calc) calc(el.dataset.calc);
  else if (el.dataset.review) {
    const [si, qi] = el.dataset.review.split(",").map(Number);
    enterReview(si, qi);
  }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.id === "history-test") {
    historyTest = el.value;
    selectedAttempts.clear();
    renderHistory();
  } else if (el.id === "history-status") {
    historyStatus = el.value;
    selectedAttempts.clear();
    renderHistory();
  } else if (el.id === "select-attempts") {
    selectedAttempts = new Set(
      el.checked ? historyAttempts().map((a) => a.id) : [],
    );
    document
      .querySelectorAll("[data-select-attempt]")
      .forEach((box) => (box.checked = el.checked));
    updateSelection();
  } else if (el.dataset.selectAttempt) {
    if (el.checked) selectedAttempts.add(el.dataset.selectAttempt);
    else selectedAttempts.delete(el.dataset.selectAttempt);
    updateSelection();
  }
});
window.addEventListener("storage", (e) => {
  if (e.key === "mock-test-v1" && e.newValue) {
    try {
      acceptState(JSON.parse(e.newValue), false);
    } catch (_) {}
  }
});
document.addEventListener("keydown", (e) => {
  if (e.target.matches("[data-review]") && e.key === "Enter") e.target.click();
});
window.addEventListener("pagehide", () => {
  if (diskReady && dirty)
    fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(db),
      keepalive: true,
    }).catch(() => {});
});
setInterval(updateTimer, 250);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshState();
    updateTimer();
  }
});
init();
