import * as vscode from "vscode";
import { WorkspaceTypeDeclaration } from "../workspace/types";
import { isTypeLikeSymbol, resolveContainingQualifiedTypeNameParts } from "../symbols/containingTypeResolver";

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
    const symbols =
      await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        "vscode.executeDocumentSymbolProvider",
        uri
      );

    if (!symbols || symbols.length === 0) {
      continue;
    }

    for (const symbol of flattenDocumentSymbols(symbols)) {
      if (!isTypeLikeSymbol(symbol)) {
        continue;
      }

      const qualifiedTypeNameParts = await resolveContainingQualifiedTypeNameParts(
        uri,
        symbol.range.start
      );

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

function flattenDocumentSymbols(
  symbols: vscode.DocumentSymbol[]
): vscode.DocumentSymbol[] {
  return symbols.flatMap((symbol) => [
    symbol,
    ...flattenDocumentSymbols(symbol.children),
  ]);
}
