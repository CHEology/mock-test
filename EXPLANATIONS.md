# Explanations

Mock Test can ask a locally installed Codex CLI or Claude Code to explain a question or review writing, then display the reply and follow-ups inside the test interface. Text, options, images, your answer, and—for full explanations—the supplied key are included automatically.

## Set up another computer

The tutor bridge supports macOS and Linux. On Windows, run both Mock Test and the chosen CLI inside WSL; native Windows process management is not supported by this bridge. Install Python 3.9+ and use a current browser.

1. Download or clone this repository:

   ```sh
   git clone https://github.com/CHEology/mock-test.git
   cd mock-test
   ```

2. Install **one** provider using its official instructions: [Codex CLI](https://developers.openai.com/codex/cli/) or [Claude Code](https://code.claude.com/docs/en/quickstart). Install it under the same OS user that runs Mock Test. On macOS, Mock Test also detects the Claude Code executable bundled with Claude Desktop once Desktop has downloaded it. You do not need a second installation if it is detected. A signed-in website alone does not install or authenticate the CLI.

3. Sign in locally and check the installation. For Codex:

   ```sh
   codex --version
   codex login
   codex login status
   ```

   For Claude Code:

   ```sh
   claude --version
   claude auth login
   claude auth status
   ```

4. Start Mock Test from the project directory:

   ```sh
   python3 launch.py
   ```

   The browser opens at `http://127.0.0.1:17654`. If that port is already used, run `MOCK_TEST_PORT=17655 python3 launch.py` instead. In WSL, use `python3 server.py` and open the address manually if browser launching is unavailable.

5. Open **Settings → Explanations**. Choose the installed channel. Choose a **Model tier**: High, Medium (default), or Low. Select **中文** or **English**, and edit **Preset prompt** if wanted. Changes save immediately.

The repository includes original demo questions for a first try. Personal question banks, saved attempts, and provider credentials are not included. Import your own tests through **Add test**.

## Model tiers

| Tier | Codex | Claude Code |
| --- | --- | --- |
| High | Latest available Astra family; high reasoning | Opus |
| Medium | Latest available Sol family; medium reasoning | Sonnet |
| Low | Latest available Luna family; low reasoning | Haiku |

Codex reads the model catalog cached by your local CLI. If a family is absent, it uses the CLI default model with the selected reasoning effort. Claude aliases resolve through Claude Code. Available models depend on your account; tiers do not override access or usage limits. A new selection applies to the next request, including follow-ups.

## Use it

The **Explanations** switch in Settings is on by default. Turn it off to hide explanation, hint, writing-feedback, and follow-up controls everywhere, including open tabs in the same browser. Its detailed settings collapse. Saved conversations and preferences remain available when you turn it back on; previously submitted requests may finish in the background.

- **Results / answer review:** click **Explain** for one question, or **Explain incorrect & unanswered** for wrong and unanswered questions. Disputed questions are available individually.
- **Writing:** click **Review writing** on results or during an enabled attempt. Feedback covers argument, evidence, structure, and language; no numeric score is invented without a rubric. Use **Review current draft** after editing, or ask a follow-up. Hints only gives one suggestion rather than rewriting your essay. An empty draft receives planning guidance.
- **Follow-ups:** type below an explanation and click **Send**. The question and that conversation accompany the next request.
- **During attempts:** the default is **Off**. Choose **Hints only** or **Full explanations** in Settings to show the corresponding button. The timer continues running.
- **Language:** explanatory prose follows your selection. Passages, question statements, and option text are quoted in their original English, without translated replacements or parenthetical translations. Each language has its own conversation; switching back restores earlier replies. Changing language does not rewrite saved replies or jobs already submitted.
- **Preset prompt:** controls style and emphasis. Language, original-source wording, and hints-only rules take precedence over conflicting preset instructions. Model replies can still make mistakes.
- **Stop / retry:** jobs run one at a time. **Stop** cancels the current question; **Stop all** cancels pending explanations for this attempt. Closing the panel or leaving the page does not cancel jobs. A stopped or failed job has a **Retry** button.

Hint requests omit the supplied key, correctness status, and supplied explanation, and use a separate conversation from full explanations. Models are instructed to give guidance without revealing the final answer.

## Storage and moving devices

Answers and library organization are in `.progress/progress.json`. Tutor conversations are in `.progress/explanations.json`, separated by attempt, question or writing task, mode, and language. Deleting an attempt also deletes its conversations and stops its jobs. Ordinary attempt JSON exports contain answers only.

For a complete move, stop the app's server and copy the `.progress/` directory plus any private `data.js` and `assets/` into a fresh project copy. Do not overwrite a destination with existing work without backing it up. Browser settings must be selected again, and each CLI must be installed and signed in on the new computer. Do not copy credentials into this repository. These files are ignored by Git.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| Channel says “not installed” | Confirm `codex --version` or `claude --version` works in the terminal that starts Mock Test. Restart the server after installing. On macOS, starting with `python3 launch.py` also avoids a GUI app's limited PATH. |
| Claude Code sign-in expired | Run `claude auth login` again, even if `claude auth status` says logged in. If using only Desktop’s bundled CLI, invoke that executable with `auth login`; its path is under `~/Library/Application Support/Claude/claude-code/<version>/<build>/claude.app/Contents/MacOS/claude`. |
| The local tool could not finish | Check login with the commands above, select Medium, and check account limits. Use current CLI versions; older releases may lack required flags. |
| Thinking takes too long | The app stops a request after five minutes. Retry, or select Low or another channel. |
| Server stopped during a reply | Restart the server, reopen the question, and click Retry. Finished replies remain saved. |
| The explanation says material is missing | Make sure the question includes its passage, diagram, and all options. Local image paths must be inside `assets/`; imported embedded images also work. |
| No Explain / Hint button while answering | Enable a mode under During attempts. Writing uses Hint or Review writing. |

The CLI sends the selected material to its provider through its existing authentication, so provider account limits and billing apply. Inference is not offline. The app stores no API key, listens only on the local computer, and does not automatically send your library. Codex runs read-only with shell, browser-search, and connector integrations disabled; Claude runs with tools disabled. Live Codex text, image, follow-up, and writing flows have been checked on macOS; Claude writing feedback, hints, and follow-ups have also been checked. Claude Code is detected from PATH, common installation directories, and versioned macOS Desktop bundles.
