"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureWorkspaceTypeIndexBuilt = void 0;
const workspaceTypeDeclarationExtractor_1 = require("./workspaceTypeDeclarationExtractor");
let workspaceTypeIndexBuildPromise;
async function ensureWorkspaceTypeIndexBuilt(state) {
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
exports.ensureWorkspaceTypeIndexBuilt = ensureWorkspaceTypeIndexBuilt;
async function buildWorkspaceTypeIndex(state) {
    state.workspaceTypeIndex.status = "building";
    try {
        const declarations = await (0, workspaceTypeDeclarationExtractor_1.extractWorkspaceTypeDeclarations)();
        const qualifiedNamesBySimpleName = new Map();
        for (const declaration of declarations) {
            const qualifiedNames = qualifiedNamesBySimpleName.get(declaration.simpleName) ??
                new Set();
            qualifiedNames.add(declaration.qualifiedName);
            qualifiedNamesBySimpleName.set(declaration.simpleName, qualifiedNames);
        }
        const ambiguousSimpleNames = new Set();
        for (const [simpleName, qualifiedNames] of qualifiedNamesBySimpleName) {
            if (qualifiedNames.size > 1) {
                ambiguousSimpleNames.add(simpleName);
            }
        }
        state.workspaceTypeIndex.qualifiedNamesBySimpleName =
            qualifiedNamesBySimpleName;
        state.workspaceTypeIndex.ambiguousSimpleNames = ambiguousSimpleNames;
        state.workspaceTypeIndex.status = "ready";
    }
    catch (error) {
        state.workspaceTypeIndex.status = "failed";
        throw error;
    }
}
//# sourceMappingURL=ensureWorkspaceTypeIndexBuilt.js.map