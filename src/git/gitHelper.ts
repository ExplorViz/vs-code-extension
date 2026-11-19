import * as vscode from "vscode";
import { API, GitExtension } from "../api/git";

export function getGitApi(): API | undefined {
  const gitExtension =
    vscode.extensions.getExtension<GitExtension>("vscode.git")?.exports;

  try {
    return gitExtension?.getAPI(1);
  } catch (error) {
    console.log(error);
    return undefined;
  }
}

export function getCurrentCommitForWorkspace(
  git: API | undefined,
  workspaceFolder: vscode.WorkspaceFolder
): string | undefined {
  const repository = git?.getRepository(workspaceFolder.uri);
  return repository?.state.HEAD?.commit;
}