import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

export const importantShortcutsKey = 'importantShortcuts';

export interface ShortcutImport {
  command: string;
  key: string;
  when?: string;
  title?: string;
  origin?: string;
}

export interface Shortcut {
  title: string;
  keys: { [key: string]: string[] | null };
  learningState: number;
  origins: string[];
  important: boolean;
}

export interface Shortcuts {
  [command: string]: Shortcut;
}

function getImportantShortcuts(context: vscode.ExtensionContext): string[] {
  return context.globalState.get<string[]>(importantShortcutsKey) ?? [];
}

export function addShortcut(
  shortcuts: Shortcuts,
  { command, key, when, title, origin }: ShortcutImport,
  importantShortcuts: string[],
) {
  const normalizedKey = normalizeKey(key);
  if (!shortcuts[command]) {
    let finalTitle = title;
    if (!finalTitle) {
      finalTitle =
        command
          .split('.')
          .at(-1)!
          .replace(/([A-Z])/g, ' $1') || command;
      finalTitle = finalTitle.charAt(0).toUpperCase() + finalTitle.slice(1);
    }
    if (command === 'gitlens.key.alt+.') {
      console.log('gitlens.key.alt+.', { command, key, when, title, origin });
      console.log(finalTitle);
    }
    shortcuts[command] = {
      title: finalTitle.trim(),
      keys: {
        [normalizeKey(normalizedKey)]: when ? [when] : null,
      },
      learningState: 0,
      origins: origin ? [origin] : [],
      important: importantShortcuts.includes(command),
    };
  } else {
    const existingShortcut = shortcuts[command];
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

export function normalizeKey(key: string) {
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

export function removeShortcut(shortcuts: Shortcuts, { command, key, when }: ShortcutImport) {
  const originalCommand = command.slice(1);
  if (!shortcuts[originalCommand]) {
    return;
  }
  const normalizedKey = normalizeKey(key);
  const existingShortcut = shortcuts[originalCommand];
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

export async function loadShortcutsFromDefault(
  context: vscode.ExtensionContext,
  shortcuts: Shortcuts,
) {
  // const shortcuts: Shortcuts = {};
  const defaultShortcutsPath = path.join(context.extensionPath, 'data', 'default_shortcuts.json');
  const defaultShortcutsContent = fs.readFileSync(defaultShortcutsPath, 'utf8');
  const defaultShortcuts: { command: string; key: string; when?: string }[] =
    JSON.parse(defaultShortcutsContent);
  defaultShortcuts.forEach((shortcut) => {
    addShortcut(
      shortcuts,
      {
        ...shortcut,
        origin: 'default',
      },
      getImportantShortcuts(context),
    );
  });
  context.globalState.update('shortcuts', shortcuts);
}

async function getShortcutsJson(): Promise<string> {
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

export async function loadShortcutsFromExtensions(
  context: vscode.ExtensionContext,
  shortcuts: Shortcuts,
) {
  // const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
  vscode.extensions.all.forEach((e) => {
    ((e.packageJSON.contributes?.keybindings ?? []) as ShortcutImport[])
      .filter((kb) => kb.key)
      .forEach((shortcut) => {
        const command = ((e.packageJSON.contributes?.commands ?? []) as ShortcutImport[]).find(
          (c) => c.command === shortcut.command,
        );
        addShortcut(
          shortcuts,
          { ...shortcut, title: command?.title, origin: e.id },
          getImportantShortcuts(context),
        );
      });
  });
  context.globalState.update('shortcuts', shortcuts);
}

export async function loadShortcutsFromConfiguration(
  context: vscode.ExtensionContext,
  shortcuts: Shortcuts,
) {
  // const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
  const fileContent = await getShortcutsJson();
  const userShortcuts = JSON.parse(fileContent.toString()) as ShortcutImport[];
  for (const shortcut of userShortcuts) {
    if (shortcut.command.startsWith('-')) {
      removeShortcut(shortcuts, shortcut);
    } else {
      addShortcut(shortcuts, { ...shortcut, origin: 'user' }, getImportantShortcuts(context));
    }
  }
  context.globalState.update('shortcuts', shortcuts);
}
