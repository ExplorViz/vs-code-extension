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
exports.loadExtensionConfig = void 0;
const vscode = __importStar(require("vscode"));
function loadExtensionConfig() {
    const settings = vscode.workspace.getConfiguration("explorviz");
    const configuredBackendUrl = settings.get("backendUrl");
    const configuredFrontendUrl = settings.get("frontendUrl");
    const envBackendUrl = process.env.VS_CODE_BACKEND_URL;
    const envFrontendUrl = process.env.FRONTEND_URL;
    if (envBackendUrl) {
        console.debug(`ATTENTION: Setting 'backendUrl' has no effect, since it is overridden by environment variable 'VS_CODE_BACKEND_URL' with value: ${envBackendUrl}`);
    }
    if (envFrontendUrl) {
        console.debug(`ATTENTION: Setting 'frontendUrl' has no effect, since it is overridden by environment variable 'FRONTEND_URL' with value: ${envFrontendUrl}`);
    }
    return {
        backendHttp: envBackendUrl ?? configuredBackendUrl,
        frontendHttp: envFrontendUrl ?? configuredFrontendUrl,
    };
}
exports.loadExtensionConfig = loadExtensionConfig;
//# sourceMappingURL=extensionConfig.js.map