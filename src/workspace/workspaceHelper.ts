import * as vscode from "vscode";

export async function askForWorkspaceFolder(): Promise<
  vscode.WorkspaceFolder | undefined
> {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showInformationMessage("No workspace folders are open.");
    return undefined;
  }

  if (workspaceFolders.length === 1) {
    return workspaceFolders[0];
  }

  const folder = await vscode.window.showWorkspaceFolderPick({
    placeHolder: "Select a workspace folder",
  });

  if (!folder) {
    vscode.window.showInformationMessage("No workspace folder selected.");
  }

  return folder;
}