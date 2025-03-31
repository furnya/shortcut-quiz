import * as path from 'path';
import * as vscode from 'vscode';

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
