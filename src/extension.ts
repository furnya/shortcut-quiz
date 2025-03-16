// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as fsAsync from 'fs/promises';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "shortcut-quiz" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand(
    'shortcut-quiz.activate',
    async () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      // vscode.window.showInformationMessage('Hello World from shortcut-quiz3!');
      // vscode.window.showInformationMessage(
      //   JSON.stringify(vscode.workspace.getConfiguration().inspect('keyboard.keybindingsFilePath'))
      // );

      // vscode.window.showInformationMessage(await getKeybindingsJson());
      const shortcuts: { [k: string]: any } = {};
      const defaultKeybindingsPath = path.join(
        context.extensionPath,
        'src',
        'default_keybindings.json'
      );
      const defaultKeybindingsContent = fs.readFileSync(
        defaultKeybindingsPath,
        'utf8'
      );
      const defaultKeybindings = JSON.parse(defaultKeybindingsContent);
      defaultKeybindings.forEach(
        (keybinding: { command: string; key: string; when?: string }) => {
          // shortcuts.push({ ...keybinding, extension: 'Default' });
          const title = keybinding.command
            .split('.')
            .at(-1)!
            .replace(/([A-Z])/g, ' $1');
          // if (!shortcuts[keybinding.command]) {
          //   shortcuts[keybinding.command] = [];
          // }
          addKeybinding(shortcuts, { ...keybinding, title });
          // shortcuts[keybinding.command].push({
          //   ...keybinding,
          //   extension: 'Default',
          //   title: title.charAt(0).toUpperCase() + title?.slice(1),
          // });
        }
      );
      vscode.extensions.all.slice(0, 1000).forEach((e) => {
        // return JSON.stringify(e.packageJSON);
        (e.packageJSON.contributes?.keybindings ?? [])
          .filter((kb: any) => kb.key)
          .forEach((keybinding: any) => {
            const command = e.packageJSON.contributes?.commands?.find(
              (c: any) => c.command === keybinding.command
            );
            // shortcuts.push({
            // if (!shortcuts[keybinding.command]) {
            //   shortcuts[keybinding.command] = [];
            // }
            // if (shortcuts[keybinding.command]) {
            //   if (
            //     compareKeys(shortcuts[keybinding.command].key, keybinding.key)
            //   ) {
            //     return;
            //   }
            //   console.error(
            //     `Duplicate keybinding found for command ${
            //       keybinding.command
            //     } with keys ${shortcuts[keybinding.command].key} and ${
            //       keybinding.key
            //     }`
            //   );
            // }
            // shortcuts[keybinding.command] = {
            // shortcuts[keybinding.command].push({
            //   ...keybinding,
            //   extension: e.id,
            //   title: command?.title,
            // });
            addKeybinding(shortcuts, {
              ...keybinding,
              title: command?.title,
            });
          });
      });
      // return;
      // const keybindingsPath = vscode.Uri.file(
      //   // `${vscode.env.appRoot}/User/keybindings.json`
      //   vscode.workspace.getConfiguration().get('keyboard.keybindingsFilePath')
      // );
      const fileContent = await getKeybindingsJson();
      // console.log(fileContent.toString());
      const userKeybindings = JSON.parse(fileContent.toString());
      // userKeybindings.forEach(async (keybinding: any) => {
      for (const keybinding of userKeybindings.slice(0, 1000)) {
        // const title = await attemptToGetCommandTitle(keybinding.command);
        // if (!shortcuts[keybinding.command]) {
        //   shortcuts[keybinding.command] = [];
        // }
        // shortcuts.push({ ...keybinding, extension: 'User', title });
        // shortcuts[keybinding.command].push({
        //   ...keybinding,
        //   extension: 'User',
        //   // title,
        // });
        if (keybinding.command.startsWith('-')) {
          removeKeybinding(shortcuts, keybinding);
        } else {
          addKeybinding(shortcuts, keybinding);
        }
      }
      // });
      //   vscode.commands.getCommands(true).then((commands) => {
      //     vscode.window.showInformationMessage(JSON.stringify(commands));
      //   });
      // const panel = vscode.window.createWebviewPanel(
      //   'shortcutQuiz',
      //   'Shortcut Quiz',
      //   vscode.ViewColumn.One,
      //   { enableScripts: true }
      // );
      // panel.webview.html = getWebviewContent(shortcuts);
      // });

      context.globalState.update('shortcuts', shortcuts);
      vscode.window.showInformationMessage('Shortcuts loaded');
      // checkAndShowEditor(context);
      const testShortcut = Object.values(shortcuts)[30];
      await openHtmlEditor(
        context,
        testShortcut.title,
        Object.keys(testShortcut.keys)[0]
        // `Opening the Command Palette`,
        // 'Ctrl+Shift+P',
      );
      setInterval(async () => checkAndShowEditor(context), 5000);
    }
  );
  const disposable2 = vscode.commands.registerCommand(
    'shortcut-quiz.inspectGlobalState',
    () => {
      const allKeys = context.globalState.keys();
      const stateContents: any = {};

      for (const key of allKeys) {
        stateContents[key] = context.globalState.get(key);
      }

      // Show in output channel
      const channel = vscode.window.createOutputChannel(
        'Shortcut Quiz Global State'
      );
      channel.appendLine(JSON.stringify(stateContents, null, 2));
      channel.show();

      // Or show in a quick look panel
      // vscode.window.showInformationMessage(
      //   `Global State: ${JSON.stringify(stateContents)}`
      // );
    }
  );
  context.subscriptions.push(disposable);
  vscode.commands.executeCommand('shortcut-quiz.activate');
}

// This method is called when your extension is deactivated
export function deactivate() {}

async function openHtmlEditor(
  context: vscode.ExtensionContext,
  title: string = `Opening the Command Palette`,
  key: string = 'Ctrl+Shift+P'
  // key: string = 'Escape Escape'
) {
  const panel = vscode.window.createWebviewPanel(
    'customHtmlView',
    'Custom HTML View',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  // Load HTML skeleton from file
  const htmlFilePath = path.join(
    context.extensionPath,
    'src',
    'quiz_editor.html'
  );
  let htmlContent = await fsAsync.readFile(htmlFilePath, 'utf8');

  // Inject custom content
  htmlContent = htmlContent.replaceAll('{{TITLE}}', title);
  htmlContent = htmlContent.replaceAll('{{KEY}}', key);

  // Set the panel content
  panel.webview.html = htmlContent;
}

async function getKeybindingsJson(): Promise<string> {
  try {
    // Get the keybindings file URI
    const keybindingsUri = await getKeybindingsFileUri();

    // Read the file content
    const fileContent = await vscode.workspace.fs.readFile(keybindingsUri);

    // Convert the Uint8Array to string
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

  if (process.platform === 'win32') {
    keybindingsPath = path.join(
      homedir,
      'AppData',
      'Roaming',
      'Code',
      'User',
      'keybindings.json'
    );
  } else if (process.platform === 'darwin') {
    keybindingsPath = path.join(
      homedir,
      'Library',
      'Application Support',
      'Code',
      'User',
      'keybindings.json'
    );
  } else {
    keybindingsPath = path.join(
      homedir,
      '.config',
      'Code',
      'User',
      'keybindings.json'
    );
  }

  return vscode.Uri.file(keybindingsPath);
}

function normalizeKey(key: string) {
  return key
    .split('+')
    .sort()
    .map((k) => k.trim().toLowerCase())
    .join('+');
}

function addKeybinding(keybindings: any, { command, key, when, title }: any) {
  const normalizedKey = normalizeKey(key);
  if (!keybindings[command]) {
    keybindings[command] = {
      title: title,
      keys: {
        [normalizeKey(normalizedKey)]: when ? [when] : null,
      },
      when: when,
    };
  } else {
    const existingKeybinding = keybindings[command];
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

function removeKeybinding(keybindings: any, { command, key, when }: any) {
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
    existingKeybinding.keys[normalizedKey] = existingKeybinding.keys[
      normalizedKey
    ].filter((w: string) => w !== when);
  } else {
    delete existingKeybinding.keys[normalizedKey];
  }
}

const INTERVAL_MS = 100 * 1000; // 10 seconds

async function checkAndShowEditor(context: vscode.ExtensionContext) {
  if (vscode.window.state.focused && (await shouldShowEditor(context))) {
    await openHtmlEditor(context);
    await updateLastShownTimestamp(context);
  }
}

async function shouldShowEditor(
  context: vscode.ExtensionContext
): Promise<boolean> {
  const lastShown = context.globalState.get<number>('lastShownTimestamp') || 0;
  const nextShowTime = lastShown + INTERVAL_MS;
  return Date.now() > nextShowTime;
}

async function updateLastShownTimestamp(context: vscode.ExtensionContext) {
  await context.globalState.update('lastShownTimestamp', Date.now());
}
