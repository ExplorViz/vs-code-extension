import * as vscode from "vscode";

const JAVA_IDENTIFIER = String.raw`[A-Za-z_$][\w$]*`;
const JAVA_QUALIFIED_NAME = String.raw`${JAVA_IDENTIFIER}(?:\.${JAVA_IDENTIFIER})*`;

const JAVA_PACKAGE_DECLARATION = new RegExp(
  String.raw`^\s*package\s+(${JAVA_QUALIFIED_NAME})\s*;`,
  "m"
);

export async function resolveQualifiedName(
  document: vscode.TextDocument,
  symbol: vscode.DocumentSymbol
): Promise<string | undefined> {
  switch (document.languageId) {
    case "java":
      return resolveJavaQualifiedName(document, symbol);

    case "typescript":
    case "typescriptreact":
    case "javascript":
    case "javascriptreact":
      return resolveFileBasedQualifiedName(document, symbol);

    case "python":
      return resolveFileBasedQualifiedName(document, symbol);

    default:
      return undefined;
  }
}

function resolveJavaQualifiedName(
  document: vscode.TextDocument,
  symbol: vscode.DocumentSymbol
): string {
  const packageName = extractJavaPackageName(document.getText());

  return packageName
    ? `${packageName}.${symbol.name}`
    : symbol.name;
}

function extractJavaPackageName(documentText: string): string {
  const match = documentText.match(JAVA_PACKAGE_DECLARATION);
  return match?.[1] ?? "";
}

function resolveFileBasedQualifiedName(
  document: vscode.TextDocument,
  symbol: vscode.DocumentSymbol
): string {
  const relativePath = vscode.workspace.asRelativePath(document.uri, false);
  const normalizedPath = relativePath.replaceAll("\\", "/");

  const withoutExtension = normalizedPath.replace(/\.[^.]+$/, "");
  const modulePath = withoutExtension.replaceAll("/", ".");

  return `${modulePath}.${symbol.name}`;
}