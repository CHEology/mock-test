# Mock Test

A general-purpose mock-test interface that runs locally in your browser. Plain JavaScript, CSS, and a Python standard-library server; no build step. Core practice needs no account.

- Two-level library: categories and folders, with scoped attempt tabs and a collapsible sidebar
- Anchored action menus, in-page editing, box selection, drag-to-move, and recoverable Trash
- Writing-task creation, section-specific practice copies, and JSON import/export
- Full-screen focus mode by default, with a per-test opt-out and saved Settings
- Configurable sections, timing, and optional writing tasks
- Single/multiple choice, multi-blank, numeric, fraction, and sentence-selection answers
- Mark and review, calculator, and typed/drawn scratchpad
- Local autosave, filtered attempt history, bulk deletion, export, and answer-key scoring
- Optional local Codex / Claude Code explanations, writing feedback, hints, and follow-up conversations

## Run

Requires Python 3.9+ and a modern browser.

```sh
python3 launch.py
```

This starts the local server and opens **http://127.0.0.1:17654** in Chrome on macOS when installed, or your default browser otherwise. Use `MOCK_TEST_PORT=17655 python3 launch.py` to choose another port. To run in the foreground instead, use `python3 server.py`.

The sidebar can stay pinned or auto-hide: move to the left edge to reveal it, move away to hide it, and use its corner button to pin it again. Help and Settings open in the main content area. Settings changes apply and save immediately across open tabs. Timer visibility and sidebar changes also update active views; test mode and writing defaults apply to new attempts. Settings controls default focus mode, timed/untimed mode, writing, timer visibility, and the sidebar. Focus mode uses the browser’s Fullscreen API: Esc or **Exit focus** returns to the normal window, and finishing or leaving a test exits automatically. Browser permission restrictions may prevent automatic full screen; the test still starts. Preferences are saved in this browser.

Drag a rectangle in any direction across empty space, including blank row space, to select items. Drag names, icons, or an already-selected group to move items. Clicking an item does not select it. Click elsewhere in the interface or press Escape to clear selection. Open any selected item’s “…” menu to move or trash the selected group. Drag tests and folders onto destinations in the page, breadcrumbs, or sidebar. Hold over a directory to open it during a drag; the left edge reveals the auto-hidden sidebar. Tests can live directly in a category or inside its folders.

## Add your questions

Use **Add test** inside a folder to create a writing task or import JSON tests. The import dialog includes an example file. Exported tests embed their images and can be imported on another installation. **Create a copy or practice** lets you select sections from an existing test. Trash preserves tests and their attempts until restored.

The included demo has 10 original example questions. Create `data.js` using [data.demo.js](data.demo.js) as the template. Configure each section's `label`, `minutes`, and `calculator`; add `essay` and `essayMinutes` for an optional writing task. Any number of sections is supported. Keep numeric test IDs and question IDs unique and stable.

Questions can use `text`, `labels`, and `options`, or an `image` path such as `assets/01-01.webp`. `data.js`, `assets/`, and attempts in `.progress/` stay outside Git. Results report accuracy against the supplied key; writing responses are saved without automatic grading.

## Explanations (experimental)

See the [explanation setup and usage guide](EXPLANATIONS.md) for a fresh-device walkthrough and troubleshooting.

Install and sign in to [Codex CLI](https://developers.openai.com/codex/cli/) or [Claude Code](https://code.claude.com/docs/en/quickstart) locally. In Settings → Explanations choose a channel, a High / Medium / Low model tier (default Medium), Chinese or English, and a preset prompt. Passage, question, and option quotations retain their original English wording. The CLI sends questions to its provider using your signed-in account; this is not offline inference. No API key is stored by this app.

Results have **Explain** per question and **Explain all incorrect** for answered, incorrect questions. Unanswered and disputed questions can still be explained individually. Writing tasks have **Review writing** for argument, structure, and language feedback, with **Review current draft** after edits. Conversations and follow-ups appear inline. Jobs run one at a time and can be stopped or retried. Leaving a page does not stop a submitted job.

During attempts, explanations are **Off** by default. Choose **Hints only** or **Full explanations** to enable them. Hint requests omit the supplied answer key and prior full explanations; the model is instructed to avoid giving the answer. The timer keeps running.

Conversations are saved separately per attempt, question, mode, and language in `.progress/explanations.json`. Deleting an attempt deletes its conversations and stops its jobs. Back up `.progress/` to include explanations; ordinary attempt JSON exports contain answers only. Interrupted jobs are marked for manual retry after a server restart.

The adapters attach question images directly, use isolated temporary directories, and disable shell / connector access for the tutor. On macOS, the adapter also detects Claude Code bundled with Claude Desktop. Both providers need a valid local login. Keep this feature branch on a separate port and copy of `.progress/` when experimenting.

## Keep a local copy in sync

```sh
python3 sync.py /path/to/local-copy
```

This copies the app and any local question bank without replacing saved attempts. On macOS it also creates **Mock Test.app** using the Xcode Command Line Tools. Later, run `python3 sync.py` to update the same destination; its path is stored in an ignored local configuration file.

## Test

Node.js 18+ is needed only for the JavaScript tests.

```sh
node --test tests/*.test.cjs
python3 -m unittest discover -s tests
```
