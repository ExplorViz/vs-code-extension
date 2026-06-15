import * as vscode from "vscode";
import { resolveLanguageQualifiedTypeName } from "./languages/languageQualifiedNameResolvers";

/**
 * Represents the relevant symbol path around a source position.
 *
 * The path is split into two parts:
 *
 * - qualifierNames:
 *   Language-level containers such as packages, modules, or namespaces.
 *
 * - typeNames:
 *   Actual type containers such as classes, interfaces, enums, or structs.
 *
 * Example for Java:
 *
 * ```java
 * package net.example;
 *
 * class Outer {
 *   class Inner {
 *     int value;
 *   }
 * }
 * ```
 *
 * For "value", the SymbolProvider may return either:
 *
 * qualifierNames: []
 * typeNames: ["Outer", "Inner"]
 *
 * or, if it exposes the package as symbols:
 *
 * qualifierNames: ["net.example"]
 * typeNames: ["Outer", "Inner"]
 *
 * Some providers may also split qualified containers into separate symbols:
 *
 * qualifierNames: ["net", "example"]
 * typeNames: ["Outer", "Inner"]
 *
 * Language-specific resolvers are responsible for completing or normalizing
 * this path. For Java, the resolver reads the package declaration from the
 * source file when qualifierNames is empty.
 */
export type ContainingSymbolPath = {
  qualifierNames: string[];
  typeNames: string[];
};

/**
 * Resolves the qualified name of the type that contains the given source
 * position.
 *
 * This function is used when a user marks a variable in the editor. The
 * resulting type name is stored together with the watched variable so that
 * snapshot matching can later compare the static source owner type with the
 * runtime owner type reported by the debug adapter.
 *
 * The implementation is intentionally language-agnostic:
 *
 * 1. Ask VS Code's DocumentSymbolProvider for the file's symbol tree.
 * 2. Find the innermost type-like symbol that contains the given position.
 * 3. Let a language-specific resolver complete the qualified name if needed.
 *
 * If no symbols are available, or if no containing type can be found, undefined
 * is returned. Callers should then use a fallback if they need one.
 */
export async function resolveContainingQualifiedTypeName(
  uri: vscode.Uri,
  position: vscode.Position
): Promise<string | undefined> {
  const document = await vscode.workspace.openTextDocument(uri);
  const symbolPath = await resolveContainingSymbolPath(uri, position);

  if (!symbolPath || symbolPath.typeNames.length === 0) {
    return undefined;
  }

  return resolveLanguageQualifiedTypeName(document, symbolPath);
}


/**
 * Resolves the raw containing symbol path for a source position.
 *
 * This function only uses the symbol tree returned by VS Code. 
 */
async function resolveContainingSymbolPath(
  uri: vscode.Uri,
  position: vscode.Position
): Promise<ContainingSymbolPath | undefined> {
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    "vscode.executeDocumentSymbolProvider",
    uri
  );

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
function findInnermostContainingSymbolPath(
  symbols: vscode.DocumentSymbol[],
  position: vscode.Position
): ContainingSymbolPath | undefined {
  let bestMatch: ContainingSymbolPath | undefined;
  let bestDepth = -1;

  function visit(
    symbol: vscode.DocumentSymbol,
    qualifierNames: string[],
    typeNames: string[]
  ): void {
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
function isQualifierLikeSymbol(symbol: vscode.DocumentSymbol): boolean {
  return (
    symbol.kind === vscode.SymbolKind.Package ||
    symbol.kind === vscode.SymbolKind.Module ||
    symbol.kind === vscode.SymbolKind.Namespace
  );
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
export function isTypeLikeSymbol(symbol: vscode.DocumentSymbol): boolean {
  return (
    symbol.kind === vscode.SymbolKind.Class ||
    symbol.kind === vscode.SymbolKind.Interface ||
    symbol.kind === vscode.SymbolKind.Enum ||
    symbol.kind === vscode.SymbolKind.Struct
  );
}