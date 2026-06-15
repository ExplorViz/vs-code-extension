import * as vscode from "vscode";
import { WorkspaceTypeDeclaration } from "./types";
import { resolveQualifiedName } from "./languageQualifiedNameResolvers";

const SUPPORTED_FILE_PATTERN = "**/*.{java}"; // {java,ts,tsx,js,jsx,py}";

const EXCLUDED_FILE_PATTERN =
  "**/{node_modules,target,build,out,dist,.gradle,.metadata,.git}/**";

export async function extractWorkspaceTypeDeclarations(): Promise<
  WorkspaceTypeDeclaration[]
> {
  const files = await vscode.workspace.findFiles(
    SUPPORTED_FILE_PATTERN,
    EXCLUDED_FILE_PATTERN
  );

  const declarations: WorkspaceTypeDeclaration[] = [];

  for (const uri of files) {
    const document = await vscode.workspace.openTextDocument(uri);
    console.log("languageId:", document.languageId);
    console.log("file:", uri.fsPath);

    const symbols =
      await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        "vscode.executeDocumentSymbolProvider",
        uri
      );

      console.log("symbols: ", symbols);

    if (!symbols || symbols.length === 0) {
      continue;
    }

    for (const symbol of flattenDocumentSymbols(symbols)) {
      if (!isTypeLikeSymbol(symbol)) {
        continue;
      }

      const qualifiedName = await resolveQualifiedName(
        document,
        symbol
      );

      if (!qualifiedName) {
        continue;
      }

      declarations.push({
        languageId: document.languageId,
        simpleName: symbol.name,
        qualifiedName,
        uri,
        symbolKind: symbol.kind,
      });
    }
  }

  return declarations;
}

function flattenDocumentSymbols(
  symbols: vscode.DocumentSymbol[]
): vscode.DocumentSymbol[] {
  return symbols.flatMap((symbol) => [
    symbol,
    ...flattenDocumentSymbols(symbol.children),
  ]);
}

function isTypeLikeSymbol(symbol: vscode.DocumentSymbol): boolean {
  return (
    symbol.kind === vscode.SymbolKind.Class ||
    symbol.kind === vscode.SymbolKind.Interface ||
    symbol.kind === vscode.SymbolKind.Enum ||
    symbol.kind === vscode.SymbolKind.Struct ||
    symbol.kind === vscode.SymbolKind.Module ||
    symbol.kind === vscode.SymbolKind.Namespace
  );
}