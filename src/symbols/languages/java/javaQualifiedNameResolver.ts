import * as vscode from "vscode";
import { ContainingSymbolPath } from "../../containingTypeResolver";
import { extractJavaPackageName } from "./javaPackageParser";

export type QualifiedTypeNameParts = {
  packageName: string;
  className: string;
  qualifiedName: string;
};

/**
 * Resolves the Java package name, source class name, and fully qualified type
 * name for a containing symbol path.
 *
 * The DocumentSymbolProvider usually gives us the surrounding type path, for
 * example:
 *
 * Outer.Inner
 *
 * For Java, this type path becomes fully qualified by prepending the package
 * name:
 *
 * com.example.Outer.Inner
 *
 * This function returns the resolved name in three forms:
 *
 * - packageName:
 *   The Java package only, for example "com.example".
 *
 * - className:
 *   The complete nested type path without the package, for example
 *   "Outer.Inner".
 *
 * - qualifiedName:
 *   The full Java type name, for example "com.example.Outer.Inner".
 *
 * If the SymbolProvider already reported a qualifier such as a Package symbol,
 * that qualifier is used as the package name. Otherwise, the package
 * declaration is read from the Java source file.
 */
export function resolveJavaQualifiedTypeNameParts(
  document: vscode.TextDocument,
  symbolPath: ContainingSymbolPath
): QualifiedTypeNameParts {
  const packageName =
    symbolPath.qualifierNames.length > 0
      ? symbolPath.qualifierNames.join(".")
      : extractJavaPackageName(document.getText());

  const className = symbolPath.typeNames.join(".");
  const qualifiedName = packageName ? `${packageName}.${className}` : className;

  return {
    packageName,
    className,
    qualifiedName,
  };
}

/**
 * Formats a symbol path as a dot-separated qualified name.
 *
 * Example:
 * qualifierNames: ["com.example"]
 * typeNames: ["Outer", "Inner"]
 *
 * returns:
 * com.example.Outer.Inner
 */
function formatQualifiedTypeName(symbolPath: ContainingSymbolPath): string {
  return [...symbolPath.qualifierNames, ...symbolPath.typeNames].join(".");
}