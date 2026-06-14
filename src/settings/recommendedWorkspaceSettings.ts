import * as vscode from "vscode";
import { ExtensionState } from "../state/extensionState";

type RecommendedSetting = {
  key: string;
  desiredValue: unknown;
  description: string;
};

const RECOMMENDED_WORKSPACE_SETTINGS: RecommendedSetting[] = [
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
export async function recommendWorkspaceSettingsIfNeeded(): Promise<void> {
  const missingSettings = getMissingRecommendedWorkspaceSettings();

  if (missingSettings.length === 0) {
    return;
  }

  const settingList = missingSettings
    .map((setting) => `• ${setting.description} (${setting.key})`)
    .join("\n");

  const choice = await vscode.window.showInformationMessage(
    [
      "ExplorViz can make more precise decisions for program snapshots if some workspace settings are adjusted.",
      "",
      "The following settings are recommended for the current workspace:",
      settingList,
      "",
      "Do you want ExplorViz to apply these workspace settings now?",
    ].join("\n"),
    { modal: true },
    "Apply Settings",
    "Not now"
  );

  if (choice !== "Apply Settings") {
    return;
  }

  await applyRecommendedWorkspaceSettings(missingSettings);

  if (vscode.debug.activeDebugSession) {
    await vscode.window.showInformationMessage(
      "ExplorViz applied the recommended workspace settings. Please restart the current debug session for all changes to take effect."
    );
  } else {
    await vscode.window.showInformationMessage(
      "ExplorViz applied the recommended workspace settings."
    );
  }
}

/**
 * Can be called from the matching/selection code when ExplorViz detected an
 * ambiguous runtime variable owner type without fully qualified runtime type information.
 *
 * This function handles three cases:
 * - recommended settings are missing -> offer to apply them
 * - settings are enabled now, but were not active when the debug session started -> suggest restart
 * - settings were already active when the session started -> no further action
 */
export async function maybeSuggestSettingsForAmbiguousRuntimeTypes(
  state: ExtensionState
): Promise<void> {
  const missingSettings = getMissingRecommendedWorkspaceSettings();

  if (missingSettings.length > 0) {
    const choice = await vscode.window.showWarningMessage(
      "ExplorViz found an ambiguous runtime type. Some recommended workspace settings are not enabled yet. Enabling them can help ExplorViz make more precise decisions for program snapshots.",
      "Apply Settings",
      "Not now"
    );

    if (choice !== "Apply Settings") {
      return;
    }

    await applyRecommendedWorkspaceSettings(missingSettings);

    if (vscode.debug.activeDebugSession) {
      await vscode.window.showInformationMessage(
        "ExplorViz applied the recommended workspace settings. Please restart the current debug session for the changes to take effect."
      );
    }

    return;
  }

  if (
    vscode.debug.activeDebugSession &&
    state.debug.recommendedSettingsAtDebugStart !== "active"
  ) {
    await vscode.window.showInformationMessage(
      "The recommended ExplorViz workspace settings are enabled now, but the current debug session may have been started before they were active. Please restart the debug session if runtime types are still not fully qualified."
    );
  }
}

/**
 * Returns whether all recommended workspace settings currently have their
 * desired values.
 *
 * This is used when a debug session starts, because some debugger settings only
 * take effect for newly started sessions.
 */
export function areRecommendedWorkspaceSettingsActive(): boolean {
  return getMissingRecommendedWorkspaceSettings().length === 0;
}

function getMissingRecommendedWorkspaceSettings(): RecommendedSetting[] {
  const config = vscode.workspace.getConfiguration();

  return RECOMMENDED_WORKSPACE_SETTINGS.filter((setting) => {
    const currentValue = config.get<unknown>(setting.key);
    return !valuesEqual(currentValue, setting.desiredValue);
  });
}

async function applyRecommendedWorkspaceSettings(
  settings: RecommendedSetting[]
): Promise<void> {
  const config = vscode.workspace.getConfiguration();

  for (const setting of settings) {
    await config.update(
      setting.key,
      setting.desiredValue,
      vscode.ConfigurationTarget.Workspace
    );
  }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}