import * as vscode from 'vscode';
import { checkAndShowEditor, getQuizDisposables } from './quiz/quiz_setup';
import { getShortcutsDisposables } from './shortcuts/shortcuts';
import { getTreeViewDisposables } from './tree_view/tree_view';

let quizInterval: NodeJS.Timeout | null = null;

export async function activate(context: vscode.ExtensionContext) {
  console.log('The extension "shortcut-quiz" is now active!');

  // TODO group commands by category
  // TODO group commands by similarity (arrowup/arrowdown commands can be combined)
  // TODO titles for defaults

  const quizDisposables = getQuizDisposables(context);
  const shortcutsDisposables = await getShortcutsDisposables(context);
  const treeViewDisposables = getTreeViewDisposables(context);

  context.subscriptions.push(
    {
      dispose: () => {
        if (quizInterval) {
          clearInterval(quizInterval);
          quizInterval = null;
        }
      },
    },
    ...treeViewDisposables,
    ...quizDisposables,
    ...shortcutsDisposables,
  );
  // only for testing
  // vscode.commands.executeCommand('shortcut-quiz.startNewQuiz');
  quizInterval = setInterval(async () => checkAndShowEditor(context), 30 * 1000);
}

// This method is called when your extension is deactivated
export function deactivate() {
  if (quizInterval) {
    clearInterval(quizInterval);
    quizInterval = null;
  }
}
