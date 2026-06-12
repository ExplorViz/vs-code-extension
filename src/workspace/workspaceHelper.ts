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

export async function buildSourceInfo(uri: vscode.Uri): Promise<{
  definitionUri: string;
  sourcePath: string;
  fileName: string;
  packageName: string;
  className: string;
}> {
  const document = await vscode.workspace.openTextDocument(uri);

  const fsPath = uri.fsPath;
  const sourcePath = toSourcePath(fsPath);
  const fileName = sourcePath.substring(sourcePath.lastIndexOf("/") + 1);
  const packageName = extractJavaPackageName(document.getText());
  const className = fileName.endsWith(".java")
    ? fileName.substring(0, fileName.length - ".java".length)
    : fileName;

  return {
    definitionUri: uri.toString(),
    sourcePath,
    fileName,
    packageName,
    className,
  };
}

function toSourcePath(absolutePath: string): string {
  const normalized = absolutePath.replaceAll("\\", "/");

  const srcIndex = normalized.indexOf("/src/");
  if (srcIndex >= 0) {
    return normalized.substring(srcIndex + 1);
  }

  return normalized;
}

function extractJavaPackageName(documentText: string): string {
  const match = documentText.match(/^\s*package\s+([a-zA-Z_][\w.]*)\s*;/m);
  return match?.[1] ?? "";
}