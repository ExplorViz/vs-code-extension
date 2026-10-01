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
exports.buildSourceInfo = exports.askForWorkspaceFolder = void 0;
const vscode = __importStar(require("vscode"));
async function askForWorkspaceFolder() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showInformationMessage("No workspace folders are open.");
        return undefined;
    }
    if (workspaceFolders.length === 1) {
        return workspaceFolders[0];
    }
    const folder = await vscode.window.showWorkspaceFolderPick({
        placeHolder: "Select a workspace folder",
    });
    if (!folder) {
        vscode.window.showInformationMessage("No workspace folder selected.");
    }
    return folder;
}
exports.askForWorkspaceFolder = askForWorkspaceFolder;
async function buildSourceInfo(uri, typeParts) {
    const sourcePath = toWorkspaceRelativePath(uri);
    const fileName = sourcePath.substring(sourcePath.lastIndexOf("/") + 1);
    return {
        definitionUri: uri.toString(),
        sourcePath,
        fileName,
        packageName: typeParts?.packageName ?? "",
        className: typeParts?.className ?? removeFileExtension(fileName),
    };
}
exports.buildSourceInfo = buildSourceInfo;
function toWorkspaceRelativePath(uri) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
        return uri.fsPath.replaceAll("\\", "/");
    }
    return vscode.workspace.asRelativePath(uri, false).replaceAll("\\", "/");
}
function removeFileExtension(fileName) {
    return fileName.replace(/\.[^.]+$/, "");
}
//# sourceMappingURL=workspaceHelper.js.map