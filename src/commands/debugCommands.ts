import * as vscode from "vscode";

export function registerDebugCommands(
  context: vscode.ExtensionContext
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
}
