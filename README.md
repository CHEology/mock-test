# Mock Test

A general-purpose mock-test interface that runs locally in your browser. Plain JavaScript, CSS, and a Python standard-library server; no account or build step.

- Configurable sections, timing, and optional writing tasks
- Single/multiple choice, multi-blank, numeric, fraction, and sentence-selection answers
- Mark and review, calculator, and typed/drawn scratchpad
- Local autosave, attempt history, export, and answer-key scoring

## Run

Requires Python 3 and a modern browser.

```sh
python3 launch.py
```

This starts the local server and opens **http://127.0.0.1:17654** in Chrome on macOS when installed, or your default browser otherwise. Use `MOCK_TEST_PORT=17655 python3 launch.py` to choose another port. To run in the foreground instead, use `python3 server.py`.

## Add your questions

The included demo has 10 original example questions. Create `data.js` using [data.demo.js](data.demo.js) as the template. Configure each section's `label`, `minutes`, and `calculator`; add `essay` and `essayMinutes` for an optional writing task. Any number of sections is supported. Keep numeric test IDs and question IDs unique and stable.

Questions can use `text`, `labels`, and `options`, or an `image` path such as `assets/01-01.webp`. `data.js`, `assets/`, and attempts in `.progress/` stay outside Git. Results report accuracy against the supplied key; writing responses are saved without automatic grading.

## Keep a local copy in sync

```sh
python3 sync.py /path/to/local-copy
```

This copies the app and any local question bank without replacing saved attempts. On macOS it also creates **Mock Test.app** using the Xcode Command Line Tools. Later, run `python3 sync.py` to update the same destination; its path is stored in an ignored local configuration file.

## Test

Node.js 18+ is needed only for the JavaScript tests.

```sh
node --test tests/core.test.cjs
python3 -m unittest discover -s tests
```
