import * as vscode from "vscode";
import { ExtensionState } from "../state/extensionState";
import { LineOfCode, VariableSymbol } from "./types";

export async function getVariablesFromCurrentEditor(
  state: ExtensionState,
  editor: vscode.TextEditor | undefined
): Promise<void> {
    if (!state.debug.isDebugSessionStopped) {
        console.log("Debug session is not stopped. Skipping variable token retrieval.");
        return;
    }

    if (!editor || editor.document.languageId !== "java") {
        console.log("Editor is not a Java document. Skipping variable token retrieval.");
        return;
    }

    console.log("Getting variable tokens for editor:", editor.document.uri.fsPath);

    const documentUriKey = editor.document.uri.toString();
    state.variables.variableTokensByUri.delete(documentUriKey);

    const timeoutMs = 10_000;
    const startTime = Date.now();

    while (true) {
        try {
            await getTokensFromEditor(state, editor);
            return;
        } catch (error) {
            console.log("Waiting for JavaLS to start...");

            if (Date.now() - startTime < timeoutMs) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            } else {
                console.log("JavaLS seems to not start. Is it installed?");
                return;
            }
        }
    }
}

async function getTokensFromEditor(
  state: ExtensionState,
  editor: vscode.TextEditor
): Promise<void> {

  const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
    "vscode.provideDocumentSemanticTokens",
    editor.document.uri
  );

  const legend =
    await vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
      "vscode.provideDocumentSemanticTokensLegend",
      editor.document.uri
    );

  if (!tokens || !legend) {
    return;
  }

  const variableSymbolsByLine: Map<LineOfCode, VariableSymbol[]> = new Map();

  const data = tokens.data;

  const variableLikeTokenTypes = new Set(
    [
        legend.tokenTypes.indexOf("variable"),
        legend.tokenTypes.indexOf("property"),
        legend.tokenTypes.indexOf("parameter"),
    ].filter((index) => index !== -1)
);

  let line = 0;
  let char = 0;

  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaChar = data[i + 1];
    const length = data[i + 2];
    const tokenTypeIndex = data[i + 3];

    line += deltaLine;
    char = deltaLine === 0 ? char + deltaChar : deltaChar;


    if (!variableLikeTokenTypes.has(tokenTypeIndex)) {
        continue;
    }

    const range = new vscode.Range(line, char, line, char + length);
    const text = editor.document.getText(range);

    const tokenArr = variableSymbolsByLine.get(line) ?? [];

    tokenArr.push({
      line,
      beginChar: char,
      endChar: char + length,
      name: text,
      documentUri: editor.document.uri,
    });

    variableSymbolsByLine.set(line, tokenArr);
  }

  const documentUriKey = editor.document.uri.toString();
  state.variables.variableTokensByUri.set(documentUriKey, variableSymbolsByLine);
}