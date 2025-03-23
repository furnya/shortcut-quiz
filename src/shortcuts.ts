import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

export interface ShortcutImport {
  command: string;
  key: string;
  when?: string;
  title?: string;
}

export interface Shortcuts {
  [command: string]: {
    title?: string;
    keys: { [key: string]: string[] | null };
    learningState: number;
  };
}

export function addKeybinding(shortcuts: Shortcuts, { command, key, when, title }: ShortcutImport) {
  const normalizedKey = normalizeKey(key);
  if (!shortcuts[command]) {
    shortcuts[command] = {
      title: title,
      keys: {
        [normalizeKey(normalizedKey)]: when ? [when] : null,
      },
      learningState: 0,
    };
  } else {
    const existingKeybinding = shortcuts[command];
    if (!existingKeybinding.title && title) {
      existingKeybinding.title = title;
    }
    if (!existingKeybinding.keys[normalizedKey]) {
      existingKeybinding.keys[normalizedKey] = when ? [when] : null;
    } else {
      if (
        when &&
        existingKeybinding.keys[normalizedKey] &&
        !existingKeybinding.keys[normalizedKey].includes(when)
      ) {
        existingKeybinding.keys[normalizedKey].push(when);
      }
    }
  }
}

export function normalizeKey(key: string) {
  return key
    .split('+')
    .sort()
    .map((k) => k.trim().toLowerCase())
    .join('+');
}

export function removeKeybinding(keybindings: Shortcuts, { command, key, when }: ShortcutImport) {
  const originalCommand = command.slice(1);
  if (!keybindings[originalCommand]) {
    return;
  }
  const normalizedKey = normalizeKey(key);
  const existingKeybinding = keybindings[originalCommand];
  if (!existingKeybinding.keys[normalizedKey]) {
    return;
  }
  if (when) {
    existingKeybinding.keys[normalizedKey] = existingKeybinding.keys[normalizedKey].filter(
      (w: string) => w !== when,
    );
  } else {
    delete existingKeybinding.keys[normalizedKey];
  }
}

export async function loadKeybindingsFromDefault(context: vscode.ExtensionContext) {
  const shortcuts: Shortcuts = {};
  const defaultKeybindingsPath = path.join(
    context.extensionPath,
    'src',
    'default_keybindings.json',
  );
  const defaultKeybindingsContent = fs.readFileSync(defaultKeybindingsPath, 'utf8');
  const defaultKeybindings: { command: string; key: string; when?: string }[] =
    JSON.parse(defaultKeybindingsContent);
  defaultKeybindings.forEach((keybinding) => {
    const title = keybinding.command
      .split('.')
      .at(-1)!
      .replace(/([A-Z])/g, ' $1');
    addKeybinding(shortcuts, { ...keybinding, title });
  });
  context.globalState.update('shortcuts', shortcuts);
}

async function getKeybindingsJson(): Promise<string> {
  try {
    const keybindingsUri = await getKeybindingsFileUri();
    const fileContent = await vscode.workspace.fs.readFile(keybindingsUri);
    return Buffer.from(fileContent).toString('utf8');
  } catch (error) {
    console.error('Failed to read keybindings.json:', error);
    vscode.window.showErrorMessage(`Failed to read keybindings.json: ${error}`);
    return '';
  }
}

async function getKeybindingsFileUri(): Promise<vscode.Uri> {
  // Different OS paths for keybindings.json
  const homedir = require('os').homedir();
  let keybindingsPath;

  const defaultPathEnd = ['Code', 'User', 'keybindings.json'];
  if (process.platform === 'win32') {
    keybindingsPath = path.join(homedir, 'AppData', 'Roaming', ...defaultPathEnd);
  } else if (process.platform === 'darwin') {
    keybindingsPath = path.join(homedir, 'Library', 'Application Support', ...defaultPathEnd);
  } else {
    keybindingsPath = path.join(homedir, '.config', ...defaultPathEnd);
  }

  return vscode.Uri.file(keybindingsPath);
}

export async function loadKeybindingsFromExtensions(context: vscode.ExtensionContext) {
  const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
  vscode.extensions.all.forEach((e) => {
    ((e.packageJSON.contributes?.keybindings ?? []) as ShortcutImport[])
      .filter((kb) => kb.key)
      .forEach((keybinding) => {
        const command = ((e.packageJSON.contributes?.commands ?? []) as ShortcutImport[]).find(
          (c) => c.command === keybinding.command,
        );
        addKeybinding(shortcuts, { ...keybinding, title: command?.title });
      });
  });
  context.globalState.update('shortcuts', shortcuts);
}

export async function loadKeybindingsFromConfiguration(context: vscode.ExtensionContext) {
  const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
  const fileContent = await getKeybindingsJson();
  const userKeybindings = JSON.parse(fileContent.toString()) as ShortcutImport[];
  for (const keybinding of userKeybindings) {
    if (keybinding.command.startsWith('-')) {
      removeKeybinding(shortcuts, keybinding);
    } else {
      addKeybinding(shortcuts, keybinding);
    }
  }
  context.globalState.update('shortcuts', shortcuts);
}
