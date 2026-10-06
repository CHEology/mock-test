const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const L = require("../library.js");

test("library deletion changes nothing until confirmation, then preserves saved attempts", () => {
  const button = {};
  let markup = "",
    commits = 0;
  const ctx = vm.createContext({
    window: { MockTestLibrary: L, addEventListener() {} },
    document: {
      addEventListener() {},
      documentElement: { addEventListener() {} },
    },
    db: {
      library: L.seed([], [{ id: 1 }, { id: 2 }]),
      attempts: [{ id: "saved", test: 1 }],
    },
    $: () => button,
    esc: (s) => s,
    dialog: (html) => {
      markup = html;
    },
    notify() {},
  });
  vm.runInContext(
    fs.readFileSync(require.resolve("../library-ui.js"), "utf8"),
    ctx,
  );
  ctx.closeLibraryMenu = () => {};
  ctx.libraryCommit = () => {
    commits++;
  };
  ctx.libraryDeleteDialog(["folder-default"]);
  assert.match(markup, /Delete Full tests\?/);
  assert.match(markup, /Everything inside/);
  assert.match(markup, /Cancel/);
  assert.equal(commits, 0);
  assert.ok(ctx.db.library.every((r) => !r.deleted));
  button.onclick();
  assert.equal(commits, 1);
  for (const id of ["folder-default", "test-1", "test-2"])
    assert.equal(ctx.db.library.find((r) => r.id === id).deleted, true);
  assert.equal(ctx.db.attempts[0].id, "saved");
  assert.equal(
    ctx.db.library.find((r) => r.id === "category-default").deleted,
    false,
  );
});
