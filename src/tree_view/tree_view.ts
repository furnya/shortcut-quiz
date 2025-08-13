import * as vscode from 'vscode';
import { getShortcuts } from '../shortcuts/shortcuts';
import { Shortcut } from '../shortcuts/types';
import { GenericShortcutTreeItem, MainCommandTreeItem } from './tree_item';

abstract class SCTProvider implements vscode.TreeDataProvider<GenericShortcutTreeItem> {
  constructor(protected readonly context: vscode.ExtensionContext) {}
  private _onDidChangeTreeData: vscode.EventEmitter<GenericShortcutTreeItem | undefined> =
    new vscode.EventEmitter<GenericShortcutTreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<GenericShortcutTreeItem | undefined> =
    this._onDidChangeTreeData.event;
  sortOrder: 'alphabetical' | 'learningState' = 'alphabetical';
  protected abstract filterCondition(shortcut: Shortcut): boolean;
  protected abstract collapseCommand: boolean;
  refresh(reloadShortcuts = true) {
    if (reloadShortcuts) {
      vscode.commands.executeCommand('shortcut-quiz.reloadShortcuts').then(() => {
        this._onDidChangeTreeData.fire(undefined);
      });
    } else {
      this._onDidChangeTreeData.fire(undefined);
    }
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
        .map(
          ([key, value]) => new MainCommandTreeItem(this.context, key, value, this.collapseCommand),
        );
    }
    return element.children;
  }
}
export class ShortcutInactiveTreeDataProvider extends SCTProvider {
  protected filterCondition(shortcut: Shortcut): boolean {
    return !shortcut.enabled;
  }
  protected collapseCommand = true;
}
export class ShortcutActiveTreeDataProvider extends SCTProvider {
  protected filterCondition(shortcut: Shortcut): boolean {
    return shortcut.enabled;
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
    async (reloadShortcuts = true) => {
      shortcutActiveTreeDataProvider.refresh(reloadShortcuts);
    },
  );
  const refreshInactiveTreeCommand = vscode.commands.registerCommand(
    'shortcut-quiz.refreshInactiveTreeView',
    async (reloadShortcuts = true) => {
      shortcutInactiveTreeDataProvider.refresh(reloadShortcuts);
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
