import * as vscode from "vscode";
import * as path from "path";
import { ExtensionState } from "../state/extensionState";
import { SessionViewProvider } from "../SessionViewProvider";
import { WatchedVariable } from "../debug/types";

export function registerVariableCommands(
  context: vscode.ExtensionContext,
  state: ExtensionState,
  sessionViewProvider: SessionViewProvider
): void {
  registerCommandAddVariableToDebugWatch(context, state, sessionViewProvider);
  registerCommandRemoveAllVariablesFromDebugWatch(
    context,
    state,
    sessionViewProvider
  );
}

function registerCommandAddVariableToDebugWatch(
  context: vscode.ExtensionContext,
  state: ExtensionState,
  sessionViewProvider: SessionViewProvider
): void {
  const debugWatchCommand = vscode.commands.registerCommand(
    "explorviz-vscode-extension.addVariableToDebugWatch",
    async (line: number, index: number) => {
      const currentEditor = vscode.window.activeTextEditor;
      const documentUriKey = currentEditor?.document.uri.toString();

      if (!currentEditor || !documentUriKey) {
        vscode.window.showErrorMessage("No active editor found.");
        return;
      }
      
      const variablesByUri = state.variables.variableTokensByUri.get(documentUriKey);

      if (!variablesByUri) {
        vscode.window.showErrorMessage("No variable tokens found for the current document.");
        return;
      }
      
      const variableToken = variablesByUri.get(line)?.[index];

      if (!variableToken) {
        vscode.window.showErrorMessage("Could not find selected variable token.");
        return;
      }

      const definitions = await vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
        "vscode.executeDefinitionProvider",
        variableToken.documentUri,
        new vscode.Position(line, variableToken.beginChar)
      );

      if (!definitions || definitions.length === 0) {
        vscode.window.showInformationMessage(`Could not find definition for variable ${variableToken.name}.`);
        return;
      }

      if (definitions.length > 1) {
        console.warn(`Multiple definitions found for ${variableToken.name}. Using first one.`, definitions);
      }

      const definitionTargets = definitions.map(getDefinitionTarget);
      console.log("Definition targets:", definitionTargets);
      const definitionTarget = definitionTargets[0];

      const variableDefinitionId = [
        definitionTarget.uri.toString(),
        definitionTarget.range.start.line,
        definitionTarget.range.start.character,
        variableToken.name
      ].join(":");

      const containingTypeName = await findContainingJavaTypeName(definitionTarget.uri, definitionTarget.range.start) ?? 
        path.basename(definitionTarget.uri.fsPath, path.extname(definitionTarget.uri.fsPath));

      const watchedVariable: WatchedVariable = {
        name: variableToken.name,

        usageUri: variableToken.documentUri,
        usageLine: variableToken.line,
        usageBeginChar: variableToken.beginChar,
        usageEndChar: variableToken.endChar,

        definitionUri: definitionTarget.uri,
        definitionLine: definitionTarget.range.start.line,
        definitionChar: definitionTarget.range.start.character,

        containingTypeName: containingTypeName
      };

      if (state.variables.debugVariableWatchlist.has(variableDefinitionId)) {
        state.variables.debugVariableWatchlist.delete(variableDefinitionId);
        state.variables.debugVariableStateValues.delete(variableDefinitionId);

        vscode.window.showInformationMessage(
          `Variable ${variableToken.name} is unmarked!`
        );

        console.log(`Variable ${variableToken.name} is unmarked!`);
      } else {
        state.variables.debugVariableWatchlist.set(
          variableDefinitionId,
          watchedVariable
        );

        state.variables.debugVariableStateValues.set(
          variableDefinitionId,
          [] // no instances added yet, will be filled during snapshotting
        );

        vscode.window.showInformationMessage(
          `Variable ${variableToken.name} is marked!`
        );

        console.log(`Variable ${variableToken.name} is marked!`);
      }

      console.log(
        "Current debugVariableWatchlist:",
        state.variables.debugVariableWatchlist
      );

      sessionViewProvider.refreshHTML();
    }
  );

  context.subscriptions.push(debugWatchCommand);
}

function registerCommandRemoveAllVariablesFromDebugWatch(
  context: vscode.ExtensionContext,
  state: ExtensionState,
  sessionViewProvider: SessionViewProvider
): void {
  const removeAllVariablesFromDebugWatchCommand =
    vscode.commands.registerCommand(
      "explorviz-vscode-extension.removeAllVariablesFromDebugWatch",
      () => {
        state.variables.debugVariableWatchlist.clear();
        state.variables.debugVariableStateValues.clear();

        vscode.window.showInformationMessage("All variables are unmarked!");
        sessionViewProvider.refreshHTML();
      }
    );

  context.subscriptions.push(removeAllVariablesFromDebugWatchCommand);
}

function getDefinitionTarget(
  definition: vscode.Location | vscode.LocationLink
): { uri: vscode.Uri; range: vscode.Range } {
  if ("targetUri" in definition) {
    return {
      uri: definition.targetUri,
      range: definition.targetSelectionRange ?? definition.targetRange,
    };
  }

  return {
    uri: definition.uri,
    range: definition.range,
  };
}

async function findContainingJavaTypeName(
  uri: vscode.Uri,
  position: vscode.Position
): Promise<string | undefined> {
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    "vscode.executeDocumentSymbolProvider",
    uri
  );

  if (!symbols) {
    return undefined;
  }

  let bestMatch: string | undefined;
  let bestDepth = -1;

  function visit(symbol: vscode.DocumentSymbol, parentTypeNames: string[]): void {
    if (!symbol.range.contains(position)) {
      return;
    }

    const isTypeSymbol =
      symbol.kind === vscode.SymbolKind.Class ||
      symbol.kind === vscode.SymbolKind.Interface ||
      symbol.kind === vscode.SymbolKind.Enum;

    const currentTypeNames = isTypeSymbol
      ? [...parentTypeNames, symbol.name]
      : parentTypeNames;

    if (isTypeSymbol && currentTypeNames.length > bestDepth) {
      bestMatch = currentTypeNames.join(".");
      bestDepth = currentTypeNames.length;
    }

    for (const child of symbol.children) {
      visit(child, currentTypeNames);
    }
  }

  for (const symbol of symbols) {
    visit(symbol, []);
  }

  return bestMatch;
}