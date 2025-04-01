import * as path from 'path';
import * as vscode from 'vscode';
import { TreeItemCollapsibleState } from 'vscode';
import { Shortcut } from '../shortcuts/types';

export class GenericShortcutTreeItem extends vscode.TreeItem {
  public children: GenericShortcutTreeItem[] = [];

  constructor(
    public readonly label: string,
    public readonly collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None,
  ) {
    super(label, collapsibleState);
  }
}

export class CommandTreeItem extends GenericShortcutTreeItem {
  public readonly commandString: string;
  constructor(
    context: vscode.ExtensionContext,
    command: string,
    value: Shortcut,
    public readonly collapseCommand: boolean = false,
  ) {
    const label = value.title
      ? value.title.charAt(0).toUpperCase() + value.title.slice(1)
      : command;
    super(
      label,
      collapseCommand ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.Expanded,
    );
    this.commandString = command;
    this.contextValue = 'command';
    this.description = command;
    this.children = [
      ...Object.entries(value.keys).map(([k, v]) => new ShortcutTreeItem(context, k, v)),
      new ScoreTreeItem(value.learningState),
      new OriginsTreeItem(value.origins),
    ];
  }
}

export class ScoreTreeItem extends GenericShortcutTreeItem {
  constructor(public readonly value: number) {
    super(`Score: ${value}`);
  }
}

export class OriginsTreeItem extends GenericShortcutTreeItem {
  constructor(public readonly value: string[]) {
    super(`Origins: ${value.join(', ')}`);
  }
}

export class ShortcutTreeItem extends GenericShortcutTreeItem {
  constructor(
    context: vscode.ExtensionContext,
    public readonly key: string,
    public readonly value: string[] | null,
  ) {
    let collapsibleState = TreeItemCollapsibleState.Collapsed;
    if (value === null) {
      collapsibleState = TreeItemCollapsibleState.None;
    }
    super(key, collapsibleState);
    this.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'assets', 'keyboard.svg'));
    this.children = (value || []).map((v) => new WhenTreeItem(context, v));
  }
}

export class WhenTreeItem extends GenericShortcutTreeItem {
  constructor(
    context: vscode.ExtensionContext,
    public readonly key: string,
  ) {
    super(key, TreeItemCollapsibleState.None);
    this.iconPath = vscode.Uri.file(
      path.join(context.extensionPath, 'assets', 'question_mark.svg'),
    );
  }
}
