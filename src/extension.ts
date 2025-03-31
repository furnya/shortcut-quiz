import * as fsAsync from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
// eslint-disable-next-line @typescript-eslint/naming-convention
import _ from 'lodash';
import {
  loadShortcutsFromDefault,
  loadShortcutsFromConfiguration,
  loadShortcutsFromExtensions,
  Shortcuts,
  getUserShortcutsFileUri,
  importantShortcutsKey,
} from './shortcuts';
import { getDisposables as getTreeViewDisposables, ShortcutTreeItem } from './tree_view';

let quizInterval: NodeJS.Timeout | null = null;

export async function activate(context: vscode.ExtensionContext) {
  console.log('The extension "shortcut-quiz" is now active!');

  // TODO group commands by category
  // TODO group commands by similarity (arrowup/arrowdown commands can be combined)
  // TODO titles for defaults
  const importantShortcutsPath = path.join(
    context.extensionPath,
    'data',
    'shortcut_selection.json',
  );
  const importantShortcutsJson = await fsAsync.readFile(importantShortcutsPath, 'utf8');
  const importantShortcuts = JSON.parse(importantShortcutsJson) as string[];
  context.globalState.update(importantShortcutsKey, importantShortcuts);

  const configChangeListener = vscode.workspace.onDidChangeConfiguration(async (e) => {
    console.log('Config has changed');
    await reloadAllShortcuts();
  });

  const userShortcutsWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(getUserShortcutsFileUri(true).fsPath, 'keybindings.json'),
    false, // ignoreCreateEvents
    false, // ignoreChangeEvents
    false, // ignoreDeleteEvents
  );
  userShortcutsWatcher.onDidChange(async () => {
    console.log('User shortcuts have changed');
    await reloadAllShortcuts();
  });

  async function reloadAllShortcuts() {
    const timeLabel = 'loadShortcuts_' + new Date().toISOString();
    console.time(timeLabel);
    const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
    for (const command in shortcuts) {
      shortcuts[command].keys = {};
    }
    await loadShortcutsFromDefault(context, shortcuts);
    await loadShortcutsFromExtensions(context, shortcuts);
    await loadShortcutsFromConfiguration(context, shortcuts);
    console.timeEnd(timeLabel);
  }

  const extensionChangeListener = vscode.extensions.onDidChange(() => {
    console.log('Extensions have changed (installed/uninstalled)');
    setTimeout(() => reloadAllShortcuts(), 10000);
  });

  const starCommandCommand = vscode.commands.registerCommand(
    'shortcut-quiz.starCommand',
    async (item: ShortcutTreeItem) => {
      const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
      if (shortcuts[item.commandString]) {
        shortcuts[item.key].important = true;
        await context.globalState.update('shortcuts', shortcuts);
        vscode.commands.executeCommand('shortcut-quiz.refreshActiveTreeView');
        vscode.commands.executeCommand('shortcut-quiz.refreshInactiveTreeView');
      }
    },
  );
  const unstarCommandCommand = vscode.commands.registerCommand(
    'shortcut-quiz.unstarCommand',
    async (item: ShortcutTreeItem) => {
      const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
      if (shortcuts[item.commandString]) {
        shortcuts[item.key].important = false;
        await context.globalState.update('shortcuts', shortcuts);
        vscode.commands.executeCommand('shortcut-quiz.refreshActiveTreeView');
        vscode.commands.executeCommand('shortcut-quiz.refreshInactiveTreeView');
      }
    },
  );

  const startNewQuizCommand = vscode.commands.registerCommand(
    'shortcut-quiz.startNewQuiz',
    async () => {
      const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
      let selection = Object.entries(shortcuts).filter(([k, s]) => s.important);
      _.shuffle(selection);
      // selection = selection.sort((a, b) => a[1].learningState - b[1].learningState);
      selection = _.sortBy(selection, (s) => s[1].learningState);
      // selection = _.sampleSize(selection, 10);
      selection = selection.slice(0, 10);
      // selection = [
      //   'workbench.action.exitZenMode',
      //   'editor.action.outdentLines',
      //   'workbench.action.closeActiveEditor',
      //   'breadcrumbs.focus',
      // ].map((k) => [k, shortcuts[k]]);
      await openHtmlEditor(
        context,
        selection.map(([k, s]) => ({ title: s.title, keys: Object.keys(s.keys), command: k })),
      );
    },
  );

  const treeViewDisposables = getTreeViewDisposables(context);

  context.subscriptions.push(
    configChangeListener,
    extensionChangeListener,
    startNewQuizCommand,
    starCommandCommand,
    unstarCommandCommand,
    userShortcutsWatcher,
    {
      dispose: () => {
        if (quizInterval) {
          clearInterval(quizInterval);
          quizInterval = null;
        }
      },
    },
    ...treeViewDisposables,
  );
  // context.globalState.update('shortcuts', {});
  await reloadAllShortcuts();
  quizInterval = setInterval(async () => checkAndShowEditor(context), 30 * 1000);
}

// This method is called when your extension is deactivated
export function deactivate() {
  if (quizInterval) {
    clearInterval(quizInterval);
    quizInterval = null;
  }
}

async function openHtmlEditor(context: vscode.ExtensionContext, shortcuts: any[] = []) {
  const panel = vscode.window.createWebviewPanel(
    'shortcutQuiz',
    'Shortcut Quiz',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  const htmlFilePath = path.join(context.extensionPath, 'src', 'quiz', 'quiz_editor.html');
  let htmlContent = await fsAsync.readFile(htmlFilePath, 'utf8');

  const keyMappingsPath = path.join(context.extensionPath, 'data', 'key_mappings.json');
  const keyMappingsJson = await fsAsync.readFile(keyMappingsPath, 'utf8');
  const keyMappings = JSON.parse(keyMappingsJson);

  panel.webview.html = htmlContent;
  function sendStartMessage() {
    panel.webview.postMessage({
      command: 'setShortcuts',
      shortcuts,
      keyMappings,
      configKeyboardLanguage: vscode.workspace
        .getConfiguration('shortcutQuiz')
        .get('keyboardLayout'),
    });
  }
  // sendStartMessage();
  panel.webview.onDidReceiveMessage((message) => {
    if (message.command === 'shortcutAnswer') {
      const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
      const shortcut = shortcuts[message.shortcutCommand];
      shortcut.learningState = shortcut.learningState + (message.correct ? 1 : -1);
      context.globalState.update('shortcuts', shortcuts);
    } else if (message.command === 'ready') {
      sendStartMessage();
    }
  });
}

async function checkAndShowEditor(context: vscode.ExtensionContext) {
  if (vscode.window.state.focused && (await shouldShowEditor(context))) {
    vscode.commands.executeCommand('shortcut-quiz.startNewQuiz');
    await updateLastShownTimestamp(context);
  }
}

async function shouldShowEditor(context: vscode.ExtensionContext): Promise<boolean> {
  const lastShown = context.globalState.get<number>('lastShownTimestamp') || 0;
  const nextShowTime =
    lastShown +
    vscode.workspace.getConfiguration('shortcutQuiz').get('quizInterval', 60) * 1000 * 60;
  return Date.now() > nextShowTime;
}

async function updateLastShownTimestamp(context: vscode.ExtensionContext) {
  await context.globalState.update('lastShownTimestamp', Date.now());
}
