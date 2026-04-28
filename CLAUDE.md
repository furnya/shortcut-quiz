# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run compile        # type-check + lint + build (dev)
npm run package        # type-check + lint + build (minified, for publishing)
npm run watch          # parallel watch: esbuild + tsc type-checking
npm run check-types    # tsc --noEmit only
npm run lint           # eslint src/
npm run test           # run vscode-test suite (requires compile-tests first)
```

There is no way to run a single test file in isolation — `vscode-test` always runs the full suite.

To run the extension in a development VS Code instance, first build it, then launch the Extension Development Host:

```bash
npm run compile
code --extensionDevelopmentPath=$(pwd)
# or with a clean temporary profile:
code --profile-temp --extensionDevelopmentPath=$(pwd)
```

Alternatively, press **F5** inside VS Code (uses `.vscode/launch.json`, which compiles first via the `compile` pre-launch task).

## Architecture

This is a VS Code extension (`src/extension.ts` is the entry point). It has **two separate compilation targets**:

| Target | Entry | Output | Format | Runtime |
|---|---|---|---|---|
| Extension host | `src/extension.ts` | `dist/extension.js` | CJS | Node (VS Code API) |
| Webview UI | `src/quiz/index.tsx` | `dist/quiz/index.js` | ESM | Browser-like (WebviewPanel) |

Both are built by `esbuild.js`. The webview UI uses **Preact** with `htm`-style JSX (`.tsx` files).

### Extension host modules

- **`src/extension.ts`** — activates the extension, sets up the periodic quiz interval (checks every 30s whether it's time to show a quiz based on `shortcutQuiz.quizInterval`).
- **`src/shortcuts/shortcuts.ts`** — loads shortcuts from three sources (merged in order): `data/default_shortcuts.json`, all installed VS Code extensions' `contributes.keybindings`, and the user's `keybindings.json`. The `ShortcutLoadManager` class handles merging, key normalization, conflict resolution, and grouping. Persisted to `context.globalState` under the key `shortcuts`.
- **`src/quiz/quiz_setup.ts`** — manages the `WebviewPanel` lifecycle, selects questions based on `quizSelection` config (lowest_score / random / mixed), communicates with the webview via `postMessage` / `onDidReceiveMessage`. Also manages the optional playground editor (a side-by-side TypeScript file from `data/typescript_sample.ts`).
- **`src/tree_view/`** — two `TreeDataProvider` implementations (`ShortcutActiveTreeDataProvider` / `ShortcutInactiveTreeDataProvider`) for the sidebar panel, sharing the abstract `SCTProvider` base class.

### Webview UI (`src/quiz/index.tsx`)

A single Preact class component `ShortcutQuiz`. On mount it fetches the list of available demo video clips from the GitHub API (`assets/clips/`), then signals `ready` to the extension host. The host replies with `setShortcuts` containing the question list and key mappings.

Key flow: `handleKeydown` → match against `currentEnabledSteps` → correct → `handleCorrectAnswer` → post `shortcutAnswer` message → extension host updates `learningState` in globalState.

### Data files (`data/`)

- **`default_shortcuts.json`** — the curated default shortcut list (VS Code built-ins).
- **`shortcut_selection.json`** — which commands are pre-enabled for quizzing and how to group related shortcuts (`relatedShortcuts`) and which `when`-conditions to prefer (`preferredConditions`).
- **`key_mappings.json`** — maps VS Code key names to browser `KeyboardEvent.code` values and locale-specific display strings (DE/EN).
- **`typescript_sample.ts`** — content loaded into the playground editor during quizzes.

### Webview ↔ Extension host message protocol

Defined in `src/quiz/types.ts`. Outgoing (host → webview): `setShortcuts`, `playgroundOpened`, `playgroundClosed`. Incoming (webview → host): `ready`, `shortcutAnswer`, `openPlayground`, `closePlayground`, `quit`, `updateKeybinding`.

### Global state keys

| Key | Type | Purpose |
|---|---|---|
| `shortcuts` | `Shortcuts` | Full merged shortcut map with `learningState` and enabled flags |
| `preselectedShortcuts` | `PreselectedShortcuts` | Loaded from `data/shortcut_selection.json` on each activation |
| `lastShownTimestamp` | `number` | Unix ms timestamp of the last auto-shown quiz |
