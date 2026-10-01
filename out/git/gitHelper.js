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
exports.getCurrentCommitForWorkspace = exports.getGitApi = void 0;
const vscode = __importStar(require("vscode"));
function getGitApi() {
    const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
    try {
        return gitExtension?.getAPI(1);
    }
    catch (error) {
        console.log(error);
        return undefined;
    }
}
exports.getGitApi = getGitApi;
function getCurrentCommitForWorkspace(git, workspaceFolder) {
    const repository = git?.getRepository(workspaceFolder.uri);
    return repository?.state.HEAD?.commit;
}
exports.getCurrentCommitForWorkspace = getCurrentCommitForWorkspace;
//# sourceMappingURL=gitHelper.js.map