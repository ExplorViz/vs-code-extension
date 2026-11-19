import * as vscode from "vscode";
import { BackendClient } from "../backend/backendClient";

export function registerBackendCommands(
  context: vscode.ExtensionContext,
  backendClient: BackendClient
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "explorviz-vscode-extension.connectToBackend",
      () => {
        backendClient.connect();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "explorviz-vscode-extension.disconnectFromBackend",
      () => {
        backendClient.disconnect();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "explorviz-vscode-extension.cancelConnectionSetup",
      () => {
        backendClient.cancelConnectionSetup();
      }
    )
  );
}