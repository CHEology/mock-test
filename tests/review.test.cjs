const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const C = require("../core.js");
function setup() {
  const app = { innerHTML: "" },
    modal = { open: false, close() {} };
  const timer = { textContent: "", classList: { toggle() {} } };
  const q = (id) => ({
    id,
    number: +id.slice(1),
    type: "single",
    key: "B",
    text: "Original question",
    labels: ["First", "Second"],
  });
  const data = [
    {
      id: 1,
      sections: [
        { label: "Reading", minutes: 1, questions: [q("q1"), q("q2")] },
        { label: "Math", minutes: 1, questions: [q("q3")] },
      ],
    },
  ];
  const ctx = vm.createContext({
    window: { MockTestCore: C, MOCK_TEST_DATA: data, addEventListener() {} },
    document: {
      querySelector: (s) =>
        s === "#app"
          ? app
          : s === "#modal"
            ? modal
            : s === "#timer"
              ? timer
              : null,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    localStorage: {
      getItem() {
        return null;
      },
    },
    setInterval() {},
    setTimeout() {},
    clearTimeout() {},
    console,
  });
  vm.runInContext(
    fs
      .readFileSync(require.resolve("../app.js"), "utf8")
      .replace(/init\(\);\s*$/, ""),
    ctx,
  );
  vm.runInContext(
    `active={id:'attempt',test:1,status:'running',section:0,question:1,mode:'timed',started:Date.now()-5000,deadline:Date.now()+55000,answers:{q1:'A'},flags:{q2:true},times:{}};`,
    ctx,
  );
  ctx.focusButton = () => "";
  ctx.testName = () => "Test";
  ctx.save = () => {};
  return { ctx, app, timer, read: (s) => vm.runInContext(s, ctx) };
}
test("section review shows completion and marks without grading or advancing; returning preserves the clock", () => {
  const { ctx, app, read } = setup();
  const deadline = read("active.deadline");
  ctx.finishDialog();
  assert.match(app.innerHTML, /1 answered · 1 unanswered · 1 marked/);
  assert.match(app.innerHTML, /data-jump="1"/);
  assert.match(app.innerHTML, /Confirm finish/);
  assert.doesNotMatch(app.innerHTML, /Correct|Incorrect|Correct answer/);
  assert.equal(read("active.section"), 0);
  assert.equal(read("active.status"), "running");
  let returned = 0;
  ctx.renderTest = () => returned++;
  ctx.action("return-section");
  assert.equal(returned, 1);
  assert.equal(read("active.deadline"), deadline);
  ctx.renderBetween = () => {};
  ctx.action("confirm-finish");
  assert.equal(read("active.section"), 1);
  assert.equal(read("active.status"), "between");
  assert.equal(read("active.answers.q1"), "A");
});
test("time expiry still finishes while reviewing, including the last section", () => {
  const { ctx, read } = setup();
  ctx.renderResults = () => {};
  vm.runInContext(
    `active.section=1; active.deadline=Date.now()-1000; screen='section-review';`,
    ctx,
  );
  ctx.updateTimer();
  assert.equal(read("active.status"), "done");
  assert.equal(read("active.expired"), true);
});
test("question-only previews keep original options but exclude supplied explanations", () => {
  const { ctx } = setup();
  const html = ctx.resultQuestionHTML({
    text: "Choose the word.",
    labels: ["alpha", "beta"],
    explanation: "DO NOT SHOW",
  });
  assert.match(html, /Choose the word/);
  assert.match(html, /alpha/);
  assert.match(html, /beta/);
  assert.doesNotMatch(html, /DO NOT SHOW/);
});
test("question and explanation toggles are independent and operate only on the selected row", () => {
  const { ctx, read } = setup();
  const question = {
    innerHTML: "",
    hasChildNodes() {
      return !!this.innerHTML;
    },
  };
  const row = { hidden: true, dataset: {}, querySelector: () => question };
  const button = () => ({
      textContent: "",
      attrs: {},
      setAttribute(k, v) {
        this.attrs[k] = v;
      },
    }),
    plain = button(),
    explain = button();
  ctx.document.querySelector = (s) =>
    s.startsWith("#result-detail")
      ? row
      : s.startsWith("[data-result-question")
        ? plain
        : s.startsWith("[data-ai-position")
          ? explain
          : null;
  let closes = 0;
  ctx.AI = {
    closeResult() {
      closes++;
    },
    mount() {},
  };
  vm.runInContext(`screen='results';active.status='done'`, ctx);
  assert.equal(ctx.toggleResultQuestion(0, 0), true);
  assert.equal(row.dataset.mode, "question");
  assert.equal(explain.attrs["aria-expanded"], "false");
  assert.equal(ctx.toggleResultQuestion(0, 0, true), true);
  assert.equal(row.dataset.mode, "explanation");
  assert.equal(ctx.toggleResultQuestion(0, 0), true);
  assert.equal(row.dataset.mode, "question");
  assert.equal(ctx.toggleResultQuestion(0, 0), false);
  assert.equal(row.hidden, true);
  assert.equal(closes, 4);
  assert.equal(read("active.answers.q1"), "A");
});

test("results keep question previews for correct and incorrect answers with explanations disabled", () => {
  const { ctx, app } = setup();
  ctx.AI = {
    reset() {},
    slot() {
      return "";
    },
    mount() {},
  };
  ctx.leaveFocusMode = () => {};
  vm.runInContext(
    "settings.aiEnabled=false;active.status='done';active.answers.q1='B';active.answers.q2='A'",
    ctx,
  );
  ctx.renderResults();
  assert.match(app.innerHTML, /Correct/);
  assert.match(app.innerHTML, /Incorrect/);
  assert.equal((app.innerHTML.match(/data-result-question=/g) || []).length, 3);
  assert.doesNotMatch(app.innerHTML, /data-ai=/);
});
