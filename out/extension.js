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
exports.createActiveTextEditorChangeHandler = exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const extensionConfig_1 = require("./config/extensionConfig");
const registerCommands_1 = require("./commands/registerCommands");
const debugCodeLensProvider_1 = require("./debug/debugCodeLensProvider");
const debugSessionListeners_1 = require("./debug/debugSessionListeners");
const gitHelper_1 = require("./git/gitHelper");
const SessionViewProvider_1 = require("./SessionViewProvider");
const extensionState_1 = require("./state/extensionState");
const backendClient_1 = require("./backend/backendClient");
const variableTokenScanner_1 = require("./debug/variableTokenScanner");
const textEditorListeners_1 = require("./text-editor/textEditorListeners");
;
const recommendedWorkspaceSettings_1 = require("./settings/recommendedWorkspaceSettings");
async function activate(context) {
    const config = (0, extensionConfig_1.loadExtensionConfig)();
    const state = (0, extensionState_1.createExtensionState)();
    const sessionViewProvider = new SessionViewProvider_1.SessionViewProvider(context.extensionUri, state, config);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(SessionViewProvider_1.SessionViewProvider.viewType, sessionViewProvider));
    const backendClient = new backendClient_1.BackendClient(config, state, sessionViewProvider);
    const git = (0, gitHelper_1.getGitApi)();
    context.subscriptions.push(vscode.window.createTextEditorDecorationType({
        gutterIconPath: context.asAbsolutePath("./images/explorviz-globe.png"),
        gutterIconSize: "contain",
        isWholeLine: true,
    }));
    (0, textEditorListeners_1.registerTextEditorListeners)(context, state);
    (0, debugCodeLensProvider_1.registerDebugCodeLensProvider)(context, state);
    (0, debugSessionListeners_1.registerDebugSessionListeners)(context, state, sessionViewProvider);
    (0, registerCommands_1.registerCommands)(context, config, state, backendClient, sessionViewProvider, git);
    backendClient.connect();
    void (0, debugSessionListeners_1.restoreStoppedDebugStateIfPossible)(state, sessionViewProvider).catch((error) => {
        console.error("Failed to restore the active debug session state:", error);
        void vscode.window.showErrorMessage("ExplorViz could not restore the active debug session state.");
    });
    console.log('Congratulations, your extension "explorviz-vscode-extension" is now active!');
    console.log("[ExplorViz] Extension path:", context.extensionPath);
    console.log("[ExplorViz] Bundle path:", __filename);
    setTimeout(() => {
        void (0, recommendedWorkspaceSettings_1.recommendWorkspaceSettingsIfNeeded)().catch((error) => {
            console.error("Failed to check or apply recommended workspace settings:", error);
            void vscode.window.showErrorMessage("ExplorViz could not check or apply the recommended workspace settings.");
        });
    }, 0);
}
exports.activate = activate;
function deactivate() {
    // Optional: Clean up resources, close connections, etc.
}
exports.deactivate = deactivate;
function createActiveTextEditorChangeHandler(state) {
    return async (editor) => {
        await (0, variableTokenScanner_1.getVariablesFromCurrentEditor)(state, editor);
    };
}
exports.createActiveTextEditorChangeHandler = createActiveTextEditorChangeHandler;
//# sourceMappingURL=extension.js.map