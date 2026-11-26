import * as vscode from "vscode";
import { ExtensionState } from "../state/extensionState";
import { SessionViewProvider } from "../SessionViewProvider";
import { dapRequest } from "../debug/dapRequest";

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
      "explorviz-vscode-extension.stopDebugging",
      async () => {
        try {
          await vscode.commands.executeCommand("workbench.action.debug.stop");
        } catch (error) {
          console.error("Failed to stop the debug session:", error);
          void vscode.window.showErrorMessage(
            "ExplorViz could not stop the debug session."
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "explorviz-vscode-extension.startRecordingTracing",
      async () => {
        const session = vscode.debug.activeDebugSession;
        if (!session || session.type !== "java") {
          void vscode.window.showWarningMessage("No active Java debug session.");
          return;
        }
        try {
          await dapRequest(session, "startTracing", { debugRunId: state.debug.debugRunId });
          state.debug.isRecordingTracing = true;
        } catch (error) {
          void vscode.window.showErrorMessage(`startTracing failed: ${String(error)}`);
        }
        sessionViewProvider.refreshHTML();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "explorviz-vscode-extension.stopRecordingTracing",
      async () => {
        const session = vscode.debug.activeDebugSession;
        if (session?.type === "java") {
          try {
            await dapRequest(session, "stopTracing", {});
          } catch (error) {
            void vscode.window.showErrorMessage(`stopTracing failed: ${String(error)}`);
          }
        }
        state.debug.isRecordingTracing = false;
        sessionViewProvider.refreshHTML();
      }
    )
  );
}