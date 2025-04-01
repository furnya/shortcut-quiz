import * as vscode from 'vscode';
import * as fsAsync from 'fs/promises';
import * as path from 'path';
import _ from 'lodash';
import { getShortcuts, updateShortcuts } from '../shortcuts/shortcuts';
import { Shortcut } from '../shortcuts/types';
import { IncomingMessage, KeyMappings, OutgoingMessage, ShortcutAnswerMessage } from './types';

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
    const message: OutgoingMessage = {
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
  // sendStartMessage();
  panel.webview.onDidReceiveMessage((message: IncomingMessage) => {
    if (message.command === 'shortcutAnswer') {
      const typedMessage = message as ShortcutAnswerMessage;
      updateShortcuts(context, (shortcuts) => {
        const shortcut = shortcuts[typedMessage.shortcutCommand];
        shortcut.learningState = shortcut.learningState + (typedMessage.correct ? 1 : -1);
        return shortcuts;
      });
    } else if (message.command === 'ready') {
      sendStartMessage();
    }
  });
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
