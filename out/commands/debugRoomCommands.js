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
exports.registerDebugRoomCommands = void 0;
const vscode = __importStar(require("vscode"));
const workspaceHelper_1 = require("../workspace/workspaceHelper");
const gitHelper_1 = require("../git/gitHelper");
function registerDebugRoomCommands(context, config, state, backendClient, sessionViewProvider, git) {
    registerCommandLoadDebugSessionLandscapes(context, state, backendClient, sessionViewProvider);
    registerCommandCreateLandscapeForDebugSession(context, config, state, backendClient, git);
    registerCommandUpdateWebViewForJoinedDebugSessionLandscape(context, state, sessionViewProvider, git);
}
exports.registerDebugRoomCommands = registerDebugRoomCommands;
function registerCommandLoadDebugSessionLandscapes(context, state, backendClient, sessionViewProvider) {
    const command = vscode.commands.registerCommand("explorviz-vscode-extension.loadDebugSessionLandscapes", async () => {
        if (backendClient.isDisconnected()) {
            vscode.window.showErrorMessage("You must first connect to the backend!");
            return;
        }
        const debugRoomList = await backendClient.emit("load-debug-room-list", isValidDebugRoomList);
        if (!debugRoomList) {
            vscode.window.showErrorMessage("Did not receive debug room list from backend. Is the frontend still connected with our extension?");
            return;
        }
        state.rooms.currentDebugRooms = debugRoomList;
        sessionViewProvider.refreshHTML();
    });
    context.subscriptions.push(command);
}
function registerCommandCreateLandscapeForDebugSession(context, config, state, backendClient, git) {
    const command = vscode.commands.registerCommand("explorviz-vscode-extension.createLandscapeForDebugSession", async () => {
        if (backendClient.isDisconnected()) {
            vscode.window.showErrorMessage("You must first connect to the backend!");
            return;
        }
        if (!config.frontendHttp) {
            vscode.window.showErrorMessage("Frontend URL is not configured.");
            return;
        }
        const workspaceFolder = await (0, workspaceHelper_1.askForWorkspaceFolder)();
        if (!workspaceFolder) {
            return;
        }
        const currentCommit = (0, gitHelper_1.getCurrentCommitForWorkspace)(git, workspaceFolder);
        if (!currentCommit) {
            vscode.window.showInformationMessage("No commit for this workspace found! Please make sure that your workspace uses Git.");
            return;
        }
        const debugSessionName = await askForDebugRoomName();
        if (!debugSessionName) {
            vscode.window.showErrorMessage("No name for debug session provided!");
            return;
        }
        const isFrontendConnected = await backendClient.emit("check-frontend-connection", (b) => typeof b === "boolean", config.frontendHttp);
        if (!isFrontendConnected) {
            vscode.window.showErrorMessage("Something went wrong while checking the connection to the frontend!");
            return;
        }
        const tokenData = await backendClient.emit("create-landscape", isCreateLandscapeAck, debugSessionName, workspaceFolder.name, currentCommit);
        if (!tokenData) {
            vscode.window.showErrorMessage("Unexpected error while creating debug room!");
            return;
        }
        state.rooms.currentDebugRoom = {
            value: tokenData.value,
            secret: tokenData.secret,
            alias: debugSessionName,
            projectName: workspaceFolder.name,
            commitId: currentCommit,
        };
        await vscode.commands.executeCommand("explorviz-vscode-extension.loadDebugSessionLandscapes");
        vscode.window.showInformationMessage(`The debug room (${state.rooms.currentDebugRoom.alias}) has been successfully created!`);
    });
    context.subscriptions.push(command);
}
function registerCommandUpdateWebViewForJoinedDebugSessionLandscape(context, state, sessionViewProvider, git) {
    const command = vscode.commands.registerCommand("explorviz-vscode-extension.updateWebViewForJoinedDebugSessionLandscape", async (obj) => {
        if (!isJoinDebugRoomPayload(obj)) {
            vscode.window.showErrorMessage("Invalid debug room selection.");
            return;
        }
        const workspaceFolder = await (0, workspaceHelper_1.askForWorkspaceFolder)();
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("No workspace folder selected.");
            return;
        }
        const currentCommit = (0, gitHelper_1.getCurrentCommitForWorkspace)(git, workspaceFolder);
        if (!currentCommit) {
            vscode.window.showInformationMessage("No commit for this workspace found! Please make sure that your workspace uses Git.");
            return;
        }
        if (obj.commitId !== currentCommit) {
            vscode.window.showWarningMessage("Please join a landscape that was created for your workspace project.");
            return;
        }
        state.rooms.currentDebugRoom = state.rooms.currentDebugRooms?.find((room) => room.value === obj.tokenValue);
        if (!state.rooms.currentDebugRoom) {
            vscode.window.showErrorMessage("Selected debug room was not found.");
            return;
        }
        sessionViewProvider.refreshHTML();
    });
    context.subscriptions.push(command);
}
function askForDebugRoomName() {
    return vscode.window.showInputBox({
        prompt: "Please give the current debug room a name",
    });
}
function isValidDebugRoom(obj) {
    return (typeof obj === "object" &&
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
        typeof obj.commitId === "string");
}
function isValidDebugRoomList(payload) {
    return Array.isArray(payload) && payload.every(isValidDebugRoom);
}
function isCreateLandscapeAck(payload) {
    return (typeof payload === "object" &&
        payload !== null &&
        "value" in payload &&
        typeof payload.value === "string" &&
        "secret" in payload &&
        typeof payload.secret === "string");
}
function isJoinDebugRoomPayload(payload) {
    return (typeof payload === "object" &&
        payload !== null &&
        "tokenValue" in payload &&
        typeof payload.tokenValue === "string" &&
        "commitId" in payload &&
        typeof payload.commitId === "string");
}
//# sourceMappingURL=debugRoomCommands.js.map