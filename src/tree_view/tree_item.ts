import * as path from 'path';
import * as vscode from 'vscode';
import { TreeItemCollapsibleState } from 'vscode';
import {
  Keybinding,
  Shortcut,
  ShortcutNonRecursive,
  ShortcutsNonRecursive,
} from '../shortcuts/types';

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
    value: ShortcutNonRecursive,
    public readonly collapseCommand: boolean = false,
    public readonly isMainCommand: boolean = false,
  ) {
    const label = value.title
      ? value.title.charAt(0).toUpperCase() + value.title.slice(1)
      : command;
    super(
      label,
      collapseCommand ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.Expanded,
    );
    this.commandString = command;
    this.description = command;
    this.children = [
      ...Object.entries(value.keybindings).map(
        ([k, v]) => new ShortcutTreeItem(context, this, k, v),
      ),
      new OriginsTreeItem(value.origins),
    ];
  }
}

export class MainCommandTreeItem extends CommandTreeItem {
  constructor(
    context: vscode.ExtensionContext,
    command: string,
    value: Shortcut,
    public readonly collapseCommand: boolean = false,
  ) {
    super(context, command, value, collapseCommand, true);
    this.contextValue = 'command';
    this.children.push(new ScoreTreeItem(value.learningState));
    if (value.relatedShortcuts) {
      this.children.push(new RelatedShortcutsTreeItem(context, value.relatedShortcuts));
    }
  }
}

export class RelatedShortcutsTreeItem extends GenericShortcutTreeItem {
  constructor(context: vscode.ExtensionContext, shortcuts: ShortcutsNonRecursive) {
    super('Related Shortcuts', TreeItemCollapsibleState.Collapsed);
    this.children.push(
      ...Object.entries(shortcuts).map(([k, v]) => new CommandTreeItem(context, k, v, true)),
    );
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
    public readonly parent: CommandTreeItem,
    public readonly key: string,
    public readonly value: Keybinding,
  ) {
    let collapsibleState = TreeItemCollapsibleState.Collapsed;
    if (value.conditions === undefined) {
      collapsibleState = TreeItemCollapsibleState.None;
    }
    let label = key;
    if (value.conditions !== undefined && parent.isMainCommand && !value.enabled) {
      label = '[disabled] ' + key;
    }
    super(label, collapsibleState);
    this.iconPath = vscode.Uri.file(
      path.join(context.extensionPath, 'assets', 'keyboard_green.svg'),
    );
    if (value.disablingPossible) {
      if (value.enabled) {
        this.contextValue = 'enabledKeybinding';
      } else {
        this.contextValue = 'disabledKeybinding';
        this.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'assets', 'keyboard.svg'));
      }
    }
    this.children = (value.conditions || []).map((v) => new WhenTreeItem(context, v));
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
