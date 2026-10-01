"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerVariableCommands = void 0;
const vscode = __importStar(require("vscode"));
const workspaceHelper_1 = require("../workspace/workspaceHelper");
const containingTypeResolver_1 = require("../symbols/containingTypeResolver");
function registerVariableCommands(context, state, sessionViewProvider) {
    registerCommandAddVariableToDebugWatch(context, state, sessionViewProvider);
    registerCommandRemoveAllVariablesFromDebugWatch(context, state, sessionViewProvider);
}
exports.registerVariableCommands = registerVariableCommands;
function registerCommandAddVariableToDebugWatch(context, state, sessionViewProvider) {
    const debugWatchCommand = vscode.commands.registerCommand("explorviz-vscode-extension.addVariableToDebugWatch", async (line, index) => {
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
        const definitions = await vscode.commands.executeCommand("vscode.executeDefinitionProvider", variableToken.documentUri, new vscode.Position(line, variableToken.beginChar));
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
        const ownerTypeNameParts = await (0, containingTypeResolver_1.resolveContainingQualifiedTypeNameParts)(definitionTarget.uri, definitionTarget.range.start);
        const sourceInfo = await (0, workspaceHelper_1.buildSourceInfo)(definitionTarget.uri, ownerTypeNameParts);
        const watchedVariable = {
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
            vscode.window.showInformationMessage(`Variable ${variableToken.name} is unmarked!`);
        }
        else {
            state.variables.debugVariableWatchlist.set(variableDefinitionId, watchedVariable);
            /*state.variables.variableSnapshotEntryByWatchedVariableId.set(
              variableDefinitionId,
              [] // no instances added yet, will be filled during snapshotting
            );*/
            vscode.window.showInformationMessage(`Variable ${variableToken.name} is marked!`);
            // We have no stable, language-agnostic way to determine the static type of this variable token here.
            // Therefore, we only store the variable identity based on its source definition.
            // During snapshotting, we use the runtime values reported by the debug adapter.
            // If the same variable name is found in multiple runtime contexts/types, we ask the user which one(s) should be saved.
        }
        console.log("Current debugVariableWatchlist:", state.variables.debugVariableWatchlist);
        sessionViewProvider.refreshHTML();
    });
    context.subscriptions.push(debugWatchCommand);
}
function registerCommandRemoveAllVariablesFromDebugWatch(context, state, sessionViewProvider) {
    const removeAllVariablesFromDebugWatchCommand = vscode.commands.registerCommand("explorviz-vscode-extension.removeAllVariablesFromDebugWatch", () => {
        state.variables.debugVariableWatchlist.clear();
        state.variables.variableSnapshotEntryByWatchedVariableId.clear();
        vscode.window.showInformationMessage("All variables are unmarked!");
        sessionViewProvider.refreshHTML();
    });
    context.subscriptions.push(removeAllVariablesFromDebugWatchCommand);
}
function getDefinitionTarget(definition) {
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
async function resolveContainingTypeName(uri, position) {
    const symbols = await vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", uri);
    if (!symbols) {
        return undefined;
    }
    let bestMatch;
    let bestDepth = -1;
    function visit(symbol, parentTypeNames) {
        if (!symbol.range.contains(position)) {
            return;
        }
        const isTypeSymbol = symbol.kind === vscode.SymbolKind.Class ||
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
//# sourceMappingURL=variableCommands.js.map