import * as fs from 'fs';
import * as fsAsync from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { MainCommandTreeItem, ShortcutTreeItem } from '../tree_view/tree_item';
import { PreselectedShortcuts, ShortcutImport, ShortcutNonRecursive, Shortcuts } from './types';

export const preselectedShortcutsKey = 'preselectedShortcuts';
export const shortcutsKey = 'shortcuts';

function getPreselectedShortcuts(context: vscode.ExtensionContext): PreselectedShortcuts {
  return context.globalState.get<PreselectedShortcuts>(preselectedShortcutsKey) ?? {};
}

function setPreselectedShortcuts(
  context: vscode.ExtensionContext,
  shortcuts: PreselectedShortcuts,
) {
  context.globalState.update(preselectedShortcutsKey, shortcuts);
}

export function getShortcuts(context: vscode.ExtensionContext): Shortcuts {
  return context.globalState.get<Shortcuts>(shortcutsKey) ?? {};
}

function setShortcuts(context: vscode.ExtensionContext, shortcuts: Shortcuts) {
  return context.globalState.update(shortcutsKey, shortcuts);
}

export function updateShortcuts(
  context: vscode.ExtensionContext,
  updateFn: (shortcuts: Shortcuts) => Shortcuts,
) {
  const shortcuts = getShortcuts(context);
  const newShortcuts = updateFn(shortcuts);
  return setShortcuts(context, newShortcuts);
}

export async function loadPreselectedShortcuts(context: vscode.ExtensionContext) {
  const preselectedShortcutsPath = path.join(
    context.extensionPath,
    'data',
    'shortcut_selection.json',
  );
  const preselectedShortcutsJson = await fsAsync.readFile(preselectedShortcutsPath, 'utf8');
  setPreselectedShortcuts(context, JSON.parse(preselectedShortcutsJson) as PreselectedShortcuts);
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
  private preselectedShortcuts: PreselectedShortcuts;
  private backupEnabledCommands: {
    command: string;
    enabled: boolean;
    enabledConditions: string[];
    learningState: number;
  }[] = [];
  constructor(
    public shortcuts: Shortcuts,
    context: vscode.ExtensionContext,
  ) {
    this.preselectedShortcuts = getPreselectedShortcuts(context);
  }

  resetKeys() {
    this.backupEnabledCommands = [];
    try {
      this.backupEnabledCommands = Object.entries(this.shortcuts).map(([command, shortcut]) => ({
        command,
        enabled: shortcut.enabled,
        enabledConditions: Object.values(shortcut.keybindings)
          .filter((k) => k.enabled)
          .flatMap((k) => k.conditions ?? []),
        learningState: shortcut.learningState,
      }));
    } catch (error) {
      console.error('Error while resetting keys:', error);
    }
    this.shortcuts = {};
  }

  addNewShortcut({ command, key, when, title, title_ai, origin }: ShortcutImport) {
    let finalTitle = title || title_ai;
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
      keybindings: {
        [normalizeKey(key)]: {
          enabled: true,
          conditions: when ? [when] : undefined,
          disablingPossible: false,
        },
      },
      learningState: 0,
      origins: origin ? [origin] : [],
      enabled: false,
    };
  }

  addToExistingShortcut(existingShortcut: ShortcutNonRecursive, shortcutImport: ShortcutImport) {
    const { when, origin, key } = shortcutImport;
    const normalizedKey = normalizeKey(key);
    if (origin && !existingShortcut.origins.includes(origin)) {
      existingShortcut.origins.push(origin);
    }
    if (!existingShortcut.keybindings[normalizedKey]) {
      existingShortcut.keybindings[normalizedKey] = {
        enabled: true,
        conditions: when ? [when] : undefined,
        disablingPossible: false,
      };
    } else {
      const keybindings = existingShortcut.keybindings[normalizedKey];
      if (!when) {
        keybindings.conditions = undefined;
      } else if (
        when &&
        keybindings.conditions !== undefined &&
        !keybindings.conditions.includes(when)
      ) {
        keybindings.conditions.push(when);
      }
    }
  }

  addShortcut(shortcutImport: ShortcutImport) {
    try {
      const command = shortcutImport.command;
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
        this.addNewShortcut(shortcutImport);
      } else {
        this.addToExistingShortcut(existingShortcut, shortcutImport);
      }
    } catch (error) {
      console.error('Error while adding shortcut:', error, shortcutImport);
    }
  }

  removeShortcut({ command, key, when }: ShortcutImport) {
    try {
      if (!this.shortcuts[command]) {
        return;
      }
      const normalizedKey = normalizeKey(key);
      const existingShortcut = this.shortcuts[command];
      if (!existingShortcut.keybindings[normalizedKey]) {
        return;
      }
      if (when) {
        existingShortcut.keybindings[normalizedKey].conditions = existingShortcut.keybindings[
          normalizedKey
        ].conditions?.filter((condition) => condition !== when);
      } else {
        delete existingShortcut.keybindings[normalizedKey];
      }
    } catch (error) {
      console.error('Error while removing shortcut:', error, { command, key, when });
    }
  }

  computeEnabledKeybindings() {
    Object.values(this.shortcuts).forEach((shortcut) => {
      const keybindingsWithConditions = Object.values(shortcut.keybindings).filter(
        (keybinding) => keybinding.conditions !== undefined,
      );
      const keybindingsWithoutConditions = Object.values(shortcut.keybindings).filter(
        (keybinding) => keybinding.conditions === undefined,
      );
      keybindingsWithConditions.forEach((keybinding) => {
        if (Object.values(shortcut.keybindings).length > 1) {
          keybinding.disablingPossible = true;
        }
        if (keybindingsWithoutConditions.length > 0) {
          keybinding.enabled = false;
        }
      });
    });
  }

  groupEnabledShortcuts() {
    try {
      Object.entries(this.preselectedShortcuts).forEach(([mainCommand, commandValue]) => {
        const mainShortcut = this.shortcuts[mainCommand];
        if (!mainShortcut) {
          console.warn(`Main command ${mainCommand} not found in shortcuts`);
          return;
        }
        mainShortcut.enabled = true;
        commandValue.relatedShortcuts?.forEach((command) => {
          const shortcut = this.shortcuts[command];
          if (!shortcut) {
            console.warn(`Related command ${command} not found in shortcuts`);
            return;
          }
          Object.values(shortcut.keybindings).forEach((keybinding) => {
            keybinding.enabled = true;
            keybinding.disablingPossible = false;
          });
          mainShortcut.relatedShortcuts = mainShortcut.relatedShortcuts || {};
          mainShortcut.relatedShortcuts[command] = {
            title: shortcut.title,
            keybindings: shortcut.keybindings,
            origins: shortcut.origins,
          };
          delete this.shortcuts[command];
        });
        if (commandValue.preferredConditions) {
          Object.values(mainShortcut.keybindings)
            .filter((keybinding) => keybinding.conditions !== undefined)
            .forEach((keybinding) => {
              keybinding.enabled = false;
              if (
                commandValue.preferredConditions!.some((condition) =>
                  keybinding.conditions!.includes(condition),
                )
              ) {
                keybinding.enabled = true;
              }
            });
        }
      });
    } catch (error) {
      console.error('Error while grouping shortcuts:', error);
    }
  }

  restoreEnabledShortcuts() {
    this.backupEnabledCommands.forEach(({ command, enabled, enabledConditions, learningState }) => {
      const shortcut = this.shortcuts[command];
      if (shortcut) {
        shortcut.learningState = learningState;
        shortcut.enabled = enabled;
        Object.values(shortcut.keybindings)
          .filter((keybinding) => keybinding.conditions !== undefined)
          .forEach((keybinding) => {
            keybinding.enabled = false;
            if (enabledConditions.some((condition) => keybinding.conditions!.includes(condition))) {
              keybinding.enabled = true;
            }
          });
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
    return '[]';
  }
}

export async function getShortcutsFromConfiguration() {
  const fileContent = await getUserShortcutsJson();
  const userShortcuts = JSON.parse(
    fileContent.toString().replace(/\/\/.*$/gm, ''),
  ) as ShortcutImport[];
  const shortcutsToAdd = userShortcuts
    .filter((shortcut) => !shortcut.command.startsWith('-'))
    .map((shortcut) => ({ ...shortcut, origin: 'user' }));
  const shortcutsToRemove = userShortcuts
    .filter((shortcut) => shortcut.command.startsWith('-'))
    .map((shortcut) => ({ ...shortcut, command: shortcut.command.slice(1) }));
  return { shortcutsToAdd, shortcutsToRemove };
}

export function getShortcutsFromExtensions() {
  try {
    return vscode.extensions.all
      .filter((e) => e.packageJSON?.contributes?.keybindings)
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
  } catch (error) {
    console.error('Error while getting shortcuts from extensions:', error);
    return [];
  }
}

export async function getShortcutsDisposables(context: vscode.ExtensionContext) {
  await loadPreselectedShortcuts(context);

  async function reloadAllShortcuts() {
    const timeLabel = 'loadShortcuts_' + new Date().toISOString();
    console.time(timeLabel);
    const shortcuts = getShortcuts(context);
    const shortcutsCopy = JSON.parse(JSON.stringify(shortcuts)) as Shortcuts;
    try {
      const manager = new ShortcutLoadManager(shortcuts, context);
      manager.resetKeys();
      const defaultShortcuts = getShortcutsFromDefault(context);
      defaultShortcuts.forEach((shortcut) => manager.addShortcut(shortcut));
      const extensionShortcuts = getShortcutsFromExtensions();
      extensionShortcuts.forEach((shortcut) => manager.addShortcut(shortcut));
      const { shortcutsToAdd, shortcutsToRemove } = await getShortcutsFromConfiguration();
      shortcutsToAdd.forEach((shortcut) => manager.addShortcut(shortcut));
      shortcutsToRemove.forEach((shortcut) => manager.removeShortcut(shortcut));
      manager.computeEnabledKeybindings();
      manager.groupEnabledShortcuts();
      manager.restoreEnabledShortcuts();
      await setShortcuts(context, manager.shortcuts);
    } catch (error) {
      console.error('Error while loading shortcuts:', error);
      await setShortcuts(context, shortcutsCopy);
    }
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
  const reloadShortcutsCommand = vscode.commands.registerCommand(
    'shortcut-quiz.reloadShortcuts',
    async () => {
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
        shortcuts[item.commandString].enabled = importance;
      }
      return shortcuts;
    });
    vscode.commands.executeCommand('shortcut-quiz.refreshActiveTreeView');
    vscode.commands.executeCommand('shortcut-quiz.refreshInactiveTreeView');
  }
  function updateConditionImportance(item: ShortcutTreeItem, importance: boolean) {
    updateShortcuts(context, (shortcuts) => {
      const command = item.parent.commandString;
      const key = item.key;
      shortcuts[command].keybindings[key].enabled = importance;
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
  const starKeybindingCommand = vscode.commands.registerCommand(
    'shortcut-quiz.starKeybinding',
    (item: ShortcutTreeItem) => updateConditionImportance(item, true),
  );
  const unstarKeybindingCommand = vscode.commands.registerCommand(
    'shortcut-quiz.unstarKeybinding',
    (item: ShortcutTreeItem) => updateConditionImportance(item, false),
  );

  return [
    configChangeListener,
    extensionChangeListener,
    userShortcutsWatcher,
    starCommandCommand,
    unstarCommandCommand,
    resetShortcutsCommand,
    reloadShortcutsCommand,
    starKeybindingCommand,
    unstarKeybindingCommand,
  ];
}
