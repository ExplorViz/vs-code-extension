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
exports.extractWorkspaceTypeDeclarations = void 0;
const vscode = __importStar(require("vscode"));
const containingTypeResolver_1 = require("../symbols/containingTypeResolver");
const SUPPORTED_FILE_PATTERN = "**/*.{java}"; // {java,ts,tsx,js,jsx,py}";
const EXCLUDED_FILE_PATTERN = "**/{node_modules,target,build,out,dist,.gradle,.metadata,.git}/**";
async function extractWorkspaceTypeDeclarations() {
    const files = await vscode.workspace.findFiles(SUPPORTED_FILE_PATTERN, EXCLUDED_FILE_PATTERN);
    const declarations = [];
    for (const uri of files) {
        const document = await vscode.workspace.openTextDocument(uri);
        const symbols = await vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", uri);
        if (!symbols || symbols.length === 0) {
            continue;
        }
        for (const symbol of flattenDocumentSymbols(symbols)) {
            if (!(0, containingTypeResolver_1.isTypeLikeSymbol)(symbol)) {
                continue;
            }
            const qualifiedTypeNameParts = await (0, containingTypeResolver_1.resolveContainingQualifiedTypeNameParts)(uri, symbol.range.start);
            if (!qualifiedTypeNameParts) {
                continue;
            }
            declarations.push({
                languageId: document.languageId,
                simpleName: symbol.name,
                qualifiedName: qualifiedTypeNameParts.qualifiedName,
                uri,
                symbolKind: symbol.kind,
            });
        }
    }
    return declarations;
}
exports.extractWorkspaceTypeDeclarations = extractWorkspaceTypeDeclarations;
function flattenDocumentSymbols(symbols) {
    return symbols.flatMap((symbol) => [
        symbol,
        ...flattenDocumentSymbols(symbol.children),
    ]);
}
//# sourceMappingURL=workspaceTypeDeclarationExtractor.js.map