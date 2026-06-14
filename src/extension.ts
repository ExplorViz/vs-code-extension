import * as vscode from "vscode";

import { loadExtensionConfig } from "./config/extensionConfig";
import { registerCommands } from "./commands/registerCommands";
import { registerDebugCodeLensProvider } from "./debug/debugCodeLensProvider";
import { registerDebugSessionListeners, restoreStoppedDebugStateIfPossible } from "./debug/debugSessionListeners";
import { getGitApi } from "./git/gitHelper";
import { SessionViewProvider } from "./SessionViewProvider";
import { createExtensionState, ExtensionState } from "./state/extensionState";
import { BackendClient } from "./backend/backendClient";
import { getVariablesFromCurrentEditor } from "./debug/variableTokenScanner";
import { registerTextEditorListeners } from "./text-editor/textEditorListeners";;
import { recommendWorkspaceSettingsIfNeeded } from "./settings/recommendedWorkspaceSettings";
import { buildWorkspaceTypeIndex } from "./workspace/workspaceTypeIndex";

export async function activate(context: vscode.ExtensionContext) {
  const config = loadExtensionConfig();
  const state = createExtensionState();

  const sessionViewProvider = new SessionViewProvider(context.extensionUri, state, config);
  await recommendWorkspaceSettingsIfNeeded();
  void buildWorkspaceTypeIndex(state).catch((error) => {
    console.warn("Could not build workspace type index:", error);
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SessionViewProvider.viewType,
      sessionViewProvider
    )
  );

  const backendClient = new BackendClient(
    config,
    state,
    sessionViewProvider
  );

  const git = getGitApi();

  context.subscriptions.push(
    vscode.window.createTextEditorDecorationType({
      gutterIconPath: context.asAbsolutePath("./images/explorviz-globe.png"),
      gutterIconSize: "contain",
      isWholeLine: true,
    })
  );

  registerTextEditorListeners(context, state);
  registerDebugCodeLensProvider(context, state);
  registerDebugSessionListeners(context, state, sessionViewProvider);
  registerCommands(
    context,
    config,
    state,
    backendClient,
    sessionViewProvider,
    git
  );

  backendClient.connect();

  // In case our extension gets activated while a debug session is already active 
  // and the program is possibly stopped 
  await restoreStoppedDebugStateIfPossible(state, sessionViewProvider);

  console.log(
    'Congratulations, your extension "explorviz-vscode-extension" is now active!'
  );
}

export function deactivate() {
  // Optional: Clean up resources, close connections, etc.
}

export function createActiveTextEditorChangeHandler(state: ExtensionState) {
  return async (editor: vscode.TextEditor | undefined): Promise<void> => {
    await getVariablesFromCurrentEditor(state, editor);
  };
}