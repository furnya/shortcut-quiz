import * as vscode from 'vscode';
import { getShortcuts } from '../shortcuts/shortcuts';
import { Shortcut } from '../shortcuts/types';
import { CommandTreeItem, GenericShortcutTreeItem } from './tree_item';

abstract class ShortcutTreeDataProvider
  implements vscode.TreeDataProvider<GenericShortcutTreeItem>
{
  constructor(protected readonly context: vscode.ExtensionContext) {}
  private _onDidChangeTreeData: vscode.EventEmitter<GenericShortcutTreeItem | undefined> =
    new vscode.EventEmitter<GenericShortcutTreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<GenericShortcutTreeItem | undefined> =
    this._onDidChangeTreeData.event;
  sortOrder: 'alphabetical' | 'learningState' = 'alphabetical';
  protected abstract filterCondition(shortcut: Shortcut): boolean;
  protected abstract collapseCommand: boolean;
  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: GenericShortcutTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: GenericShortcutTreeItem): GenericShortcutTreeItem[] {
    const shortcuts = getShortcuts(this.context);
    if (!element) {
      return Object.entries(shortcuts)
        .filter(([key, value]) => this.filterCondition(shortcuts[key]))
        .toSorted(([keyA, valueA], [keyB, valueB]) => {
          if (this.sortOrder === 'learningState') {
            return valueA.learningState - valueB.learningState;
          } else if (this.sortOrder === 'alphabetical') {
            return valueA.title.localeCompare(valueB.title);
          }
          return keyA.localeCompare(keyB);
        })
        .map(([key, value]) => new CommandTreeItem(this.context, key, value, this.collapseCommand));
    }
    return element.children;
  }
}
export class ShortcutInactiveTreeDataProvider extends ShortcutTreeDataProvider {
  protected filterCondition(shortcut: Shortcut): boolean {
    return !shortcut.important;
  }
  protected collapseCommand = true;
}
export class ShortcutActiveTreeDataProvider extends ShortcutTreeDataProvider {
  protected filterCondition(shortcut: Shortcut): boolean {
    return shortcut.important;
  }
  protected collapseCommand = false;
}

export function getTreeViewDisposables(context: vscode.ExtensionContext) {
  const shortcutActiveTreeDataProvider = new ShortcutActiveTreeDataProvider(context);
  vscode.window.createTreeView('shortcutQuizShortcutTreeViewActive', {
    treeDataProvider: shortcutActiveTreeDataProvider,
    showCollapseAll: true,
  });
  const shortcutInactiveTreeDataProvider = new ShortcutInactiveTreeDataProvider(context);
  vscode.window.createTreeView('shortcutQuizShortcutTreeViewInactive', {
    treeDataProvider: shortcutInactiveTreeDataProvider,
    showCollapseAll: true,
  });

  const refreshActiveTreeCommand = vscode.commands.registerCommand(
    'shortcut-quiz.refreshActiveTreeView',
    async () => {
      shortcutActiveTreeDataProvider.refresh();
    },
  );
  const refreshInactiveTreeCommand = vscode.commands.registerCommand(
    'shortcut-quiz.refreshInactiveTreeView',
    async () => {
      shortcutInactiveTreeDataProvider.refresh();
    },
  );
  const sortActiveTreeAlphabeticallyCommand = vscode.commands.registerCommand(
    'shortcut-quiz.sortActiveTreeAlphabetically',
    async () => {
      shortcutActiveTreeDataProvider.sortOrder = 'alphabetical';
      shortcutActiveTreeDataProvider.refresh();
    },
  );
  const sortActiveTreeByScoreCommand = vscode.commands.registerCommand(
    'shortcut-quiz.sortActiveTreeByScore',
    async () => {
      shortcutActiveTreeDataProvider.sortOrder = 'learningState';
      shortcutActiveTreeDataProvider.refresh();
    },
  );
  const sortInactiveTreeAlphabeticallyCommand = vscode.commands.registerCommand(
    'shortcut-quiz.sortInactiveTreeAlphabetically',
    async () => {
      shortcutInactiveTreeDataProvider.sortOrder = 'alphabetical';
      shortcutInactiveTreeDataProvider.refresh();
    },
  );
  const sortInactiveTreeByScoreCommand = vscode.commands.registerCommand(
    'shortcut-quiz.sortInactiveTreeByScore',
    async () => {
      shortcutInactiveTreeDataProvider.sortOrder = 'learningState';
      shortcutInactiveTreeDataProvider.refresh();
    },
  );

  return [
    refreshActiveTreeCommand,
    refreshInactiveTreeCommand,
    sortActiveTreeAlphabeticallyCommand,
    sortActiveTreeByScoreCommand,
    sortInactiveTreeAlphabeticallyCommand,
    sortInactiveTreeByScoreCommand,
  ];
}
