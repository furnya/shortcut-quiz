import * as vscode from 'vscode';
import * as fsAsync from 'fs/promises';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/naming-convention
import _ from 'lodash';
import { getShortcuts, updateShortcuts } from '../shortcuts/shortcuts';
import { Keybindings, Shortcut } from '../shortcuts/types';
import {
  IncomingMessage,
  Keybinding,
  KeyMappings,
  PlaygroundClosedMessage,
  PlaygroundOpenedMessage,
  SetShortcutsMessage,
  ShortcutAnswerMessage,
  UpdateKeybindingMessage,
} from './types';

let quizPanel: vscode.WebviewPanel | null = null;
let playgroundEditor: vscode.TextEditor | null = null;

async function openQuizEditor(
  context: vscode.ExtensionContext,
  shortcutSelection: [string, Shortcut][] = [],
) {
  if (quizPanel) {
    quizPanel.reveal();
    return;
  }
  quizPanel = vscode.window.createWebviewPanel(
    'shortcutQuiz',
    'Shortcut Quiz',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
    },
  );
  quizPanel.onDidDispose(() => {
    quizPanel = null;
    if (playgroundEditor) {
      closePlayground();
    }
  });

  const keyMappingsPath = path.join(context.extensionPath, 'data', 'key_mappings.json');
  const keyMappingsJson = await fsAsync.readFile(keyMappingsPath, 'utf8');
  const keyMappings = JSON.parse(keyMappingsJson) as KeyMappings;

  const stylesUri = quizPanel.webview.asWebviewUri(
    // vscode.Uri.joinPath(context.extensionUri, 'src', 'quiz', 'styles.css'),
    vscode.Uri.joinPath(context.extensionUri, 'dist', 'quiz', 'styles.css'),
  );
  const scriptUri = quizPanel.webview.asWebviewUri(
    // vscode.Uri.joinPath(context.extensionUri, 'src', 'quiz', 'script.js'),
    vscode.Uri.joinPath(context.extensionUri, 'dist', 'quiz', 'index.js'),
  );

  quizPanel.webview.html = /*html*/ `
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
    function mapKeybindings(keybindings: Keybindings): Keybinding[] {
      return Object.entries(keybindings).map(([key, value]) => ({
        key,
        enabled: value.enabled,
        disablingPossible: value.disablingPossible,
        conditions: value.conditions,
      }));
    }
    const message: SetShortcutsMessage = {
      command: 'setShortcuts',
      debug: context.extensionMode === vscode.ExtensionMode.Development,
      shortcuts: shortcutSelection.map(([k, s]) => ({
        title: s.title,
        keys: mapKeybindings(s.keybindings),
        command: k,
        enabled: s.enabled,
        relatedShortcuts: Object.entries(s.relatedShortcuts ?? {}).map(([command, value]) => ({
          title: value.title,
          keys: mapKeybindings(value.keybindings),
          command,
        })),
      })),
      keyMappings,
      configKeyboardLanguage:
        vscode.workspace.getConfiguration('shortcutQuiz').get('keyboardLayout') ?? 'en',
      maxWrongTries: vscode.workspace
        .getConfiguration('shortcutQuiz')
        .get<number>('maxWrongTries', 10),
    };
    quizPanel?.webview.postMessage(message);
  }
  if (vscode.workspace.getConfiguration('shortcutQuiz').get('showPlayground')) {
    await openPlayground(context);
    vscode.commands.executeCommand('workbench.action.evenEditorWidths');
    quizPanel.webview.postMessage({ command: 'playgroundOpened' } as PlaygroundOpenedMessage);
  }
  quizPanel.webview.onDidReceiveMessage(async (message: IncomingMessage) => {
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
      await openPlayground(context);
      quizPanel?.webview.postMessage({ command: 'playgroundOpened' } as PlaygroundOpenedMessage);
    } else if (message.command === 'quit') {
      closePlayground();
      quizPanel?.dispose();
    } else if (message.command === 'updateKeybinding') {
      const typedMessage = message as UpdateKeybindingMessage;
      await updateShortcuts(context, (shortcuts) => {
        const shortcut = shortcuts[typedMessage.shortcutCommand];
        if (shortcut) {
          if (typedMessage.key) {
            shortcut.keybindings[typedMessage.key].enabled = typedMessage.enable;
          } else {
            shortcut.enabled = typedMessage.enable;
          }
        }
        return shortcuts;
      });
      vscode.commands.executeCommand('shortcut-quiz.refreshActiveTreeView', false);
      vscode.commands.executeCommand('shortcut-quiz.refreshInactiveTreeView', false);
    }
  });
}

async function openPlayground(context: vscode.ExtensionContext) {
  const sampleContent = await fsAsync.readFile(
    path.join(context.extensionPath, 'data', 'typescript_sample.ts'),
    'utf8',
  );
  const document = await vscode.workspace.openTextDocument({
    content: sampleContent,
    language: 'typescript',
  });
  playgroundEditor = await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside, true);
}

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
    (t) =>
      (t.input as vscode.TabInputText)?.uri?.fsPath === playgroundEditor?.document?.uri?.fsPath,
  );
  if (!foundTab) {
    return;
  }
  vscode.window.tabGroups.close(foundTab);
  playgroundEditor = null;
  quizPanel?.webview.postMessage({ command: 'playgroundClosed' } as PlaygroundClosedMessage);
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
      const numberOfQuestions = vscode.workspace
        .getConfiguration('shortcutQuiz')
        .get<number>('numberOfQuestions', 10);
      const selectionMethod = vscode.workspace
        .getConfiguration('shortcutQuiz')
        .get<'lowest_score' | 'random' | 'mixed'>('quizSelection', 'lowest_score');
      let selection = Object.entries(shortcuts).filter(([k, s]) => s.enabled);
      if (selectionMethod === 'lowest_score') {
        _.shuffle(selection);
        selection = _.sortBy(selection, (s) => s[1].learningState);
        selection = selection.slice(0, numberOfQuestions);
      } else if (selectionMethod === 'random') {
        selection = _.sampleSize(selection, numberOfQuestions);
      } else if (selectionMethod === 'mixed') {
        const lowestScore = _.sortBy(selection, (s) => s[1].learningState).slice(
          0,
          _.floor(numberOfQuestions / 2),
        );
        // remove lowest score from selection
        selection = selection.filter((s) => !lowestScore.some((l) => l[0] === s[0]));
        const randomSelection = _.sampleSize(selection, _.ceil(numberOfQuestions / 2));
        selection = [...lowestScore, ...randomSelection];
        selection = _.shuffle(selection);
      }
      // selection = selection.sort((a, b) => a[1].learningState - b[1].learningState);
      // selection = _.sampleSize(selection, 10);
      // selection = [
      //   'workbench.action.exitZenMode',
      //   'editor.action.outdentLines',
      //   'workbench.action.closeActiveEditor',
      //   'breadcrumbs.focus',
      // ].map((k) => [k, shortcuts[k]]);
      await openQuizEditor(context, selection);
    },
  );

  const documentCloseListener = vscode.workspace.onDidCloseTextDocument((document) => {
    if (playgroundEditor && document.uri.toString() === playgroundEditor.document.uri.toString()) {
      playgroundEditor = null;
      quizPanel?.webview.postMessage({ command: 'playgroundClosed' } as PlaygroundClosedMessage);
    }
  });

  return [startNewQuizCommand, documentCloseListener];
}
