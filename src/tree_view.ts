import * as vscode from 'vscode';
import * as path from 'path';
import { Shortcut, Shortcuts } from './shortcuts';

export class ShortcutTreeItem extends vscode.TreeItem {
  public readonly children: ShortcutTreeItem[] = [];
  public readonly commandString: string;
  constructor(
    public readonly context: vscode.ExtensionContext,
    public readonly key: string,
    public readonly value: any,
    public readonly isShortcut: boolean = false,
    public readonly parent: ShortcutTreeItem | null = null,
    public readonly collapseCommand: boolean = false,
  ) {
    let label = isShortcut ? key : key.charAt(0).toUpperCase() + key.slice(1);
    if (key === 'learningState') {
      label = 'Score';
    }
    let collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    if (typeof value !== 'object' || value === null) {
      label += `: ${value}`;
      collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
    super(label, collapsibleState);
    if (!parent) {
      this.contextValue = 'command';
      this.label = value.title ?? key;
      this.description = key;
      if (collapseCommand) {
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      }
    }
    if (key === 'origins') {
      this.label = `Origins: ${value.join(', ')}`;
      this.children = [];
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
    this.commandString = key;
    this.parent = parent;
    if (this.isShortcut) {
      this.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'assets', 'keyboard.svg'));
      this.label = key;
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      if (value === null) {
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;
      }
    } else if (this.parent?.isShortcut) {
      this.iconPath = vscode.Uri.file(
        path.join(context.extensionPath, 'assets', 'question_mark.svg'),
      );
      this.label = value;
    }
    if (typeof value === 'object' && value !== null && key !== 'origins') {
      this.children = [];
      if (!this.parent) {
        this.children.push(
          ...Object.entries(value.keys).map(
            ([k, v]) => new ShortcutTreeItem(context, k, v, true, this),
          ),
        );
      }
      this.children.push(
        ...Object.entries(value)
          .filter(([k, v]) => !['title', 'important', 'keys'].includes(k))
          .map(([k, v]) => {
            return new ShortcutTreeItem(context, k, v, false, this);
          }),
      );
    }
  }
}

abstract class ShortcutTreeDataProvider implements vscode.TreeDataProvider<ShortcutTreeItem> {
  constructor(protected readonly context: vscode.ExtensionContext) {}
  private _onDidChangeTreeData: vscode.EventEmitter<ShortcutTreeItem | undefined> =
    new vscode.EventEmitter<ShortcutTreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<ShortcutTreeItem | undefined> =
    this._onDidChangeTreeData.event;
  sortOrder: 'alphabetical' | 'learningState' = 'alphabetical';
  protected abstract filterCondition(shortcut: Shortcut): boolean;
  protected abstract collapseCommand: boolean;
  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ShortcutTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ShortcutTreeItem): ShortcutTreeItem[] {
    const shortcuts = this.context.globalState.get<Shortcuts>('shortcuts') ?? {};
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
          ([key, value]) =>
            new ShortcutTreeItem(this.context, key, value, false, null, this.collapseCommand),
        );
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

export function getDisposables(context: vscode.ExtensionContext) {
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
