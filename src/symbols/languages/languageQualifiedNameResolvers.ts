import * as vscode from "vscode";
import { ContainingSymbolPath } from "../containingTypeResolver";
import {
  QualifiedTypeNameParts,
  resolveJavaQualifiedTypeNameParts,
} from "./java/javaQualifiedNameResolver";

/**
 * Resolves the language-specific qualified type name parts for a containing
 * symbol path.
 *
 * This function acts as the central dispatcher for language-specific qualified
 * name resolution.
 *
 * Language-specific resolvers can decide how qualifier names and type names
 * should be interpreted.
 */
export function resolveLanguageQualifiedTypeNameParts(
  document: vscode.TextDocument,
  symbolPath: ContainingSymbolPath
): QualifiedTypeNameParts {
  switch (document.languageId) {
    case "java":
      return resolveJavaQualifiedTypeNameParts(document, symbolPath);

    default:
      return buildGenericQualifiedTypeNameParts(symbolPath);
  }
}

function buildGenericQualifiedTypeNameParts(
  symbolPath: ContainingSymbolPath
): QualifiedTypeNameParts {
  const packageName = symbolPath.qualifierNames.join(".");
  const className = symbolPath.typeNames.join(".");
  const qualifiedName = packageName ? `${packageName}.${className}` : className;

  return {
    packageName,
    className,
    qualifiedName,
  };
}