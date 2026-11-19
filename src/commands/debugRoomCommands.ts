import * as vscode from "vscode";
import { BackendClient } from "../backend/backendClient";
import { ExtensionConfig } from "../config/extensionConfig";
import { API } from "../api/git";
import { ExtensionState } from "../state/extensionState";
import { SessionViewProvider } from "../SessionViewProvider";
import { DebugRoom, DebugRoomList } from "../debug/types";
import { askForWorkspaceFolder } from "../workspace/workspaceHelper";
import { getCurrentCommitForWorkspace } from "../git/gitHelper";

interface JoinDebugRoomPayload {
  tokenValue: string;
  commitId: string;
}

export function registerDebugRoomCommands(
  context: vscode.ExtensionContext,
  config: ExtensionConfig,
  state: ExtensionState,
  backendClient: BackendClient,
  sessionViewProvider: SessionViewProvider,
  git: API | undefined
): void {
  registerCommandLoadDebugSessionLandscapes(
    context,
    state,
    backendClient,
    sessionViewProvider
  );

  registerCommandCreateLandscapeForDebugSession(
    context,
    config,
    state,
    backendClient,
    git
  );

  registerCommandUpdateWebViewForJoinedDebugSessionLandscape(
    context,
    state,
    sessionViewProvider,
    git
  );
}

function registerCommandLoadDebugSessionLandscapes(
  context: vscode.ExtensionContext,
  state: ExtensionState,
  backendClient: BackendClient,
  sessionViewProvider: SessionViewProvider
): void {
  const command = vscode.commands.registerCommand(
    "explorviz-vscode-extension.loadDebugSessionLandscapes",
    async () => {
      if (backendClient.isDisconnected()) {
        vscode.window.showErrorMessage("You must first connect to the backend!");
        return;
      }

      const debugRoomList = await backendClient.emit<DebugRoomList>(
        "load-debug-room-list",
        isValidDebugRoomList
      );

      if (!debugRoomList) {
        vscode.window.showErrorMessage(
          "Did not receive debug room list from backend. Is the frontend still connected with our extension?"
        );
        return;
      }

      state.rooms.currentDebugRooms = debugRoomList;
      sessionViewProvider.refreshHTML();
    }
  );

  context.subscriptions.push(command);
}

function registerCommandCreateLandscapeForDebugSession(
  context: vscode.ExtensionContext,
  config: ExtensionConfig,
  state: ExtensionState,
  backendClient: BackendClient,
  git: API | undefined
): void {
  const command = vscode.commands.registerCommand(
    "explorviz-vscode-extension.createLandscapeForDebugSession",
    async () => {
      if (backendClient.isDisconnected()) {
        vscode.window.showErrorMessage("You must first connect to the backend!");
        return;
      }

      if (!config.frontendHttp) {
        vscode.window.showErrorMessage("Frontend URL is not configured.");
        return;
      }

      const workspaceFolder = await askForWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const currentCommit = getCurrentCommitForWorkspace(git, workspaceFolder);

      if (!currentCommit) {
        vscode.window.showInformationMessage(
          "No commit for this workspace found! Please make sure that your workspace uses Git."
        );
        return;
      }

      const debugSessionName = await askForDebugRoomName();

      if (!debugSessionName) {
        vscode.window.showErrorMessage("No name for debug session provided!");
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

      const tokenData = await backendClient.emit<
        { value: string; secret: string },
        [string, string, string]
      >(
        "create-landscape",
        isCreateLandscapeAck,
        debugSessionName,
        workspaceFolder.name,
        currentCommit
      );

      if (!tokenData) {
        vscode.window.showErrorMessage(
          "Unexpected error while creating debug room!"
        );
        return;
      }

      state.rooms.currentDebugRoom = {
        value: tokenData.value,
        secret: tokenData.secret,
        alias: debugSessionName,
        projectName: workspaceFolder.name,
        commitId: currentCommit,
      };

      await vscode.commands.executeCommand(
        "explorviz-vscode-extension.loadDebugSessionLandscapes"
      );

      vscode.window.showInformationMessage(
        `The debug room (${state.rooms.currentDebugRoom.alias}) has been successfully created!`
      );
    }
  );

  context.subscriptions.push(command);
}

function registerCommandUpdateWebViewForJoinedDebugSessionLandscape(
  context: vscode.ExtensionContext,
  state: ExtensionState,
  sessionViewProvider: SessionViewProvider,
  git: API | undefined
): void {
  const command = vscode.commands.registerCommand(
    "explorviz-vscode-extension.updateWebViewForJoinedDebugSessionLandscape",
    async (obj: unknown) => {
      if (!isJoinDebugRoomPayload(obj)) {
        vscode.window.showErrorMessage("Invalid debug room selection.");
        return;
      }

      const workspaceFolder = await askForWorkspaceFolder();

      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder selected.");
        return;
      }

      const currentCommit = getCurrentCommitForWorkspace(git, workspaceFolder);

      if (!currentCommit) {
        vscode.window.showInformationMessage(
          "No commit for this workspace found! Please make sure that your workspace uses Git."
        );
        return;
      }

      if (obj.commitId !== currentCommit) {
        vscode.window.showWarningMessage(
          "Please join a landscape that was created for your workspace project."
        );
        return;
      }

      state.rooms.currentDebugRoom = state.rooms.currentDebugRooms?.find(
        (room) => room.value === obj.tokenValue
      );

      if (!state.rooms.currentDebugRoom) {
        vscode.window.showErrorMessage("Selected debug room was not found.");
        return;
      }

      sessionViewProvider.refreshHTML();
    }
  );

  context.subscriptions.push(command);
}

function askForDebugRoomName() {
  return vscode.window.showInputBox({
    prompt: "Please give the current debug room a name",
  });
}

function isValidDebugRoom(obj: unknown): obj is DebugRoom {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "alias" in obj &&
    typeof obj.alias === "string" &&
    "secret" in obj &&
    typeof obj.secret === "string" &&
    "value" in obj &&
    typeof obj.value === "string" &&
    "projectName" in obj &&
    typeof obj.projectName === "string" &&
    "commitId" in obj &&
    typeof obj.commitId === "string"
  );
}

function isValidDebugRoomList(payload: unknown): payload is DebugRoomList {
  return Array.isArray(payload) && payload.every(isValidDebugRoom);
}

function isCreateLandscapeAck(
  payload: unknown
): payload is { value: string; secret: string } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "value" in payload &&
    typeof payload.value === "string" &&
    "secret" in payload &&
    typeof payload.secret === "string"
  );
}

function isJoinDebugRoomPayload(
  payload: unknown
): payload is JoinDebugRoomPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "tokenValue" in payload &&
    typeof payload.tokenValue === "string" &&
    "commitId" in payload &&
    typeof payload.commitId === "string"
  );
}