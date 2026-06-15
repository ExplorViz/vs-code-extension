import { ExtensionState } from "../state/extensionState";
import { extractWorkspaceTypeDeclarations } from "./workspaceTypeDeclarationExtractor";

let workspaceTypeIndexBuildPromise: Promise<void> | undefined;

export async function ensureWorkspaceTypeIndexBuilt(
  state: ExtensionState
): Promise<void> {
  if (state.workspaceTypeIndex.status === "ready") {
    return;
  }

  if (workspaceTypeIndexBuildPromise) {
    await workspaceTypeIndexBuildPromise;
    return;
  }

  workspaceTypeIndexBuildPromise = buildWorkspaceTypeIndex(state).finally(() => {
    workspaceTypeIndexBuildPromise = undefined;
  });

  await workspaceTypeIndexBuildPromise;
}

async function buildWorkspaceTypeIndex(
  state: ExtensionState
): Promise<void> {
  state.workspaceTypeIndex.status = "building";

  try {
    const declarations = await extractWorkspaceTypeDeclarations();

    const qualifiedNamesBySimpleName = new Map<string, Set<string>>();

    for (const declaration of declarations) {
      const qualifiedNames =
        qualifiedNamesBySimpleName.get(declaration.simpleName) ??
        new Set<string>();

      qualifiedNames.add(declaration.qualifiedName);
      qualifiedNamesBySimpleName.set(declaration.simpleName, qualifiedNames);
    }

    const ambiguousSimpleNames = new Set<string>();

    for (const [simpleName, qualifiedNames] of qualifiedNamesBySimpleName) {
      if (qualifiedNames.size > 1) {
        ambiguousSimpleNames.add(simpleName);
      }
    }

    state.workspaceTypeIndex.qualifiedNamesBySimpleName =
      qualifiedNamesBySimpleName;
    state.workspaceTypeIndex.ambiguousSimpleNames = ambiguousSimpleNames;
    state.workspaceTypeIndex.status = "ready";
  } catch (error) {
    state.workspaceTypeIndex.status = "failed";
    throw error;
  }
}