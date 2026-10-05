"use strict";
const DATA = window.MOCK_TEST_DATA,
  C = window.MockTestCore,
  $ = (s) => document.querySelector(s),
  app = $("#app"),
  modal = $("#modal");
let db = { version: 1, attempts: [] },
  active = null,
  screen = "home",
  reviewing = false,
  zoom = 100,
  hideTime = false,
  diskReady = false,
  dirty = false,
  saveChain = Promise.resolve(),
  saveTimer,
  calcValue = "",
  calcMemory = 0;
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
function save() {
  dirty = true;
  db.updated = Date.now();
  if (active) active.updated = db.updated;
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
    })
    .catch(() =>
      notify("Disk save failed. Keep this tab open and export your progress."),
    );
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
  if (candidates.length)
    db = candidates.sort((a, b) => (b.updated || 0) - (a.updated || 0))[0];
  renderHome();
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
function renderHome() {
  screen = "home";
  active = null;
  reviewing = false;
  closeTools();
  document.title = "Mock Test";
  const completed = new Set(
    db.attempts
      .filter((a) => a.status === "done" && DATA.some((t) => t.id === a.test))
      .map((a) => a.test),
  ).size;
  app.innerHTML = `<main class="home"><div class="row spread"><div class="brand"><b>M</b>Mock Test</div><div class="row"><button data-action="history">Attempts</button><button data-action="export">Export progress</button><button data-action="help">Help</button></div></div><div class="home-hero"><div><div class="eyebrow">${window.MOCK_TEST_DEMO ? "Demo library" : "Your practice library"}</div><h1 style="margin-top:15px">Your next practice session.</h1><p class="muted">${DATA.length} ${DATA.length === 1 ? "set" : "sets"} · ${DATA.reduce((n, t) => n + t.sections.reduce((m, s) => m + s.questions.length, 0), 0)} questions </p></div><div class="hero-count">${completed}<span>of ${DATA.length} completed</span></div></div><div class="cards">${DATA.map(
    (t) => {
      const attempts = db.attempts.filter((a) => a.test === t.id),
        last = attempts.at(-1),
        open = attempts.findLast((a) => a.status !== "done");
      return `<article class="card"><div class="row spread"><div class="setnumber">PRACTICE ${String(t.id).padStart(2, "0")}</div><span class="pill ${open ? "active" : ""}">${open ? "In progress" : last ? "Completed" : "Ready"}</span></div><h2>Test ${String(t.id).padStart(2, "0")}</h2><div class="section-track">${t.essay ? `<span>Writing · ${t.essayMinutes ?? 30}m</span>` : ""}${t.sections.map((s) => `<span>${s.label} · ${s.minutes}m</span>`).join("")}</div><div class="card-buttons">${open ? `<button class="primary" data-resume="${open.id}">Resume test</button>` : `<button class="primary" data-start="${t.id}">${last ? "New attempt" : "Start test"}</button>`}${last?.status === "done" ? `<button data-results="${last.id}">View results</button>` : open ? `<button data-start="${t.id}">New attempt</button>` : `<span class="muted" style="align-self:center">${(t.essay ? (t.essayMinutes ?? 30) : 0) + t.sections.reduce((n, s) => n + s.minutes, 0)} minutes</span>`}</div></article>`;
    },
  ).join("")}</div></main>`;
}
function historyDialog() {
  dialog(
    `<h2>Your attempts</h2>${
      db.attempts.length
        ? '<div class="stack">' +
          db.attempts
            .filter((a) => DATA.some((t) => t.id === a.test))
            .reverse()
            .map(
              (a) =>
                `<div class="row spread"><span><strong>Test ${String(a.test).padStart(2, "0")}</strong><br>${new Date(a.created).toLocaleString()} · ${a.mode === "timed" ? "Timed" : "Untimed"}</span><button ${a.status === "done" ? "data-results" : "data-resume"}="${a.id}">${a.status === "done" ? "Results" : "Resume"}</button></div>`,
            )
            .join("") +
          "</div>"
        : "<p>No attempts yet.</p>"
    }<div class="dialog-actions"><button data-action="close">Close</button></div>`,
  );
}
function startDialog(id) {
  const t = DATA.find((x) => x.id === id);
  dialog(
    `<h2>Start Test ${String(id).padStart(2, "0")}</h2><label class="radio-card"><input type="radio" name="mode" value="timed" checked><span><strong>Timed test</strong><br>Each section ends when time runs out.</span></label><label class="radio-card"><input type="radio" name="mode" value="practice"><span><strong>Untimed practice</strong><br>Work at your own pace.</span></label>${t.essay ? `<label class="radio-card"><input id="include-essay" type="checkbox" checked><span>Include writing · ${t.essayMinutes ?? 30} minutes</span></label>` : ""}<div class="section-track">${t.sections.map((s) => `<span>${s.label} · ${s.questions.length} questions</span>`).join("")}</div><div class="dialog-actions"><button data-action="close">Cancel</button><button class="primary" data-begin="${id}">Begin</button></div>`,
  );
}
function begin(id) {
  const mode = $("input[name=mode]:checked").value,
    essay = !!$("#include-essay")?.checked;
  active = {
    id: crypto.randomUUID(),
    test: id,
    mode,
    includeEssay: essay,
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
  reviewing = false;
  closeModal();
  startClock();
  save();
  renderTest();
}
function startClock() {
  active.started = Date.now();
  active.deadline =
    active.mode === "timed"
      ? Date.now() + (section()?.minutes ?? test().essayMinutes ?? 30) * 60000
      : null;
}
function resume(id) {
  active = db.attempts.find((a) => a.id === id);
  reviewing = false;
  if (!active) return;
  closeModal();
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
function renderTest() {
  screen = "test";
  closeTools();
  const s = section(),
    q = question(),
    essay = !s;
  document.title = `Test ${active.test} · ${s?.label || "Writing"} | Mock Test`;
  app.innerHTML = `<div class="test-shell"><header class="test-top"><div class="brand"><b>M</b>Mock Test <span class="sub">Test ${String(active.test).padStart(2, "0")} · ${esc(s?.title || s?.label || "Writing")}</span></div><div class="row">${reviewing ? "<strong>Answer review</strong>" : `<span id="timer" class="timer"></span><button data-action="time">${hideTime ? "Show" : "Hide"} time</button>`}<button data-action="fullscreen" aria-label="Toggle full screen">Full screen</button></div></header><div class="toolbar"><h2>${essay ? "Writing" : `${s.label} · Question ${q.number} of ${s.questions.length}`}</h2><div class="row">${s?.calculator ? '<button data-action="calculator">Calculator</button>' : ""}<button data-action="scratch">Scratchpad</button>${!essay ? `<button data-action="flag" class="${active.flags[q.id] ? "marked" : ""}" aria-pressed="${!!active.flags[q.id]}">${active.flags[q.id] ? "★ Marked" : "☆ Mark"}</button><button data-action="review">Review</button>` : ""}<button data-action="help">Help</button></div></div><div class="workspace"><main class="question-pane">${essay ? essayHTML() : q.type === "sentence" ? `<div class="sentence-layout"><div class="passage">${q.sentences.map((x, i) => `<button class="sentence ${answerValue() === letters(q.count)[i] ? "selected" : ""}" data-choice="${letters(q.count)[i]}" aria-pressed="${answerValue() === letters(q.count)[i]}" ${reviewing ? "disabled" : ""}>${esc(x)}</button> `).join("")}</div><div class="sentence-prompt">${esc(q.prompt)}</div></div>` : q.text ? textQuestion(q) : `<div class="image-frame" style="width:${zoom}%"><img class="question-image" style="max-width:${(1100 * zoom) / 100}px" src="${q.image}" alt="Test ${active.test}, ${s.label}, question ${q.number}" draggable="false"></div>`}</main>${essay ? "" : `<aside class="answer-panel">${controls(q)}</aside>`}</div><nav class="bottom-nav"><div class="row">${reviewing ? '<button data-action="results">← Results</button>' : '<button data-action="leave">Save & exit</button>'}${!essay ? `<div class="zoom-controls"><button data-zoom="-10" aria-label="Zoom out">−</button><span>${zoom}%</span><button data-zoom="10" aria-label="Zoom in">+</button></div>` : ""}</div><div class="row">${!essay ? `<button data-action="back" ${active.question === 0 ? "disabled" : ""}>← Back</button>` : ""}<button class="primary" data-action="next">${essay ? "Finish writing" : active.question === s.questions.length - 1 ? (reviewing ? "Results" : "Finish section") : "Next →"}</button></div></nav></div>`;
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
    `<h2>${s.label} · Review section</h2><div class="review-grid">${s.questions
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
    `<h2>${s ? "Finish " + s.label + "?" : "Finish writing?"}</h2><p>${missing ? `${missing} question${missing > 1 ? "s are" : " is"} unanswered. ` : ""}You cannot return to this section after finishing.</p><div class="dialog-actions"><button data-action="close">Keep working</button><button class="primary" data-action="confirm-finish">Finish section</button></div>`,
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
  screen = "between";
  const s = section();
  app.innerHTML = `<main class="center-screen"><div class="eyebrow">Test ${String(active.test).padStart(2, "0")}</div><h1 style="margin-top:22px">${active.expired ? "Time is up." : "Section complete."}</h1><p>Your answers have been saved.</p><div class="card" style="margin:32px 0"><h2>Next: ${esc(s.title || s.label)}</h2><div class="section-track"><span>${s.questions.length} questions</span><span>${active.mode === "timed" ? s.minutes + " minutes" : "Untimed"}</span></div></div><div class="row spread">${homeButton()}<button class="primary" data-action="next-section">Start ${s.label}</button></div></main>`;
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
  closeModal();
  screen = "results";
  reviewing = false;
  closeTools();
  const t = test();
  document.title = `Test ${t.id} results | Mock Test`;
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
  app.innerHTML = `<main class="results"><div class="row spread">${homeButton()}<button data-action="export-attempt">Export this attempt</button></div><div style="margin-top:40px"><div class="eyebrow">Test ${String(t.id).padStart(2, "0")} · ${active.mode === "timed" ? "Timed" : "Untimed"}</div><h1 style="margin-top:16px">${correct} of ${total} correct</h1>${excluded ? `<p class="muted">${excluded} disputed question${excluded > 1 ? "s" : ""} excluded from scoring.</p>` : ""}</div><div class="results-summary">${cards}</div><div class="row spread"><h2 style="margin:0">Review your answers</h2>${active.includeEssay ? '<button data-action="review-essay">Read your essay</button>' : ""}</div>${t.sections
    .map(
      (s, si) =>
        `<h3 style="margin-top:32px">${s.label}</h3><table><thead><tr><th>Question</th><th>Your answer</th><th>Key</th><th>Result</th></tr></thead><tbody>${s.questions
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
function help() {
  dialog(
    '<h2>Using the test</h2><p>Select answers in the panel on the right. Unlabelled choices follow their order in the question: top to bottom, or left to right across each row. Multi-blank choices restart at A in each column.</p><p>Use Mark and Review to return to questions within the current section. Numeric entries accept equivalent decimals or fractions. Click directly on the passage for sentence-selection questions.</p><p>Timed sections keep counting if you leave or close the tab. Progress saves automatically. Results show accuracy against the supplied answer key.</p><div class="dialog-actions"><button class="primary" data-action="close">Got it</button></div>',
  );
}
async function action(name) {
  switch (name) {
    case "close":
      closeModal();
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
    case "fullscreen":
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch (e) {
        notify("Use your browser’s full-screen command.");
      }
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
      if (active.mode === "timed")
        dialog(
          '<h2>Save and leave?</h2><p>Your answers are saved. The section clock will continue while you are away.</p><div class="dialog-actions"><button data-action="close">Keep working</button><button class="primary" data-action="home">Leave test</button></div>',
        );
      else {
        save();
        renderHome();
      }
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
  if (!document.hidden) updateTimer();
});
init();
