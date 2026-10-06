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

test("bulk actions preserve selection while item menus target only their own item", () => {
  const clicks = [];
  const ctx = vm.createContext({
    window: { MockTestLibrary: L, addEventListener() {} },
    document: {
      addEventListener(name, handler, capture) {
        if (name === "click") clicks.push({ handler, capture });
      },
      documentElement: { addEventListener() {} },
    },
    db: { library: L.seed([], [{ id: 1 }, { id: 2 }]), attempts: [] },
    screen: "home",
    esc: (s) => s,
  });
  vm.runInContext(
    fs.readFileSync(require.resolve("../library-ui.js"), "utf8"),
    ctx,
  );
  ctx.closeLibraryMenu = () => {};
  assert.equal(ctx.librarySelectionHTML(), "");
  vm.runInContext('librarySelection = new Set(["test-1", "test-2"])', ctx);
  const toolbar = ctx.librarySelectionHTML();
  assert.ok(toolbar.indexOf(">Move<") < toolbar.indexOf("2 selected"));
  assert.ok(toolbar.indexOf(">Delete<") < toolbar.indexOf("2 selected"));
  let menu;
  ctx.libraryContextMenu = (_, html) => {
    menu = html;
  };
  ctx.libraryItemMenu("test-1", {});
  assert.match(menu, /data-lib-delete="test-1"/);
  assert.match(menu, /data-lib-move="test-1"/);
  assert.doesNotMatch(menu, /data-lib-bulk/);
  const button = {
    dataset: { libBulk: "delete" },
    hasAttribute() {
      return false;
    },
  };
  const event = {
    target: {
      closest(selector) {
        if (selector === "button") return button;
        if (
          selector.includes("#library-selection-actions") ||
          selector === "button,input,select,textarea,a"
        )
          return button;
        return null;
      },
    },
  };
  clicks.find((c) => c.capture === true).handler(event);
  assert.equal(vm.runInContext("librarySelection.size", ctx), 2);
  let requested;
  ctx.libraryDeleteDialog = (ids) => {
    requested = [...ids];
  };
  clicks.find((c) => !c.capture).handler(event);
  assert.deepEqual(requested, ["test-1", "test-2"]);
});
