import * as vscode from "vscode";
import { ExtensionState } from "../state/extensionState";

export function registerDebugCodeLensProvider(
  context: vscode.ExtensionContext,
  state: ExtensionState
): void {
  const debugCodeLensProvider: vscode.CodeLensProvider = {
    provideCodeLenses() {
      return state.codeLens.debugCodeLenses;
    },

    onDidChangeCodeLenses: state.codeLens.debugCodeLensEmitter.event,
  };

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: "file", language: "java" },
      debugCodeLensProvider
    )
  );
}