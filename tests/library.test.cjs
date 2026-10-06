const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../library.js");
const C = require("../core.js");
const initial = () => L.seed([], [{ id: 1, sections: [] }]);
test("migration keeps stable IDs and never restores a deleted built-in test", () => {
  let records = initial();
  records = L.remove(records, ["test-1"], 10);
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
test("deleting a category removes descendants while preserving data for saved attempts", () => {
  const original = initial(),
    records = L.remove(original, ["category-default"], 20);
  assert.ok(records.every((r) => r.deleted));
  assert.ok(records.every((r) => !L.visible(records, r)));
  assert.equal(records.find((r) => r.id === "test-1").testId, 1);
  assert.ok(original.every((r) => !r.deleted));
  assert.throws(() => L.move(records, ["test-1"], "folder-writing"));
});
test("a newer stale rename cannot resurrect a deleted test in either merge order", () => {
  const removed = {
    version: 1,
    library: L.remove(initial(), ["test-1"], 20),
    attempts: [],
  };
  const stale = {
    version: 1,
    library: initial().map((r) => ({ ...r, updated: 999 })),
    attempts: [],
  };
  for (const states of [
    [removed, stale],
    [stale, removed],
  ]) {
    const merged = C.mergeState(...states);
    assert.equal(merged.library.find((r) => r.id === "test-1").deleted, true);
  }
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
  assert.equal(
    L.move(records, ["test-1"], "cat2").find((r) => r.id === "test-1").parent,
    "cat2",
  );
  assert.throws(() => L.move(records, ["folder-default"], "folder2"));
  assert.throws(() => L.move(records, ["category-default"], "cat2"));
  assert.throws(() =>
    L.move(L.remove(records, ["cat2"]), ["test-1"], "folder2"),
  );
});
test("library changes merge independently and old clients cannot undo deletion", () => {
  const base = {
    version: 1,
    attempts: [{ id: "answer", test: 1, answers: { q: "A" } }],
    library: initial(),
  };
  const renamed = initial().map((r) =>
    r.id === "folder-default" ? { ...r, name: "Renamed", updated: 20 } : r,
  );
  const trashed = L.remove(initial(), ["test-1"], 30);
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
  assert.equal(merged.library.find((r) => r.id === "test-1").deleted, true);
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

test("category and folder scopes isolate their tests, including saved history of trashed items", () => {
  const records = [
    ...initial(),
    { id: "writing-1", kind: "test", testId: 2, parent: "folder-writing" },
    { id: "other-category", kind: "category", name: "Other" },
    { id: "other-folder", kind: "folder", parent: "other-category" },
    { id: "other-test", kind: "test", testId: 3, parent: "other-folder" },
  ];
  assert.deepEqual([...L.testIds(records, "category-default")].sort(), [1, 2]);
  assert.deepEqual([...L.testIds(records, "folder-default")], [1]);
  assert.deepEqual([...L.testIds(records, "folder-writing")], [2]);
  assert.deepEqual([...L.testIds(records, "other-category")], [3]);
  assert.deepEqual([...L.testIds(records, "all")].sort(), [1, 2, 3]);
  assert.equal(L.testIds(records, "missing").size, 0);
  const moved = L.move(records, ["test-1"], "other-folder", 100);
  assert.deepEqual([...L.testIds(moved, "category-default")], [2]);
  assert.deepEqual([...L.testIds(moved, "other-category")].sort(), [1, 3]);
  const trashed = L.remove(records, ["test-1"], 200);
  assert.deepEqual([...L.testIds(trashed, "folder-default")], [1]);
});

test("parent-directory moves preserve test identity and category attempt scope", () => {
  const records = initial();
  const moved = L.move(records, ["test-1"], "category-default", 55);
  assert.deepEqual([...L.testIds(moved, "category-default")], [1]);
  assert.deepEqual([...L.testIds(moved, "folder-default")], []);
  assert.equal(moved.find((r) => r.id === "test-1").testId, 1);
  assert.equal(records.find((r) => r.id === "test-1").parent, "folder-default");
  assert.throws(() => L.move(records, ["folder-default"], "folder-default"));
  assert.throws(() =>
    L.move(records, ["test-1", "folder-default"], "folder-writing"),
  );
});

test("bulk moves are atomic and retain descendant test scope", () => {
  const records = [
    ...initial(),
    { id: "other", kind: "category", name: "Other" },
  ];
  const moved = L.move(
    records,
    ["folder-default", "folder-writing"],
    "other",
    80,
  );
  assert.deepEqual([...L.testIds(moved, "other")], [1]);
  assert.equal(moved.find((r) => r.id === "test-1").parent, "folder-default");
  assert.deepEqual([...L.testIds(records, "category-default")], [1]);
  assert.throws(() => L.move(records, ["folder-default", "missing"], "other"));
  assert.equal(
    records.find((r) => r.id === "folder-default").parent,
    "category-default",
  );
});
