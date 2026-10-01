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
exports.restoreStoppedDebugStateIfPossible = exports.registerDebugSessionListeners = void 0;
const vscode = __importStar(require("vscode"));
const variableTokenScanner_1 = require("./variableTokenScanner");
const dapRequest_1 = require("./dapRequest");
const recommendedWorkspaceSettings_1 = require("../settings/recommendedWorkspaceSettings");
function registerDebugSessionListeners(context, state, sessionViewProvider) {
    context.subscriptions.push(vscode.debug.onDidStartDebugSession(() => {
        console.debug("Started debug session");
        state.debug.isInDebugSession = true;
        state.debug.debugRunId = crypto.randomUUID();
        state.debug.recommendedSettingsAtDebugStart =
            (0, recommendedWorkspaceSettings_1.areRecommendedWorkspaceSettingsActive)() ? "active" : "inactive";
        vscode.commands.executeCommand("setContext", "explorviz.showSaveCurrentStateForMarkedVariablesCommand", true);
        sessionViewProvider.refreshHTML();
    }));
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(() => {
        state.debug.isInDebugSession = false;
        state.debug.debugRunId = undefined;
        state.debug.isDebugSessionStopped = false;
        state.debug.stoppedDebugSession = undefined;
        state.debug.stoppedDebugThreadId = undefined;
        state.debug.recommendedSettingsAtDebugStart = "unknown";
        sessionViewProvider.refreshHTML();
    }));
    context.subscriptions.push(vscode.debug.registerDebugAdapterTrackerFactory("java", {
        createDebugAdapterTracker(session) {
            return {
                onWillReceiveMessage: (m) => {
                    if (m?.type === "request" && m?.command === "initialize") {
                        state.debug.capabilities = {
                            supportsVariableType: m.arguments?.supportsVariableType ?? false,
                        };
                        return;
                    }
                    if (!m?.command) {
                        return;
                    }
                    switch (m.command) {
                        case "continue":
                        case "terminate":
                        case "disconnect":
                            state.debug.isDebugSessionStopped = false;
                            state.debug.stoppedDebugSession = undefined;
                            state.debug.stoppedDebugThreadId = undefined;
                            sessionViewProvider.refreshHTML();
                            break;
                    }
                },
                onDidSendMessage: (m) => {
                    if (!m?.event) {
                        return;
                    }
                    switch (m.event) {
                        case "processid":
                            if (m?.body?.processId) {
                                state.debug.debuggedAppPID = m.body.processId;
                            }
                            break;
                        case "stopped":
                            state.debug.isDebugSessionStopped = true;
                            state.debug.stoppedDebugSession = session;
                            state.debug.stoppedDebugThreadId = m?.body?.threadId;
                            if (m?.body?.reason === "breakpoint" ||
                                m?.body?.reason === "data breakpoint" ||
                                m?.body?.reason === "function breakpoint" ||
                                m?.body?.reason === "instruction breakpoint") {
                                (0, variableTokenScanner_1.getVariablesFromCurrentEditor)(state, vscode.window.activeTextEditor);
                            }
                            sessionViewProvider.refreshHTML();
                            break;
                    }
                },
            };
        },
    }));
}
exports.registerDebugSessionListeners = registerDebugSessionListeners;
async function restoreStoppedDebugStateIfPossible(state, sessionViewProvider) {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
        return;
    }
    state.debug.isInDebugSession = true;
    state.debug.stoppedDebugSession = session;
    state.debug.recommendedSettingsAtDebugStart = "unknown";
    const threadId = getThreadIdFromActiveStackFrame() ??
        await inferStoppedThreadIdFromDebugAdapter(session);
    if (threadId === undefined) {
        state.debug.isDebugSessionStopped = false;
        state.debug.stoppedDebugThreadId = undefined;
        sessionViewProvider.refreshHTML();
        return;
    }
    state.debug.isDebugSessionStopped = true;
    state.debug.stoppedDebugThreadId = threadId;
    await (0, variableTokenScanner_1.getVariablesFromCurrentEditor)(state, vscode.window.activeTextEditor);
    sessionViewProvider.refreshHTML();
}
exports.restoreStoppedDebugStateIfPossible = restoreStoppedDebugStateIfPossible;
function getThreadIdFromActiveStackFrame() {
    const item = vscode.debug.activeStackItem;
    if (item instanceof vscode.DebugStackFrame) {
        return item.threadId;
    }
    return undefined;
}
async function inferStoppedThreadIdFromDebugAdapter(session) {
    let threadsResponse;
    try {
        threadsResponse = await (0, dapRequest_1.dapRequest)(session, "threads");
    }
    catch {
        return undefined;
    }
    for (const thread of threadsResponse.threads) {
        try {
            const stackTraceResponse = await (0, dapRequest_1.dapRequest)(session, "stackTrace", {
                threadId: thread.id,
                startFrame: 0,
                levels: 1,
            });
            if (stackTraceResponse.stackFrames.length > 0) {
                return thread.id;
            }
        }
        catch {
            // If there are active threads or if the adapter is currently unable to provide a stack trace,
            // the stack trace may fail. In that case, we'll try the next thread.
        }
    }
    return undefined;
}
//# sourceMappingURL=debugSessionListeners.js.map