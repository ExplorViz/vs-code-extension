import * as vscode from "vscode";
import { ContainingSymbolPath } from "../symbols/containingTypeResolver";
import { QualifiedTypeNameParts } from "../symbols/languages/java/javaQualifiedNameResolver";

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

export async function buildSourceInfo(
  uri: vscode.Uri,
  typeParts?: QualifiedTypeNameParts
): Promise<{
  definitionUri: string;
  sourcePath: string;
  fileName: string;
  packageName: string;
  className: string;
}> {
  const sourcePath = toWorkspaceRelativePath(uri);
  const fileName = sourcePath.substring(sourcePath.lastIndexOf("/") + 1);

  return {
    definitionUri: uri.toString(),
    sourcePath,
    fileName,
    packageName: typeParts?.packageName ?? "",
    className: typeParts?.className ?? removeFileExtension(fileName),
  };
}

function toWorkspaceRelativePath(uri: vscode.Uri): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

  if (!workspaceFolder) {
    return uri.fsPath.replaceAll("\\", "/");
  }

  return vscode.workspace.asRelativePath(uri, false).replaceAll("\\", "/");
}

function removeFileExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}
