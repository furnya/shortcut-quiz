// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
// import * as fs from 'fs';
import * as fsAsync from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
// eslint-disable-next-line @typescript-eslint/naming-convention
import _ from 'lodash';
import {
  loadKeybindingsFromDefault,
  loadKeybindingsFromConfiguration,
  loadKeybindingsFromExtensions,
  Shortcuts,
  getKeybindingsFileUri,
} from './shortcuts';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "shortcut-quiz" is now active!');

  const importantKeybindingsPath = path.join(
    context.extensionPath,
    'src',
    'keybinding_selection.json',
  );
  const importantKeybindingsJson = await fsAsync.readFile(importantKeybindingsPath, 'utf8');
  const importantKeybindings = JSON.parse(importantKeybindingsJson) as string[];
  context.globalState.update('importantKeybindings', importantKeybindings);

  const keybindingsChangeListener = vscode.workspace.onDidChangeConfiguration(async (e) => {
    console.log('Config has changed');
    // await loadKeybindingsFromConfiguration(context);
    await reloadAllKeybindings();
  });

  const userKeybindingsWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(getKeybindingsFileUri(true).fsPath, 'keybindings.json'),
    false, // ignoreCreateEvents
    false, // ignoreChangeEvents
    false, // ignoreDeleteEvents
  );
  userKeybindingsWatcher.onDidChange(async (e) => {
    console.log('Keybindings have changed');
    console.log(e);
    // await loadKeybindingsFromConfiguration(context);
    await reloadAllKeybindings();
  });

  async function reloadAllKeybindings() {
    const timeLabel = 'loadKeybindings_' + new Date().toISOString();
    console.time(timeLabel);
    const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
    for (const command in shortcuts) {
      shortcuts[command].keys = {};
    }
    await loadKeybindingsFromDefault(context, shortcuts);
    await loadKeybindingsFromExtensions(context, shortcuts);
    await loadKeybindingsFromConfiguration(context, shortcuts);
    console.timeEnd(timeLabel);
  }

  // Listen for extension changes
  const extensionChangeListener = vscode.extensions.onDidChange(() => {
    console.log('Extensions have changed (installed/uninstalled)');
    // setTimeout(() => loadKeybindingsFromExtensions(context), 10000);
    setTimeout(() => reloadAllKeybindings(), 10000);
  });

  const activateCommand = vscode.commands.registerCommand('shortcut-quiz.activate', async () => {
    // context.globalState.update('shortcuts', {});
    // if (true) {
    // if (!context.globalState.get('shortcuts')) {
    //   vscode.window.showInformationMessage('Loading shortcuts...');
    //   await reloadAllKeybindings();
    //   vscode.window.showInformationMessage('Shortcuts loaded');
    // }
    await reloadAllKeybindings();

    vscode.commands.executeCommand('shortcut-quiz.startNewQuiz');
    // checkAndShowEditor(context);
    // const quizInterval = setInterval(async () => checkAndShowEditor(context), 30 * 1000);
    const quizInterval = setInterval(async () => checkAndShowEditor(context), 0.5 * 1000);
    context.globalState.update('quizInterval', quizInterval);
  });
  const inspectGlobalStateCommand = vscode.commands.registerCommand(
    'shortcut-quiz.inspectGlobalState',
    () => {
      const allKeys = context.globalState.keys();
      const stateContents: any = {};
      for (const key of allKeys) {
        stateContents[key] = context.globalState.get(key);
      }
      const channel = vscode.window.createOutputChannel('Shortcut Quiz Global State');
      channel.appendLine(JSON.stringify(stateContents, null, 2));
      channel.show();
    },
  );

  const startNewQuizCommand = vscode.commands.registerCommand(
    'shortcut-quiz.startNewQuiz',
    async () => {
      const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
      let selection = Object.entries(shortcuts).filter(([k, s]) => s.important);
      _.shuffle(selection);
      // TODO choose shortcuts with lowest learning state
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

  context.subscriptions.push(
    activateCommand,
    inspectGlobalStateCommand,
    keybindingsChangeListener,
    extensionChangeListener,
    startNewQuizCommand,
    userKeybindingsWatcher,
  );
  vscode.commands.executeCommand('shortcut-quiz.activate');
}

// This method is called when your extension is deactivated
export function deactivate() {
  clearInterval(vscode.workspace.getConfiguration('shortcutQuiz').get('quizInterval'));
}

async function openHtmlEditor(context: vscode.ExtensionContext, keybindings: any[] = []) {
  const panel = vscode.window.createWebviewPanel(
    'shortcutQuiz',
    'Shortcut Quiz',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  const htmlFilePath = path.join(context.extensionPath, 'src', 'quiz_editor.html');
  let htmlContent = await fsAsync.readFile(htmlFilePath, 'utf8');

  const keyMappingsPath = path.join(context.extensionPath, 'src', 'key_mappings.json');
  const keyMappingsJson = await fsAsync.readFile(keyMappingsPath, 'utf8');
  const keyMappings = JSON.parse(keyMappingsJson);

  panel.webview.html = htmlContent;
  function sendStartMessage() {
    panel.webview.postMessage({
      command: 'setKeybindings',
      keybindings,
      keyMappings,
      configKeyboardLanguage: vscode.workspace
        .getConfiguration('shortcutQuiz')
        .get('keyboardLayout'),
    });
  }
  // sendStartMessage();
  panel.webview.onDidReceiveMessage((message) => {
    if (message.command === 'keybindingAnswer') {
      const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
      const shortcut = shortcuts[message.keybindingCommand];
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
