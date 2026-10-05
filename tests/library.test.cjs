const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../library.js");
const C = require("../core.js");
const initial = () => L.seed([], [{ id: 1, sections: [] }]);
test("migration keeps stable IDs and never restores a trashed built-in test", () => {
  let records = initial();
  records = L.trash(records, ["test-1"], 10);
  records.find((r) => r.id === "category-default").name = "My category";
  const again = L.seed(records, [{ id: 1 }, { id: 2 }]);
  assert.equal(again.filter((r) => r.id === "test-1").length, 1);
  assert.equal(
    L.visible(
      again,
      again.find((r) => r.id === "test-1"),
    ),
    false,
  );
  assert.equal(
    again.find((r) => r.id === "category-default").name,
    "My category",
  );
  assert.equal(again.filter((r) => r.kind === "test").length, 2);
});
test("trash hides descendants and restore recovers ancestry without altering tests", () => {
  const original = initial(),
    records = L.trash(original, ["category-default"], 20);
  assert.equal(
    L.visible(
      records,
      records.find((r) => r.id === "test-1"),
    ),
    false,
  );
  const restored = L.restore(records, ["test-1"], 30);
  assert.equal(
    L.visible(
      restored,
      restored.find((r) => r.id === "test-1"),
    ),
    true,
  );
  assert.equal(restored.find((r) => r.id === "test-1").testId, 1);
});
test("moving tests and folders enforces exactly two organization tiers", () => {
  const records = [
    ...initial(),
    { id: "cat2", kind: "category", name: "Other", updated: 1 },
    {
      id: "folder2",
      kind: "folder",
      name: "Writing",
      parent: "cat2",
      updated: 1,
    },
  ];
  const moved = L.move(records, ["test-1"], "folder2", 30);
  assert.equal(moved.find((r) => r.id === "test-1").parent, "folder2");
  assert.throws(() => L.move(records, ["test-1"], "cat2"));
  assert.throws(() => L.move(records, ["folder-default"], "folder2"));
  assert.throws(() => L.move(records, ["category-default"], "cat2"));
  assert.throws(() =>
    L.move(L.trash(records, ["cat2"]), ["test-1"], "folder2"),
  );
});
test("library changes merge independently and old clients cannot undo trash", () => {
  const base = {
    version: 1,
    attempts: [{ id: "answer", test: 1, answers: { q: "A" } }],
    library: initial(),
  };
  const renamed = initial().map((r) =>
    r.id === "folder-default" ? { ...r, name: "Renamed", updated: 20 } : r,
  );
  const trashed = L.trash(initial(), ["test-1"], 30);
  const merged = C.mergeState(
    base,
    { ...base, library: renamed },
    { ...base, library: trashed },
    base,
  );
  assert.equal(
    merged.library.find((r) => r.id === "folder-default").name,
    "Renamed",
  );
  assert.equal(merged.library.find((r) => r.id === "test-1").trashed, true);
  assert.deepEqual(merged.attempts[0].answers, { q: "A" });
});
test("imports accept writing-only tests and reject broken questions or remote images", () => {
  assert.equal(
    L.validateTest({
      essay: "Explain your view.",
      essayMinutes: 20,
      sections: [],
    }).sections.length,
    0,
  );
  const make = () => ({
    sections: [
      {
        label: "Section",
        minutes: 10,
        questions: [
          {
            id: "q",
            type: "single",
            count: 2,
            key: "A",
            text: "Choose.",
            labels: ["Yes", "No"],
          },
        ],
      },
    ],
  });
  assert.equal(L.validateTest(make()).sections[0].questions[0].number, 1);
  for (const mutate of [
    (t) => (t.sections[0].minutes = 0),
    (t) => (t.sections[0].questions[0].key = "Z"),
    (t) => (t.sections[0].questions[0].image = "https://example.com/tracker"),
    (t) => t.sections[0].questions.push({ ...t.sections[0].questions[0] }),
  ]) {
    const t = make();
    mutate(t);
    assert.throws(() => L.validateTest(t));
  }
  assert.throws(() => L.validateTest({ sections: [] }));
});
