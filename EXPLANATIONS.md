# Explanations

Mock Test can ask a locally installed Codex CLI or Claude Code to explain a question, then display the reply and follow-ups inside the test interface. Text, options, images, your answer, and—for full explanations—the supplied key are included automatically.

## Set up another computer

The tutor bridge supports macOS and Linux. On Windows, run both Mock Test and the chosen CLI inside WSL; native Windows process management is not supported by this bridge. Install Python 3.9+ and use a current browser.

1. Download or clone this repository. While the feature is experimental, select the `codex/features-ai-explanations` branch before downloading, or clone it directly:

   ```sh
   git clone --branch codex/features-ai-explanations https://github.com/CHEology/mock-test.git
   cd mock-test
   ```

2. Install **one** provider using its official instructions: [Codex CLI](https://developers.openai.com/codex/cli/) or [Claude Code](https://code.claude.com/docs/en/quickstart). Install it under the same OS user that runs Mock Test. A signed-in website alone does not install or authenticate the CLI.

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

5. Open **Settings → Explanations**. Choose the installed channel. Leave **Model** blank initially; it uses the adapter's default model. You can enter a model ID or alias accepted by your account's CLI later. Select **中文** or **English**, and edit **Preset prompt** if wanted. Changes save immediately.

The repository includes original demo questions for a first try. Personal question banks, saved attempts, and provider credentials are not included. Import your own tests through **Add test**.

## Use it

- **Results / answer review:** click **Explain** for one question, or **Explain all incorrect** for all answered mistakes. Unanswered and disputed questions are available individually.
- **Follow-ups:** type below an explanation and click **Send**. The question and that conversation accompany the next request.
- **During attempts:** the default is **Off**. Choose **Hints only** or **Full explanations** in Settings to show the corresponding button. The timer continues running.
- **Language:** explanatory prose follows your selection. Passages, question statements, and option text are quoted in their original English, without translated replacements or parenthetical translations. Each language has its own conversation; switching back restores earlier replies. Changing language does not rewrite saved replies or jobs already submitted.
- **Preset prompt:** controls style and emphasis. Language, original-source wording, and hints-only rules take precedence over conflicting preset instructions. Model replies can still make mistakes.
- **Stop / retry:** jobs run one at a time. **Stop** cancels the current question; **Stop all** cancels pending explanations for this attempt. Closing the panel or leaving the page does not cancel jobs. A stopped or failed job has a **Retry** button.

Hint requests omit the supplied key, correctness status, and supplied explanation, and use a separate conversation from full explanations. Models are instructed to give guidance without revealing the final answer.

## Storage and moving devices

Answers and library organization are in `.progress/progress.json`. Tutor conversations are in `.progress/explanations.json`, separated by attempt, question, mode, and language. Deleting an attempt also deletes its conversations and stops its jobs. Ordinary attempt JSON exports contain answers only.

For a complete move, stop the app's server and copy the `.progress/` directory plus any private `data.js` and `assets/` into a fresh project copy. Do not overwrite a destination with existing work without backing it up. Browser settings must be selected again, and each CLI must be installed and signed in on the new computer. Do not copy credentials into this repository. These files are ignored by Git.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| Channel says “not installed” | Confirm `codex --version` or `claude --version` works in the terminal that starts Mock Test. Restart the server after installing. On macOS, starting with `python3 launch.py` also avoids a GUI app's limited PATH. |
| The local tool could not finish | Check login with the commands above, try a blank Model field, and check account limits. Use current CLI versions; older releases may lack required flags. |
| Thinking takes too long | The app stops a request after five minutes. Retry, or select another available model. |
| Server stopped during a reply | Restart the server, reopen the question, and click Retry. Finished replies remain saved. |
| The explanation says material is missing | Make sure the question includes its passage, diagram, and all options. Local image paths must be inside `assets/`; imported embedded images also work. |
| No Explain / Hint button while answering | Enable a mode under During attempts. Writing responses do not currently have a tutor entry. |

The CLI sends the selected material to its provider through its existing authentication, so provider account limits and billing apply. Inference is not offline. The app stores no API key, listens only on the local computer, and does not automatically send your library. Codex runs read-only with shell, browser-search, and connector integrations disabled; Claude runs with tools disabled. Live Codex text, image, and follow-up flows have been checked on macOS. Claude's adapter has protocol tests, but still needs a live check on a machine with Claude Code installed.
