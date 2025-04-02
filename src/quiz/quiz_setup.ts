import * as vscode from 'vscode';
import * as fsAsync from 'fs/promises';
import * as path from 'path';
import _ from 'lodash';
import { getShortcuts, updateShortcuts } from '../shortcuts/shortcuts';
import { Shortcut } from '../shortcuts/types';
import {
  IncomingMessage,
  KeyMappings,
  PlaygroundClosedMessage,
  PlaygroundOpenedMessage,
  SetShortcutsMessage,
  ShortcutAnswerMessage,
} from './types';

async function openHtmlEditor(
  context: vscode.ExtensionContext,
  shortcutSelection: [string, Shortcut][] = [],
) {
  const panel = vscode.window.createWebviewPanel(
    'shortcutQuiz',
    'Shortcut Quiz',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
    },
  );

  const keyMappingsPath = path.join(context.extensionPath, 'data', 'key_mappings.json');
  const keyMappingsJson = await fsAsync.readFile(keyMappingsPath, 'utf8');
  const keyMappings = JSON.parse(keyMappingsJson) as KeyMappings;

  const stylesUri = panel.webview.asWebviewUri(
    // vscode.Uri.joinPath(context.extensionUri, 'src', 'quiz', 'styles.css'),
    vscode.Uri.joinPath(context.extensionUri, 'dist', 'quiz', 'styles.css'),
  );
  const scriptUri = panel.webview.asWebviewUri(
    // vscode.Uri.joinPath(context.extensionUri, 'src', 'quiz', 'script.js'),
    vscode.Uri.joinPath(context.extensionUri, 'dist', 'quiz', 'index.js'),
  );

  panel.webview.html = /*html*/ `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Shortcut Quiz</title>
      <link rel="stylesheet" href="${stylesUri}">
    </head>
    <body>
      <div id="app"></div>
      <script src="${scriptUri}" type="module"></script>
    </body>
  </html>`;

  function sendStartMessage() {
    const message: SetShortcutsMessage = {
      command: 'setShortcuts',
      shortcuts: shortcutSelection.map(([k, s]) => ({
        title: s.title,
        keys: Object.keys(s.keys),
        command: k,
      })),
      keyMappings,
      configKeyboardLanguage:
        vscode.workspace.getConfiguration('shortcutQuiz').get('keyboardLayout') ?? 'en',
    };
    panel.webview.postMessage(message);
  }
  let playgroundEditor: vscode.TextEditor | null = await openPlayground(context);
  panel.webview.postMessage({ command: 'playgroundOpened' } as PlaygroundOpenedMessage);
  function closePlayground() {
    if (!playgroundEditor) {
      return;
    }
    // empty document
    playgroundEditor.edit((edit) => {
      edit.replace(new vscode.Range(0, 0, playgroundEditor?.document.lineCount ?? 100_000, 0), '');
    });
    const foundTabGroup = vscode.window.tabGroups.all.find(
      (tg) => tg.viewColumn === playgroundEditor?.viewColumn,
    );
    const foundTab = foundTabGroup?.tabs.find(
      (t) => (t.input as vscode.TabInputText)?.uri.fsPath === playgroundEditor?.document.uri.fsPath,
    );
    if (!foundTab) {
      return;
    }
    vscode.window.tabGroups.close(foundTab);
    playgroundEditor = null;
    panel.webview.postMessage({ command: 'playgroundClosed' } as PlaygroundClosedMessage);
  }
  panel.webview.onDidReceiveMessage(async (message: IncomingMessage) => {
    if (message.command === 'shortcutAnswer') {
      const typedMessage = message as ShortcutAnswerMessage;
      updateShortcuts(context, (shortcuts) => {
        const shortcut = shortcuts[typedMessage.shortcutCommand];
        shortcut.learningState = shortcut.learningState + (typedMessage.correct ? 1 : -1);
        return shortcuts;
      });
    } else if (message.command === 'ready') {
      sendStartMessage();
    } else if (message.command === 'closePlayground') {
      closePlayground();
    } else if (message.command === 'openPlayground') {
      playgroundEditor = await openPlayground(context);
      panel.webview.postMessage({ command: 'playgroundOpened' } as PlaygroundOpenedMessage);
    } else if (message.command === 'quit') {
      closePlayground();
      panel.dispose();
    }
  });
}

async function openPlayground(context: vscode.ExtensionContext) {
  const sampleContent = await fsAsync.readFile(
    path.join(context.extensionPath, 'assets', 'typescript_sample.ts'),
    'utf8',
  );
  const document = await vscode.workspace.openTextDocument({
    content: sampleContent,
    language: 'typescript',
  });
  return await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside, true);
}

export async function checkAndShowEditor(context: vscode.ExtensionContext) {
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

export function getQuizDisposables(context: vscode.ExtensionContext) {
  const startNewQuizCommand = vscode.commands.registerCommand(
    'shortcut-quiz.startNewQuiz',
    async () => {
      const shortcuts = getShortcuts(context);
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
      await openHtmlEditor(context, selection);
    },
  );
  return [startNewQuizCommand];
}
