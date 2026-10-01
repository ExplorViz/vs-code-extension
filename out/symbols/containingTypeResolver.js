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
exports.isTypeLikeSymbol = exports.resolveContainingQualifiedTypeNameParts = void 0;
const vscode = __importStar(require("vscode"));
const languageQualifiedNameResolvers_1 = require("./languages/languageQualifiedNameResolvers");
/**
 * Resolves the qualified type-name parts for the type that contains the given
 * source position.
 *
 * This function is used when a user marks a variable in the editor. The
 * resulting type information is stored together with the watched variable so
 * that snapshot matching can later compare the static source owner type with
 * the runtime owner type reported by the debug adapter.
 *
 * The returned parts contain:
 *
 * - packageName:
 *   The language/package/module/namespace qualifier, if available.
 *
 * - className:
 *   The containing type path without the package/qualifier. For nested types,
 *   this can contain multiple segments, for example "Outer.Inner".
 *
 * - qualifiedName:
 *   The full qualified type name, for example
 *   "net.example.Outer.Inner".
 *
 * The implementation is intentionally language-agnostic:
 *
 * 1. Ask VS Code's DocumentSymbolProvider for the file's symbol tree.
 * 2. Find the innermost type-like symbol that contains the given position.
 * 3. Let a language-specific resolver complete and split the qualified name.
 *
 * If no symbols are available, or if no containing type can be found, undefined
 * is returned. Callers should then use a fallback if they need one.
 */
async function resolveContainingQualifiedTypeNameParts(uri, position) {
    const document = await vscode.workspace.openTextDocument(uri);
    const symbolPath = await resolveContainingSymbolPath(uri, position);
    if (!symbolPath || symbolPath.typeNames.length === 0) {
        return undefined;
    }
    return (0, languageQualifiedNameResolvers_1.resolveLanguageQualifiedTypeNameParts)(document, symbolPath);
}
exports.resolveContainingQualifiedTypeNameParts = resolveContainingQualifiedTypeNameParts;
/**
 * Resolves the raw containing symbol path for a source position.
 *
 * This function only uses the symbol tree returned by VS Code.
 */
async function resolveContainingSymbolPath(uri, position) {
    const symbols = await vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", uri);
    if (!symbols || symbols.length === 0) {
        return undefined;
    }
    return findInnermostContainingSymbolPath(symbols, position);
}
/**
 * Finds the innermost type-like symbol that contains the given position.
 *
 * The DocumentSymbolProvider returns a tree. For nested classes/types, the
 * nested type usually appears as a child of the outer type.
 *
 * Example:
 *
 * Outer
 * └── Inner
 *     └── value
 *
 * If the position is inside Inner, this function returns:
 *
 * typeNames: ["Outer", "Inner"]
 *
 * This is important because only using the innermost type name would produce
 * "Inner", while the correct source owner type is "Outer.Inner".
 */
function findInnermostContainingSymbolPath(symbols, position) {
    let bestMatch;
    let bestDepth = -1;
    function visit(symbol, qualifierNames, typeNames) {
        if (!symbol.range.contains(position)) {
            return;
        }
        const nextQualifierNames = isQualifierLikeSymbol(symbol)
            ? [...qualifierNames, symbol.name]
            : qualifierNames;
        const nextTypeNames = isTypeLikeSymbol(symbol)
            ? [...typeNames, symbol.name]
            : typeNames;
        const depth = nextQualifierNames.length + nextTypeNames.length;
        /**
         * Only store matches once we are inside at least one type-like symbol.
         *
         * A package/module/namespace alone is not enough for snapshot matching,
         * because we need the type that owns the watched variable.
         */
        if (nextTypeNames.length > 0 && depth > bestDepth) {
            bestMatch = {
                qualifierNames: nextQualifierNames,
                typeNames: nextTypeNames,
            };
            bestDepth = depth;
        }
        for (const child of symbol.children) {
            visit(child, nextQualifierNames, nextTypeNames);
        }
    }
    for (const symbol of symbols) {
        visit(symbol, [], []);
    }
    return bestMatch;
}
/**
 * Checks whether a symbol represents a language-level qualifier.
 *
 * These symbols describe containers around types, but are usually not runtime
 * object types themselves.
 *
 * Examples:
 * - Java package
 * - TypeScript namespace/module
 * - C# namespace
 */
function isQualifierLikeSymbol(symbol) {
    return (symbol.kind === vscode.SymbolKind.Package ||
        symbol.kind === vscode.SymbolKind.Module ||
        symbol.kind === vscode.SymbolKind.Namespace);
}
/**
 * Checks whether a symbol represents a type-like declaration.
 *
 * These symbols are relevant for snapshot matching because watched variables
 * are compared against runtime variables using their containing/owner type.
 *
 * Examples:
 * - Java class/interface/enum
 * - TypeScript class/interface
 * - C# class/struct/interface
 */
function isTypeLikeSymbol(symbol) {
    return (symbol.kind === vscode.SymbolKind.Class ||
        symbol.kind === vscode.SymbolKind.Interface ||
        symbol.kind === vscode.SymbolKind.Enum ||
        symbol.kind === vscode.SymbolKind.Struct);
}
exports.isTypeLikeSymbol = isTypeLikeSymbol;
//# sourceMappingURL=containingTypeResolver.js.map