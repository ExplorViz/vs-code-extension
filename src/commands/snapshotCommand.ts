import * as vscode from "vscode";
import { BackendClient } from "../backend/backendClient";
import { ExtensionConfig } from "../config/extensionConfig";
import { DebugSnapshotDataDto, RuntimeOwnerGroup, RuntimeVariableValue, VariableSnapshotEntry, VariableSnapshotEntryDto  } from "../debug/types";
import { searchVariablesInCurrentStackFrames } from "../debug/variableStateSearch";
import { ExtensionState } from "../state/extensionState";
import { buildSourceInfo } from "../workspace/workspaceHelper";
import { resolveContainingQualifiedTypeNameParts } from "../symbols/containingTypeResolver";

export function registerSnapshotCommand(
  context: vscode.ExtensionContext,
  config: ExtensionConfig,
  state: ExtensionState,
  backendClient: BackendClient
): void {
  registerCommandSaveCurrentStateForMarkedVariables(context, config, state, backendClient);
}

function registerCommandSaveCurrentStateForMarkedVariables(
  context: vscode.ExtensionContext,
  config: ExtensionConfig,
  state: ExtensionState,
  backendClient: BackendClient
): void {
  const saveCurrentStateForMarkedVariables = vscode.commands.registerCommand(
    "explorviz-vscode-extension.saveCurrentStateForMarkedVariables",
    async () => {
      if (!state.rooms.currentDebugRoom) {
        vscode.window.showInformationMessage("Please join a debug room!");
        return;
      }

      if (
        !state.debug.isDebugSessionStopped ||
        state.debug.stoppedDebugSession === undefined ||
        state.debug.stoppedDebugThreadId === undefined
      ) {
        vscode.window.showInformationMessage(
          "Variable savement failed! Debug Session is not stopped!"
        );
        return;
      }

      if (!config.frontendHttp) {
        vscode.window.showErrorMessage("Frontend URL is not configured.");
        return;
      }

      const isFrontendConnected = await backendClient.emit<boolean, [string]>(
        "check-frontend-connection",
        (b): b is boolean => typeof b === "boolean",
        config.frontendHttp
      );

      if (!isFrontendConnected) {
        vscode.window.showErrorMessage(
          "Something went wrong while checking the connection to the frontend!"
        );
        return;
      }

      const timestampInNano = BigInt(Date.now()) * 1_000_000n;

      await searchVariablesInCurrentStackFrames(
        state,
        state.debug.stoppedDebugSession,
        state.debug.stoppedDebugThreadId
      );

      const emittedValues: VariableSnapshotEntry[] = await buildVariableEntries(state);
      
      const variables: VariableSnapshotEntryDto[] = emittedValues.map(
        (snapshotEntry) => ({
          ...snapshotEntry,
          definitionUri: snapshotEntry.definitionUri.toString(),
        })
      );

      const debugRunId = state.debug.debugRunId ?? crypto.randomUUID();
      state.debug.debugRunId = debugRunId;

      const debugSnapshotData: DebugSnapshotDataDto = {
        landscapeToken: state.rooms.currentDebugRoom.value,
        debugRunId,
        repositoryName: state.rooms.currentDebugRoom.projectName,
        commitHash: state.rooms.currentDebugRoom.commitId,
        epochNano: Number(timestampInNano),
        variables,
      };

      if (emittedValues.length === 0) {
        vscode.window.showInformationMessage(
          "No variables found in the current stack frames to save!"
        );
        return;
      }

      console.log("Emitting current snapshot data over socket:", debugSnapshotData);

      const saveSuccess = await backendClient.emit<
        boolean,
        [DebugSnapshotDataDto]
      >(
        "save-current-state",
        (payload): payload is boolean => typeof payload === "boolean",
        debugSnapshotData
      );

      if (saveSuccess) {
        vscode.window.showInformationMessage("Current state has been saved!");
        console.log("Current state has been saved successfully!");
      } else {
        vscode.window.showErrorMessage("Unable to save current state!");
        console.error("Unable to save current state!");
      }
    }
  );

  context.subscriptions.push(saveCurrentStateForMarkedVariables);
}

async function buildVariableEntries(state: ExtensionState):  Promise<VariableSnapshotEntry[]> {
  const emittedValues: VariableSnapshotEntry[] = [];

  for (const [
    watchedVariableId,
    snapshotEntry,
  ] of state.variables.variableSnapshotEntryByWatchedVariableId) {
    const ownerGroup = snapshotEntry.ownerGroup;

    const watchedVariable =
      state.variables.debugVariableWatchlist.get(watchedVariableId);

    if (!watchedVariable) {
      continue;
    }

    const ownerTypeNameParts = await resolveContainingQualifiedTypeNameParts(
      watchedVariable.definitionUri,
      new vscode.Position(watchedVariable.definitionLine, watchedVariable.definitionChar)
    );

    const sourceInfo = await buildSourceInfo(watchedVariable.definitionUri, ownerTypeNameParts);

    const variableEntry: VariableSnapshotEntry  = {
      id: watchedVariableId,
      name: watchedVariable.name,
      definitionUri: watchedVariable.definitionUri,
      sourcePath: sourceInfo.sourcePath,
      fileName: sourceInfo.fileName,
      packageName: sourceInfo.packageName,
      className: sourceInfo.className,
      ownerGroup,
    };

    emittedValues.push(variableEntry);
  }

  return emittedValues;
}