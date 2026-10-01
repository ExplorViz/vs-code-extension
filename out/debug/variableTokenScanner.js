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
exports.getVariablesFromCurrentEditor = void 0;
const vscode = __importStar(require("vscode"));
async function getVariablesFromCurrentEditor(state, editor) {
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
    const timeoutMs = 10000;
    const startTime = Date.now();
    while (true) {
        try {
            await getTokensFromEditor(state, editor);
            return;
        }
        catch (error) {
            console.log("Waiting for JavaLS to start...");
            if (Date.now() - startTime < timeoutMs) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
            else {
                console.log("JavaLS seems to not start. Is it installed?");
                return;
            }
        }
    }
}
exports.getVariablesFromCurrentEditor = getVariablesFromCurrentEditor;
async function getTokensFromEditor(state, editor) {
    const tokens = await vscode.commands.executeCommand("vscode.provideDocumentSemanticTokens", editor.document.uri);
    const legend = await vscode.commands.executeCommand("vscode.provideDocumentSemanticTokensLegend", editor.document.uri);
    if (!tokens || !legend) {
        return;
    }
    const variableSymbolsByLine = new Map();
    const data = tokens.data;
    const variableLikeTokenTypes = new Set([
        legend.tokenTypes.indexOf("variable"),
        legend.tokenTypes.indexOf("property"),
        legend.tokenTypes.indexOf("parameter"),
    ].filter((index) => index !== -1));
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
//# sourceMappingURL=variableTokenScanner.js.map