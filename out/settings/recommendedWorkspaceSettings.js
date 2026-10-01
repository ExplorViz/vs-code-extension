"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.areRecommendedWorkspaceSettingsActive = exports.maybeSuggestSettingsForAmbiguousRuntimeTypes = exports.recommendWorkspaceSettingsIfNeeded = void 0;
const vscode = __importStar(require("vscode"));
const variableStateSearch_1 = require("../debug/variableStateSearch");
const RECOMMENDED_WORKSPACE_SETTINGS = [
    {
        key: "java.debug.settings.showQualifiedNames",
        desiredValue: true,
        description: "Show fully qualified Java class names while debugging.",
    },
];
/**
 * Shows a general recommendation during extension activation if one or more
 * recommended workspace settings are not configured yet.
 *
 * This should be called once during activation.
 */
async function recommendWorkspaceSettingsIfNeeded() {
    const missingSettings = getMissingRecommendedWorkspaceSettings();
    if (missingSettings.length === 0) {
        return;
    }
    const settingList = missingSettings
        .map((setting) => `• ${setting.description} (${setting.key})`)
        .join("\n");
    const choice = await vscode.window.showInformationMessage([
        "ExplorViz can make more precise decisions for program snapshots if some workspace settings are adjusted.",
        "",
        "The following settings are recommended for the current workspace:",
        settingList,
        "",
        "Do you want ExplorViz to apply these workspace settings now?",
    ].join("\n"), { modal: true }, "Apply Settings", "Not now");
    if (choice !== "Apply Settings") {
        return;
    }
    await applyRecommendedWorkspaceSettings(missingSettings);
    if (vscode.debug.activeDebugSession) {
        void vscode.window.showInformationMessage("Settings applied: Restart the current debug session for all changes to take effect.");
    }
    else {
        void vscode.window.showInformationMessage("ExplorViz applied the recommended workspace settings.");
    }
}
exports.recommendWorkspaceSettingsIfNeeded = recommendWorkspaceSettingsIfNeeded;
/**
 * Can be called from the matching/selection code when ExplorViz detected an
 * ambiguous runtime variable owner type without fully qualified runtime type information.
 *
 * This function handles three cases:
 * - recommended settings are missing -> offer to apply them
 * - settings are enabled now, but were not active when the debug session started -> suggest restart
 * - settings were already active when the session started -> no further action
 */
async function maybeSuggestSettingsForAmbiguousRuntimeTypes(state, matches) {
    const ambiguousRuntimeTypes = getAmbiguousRuntimeTypesWithoutFqn(state, matches);
    if (ambiguousRuntimeTypes.length === 0) {
        return;
    }
    const missingSettings = getMissingRecommendedWorkspaceSettings();
    if (missingSettings.length > 0) {
        const ambiguousRuntimeTypeList = ambiguousRuntimeTypes
            .map((type) => `• ${type.simpleName}: ${type.qualifiedNames.join(", ")}`)
            .join("\n");
        const choice = await vscode.window.showWarningMessage([
            "ExplorViz found ambiguous runtime types. The debugger only provided simple type names, but this workspace contains multiple matching qualified types.",
            "",
            "Ambiguous runtime types:",
            ambiguousRuntimeTypeList,
            "",
            "Some recommended workspace settings are not enabled yet. Enabling them can help ExplorViz make more precise decisions for program snapshots.",
        ].join("\n"), { modal: true }, "Apply Settings", "Not now");
        if (choice !== "Apply Settings") {
            return;
        }
        await applyRecommendedWorkspaceSettings(missingSettings);
        if (vscode.debug.activeDebugSession) {
            await vscode.window.showInformationMessage("ExplorViz applied the recommended workspace settings. Please restart the current debug session for the changes to take effect.");
        }
        return;
    }
    if (vscode.debug.activeDebugSession &&
        state.debug.recommendedSettingsAtDebugStart !== "active") {
        const ambiguousRuntimeTypeList = ambiguousRuntimeTypes
            .map((type) => `• ${type.simpleName}: ${type.qualifiedNames.join(", ")}`)
            .join("\n");
        await vscode.window.showInformationMessage([
            "The recommended ExplorViz workspace settings are enabled now, but the current debug session may have been started before they were active.",
            "",
            "Ambiguous runtime types:",
            ambiguousRuntimeTypeList,
            "",
            "Please restart the debug session if runtime types are still not fully qualified.",
        ].join("\n"), { modal: true });
    }
}
exports.maybeSuggestSettingsForAmbiguousRuntimeTypes = maybeSuggestSettingsForAmbiguousRuntimeTypes;
/**
 * Returns whether all recommended workspace settings currently have their
 * desired values.
 *
 * This is used when a debug session starts, because some debugger settings only
 * take effect for newly started sessions.
 */
function areRecommendedWorkspaceSettingsActive() {
    return getMissingRecommendedWorkspaceSettings().length === 0;
}
exports.areRecommendedWorkspaceSettingsActive = areRecommendedWorkspaceSettingsActive;
function getMissingRecommendedWorkspaceSettings() {
    const config = vscode.workspace.getConfiguration();
    return RECOMMENDED_WORKSPACE_SETTINGS.filter((setting) => {
        const currentValue = config.get(setting.key);
        return !valuesEqual(currentValue, setting.desiredValue);
    });
}
async function applyRecommendedWorkspaceSettings(settings) {
    const config = vscode.workspace.getConfiguration();
    for (const setting of settings) {
        await config.update(setting.key, setting.desiredValue, vscode.ConfigurationTarget.Workspace);
    }
}
function valuesEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
function getAmbiguousRuntimeTypesWithoutFqn(state, matches) {
    if (state.workspaceTypeIndex.status !== "ready") {
        return [];
    }
    const ambiguousRuntimeTypesBySimpleName = new Map();
    for (const match of matches) {
        const ownerType = match.ownerType;
        if (!ownerType) {
            continue;
        }
        if ((0, variableStateSearch_1.isFullyQualifiedTypeName)(ownerType)) {
            continue;
        }
        const simpleName = (0, variableStateSearch_1.getSimpleTypeName)(ownerType);
        if (!state.workspaceTypeIndex.ambiguousSimpleNames.has(simpleName)) {
            continue;
        }
        const qualifiedNames = state.workspaceTypeIndex.qualifiedNamesBySimpleName.get(simpleName);
        ambiguousRuntimeTypesBySimpleName.set(simpleName, {
            simpleName,
            qualifiedNames: Array.from(qualifiedNames ?? []).sort(),
        });
    }
    return Array.from(ambiguousRuntimeTypesBySimpleName.values());
}
//# sourceMappingURL=recommendedWorkspaceSettings.js.map