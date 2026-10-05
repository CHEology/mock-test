const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const C = require("../core.js");

test("numeric grading accepts equivalent values and rejects invalid entries", () => {
  assert.equal(C.grade({ type: "numeric", key: "3.5" }, "3.50"), true);
  assert.equal(C.grade({ type: "fraction", key: "2/5" }, ["4", "10"]), true);
  for (const input of ["", "words", "1/0"])
    assert.equal(C.grade({ type: "numeric", key: "0" }, input), false);
  assert.equal(C.grade({ type: "fraction", key: "2/5" }, ["2", "0"]), false);
});

test("multi-select requires the full set; blank order matters", () => {
  assert.equal(C.grade({ type: "multi", key: "AC" }, ["C", "A"]), true);
  assert.equal(C.grade({ type: "multi", key: "AC" }, ["A"]), false);
  assert.equal(C.grade({ type: "multi", key: "AC" }, ["A", "B", "C"]), false);
  assert.equal(
    C.grade({ type: "blanks", count: 2, key: "BA" }, ["B", "A"]),
    true,
  );
  assert.equal(
    C.grade({ type: "blanks", count: 2, key: "BA" }, ["A", "B"]),
    false,
  );
  assert.equal(C.answered({ type: "blanks", count: 2 }, ["B", ""]), false);
});

test("disputed questions remain unscored even if unanswered", () => {
  assert.equal(
    C.grade({ type: "single", key: "A", disputed: true }, "A"),
    null,
  );
  assert.equal(
    C.grade({ type: "single", key: "A", disputed: true }, undefined),
    null,
  );
});

test("calculator evaluates arithmetic without evaluating JavaScript", () => {
  assert.equal(C.calculate("(3+4)*5-6/2"), 32);
  assert.equal(C.calculate("−2".replace("−", "-")), -2);
  for (const value of ["1/0", "process.exit()", "(1+2", "2..3"])
    assert.throws(() => C.calculate(value));
});

test("demo includes every answer type with valid answer keys", () => {
  const context = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../data.demo.js"), "utf8"),
    context,
  );
  const bank = JSON.parse(JSON.stringify(context.window.MOCK_TEST_DATA));
  const questions = bank.flatMap((t) => t.sections.flatMap((s) => s.questions));
  assert.equal(questions.length, 10);
  assert.equal(new Set(questions.map((q) => q.id)).size, 10);
  assert.equal(new Set(questions.map((q) => q.type)).size, 6);
  for (const q of questions) {
    const answer = ["multi", "blanks"].includes(q.type)
      ? q.key.split("")
      : q.type === "fraction"
        ? q.key.split("/")
        : q.key;
    assert.equal(C.grade(q, answer), true, q.id);
  }
});

test("deleted attempt IDs cannot return from a stale tab, even with a later timestamp", () => {
  const merged = C.mergeState(
    { version: 1, updated: 100, attempts: [], deleted: { old: 100 } },
    {
      version: 1,
      updated: 200,
      attempts: [
        { id: "old", updated: 200, answers: { q: "A" } },
        { id: "new", updated: 200 },
      ],
    },
  );
  assert.deepEqual(
    merged.attempts.map((a) => a.id),
    ["new"],
  );
  assert.equal(merged.deleted.old, 100);
});

test("state merging keeps independent attempts and the newest revision", () => {
  const merged = C.mergeState(
    {
      version: 1,
      updated: 20,
      attempts: [{ id: "a", updated: 20, answers: { q: "B" } }],
      deleted: { x: 10 },
    },
    {
      version: 1,
      updated: 30,
      attempts: [
        { id: "a", updated: 10, answers: {} },
        { id: "b", updated: 30 },
      ],
      deleted: { y: 30 },
    },
  );
  assert.deepEqual(merged.attempts.find((a) => a.id === "a").answers, {
    q: "B",
  });
  assert.equal(merged.attempts.length, 2);
  assert.deepEqual(Object.keys(merged.deleted).sort(), ["x", "y"]);
});

test("test preferences default to focus mode and preserve explicit opt-outs", () => {
  assert.deepEqual(C.preferences(), {
    focusMode: true,
    mode: "timed",
    includeWriting: true,
    showTimer: true,
  });
  assert.deepEqual(
    C.preferences({
      focusMode: false,
      mode: "practice",
      includeWriting: false,
      showTimer: false,
    }),
    {
      focusMode: false,
      mode: "practice",
      includeWriting: false,
      showTimer: false,
    },
  );
  assert.deepEqual(
    C.preferences({
      focusMode: "false",
      mode: "invalid",
      includeWriting: null,
      showTimer: 0,
    }),
    C.preferences(),
  );
  assert.deepEqual(C.preferences(null), C.preferences());
});
