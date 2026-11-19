import * as vscode from "vscode";
import * as path from "path";
import { ExtensionState } from "../state/extensionState";
import { SessionViewProvider } from "../SessionViewProvider";
import { WatchedVariable } from "../debug/types";
import { buildSourceInfo } from "../workspace/workspaceHelper";
import { resolveContainingQualifiedTypeNameParts } from "../symbols/containingTypeResolver";

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
      const definitionTarget = definitionTargets[0];

      const variableDefinitionId = [
        definitionTarget.uri.toString(),
        definitionTarget.range.start.line,
        definitionTarget.range.start.character,
        variableToken.name
      ].join(":");

      /*const containingTypeName = await resolveContainingTypeName(definitionTarget.uri, definitionTarget.range.start) ?? 
        path.basename(definitionTarget.uri.fsPath, path.extname(definitionTarget.uri.fsPath));*/

      const ownerTypeNameParts = await resolveContainingQualifiedTypeNameParts(
        definitionTarget.uri,
        definitionTarget.range.start
      );

      const sourceInfo = await buildSourceInfo(definitionTarget.uri, ownerTypeNameParts);
      const watchedVariable: WatchedVariable = {
        name: variableToken.name,

        usageUri: variableToken.documentUri,
        usageLine: variableToken.line,
        usageBeginChar: variableToken.beginChar,
        usageEndChar: variableToken.endChar,

        definitionUri: definitionTarget.uri,
        definitionLine: definitionTarget.range.start.line,
        definitionChar: definitionTarget.range.start.character,

        ownerType: ownerTypeNameParts?.qualifiedName,

        sourcePath: sourceInfo.sourcePath,
        fileName: sourceInfo.fileName,
        packageName: sourceInfo.packageName,
        className: sourceInfo.className,
      };

      if (state.variables.debugVariableWatchlist.has(variableDefinitionId)) {
        state.variables.debugVariableWatchlist.delete(variableDefinitionId);
        state.variables.variableSnapshotEntryByWatchedVariableId.delete(variableDefinitionId);

        vscode.window.showInformationMessage(
          `Variable ${variableToken.name} is unmarked!`
        );

      } else {
        state.variables.debugVariableWatchlist.set(
          variableDefinitionId,
          watchedVariable
        );

        /*state.variables.variableSnapshotEntryByWatchedVariableId.set(
          variableDefinitionId,
          [] // no instances added yet, will be filled during snapshotting
        );*/

        vscode.window.showInformationMessage(
          `Variable ${variableToken.name} is marked!`
        );

        // We have no stable, language-agnostic way to determine the static type of this variable token here.
        // Therefore, we only store the variable identity based on its source definition.
        // During snapshotting, we use the runtime values reported by the debug adapter.
        // If the same variable name is found in multiple runtime contexts/types, we ask the user which one(s) should be saved.
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
        state.variables.variableSnapshotEntryByWatchedVariableId.clear();

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

async function resolveContainingTypeName(
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