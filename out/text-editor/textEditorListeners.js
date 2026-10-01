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
exports.registerTextEditorListeners = void 0;
const vscode = __importStar(require("vscode"));
const variableTokenScanner_1 = require("../debug/variableTokenScanner");
function registerTextEditorListeners(context, state) {
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(createActiveTextEditorChangeHandler(state)));
    context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(createSelectionChangeHandler(state)));
}
exports.registerTextEditorListeners = registerTextEditorListeners;
function createActiveTextEditorChangeHandler(state) {
    return async (editor) => {
        await (0, variableTokenScanner_1.getVariablesFromCurrentEditor)(state, editor);
    };
}
function createSelectionChangeHandler(state) {
    return (e) => {
        const startLine = e.textEditor.selection.start.line;
        const startChar = e.textEditor.selection.start.character;
        const documentUriKey = e.textEditor.document.uri.toString();
        const variableTokensByUri = state.variables.variableTokensByUri.get(documentUriKey);
        state.codeLens.debugCodeLenses = [];
        if (state.debug.isDebugSessionStopped) {
            if (e.textEditor.selection.isEmpty &&
                variableTokensByUri &&
                variableTokensByUri.has(startLine)) {
                const varsInLine = variableTokensByUri.get(startLine);
                for (const [index, variable] of varsInLine.entries()) {
                    if (startChar >= variable.beginChar &&
                        startChar <= variable.endChar) {
                        state.codeLens.debugCodeLenses = [
                            new vscode.CodeLens(new vscode.Range(startLine, startChar, startLine, startChar), {
                                title: "🌍",
                                command: "explorviz-vscode-extension.addVariableToDebugWatch",
                                arguments: [variable.line, index],
                            }),
                        ];
                        break;
                    }
                }
            }
        }
        state.codeLens.debugCodeLensEmitter.fire();
    };
}
//# sourceMappingURL=textEditorListeners.js.map