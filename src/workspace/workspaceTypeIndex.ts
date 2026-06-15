import { ExtensionState } from "../state/extensionState";
import { extractWorkspaceTypeDeclarations } from "./documentSymbolTypeExtractor";
import { TypeIndexBuildResult, WorkspaceTypeDeclaration } from "./types";


function createTypeIndex(
  declarations: WorkspaceTypeDeclaration[]
): TypeIndexBuildResult {
  const qualifiedNamesBySimpleName = new Map<string, Set<string>>();

  for (const declaration of declarations) {
    console.log("Declaration: ", declaration);
    const qualifiedNames =
      qualifiedNamesBySimpleName.get(declaration.simpleName) ??
      new Set<string>();

    qualifiedNames.add(declaration.qualifiedName);

    qualifiedNamesBySimpleName.set(
      declaration.simpleName,
      qualifiedNames
    );
  }

  const ambiguousSimpleNames = new Set<string>();

  for (const [simpleName, qualifiedNames] of qualifiedNamesBySimpleName) {
    console.log(simpleName, "->", qualifiedNames);
    if (qualifiedNames.size > 1) {
      ambiguousSimpleNames.add(simpleName);
    }
  }

  return {
    qualifiedNamesBySimpleName,
    ambiguousSimpleNames,
  };
}