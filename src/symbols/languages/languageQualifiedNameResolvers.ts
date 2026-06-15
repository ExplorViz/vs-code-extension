import * as vscode from "vscode";
import { ContainingSymbolPath } from "../containingTypeResolver";
import { resolveJavaQualifiedTypeName } from "./java/javaQualifiedNameResolver";

/**
 * Resolves the language-specific qualified type name for a containing symbol path.
 *
 * This function acts as the central dispatcher for language-specific qualified
 * name resolution.
 */
export function resolveLanguageQualifiedTypeName(
  document: vscode.TextDocument,
  symbolPath: ContainingSymbolPath
): string {
  switch (document.languageId) {
    case "java":
      return resolveJavaQualifiedTypeName(document, symbolPath);

    default:
      return formatQualifiedTypeName(symbolPath);
  }
}

function formatQualifiedTypeName(symbolPath: ContainingSymbolPath): string {
  return [...symbolPath.qualifierNames, ...symbolPath.typeNames].join(".");
}