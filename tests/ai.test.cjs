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
