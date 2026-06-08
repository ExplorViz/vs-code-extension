import * as vscode from "vscode";
import { BackendClient } from "../backend/backendClient";
import { ExtensionConfig } from "../config/extensionConfig";
import { ClassEntry, StateValue, VariableEntry } from "../debug/types";
import { searchVariablesInCurrentStackFrames } from "../debug/variableStateSearch";
import { ExtensionState } from "../state/extensionState";

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

      console.log("Saving current state");

      const timestampInNano = BigInt(Date.now()) * 1_000_000n;

      await searchVariablesInCurrentStackFrames(
        state,
        state.debug.stoppedDebugSession,
        state.debug.stoppedDebugThreadId
      );

      const emittedValues: VariableEntry[] = buildVariableEntries(state);

      if (emittedValues.length === 0) {
        vscode.window.showInformationMessage(
          "No variables found in the current stack frames to save!"
        );
        return;
      }

      console.log("Emitting current state over socket:", emittedValues);

      const saveSuccess = await backendClient.emit<
        boolean,
        [string, number, VariableEntry[]]
      >(
        "save-current-state",
        (payload): payload is boolean => typeof payload === "boolean",
        state.rooms.currentDebugRoom.value,
        Number(timestampInNano),
        emittedValues
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

function buildVariableEntries(state: ExtensionState): VariableEntry[] {
  const emittedValues: VariableEntry[] = [];

  for (const [
    watchedVariableId,
    stateValues,
  ] of state.variables.debugVariableStateValues) {
    if (stateValues.length === 0) {
      continue;
    }

    const watchedVariable =
      state.variables.debugVariableWatchlist.get(watchedVariableId);

    if (!watchedVariable) {
      continue;
    }

    const variableEntry: VariableEntry = {
      name: watchedVariable.name,
      classes: [
        {
          className: watchedVariable.containingTypeName ?? "unknown",
          values: stateValues,
        },
      ],
    };

    emittedValues.push(variableEntry);
  }

  return emittedValues;
}