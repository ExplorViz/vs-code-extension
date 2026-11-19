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

export async function activate(context: vscode.ExtensionContext) {
  const config = loadExtensionConfig();
  const state = createExtensionState();

  const sessionViewProvider = new SessionViewProvider(context.extensionUri, state, config);

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

  void restoreStoppedDebugStateIfPossible(state, sessionViewProvider).catch(
    (error: unknown) => {
      console.error("Failed to restore the active debug session state:", error);
      void vscode.window.showErrorMessage(
        "ExplorViz could not restore the active debug session state."
      );
    }
  );

  console.log(
    'Congratulations, your extension "explorviz-vscode-extension" is now active!'
  );

  console.log("[ExplorViz] Extension path:", context.extensionPath);
console.log("[ExplorViz] Bundle path:", __filename);

  setTimeout(() => {
    void recommendWorkspaceSettingsIfNeeded().catch((error: unknown) => {
      console.error(
        "Failed to check or apply recommended workspace settings:",
        error
      );
      void vscode.window.showErrorMessage(
        "ExplorViz could not check or apply the recommended workspace settings."
      );
    });
  }, 0);
}

export function deactivate() {
  // Optional: Clean up resources, close connections, etc.
}

export function createActiveTextEditorChangeHandler(state: ExtensionState) {
  return async (editor: vscode.TextEditor | undefined): Promise<void> => {
    await getVariablesFromCurrentEditor(state, editor);
  };
}