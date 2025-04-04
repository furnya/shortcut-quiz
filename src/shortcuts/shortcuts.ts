import * as fs from 'fs';
import * as fsAsync from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { MainCommandTreeItem } from '../tree_view/tree_item';
import { ShortcutImport, ShortcutNonRecursive, Shortcuts } from './types';

export const importantShortcutsKey = 'importantShortcuts';
export const shortcutsKey = 'shortcuts';

function getImportantShortcuts(context: vscode.ExtensionContext): string[][] {
  return context.globalState.get<string[][]>(importantShortcutsKey) ?? [];
}

function setImportantShortcuts(context: vscode.ExtensionContext, shortcuts: string[]) {
  context.globalState.update(importantShortcutsKey, shortcuts);
}

export function getShortcuts(context: vscode.ExtensionContext): Shortcuts {
  return context.globalState.get<Shortcuts>(shortcutsKey) ?? {};
}

function setShortcuts(context: vscode.ExtensionContext, shortcuts: Shortcuts) {
  context.globalState.update(shortcutsKey, shortcuts);
}

export function updateShortcuts(
  context: vscode.ExtensionContext,
  updateFn: (shortcuts: Shortcuts) => Shortcuts,
) {
  const shortcuts = getShortcuts(context);
  const newShortcuts = updateFn(shortcuts);
  setShortcuts(context, newShortcuts);
}

export async function loadImportantShortcuts(context: vscode.ExtensionContext) {
  const importantShortcutsPath = path.join(
    context.extensionPath,
    'data',
    'shortcut_selection.json',
  );
  const importantShortcutsJson = await fsAsync.readFile(importantShortcutsPath, 'utf8');
  const importantShortcuts = JSON.parse(importantShortcutsJson) as string[];
  setImportantShortcuts(context, importantShortcuts);
}

function normalizeKey(key: string) {
  return key
    .split(' ')
    .map((k) =>
      k
        .split('+')
        .map((k) => k.trim().toLowerCase())
        .sort((a, b) => {
          const specialKeys = ['ctrl', 'shift', 'alt', 'cmd', 'meta', 'win'];
          if (specialKeys.includes(a) && !specialKeys.includes(b)) {
            return -1;
          }
          if (specialKeys.includes(b) && !specialKeys.includes(a)) {
            return 1;
          }
          return a.localeCompare(b);
        })
        .join('+'),
    )
    .join(' ');
}

class ShortcutLoadManager {
  private importantShortcuts: string[][];
  private backupImportantCommands: { command: string; important: boolean }[] = [];
  constructor(
    public shortcuts: Shortcuts,
    context: vscode.ExtensionContext,
  ) {
    this.importantShortcuts = getImportantShortcuts(context);
  }

  resetKeys() {
    this.backupImportantCommands = Object.entries(this.shortcuts).map(([command, shortcut]) => ({
      command,
      important: shortcut.important,
    }));
    this.shortcuts = {};
  }

  addShortcut({ command, key, when, title, origin }: ShortcutImport) {
    const normalizedKey = normalizeKey(key);
    let existingShortcut: ShortcutNonRecursive | undefined = this.shortcuts[command];
    if (!existingShortcut) {
      const existingMainShortcut = Object.values(this.shortcuts).find((s) =>
        Object.keys(s.relatedShortcuts ?? {}).includes(command),
      );
      if (existingMainShortcut) {
        existingShortcut = existingMainShortcut.relatedShortcuts![command];
      }
    }
    if (!existingShortcut) {
      let finalTitle = title;
      if (!finalTitle) {
        finalTitle =
          command
            .split('.')
            .at(-1)!
            .replace(/([A-Z])/g, ' $1') || command;
        finalTitle = finalTitle.charAt(0).toUpperCase() + finalTitle.slice(1);
      }
      this.shortcuts[command] = {
        title: finalTitle.trim(),
        keys: {
          [normalizeKey(normalizedKey)]: when ? [when] : null,
        },
        learningState: 0,
        origins: origin ? [origin] : [],
        important: false,
      };
    } else {
      if (origin && !existingShortcut.origins.includes(origin)) {
        existingShortcut.origins.push(origin);
      }
      if (!existingShortcut.keys[normalizedKey]) {
        existingShortcut.keys[normalizedKey] = when ? [when] : null;
      } else {
        if (
          when &&
          existingShortcut.keys[normalizedKey] &&
          !existingShortcut.keys[normalizedKey].includes(when)
        ) {
          existingShortcut.keys[normalizedKey].push(when);
        }
      }
    }
  }

  removeShortcut({ command, key, when }: ShortcutImport) {
    if (!this.shortcuts[command]) {
      return;
    }
    const normalizedKey = normalizeKey(key);
    const existingShortcut = this.shortcuts[command];
    if (!existingShortcut.keys[normalizedKey]) {
      return;
    }
    if (when) {
      existingShortcut.keys[normalizedKey] = existingShortcut.keys[normalizedKey].filter(
        (w: string) => w !== when,
      );
    } else {
      delete existingShortcut.keys[normalizedKey];
    }
  }

  groupImportantShortcuts() {
    this.importantShortcuts.forEach((group) => {
      const mainCommand = group[0];
      const mainShortcut = this.shortcuts[mainCommand];
      mainShortcut.important = true;
      group.slice(1).forEach((command) => {
        const shortcut = this.shortcuts[command];
        if (shortcut) {
          mainShortcut.relatedShortcuts = mainShortcut.relatedShortcuts || {};
          mainShortcut.relatedShortcuts[command] = {
            title: shortcut.title,
            keys: shortcut.keys,
            origins: shortcut.origins,
          };
          delete this.shortcuts[command];
        }
      });
    });
  }

  restoreImportantShortcuts() {
    this.backupImportantCommands.forEach(({ command, important }) => {
      const shortcut = this.shortcuts[command];
      if (shortcut) {
        shortcut.important = important;
      }
    });
  }
}

export function getShortcutsFromDefault(context: vscode.ExtensionContext) {
  const defaultShortcuts: { command: string; key: string; when?: string }[] = JSON.parse(
    fs.readFileSync(path.join(context.extensionPath, 'data', 'default_shortcuts.json'), 'utf8'),
  );
  return defaultShortcuts.map((shortcut) => ({
    ...shortcut,
    origin: 'default',
  }));
}

export function getUserShortcutsFileUri(onlyFolder: boolean = false): vscode.Uri {
  const homedir = require('os').homedir();
  let shortcutsPath;

  let defaultPathEnd = ['Code', 'User', 'keybindings.json'];
  if (onlyFolder) {
    defaultPathEnd = defaultPathEnd.slice(0, -1);
  }
  if (process.platform === 'win32') {
    shortcutsPath = path.join(homedir, 'AppData', 'Roaming', ...defaultPathEnd);
  } else if (process.platform === 'darwin') {
    shortcutsPath = path.join(homedir, 'Library', 'Application Support', ...defaultPathEnd);
  } else {
    shortcutsPath = path.join(homedir, '.config', ...defaultPathEnd);
  }

  return vscode.Uri.file(shortcutsPath);
}

async function getUserShortcutsJson(): Promise<string> {
  try {
    const shortcutsUri = getUserShortcutsFileUri();
    const fileContent = await vscode.workspace.fs.readFile(shortcutsUri);
    return Buffer.from(fileContent).toString('utf8');
  } catch (error) {
    const errorMessage = `Failed to read keybindings.json: ${error}`;
    console.error(errorMessage);
    vscode.window.showErrorMessage(errorMessage);
    return '';
  }
}

export async function getShortcutsFromConfiguration() {
  const fileContent = await getUserShortcutsJson();
  const userShortcuts = JSON.parse(fileContent.toString()) as ShortcutImport[];
  const shortcutsToAdd = userShortcuts
    .filter((shortcut) => !shortcut.command.startsWith('-'))
    .map((shortcut) => ({ ...shortcut, origin: 'user' }));
  const shortcutsToRemove = userShortcuts
    .filter((shortcut) => shortcut.command.startsWith('-'))
    .map((shortcut) => ({ ...shortcut, command: shortcut.command.slice(1) }));
  return { shortcutsToAdd, shortcutsToRemove };
}

export function getShortcutsFromExtensions() {
  return vscode.extensions.all
    .filter((e) => e.packageJSON.contributes?.keybindings)
    .map((e) =>
      (e.packageJSON.contributes?.keybindings as ShortcutImport[])
        .filter((kb) => kb.key)
        .map((shortcut) => {
          const command = ((e.packageJSON.contributes?.commands ?? []) as ShortcutImport[]).find(
            (c) => c.command === shortcut.command,
          );
          return { ...shortcut, title: command?.title, origin: e.id };
        }),
    )
    .flat();
}

export async function getShortcutsDisposables(context: vscode.ExtensionContext) {
  await loadImportantShortcuts(context);

  async function reloadAllShortcuts() {
    const timeLabel = 'loadShortcuts_' + new Date().toISOString();
    console.time(timeLabel);
    const shortcuts = getShortcuts(context);
    const manager = new ShortcutLoadManager(shortcuts, context);
    manager.resetKeys();
    const defaultShortcuts = getShortcutsFromDefault(context);
    defaultShortcuts.forEach((shortcut) => manager.addShortcut(shortcut));
    const extensionShortcuts = getShortcutsFromExtensions();
    extensionShortcuts.forEach((shortcut) => manager.addShortcut(shortcut));
    const { shortcutsToAdd, shortcutsToRemove } = await getShortcutsFromConfiguration();
    shortcutsToAdd.forEach((shortcut) => manager.addShortcut(shortcut));
    shortcutsToRemove.forEach((shortcut) => manager.removeShortcut(shortcut));
    manager.groupImportantShortcuts();
    manager.restoreImportantShortcuts();
    setShortcuts(context, manager.shortcuts);
    console.timeEnd(timeLabel);
  }
  await reloadAllShortcuts();

  const configChangeListener = vscode.workspace.onDidChangeConfiguration(async (e) => {
    console.log('Config has changed');
    await reloadAllShortcuts();
  });

  const resetShortcutsCommand = vscode.commands.registerCommand(
    'shortcut-quiz.resetShortcuts',
    async () => {
      // only for debugging
      context.globalState.update('shortcuts', {});
      context.globalState.update('shortcutsGrouped', false);
      await reloadAllShortcuts();
    },
  );

  const userShortcutsWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(getUserShortcutsFileUri(true).fsPath, 'keybindings.json'),
    false, // ignoreCreateEvents
    false, // ignoreChangeEvents
    false, // ignoreDeleteEvents
  );
  userShortcutsWatcher.onDidChange(async () => {
    console.log('User shortcuts have changed');
    await reloadAllShortcuts();
  });

  const extensionChangeListener = vscode.extensions.onDidChange(() => {
    console.log('Extensions have changed (installed/uninstalled)');
    setTimeout(() => reloadAllShortcuts(), 10000);
  });

  function updateCommandImportance(item: MainCommandTreeItem, importance: boolean) {
    updateShortcuts(context, (shortcuts) => {
      if (shortcuts[item.commandString]) {
        shortcuts[item.commandString].important = importance;
      }
      return shortcuts;
    });
    vscode.commands.executeCommand('shortcut-quiz.refreshActiveTreeView');
    vscode.commands.executeCommand('shortcut-quiz.refreshInactiveTreeView');
  }

  const starCommandCommand = vscode.commands.registerCommand(
    'shortcut-quiz.starCommand',
    (item: MainCommandTreeItem) => updateCommandImportance(item, true),
  );
  const unstarCommandCommand = vscode.commands.registerCommand(
    'shortcut-quiz.unstarCommand',
    (item: MainCommandTreeItem) => updateCommandImportance(item, false),
  );

  return [
    configChangeListener,
    extensionChangeListener,
    userShortcutsWatcher,
    starCommandCommand,
    unstarCommandCommand,
    resetShortcutsCommand,
  ];
}
