const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const sandbox = vm.createContext({
  setInterval() {},
  document: { addEventListener() {} },
});
vm.runInContext(fs.readFileSync(require.resolve("../ai.js"), "utf8"), sandbox);
const AI = vm.runInContext("AI", sandbox);
test("hint requests omit keys and supplied explanations before leaving the browser", () => {
  const q = {
    id: "q1",
    text: "Choose",
    type: "single",
    labels: ["one", "two"],
    image: "assets/q.webp",
    key: "B",
    explanation: "two",
    disputed: true,
  };
  const attempt = { answers: { q1: "A" } };
  const hint = AI.context(q, { label: "Reading" }, attempt, "hint");
  assert.equal(hint.answer, "A");
  assert.equal(hint.image, "assets/q.webp");
  for (const key of ["key", "explanation", "disputed"])
    assert.equal(Object.hasOwn(hint, key), false);
  const full = AI.context(q, { label: "Reading" }, attempt, "full");
  assert.equal(full.key, "B");
  assert.equal(full.disputed, true);
});

test("writing context captures the current draft without a multiple-choice key", () => {
  const q = {
    id: "@writing",
    task: "writing",
    text: "Discuss parks",
    key: "none",
  };
  const out = AI.context(q, {}, { essay: "My current draft" }, "full");
  assert.equal(out.prompt, "Discuss parks");
  assert.equal(out.response, "My current draft");
  assert.equal(out.task, "writing");
  assert.equal(Object.hasOwn(out, "key"), false);
});

test("master switch hides every test-mode entry and skips provider discovery", async () => {
  sandbox.settings = { aiEnabled: false, aiDuring: "full" };
  sandbox.fetch = () => {
    throw Error("Disabled explanations must not query providers");
  };
  for (const status of ["done", "running"]) {
    for (const section of [-1, 0]) {
      sandbox.active = { status, section };
      assert.equal(AI.button(), "");
      assert.equal(AI.slot(), "");
    }
  }
  await AI.providers();
  sandbox.settings.aiEnabled = true;
  assert.match(AI.button(), /Explain/);
  sandbox.active.section = -1;
  assert.match(AI.button(), /Review writing/);
  sandbox.settings.aiDuring = "hint";
  assert.match(AI.button(), /Hint/);
});

test("batch explanations include wrong and unanswered questions, excluding correct and disputed", () => {
  sandbox.C = require("../core.js");
  const q = (id, extra = {}) => ({
    id,
    type: "single",
    count: 2,
    key: "B",
    ...extra,
  });
  const t = {
    sections: [
      {
        questions: [
          q("wrong"),
          q("blank"),
          q("correct"),
          q("disputed", { disputed: true }),
        ],
      },
    ],
  };
  const a = { answers: { wrong: "A", correct: "B", disputed: "A" } };
  assert.equal(
    JSON.stringify(AI.incorrectQuestions(t, a)),
    JSON.stringify([
      [0, 0],
      [0, 1],
    ]),
  );
  assert.equal(AI.incorrectQuestions(t, { answers: {} }).length, 3);
});
