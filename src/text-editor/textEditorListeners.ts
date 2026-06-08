import * as vscode from "vscode";
import { ExtensionState } from "../state/extensionState";
import { getVariablesFromCurrentEditor } from "../debug/variableTokenScanner";

export function registerTextEditorListeners(
  context: vscode.ExtensionContext,
  state: ExtensionState
): void {
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(
      createActiveTextEditorChangeHandler(state)
    )
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(
      createSelectionChangeHandler(state)
    )
  );
}

function createActiveTextEditorChangeHandler(state: ExtensionState) {
  return async (editor: vscode.TextEditor | undefined): Promise<void> => {
    await getVariablesFromCurrentEditor(state, editor);
  };
}

function createSelectionChangeHandler(state: ExtensionState) {
  return (e: vscode.TextEditorSelectionChangeEvent): void => {
    const startLine = e.textEditor.selection.start.line;
    const startChar = e.textEditor.selection.start.character;
    const documentUriKey = e.textEditor.document.uri.toString();
    const variableTokensByUri = state.variables.variableTokensByUri.get(documentUriKey);

    state.codeLens.debugCodeLenses = [];

    if (state.debug.isDebugSessionStopped) {
      if (
        e.textEditor.selection.isEmpty && 
        variableTokensByUri &&
        variableTokensByUri.has(startLine)
      ) {
        const varsInLine = variableTokensByUri.get(startLine)!;

        for (const [index, variable] of varsInLine.entries()) {
          if (
            startChar >= variable.beginChar &&
            startChar <= variable.endChar
          ) {
            state.codeLens.debugCodeLenses = [
              new vscode.CodeLens(
                new vscode.Range(startLine, startChar, startLine, startChar),
                {
                  title: "🌍",
                  command: "explorviz-vscode-extension.addVariableToDebugWatch",
                  arguments: [variable.line, index],
                }
              ),
            ];

            break;
          }
        }
      }
    }

    state.codeLens.debugCodeLensEmitter.fire();
  };
}