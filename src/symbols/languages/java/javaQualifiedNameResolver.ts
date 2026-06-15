import * as vscode from "vscode";
import { ContainingSymbolPath } from "../../containingTypeResolver";
import { extractJavaPackageName } from "./javaPackageParser";

/**
 * Resolves the fully qualified Java type name for a containing symbol path.
 *
 * The DocumentSymbolProvider usually gives us the surrounding type path, for
 * example:
 *
 * Outer.Inner
 *
 * For Java, this type path is only fully qualified once the package name is
 * prepended:
 *
 * com.example.Outer.Inner
 *
 * If the SymbolProvider already reported a qualifier such as a Package symbol,
 * that qualifier is used directly. Otherwise, the package declaration is read
 * from the Java source file.
 */
export function resolveJavaQualifiedTypeName(
  document: vscode.TextDocument,
  symbolPath: ContainingSymbolPath
): string {
  if (symbolPath.qualifierNames.length > 0) {
    return formatQualifiedTypeName(symbolPath);
  }

  const packageName = extractJavaPackageName(document.getText());
  const typeName = symbolPath.typeNames.join(".");

  return packageName ? `${packageName}.${typeName}` : typeName;
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