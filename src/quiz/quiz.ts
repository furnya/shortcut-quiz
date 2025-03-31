import * as vscode from 'vscode';
import * as fsAsync from 'fs/promises';
import * as path from 'path';
import { Shortcuts } from '../shortcuts/types';
import _ from 'lodash';
import { getShortcuts, updateShortcuts } from '../shortcuts/shortcuts';

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
      updateShortcuts(context, (shortcuts) => {
        const shortcut = shortcuts[message.shortcutCommand];
        shortcut.learningState = shortcut.learningState + (message.correct ? 1 : -1);
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
      await openHtmlEditor(
        context,
        selection.map(([k, s]) => ({ title: s.title, keys: Object.keys(s.keys), command: k })),
      );
    },
  );
  return [startNewQuizCommand];
}
