import * as vscode from "vscode";


export interface WorkspaceTypeDeclaration {
  languageId: string;
  simpleName: string;
  qualifiedName: string;
  uri: vscode.Uri;
  symbolKind: vscode.SymbolKind;
}

export interface TypeIndexBuildResult {
  qualifiedNamesBySimpleName: Map<string, Set<string>>;
  ambiguousSimpleNames: Set<string>;
}