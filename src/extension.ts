// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as fsAsync from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  loadKeybindingsFromDefault,
  loadKeybindingsFromConfiguration,
  loadKeybindingsFromExtensions,
  Shortcuts,
} from './shortcuts';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "shortcut-quiz" is now active!');

  const keybindingsChangeListener = vscode.workspace.onDidChangeConfiguration(async (e) => {
    console.log('Config has changed');
    await loadKeybindingsFromConfiguration(context);
  });

  // Listen for extension changes
  const extensionChangeListener = vscode.extensions.onDidChange(() => {
    console.log('Extensions have changed (installed/uninstalled)');
    setTimeout(() => loadKeybindingsFromExtensions(context), 10000);
  });

  const activateCommand = vscode.commands.registerCommand('shortcut-quiz.activate', async () => {
    if (!context.globalState.get('shortcuts')) {
    // if (true) {
      vscode.window.showInformationMessage('Loading shortcuts...');
      await loadKeybindingsFromDefault(context);
      await loadKeybindingsFromExtensions(context);
      await loadKeybindingsFromConfiguration(context);
      vscode.window.showInformationMessage('Shortcuts loaded');
    }

    const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
    const testShortcut: any = Object.values(shortcuts)[0];
    await openHtmlEditor(
      context,
      // testShortcut.title,
      // Object.keys(testShortcut.keys)[0]
      undefined,
      undefined,
      // [{ title: testShortcut.title, key: Object.keys(testShortcut.keys)[0] }],
      Object.entries(shortcuts)
        .slice(0, 10)
        .map(([k, s]) => ({ title: s.title, key: Object.keys(s.keys)[0], command: k })),
    );
    // setInterval(async () => checkAndShowEditor(context), 5000);
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
  context.subscriptions.push(
    activateCommand,
    inspectGlobalStateCommand,
    keybindingsChangeListener,
    extensionChangeListener,
  );
  vscode.commands.executeCommand('shortcut-quiz.activate');
}

// This method is called when your extension is deactivated
export function deactivate() {}

async function openHtmlEditor(
  context: vscode.ExtensionContext,
  title: string = `Opening the Command Palette`,
  key: string = 'Ctrl+Shift+P',
  keybindings: any[] = [],
  // key: string = 'Escape Escape'
) {
  const panel = vscode.window.createWebviewPanel(
    'customHtmlView',
    'Custom HTML View',
    vscode.ViewColumn.One,
    { enableScripts: true },
  );

  // Load HTML skeleton from file
  // const htmlFilePath = path.join(context.extensionPath, 'src', 'quiz_editor.html');
  const htmlFilePath = path.join(context.extensionPath, 'src', 'quiz_editor2.html');
  let htmlContent = await fsAsync.readFile(htmlFilePath, 'utf8');

  // Inject custom content
  // htmlContent = htmlContent.replaceAll('{{TITLE}}', title);
  // htmlContent = htmlContent.replaceAll('{{KEY}}', key);

  // Set the panel content
  panel.webview.html = htmlContent;
  panel.webview.postMessage({ command: 'setKeybindings', keybindings });
  panel.webview.onDidReceiveMessage((message) => {
    if (message.command === 'keybindingAnswer') {
      const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
      const shortcut = shortcuts[message.keybindingCommand];
      shortcut.learningState = shortcut.learningState + (message.correct ? 1 : -1);
      context.globalState.update('shortcuts', shortcuts);
    }
  });
}

const INTERVAL_MS = 100 * 1000; // 10 seconds

async function checkAndShowEditor(context: vscode.ExtensionContext) {
  if (vscode.window.state.focused && (await shouldShowEditor(context))) {
    await openHtmlEditor(context);
    await updateLastShownTimestamp(context);
  }
}

async function shouldShowEditor(context: vscode.ExtensionContext): Promise<boolean> {
  const lastShown = context.globalState.get<number>('lastShownTimestamp') || 0;
  const nextShowTime = lastShown + INTERVAL_MS;
  return Date.now() > nextShowTime;
}

async function updateLastShownTimestamp(context: vscode.ExtensionContext) {
  await context.globalState.update('lastShownTimestamp', Date.now());
}
