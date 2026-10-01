import * as vscode from "vscode";
import { API } from "../api/git";
import { ExtensionConfig } from "../config/extensionConfig";
import { SessionViewProvider } from "../SessionViewProvider";
import { ExtensionState } from "../state/extensionState";
import { registerBackendCommands } from "./backendCommands";
import { registerDebugRoomCommands } from "./debugRoomCommands";
import { registerDebugCommands } from "./debugCommands";
import { registerVariableCommands } from "./variableCommands";
import { BackendClient } from "../backend/backendClient";
import { registerSnapshotCommand } from "./snapshotCommand";

export function registerCommands(
  context: vscode.ExtensionContext,
  config: ExtensionConfig,
  state: ExtensionState,
  backendClient: BackendClient,
  sessionViewProvider: SessionViewProvider,
  git: API | undefined
): void {
  registerBackendCommands(context, backendClient);
  registerDebugCommands(context);

  registerDebugRoomCommands(
    context,
    config,
    state,
    backendClient,
    sessionViewProvider,
    git
  );

  registerVariableCommands(context, state, sessionViewProvider);
  registerSnapshotCommand(context, config, state, backendClient);
}