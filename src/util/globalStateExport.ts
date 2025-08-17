import * as fs from 'fs';
import * as vscode from 'vscode';

export async function getExportDisposables(context: vscode.ExtensionContext) {
  const exportGlobalState = vscode.commands.registerCommand(
    'shortcut-quiz.exportGlobalState',
    async () => {
      try {
        const stateData: { [key: string]: any } = {};
        for (const key of context.globalState.keys()) {
          stateData[key] = context.globalState.get(key);
        }
        const saveUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file('globalState.json'),
          filters: {
            'JSON Files': ['json'],
            'All Files': ['*'],
          },
          saveLabel: 'Export GlobalState',
        });
        if (saveUri) {
          await fs.promises.writeFile(saveUri.fsPath, JSON.stringify(stateData, null, 2), 'utf8');
          vscode.window.showInformationMessage(
            `GlobalState exported successfully to: ${saveUri.fsPath}`,
          );
          const openFile = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Would you like to open the exported file?',
          });
          if (openFile === 'Yes') {
            const document = await vscode.workspace.openTextDocument(saveUri);
            await vscode.window.showTextDocument(document);
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to export globalState: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
  return [exportGlobalState];
}
