// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
// import * as fs from 'fs';
import * as fsAsync from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
// eslint-disable-next-line @typescript-eslint/naming-convention
import _ from 'lodash';
import {
  loadKeybindingsFromDefault,
  loadKeybindingsFromConfiguration,
  loadKeybindingsFromExtensions,
  Shortcuts,
  getKeybindingsFileUri,
  Shortcut,
} from './shortcuts';

let quizInterval: NodeJS.Timeout | null = null;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "shortcut-quiz" is now active!');

  const importantKeybindingsPath = path.join(
    context.extensionPath,
    'src',
    'keybinding_selection.json',
  );
  const importantKeybindingsJson = await fsAsync.readFile(importantKeybindingsPath, 'utf8');
  const importantKeybindings = JSON.parse(importantKeybindingsJson) as string[];
  context.globalState.update('importantKeybindings', importantKeybindings);

  const keybindingsChangeListener = vscode.workspace.onDidChangeConfiguration(async (e) => {
    console.log('Config has changed');
    // await loadKeybindingsFromConfiguration(context);
    await reloadAllKeybindings();
  });

  const userKeybindingsWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(getKeybindingsFileUri(true).fsPath, 'keybindings.json'),
    false, // ignoreCreateEvents
    false, // ignoreChangeEvents
    false, // ignoreDeleteEvents
  );
  userKeybindingsWatcher.onDidChange(async (e) => {
    console.log('Keybindings have changed');
    console.log(e);
    // await loadKeybindingsFromConfiguration(context);
    await reloadAllKeybindings();
  });

  async function reloadAllKeybindings() {
    const timeLabel = 'loadKeybindings_' + new Date().toISOString();
    console.time(timeLabel);
    const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
    for (const command in shortcuts) {
      shortcuts[command].keys = {};
    }
    await loadKeybindingsFromDefault(context, shortcuts);
    await loadKeybindingsFromExtensions(context, shortcuts);
    await loadKeybindingsFromConfiguration(context, shortcuts);
    console.timeEnd(timeLabel);
  }

  // Listen for extension changes
  const extensionChangeListener = vscode.extensions.onDidChange(() => {
    console.log('Extensions have changed (installed/uninstalled)');
    // setTimeout(() => loadKeybindingsFromExtensions(context), 10000);
    setTimeout(() => reloadAllKeybindings(), 10000);
  });

  class KeybindingTreeItem extends vscode.TreeItem {
    public readonly isKeybinding: boolean;
    public readonly children: KeybindingTreeItem[] = [];
    public readonly commandString: string;
    constructor(
      public readonly key: string,
      public readonly value: any,
      public readonly parent: KeybindingTreeItem | null = null,
      public readonly collapseCommand: boolean = false,
    ) {
      let label = parent?.label === 'Keys' ? key : key.charAt(0).toUpperCase() + key.slice(1);
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
      this.isKeybinding = parent?.label === 'Keys';
      this.parent = parent;
      if (this.isKeybinding) {
        this.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'assets', 'keyboard.svg'));
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      } else if (this.parent?.isKeybinding) {
        this.iconPath = vscode.Uri.file(
          path.join(context.extensionPath, 'assets', 'question_mark.svg'),
        );
        this.label = value;
      }
      if (typeof value === 'object' && value !== null && key !== 'origins') {
        this.children = Object.entries(value)
          .filter(([k, v]) => !['title'].includes(k))
          .map(([k, v]) => {
            return new KeybindingTreeItem(k, v, this);
          });
      }
    }
  }

  abstract class ShortcutTreeDataProvider implements vscode.TreeDataProvider<KeybindingTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<KeybindingTreeItem | undefined> =
      new vscode.EventEmitter<KeybindingTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<KeybindingTreeItem | undefined> =
      this._onDidChangeTreeData.event;
    sortOrder: 'alphabetical' | 'learningState' = 'alphabetical';
    protected abstract filterCondition(shortcut: Shortcut): boolean;
    protected abstract collapseCommand: boolean;
    refresh() {
      this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: KeybindingTreeItem): vscode.TreeItem {
      return element;
    }

    getChildren(element?: KeybindingTreeItem): KeybindingTreeItem[] {
      const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
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
          .map(([key, value]) => new KeybindingTreeItem(key, value, null, this.collapseCommand));
      }
      return element.children;
    }
  }
  class ShortcutInactiveTreeDataProvider extends ShortcutTreeDataProvider {
    protected filterCondition(shortcut: Shortcut): boolean {
      return !shortcut.important;
    }
    protected collapseCommand = true;
  }
  class ShortcutActiveTreeDataProvider extends ShortcutTreeDataProvider {
    protected filterCondition(shortcut: Shortcut): boolean {
      return shortcut.important;
    }
    protected collapseCommand = false;
  }

  const shortcutActiveTreeDataProvider = new ShortcutActiveTreeDataProvider();
  vscode.window.createTreeView('shortcutQuizShortcutTreeViewActive', {
    treeDataProvider: shortcutActiveTreeDataProvider,
    showCollapseAll: true,
  });
  const shortcutInactiveTreeDataProvider = new ShortcutInactiveTreeDataProvider();
  vscode.window.createTreeView('shortcutQuizShortcutTreeViewInactive', {
    treeDataProvider: shortcutInactiveTreeDataProvider,
    showCollapseAll: true,
  });

  const starCommandCommand = vscode.commands.registerCommand(
    'shortcut-quiz.starCommand',
    async (keybinding: KeybindingTreeItem) => {
      const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
      if (shortcuts[keybinding.commandString]) {
        shortcuts[keybinding.key].important = true;
        await context.globalState.update('shortcuts', shortcuts);
        vscode.commands.executeCommand('shortcut-quiz.refreshActiveTreeView');
        vscode.commands.executeCommand('shortcut-quiz.refreshInactiveTreeView');
        // shortcutActiveTreeDataProvider.refresh();
        // shortcutInactiveTreeDataProvider.refresh();
      }
    },
  );
  const unstarCommandCommand = vscode.commands.registerCommand(
    'shortcut-quiz.unstarCommand',
    async (keybinding: KeybindingTreeItem) => {
      const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
      if (shortcuts[keybinding.commandString]) {
        shortcuts[keybinding.key].important = false;
        await context.globalState.update('shortcuts', shortcuts);
        vscode.commands.executeCommand('shortcut-quiz.refreshActiveTreeView');
        vscode.commands.executeCommand('shortcut-quiz.refreshInactiveTreeView');
        // shortcutActiveTreeDataProvider.refresh();
        // shortcutInactiveTreeDataProvider.refresh();
      }
    },
  );

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

  const startNewQuizCommand = vscode.commands.registerCommand(
    'shortcut-quiz.startNewQuiz',
    async () => {
      const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
      let selection = Object.entries(shortcuts).filter(([k, s]) => s.important);
      _.shuffle(selection);
      // TODO choose shortcuts with lowest learning state
      // selection = selection.sort((a, b) => a[1].learningState - b[1].learningState);
      selection = _.sortBy(selection, (s) => s[1].learningState);
      // selection = _.sampleSize(selection, 10);
      selection = selection.slice(0, 10);
      // selection = [
      //   'workbench.action.exitZenMode',
      //   'editor.action.outdentLines',
      //   'workbench.action.closeActiveEditor',
      //   'breadcrumbs.focus',
      // ].map((k) => [k, shortcuts[k]]);
      await openHtmlEditor(
        context,
        selection.map(([k, s]) => ({ title: s.title, keys: Object.keys(s.keys), command: k })),
      );
    },
  );

  context.subscriptions.push(
    keybindingsChangeListener,
    extensionChangeListener,
    startNewQuizCommand,
    starCommandCommand,
    unstarCommandCommand,
    refreshActiveTreeCommand,
    refreshInactiveTreeCommand,
    userKeybindingsWatcher,
    sortActiveTreeAlphabeticallyCommand,
    sortActiveTreeByScoreCommand,
    sortInactiveTreeAlphabeticallyCommand,
    sortInactiveTreeByScoreCommand,
    {
      dispose: () => {
        if (quizInterval) {
          clearInterval(quizInterval);
          quizInterval = null;
        }
      },
    },
  );
  // context.globalState.update('shortcuts', {});
  await reloadAllKeybindings();
  quizInterval = setInterval(async () => checkAndShowEditor(context), 30 * 1000);
}

// This method is called when your extension is deactivated
export function deactivate() {
  if (quizInterval) {
    clearInterval(quizInterval);
    quizInterval = null;
  }
}

async function openHtmlEditor(context: vscode.ExtensionContext, keybindings: any[] = []) {
  const panel = vscode.window.createWebviewPanel(
    'shortcutQuiz',
    'Shortcut Quiz',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  const htmlFilePath = path.join(context.extensionPath, 'src', 'quiz_editor.html');
  let htmlContent = await fsAsync.readFile(htmlFilePath, 'utf8');

  const keyMappingsPath = path.join(context.extensionPath, 'src', 'key_mappings.json');
  const keyMappingsJson = await fsAsync.readFile(keyMappingsPath, 'utf8');
  const keyMappings = JSON.parse(keyMappingsJson);

  panel.webview.html = htmlContent;
  function sendStartMessage() {
    panel.webview.postMessage({
      command: 'setKeybindings',
      keybindings,
      keyMappings,
      configKeyboardLanguage: vscode.workspace
        .getConfiguration('shortcutQuiz')
        .get('keyboardLayout'),
    });
  }
  // sendStartMessage();
  panel.webview.onDidReceiveMessage((message) => {
    if (message.command === 'keybindingAnswer') {
      const shortcuts = context.globalState.get<Shortcuts>('shortcuts') ?? {};
      const shortcut = shortcuts[message.keybindingCommand];
      shortcut.learningState = shortcut.learningState + (message.correct ? 1 : -1);
      context.globalState.update('shortcuts', shortcuts);
    } else if (message.command === 'ready') {
      sendStartMessage();
    }
  });
}

async function checkAndShowEditor(context: vscode.ExtensionContext) {
  if (vscode.window.state.focused && (await shouldShowEditor(context))) {
    vscode.commands.executeCommand('shortcut-quiz.startNewQuiz');
    await updateLastShownTimestamp(context);
  }
}

async function shouldShowEditor(context: vscode.ExtensionContext): Promise<boolean> {
  const lastShown = context.globalState.get<number>('lastShownTimestamp') || 0;
  const nextShowTime =
    lastShown +
    vscode.workspace.getConfiguration('shortcutQuiz').get('quizInterval', 60) * 1000 * 60;
  return Date.now() > nextShowTime;
}

async function updateLastShownTimestamp(context: vscode.ExtensionContext) {
  await context.globalState.update('lastShownTimestamp', Date.now());
}
