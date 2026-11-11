import * as vscode from "vscode";
import { ExtensionState } from "../state/extensionState";
import { SessionViewProvider } from "../SessionViewProvider";

export function registerDebugCommands(
  context: vscode.ExtensionContext,
  state: ExtensionState,
  sessionViewProvider: SessionViewProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "explorviz-vscode-extension.startDebugging",
      async () => {
        try {
          await vscode.commands.executeCommand("workbench.action.debug.start");
        } catch (error) {
          console.error("Failed to start a debug session:", error);
          void vscode.window.showErrorMessage(
            "ExplorViz could not start the debug session."
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "explorviz-vscode-extension.startRecordingTracing",
      () => {
        state.debug.isRecordingTracing = true;
        sessionViewProvider.refreshHTML();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "explorviz-vscode-extension.stopRecordingTracing",
      () => {
        state.debug.isRecordingTracing = false;
        sessionViewProvider.refreshHTML();
      }
    )
  );
}
