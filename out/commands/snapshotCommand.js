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
exports.registerSnapshotCommand = void 0;
const vscode = __importStar(require("vscode"));
const variableStateSearch_1 = require("../debug/variableStateSearch");
const workspaceHelper_1 = require("../workspace/workspaceHelper");
const containingTypeResolver_1 = require("../symbols/containingTypeResolver");
function registerSnapshotCommand(context, config, state, backendClient) {
    registerCommandSaveCurrentStateForMarkedVariables(context, config, state, backendClient);
}
exports.registerSnapshotCommand = registerSnapshotCommand;
function registerCommandSaveCurrentStateForMarkedVariables(context, config, state, backendClient) {
    const saveCurrentStateForMarkedVariables = vscode.commands.registerCommand("explorviz-vscode-extension.saveCurrentStateForMarkedVariables", async () => {
        if (!state.rooms.currentDebugRoom) {
            vscode.window.showInformationMessage("Please join a debug room!");
            return;
        }
        if (!state.debug.isDebugSessionStopped ||
            state.debug.stoppedDebugSession === undefined ||
            state.debug.stoppedDebugThreadId === undefined) {
            vscode.window.showInformationMessage("Variable savement failed! Debug Session is not stopped!");
            return;
        }
        if (!config.frontendHttp) {
            vscode.window.showErrorMessage("Frontend URL is not configured.");
            return;
        }
        const isFrontendConnected = await backendClient.emit("check-frontend-connection", (b) => typeof b === "boolean", config.frontendHttp);
        if (!isFrontendConnected) {
            vscode.window.showErrorMessage("Something went wrong while checking the connection to the frontend!");
            return;
        }
        const timestampInNano = BigInt(Date.now()) * 1000000n;
        await (0, variableStateSearch_1.searchVariablesInCurrentStackFrames)(state, state.debug.stoppedDebugSession, state.debug.stoppedDebugThreadId);
        const emittedValues = await buildVariableEntries(state);
        const variables = emittedValues.map((snapshotEntry) => ({
            ...snapshotEntry,
            definitionUri: snapshotEntry.definitionUri.toString(),
        }));
        const debugRunId = state.debug.debugRunId ?? crypto.randomUUID();
        state.debug.debugRunId = debugRunId;
        const debugSnapshotData = {
            landscapeToken: state.rooms.currentDebugRoom.value,
            debugRunId,
            repositoryName: state.rooms.currentDebugRoom.projectName,
            commitHash: state.rooms.currentDebugRoom.commitId,
            epochNano: Number(timestampInNano),
            variables,
        };
        if (emittedValues.length === 0) {
            vscode.window.showInformationMessage("No variables found in the current stack frames to save!");
            return;
        }
        console.log("Emitting current snapshot data over socket:", debugSnapshotData);
        const saveSuccess = await backendClient.emit("save-current-state", (payload) => typeof payload === "boolean", debugSnapshotData);
        if (saveSuccess) {
            vscode.window.showInformationMessage("Current state has been saved!");
            console.log("Current state has been saved successfully!");
        }
        else {
            vscode.window.showErrorMessage("Unable to save current state!");
            console.error("Unable to save current state!");
        }
    });
    context.subscriptions.push(saveCurrentStateForMarkedVariables);
}
async function buildVariableEntries(state) {
    const emittedValues = [];
    for (const [watchedVariableId, snapshotEntry,] of state.variables.variableSnapshotEntryByWatchedVariableId) {
        const ownerGroup = snapshotEntry.ownerGroup;
        const watchedVariable = state.variables.debugVariableWatchlist.get(watchedVariableId);
        if (!watchedVariable) {
            continue;
        }
        const ownerTypeNameParts = await (0, containingTypeResolver_1.resolveContainingQualifiedTypeNameParts)(watchedVariable.definitionUri, new vscode.Position(watchedVariable.definitionLine, watchedVariable.definitionChar));
        const sourceInfo = await (0, workspaceHelper_1.buildSourceInfo)(watchedVariable.definitionUri, ownerTypeNameParts);
        const variableEntry = {
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
//# sourceMappingURL=snapshotCommand.js.map