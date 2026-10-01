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
exports.SessionViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class SessionViewProvider {
    constructor(_extensionUri, state, config) {
        this._extensionUri = _extensionUri;
        this.state = state;
        this.config = config;
        this._webviewReady = false;
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        this._webviewReady = false;
        webviewView.onDidDispose(() => {
            if (this._view === webviewView) {
                this._view = undefined;
                this._webviewReady = false;
            }
        });
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
        webviewView.webview.onDidReceiveMessage((data) => {
            switch (data.type) {
                case "ready": {
                    this._webviewReady = true;
                    this.refreshHTML();
                    break;
                }
                case "executeExplorVizCommand": {
                    if (data.optional) {
                        vscode.commands.executeCommand(data.command, data.optional);
                    }
                    else {
                        vscode.commands.executeCommand(data.command);
                    }
                    break;
                }
            }
        });
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    }
    refreshHTML() {
        if (this._view && this._webviewReady) {
            void this._view.webview.postMessage({
                type: "updateSessionContent",
                html: this._getContentHtml(),
            });
        }
    }
    _getHtmlForWebview(webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "main.js"));
        const vscodeCSSUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css"));
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">

  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <link href="${vscodeCSSUri}" rel="stylesheet">

  <title>ExplorViz Session Information</title>
</head>
<body>

  <div id="explorviz-session-content"></div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
    _getContentHtml() {
        return `
      <p>Start a collaboratively usable Software Visualization session to comprehend your software using the 3D city metaphor.</p>

      <br />

      ${this.renderConnectToBackendButton()}
      ${this.renderLoadingAnimation()}
      ${this.renderCancelConnectionSetupButton()}
      ${this.renderDisconnectFromBackendButton()}

      <br />

      ${this.renderCreateLandscapeForDebugSessionButton()}

      <br />

      ${this.renderLoadDebugSessionLandscapesButton()}

      <br /><br />

      ${this.renderCurrentMarkedVariablesTable()}

      <br />

      ${this.renderSaveSnapshotButton()}
    `;
    }
    renderConnectToBackendButton() {
        if (!this.state.backend.isConnected && !this.state.backend.isLoading) {
            return "<button id='explorviz-connect-to-backend-button'>Connect To Backend</button>";
        }
        return "";
    }
    renderLoadingAnimation() {
        if (!this.state.backend.isConnected && this.state.backend.isLoading) {
            return `
        <p>Trying to set up a connection to the backend... Please make sure the backend is reachable under ${this.escapeHtml(this.config.backendHttp ?? "undefined")}</p>
        <div id="loading"></div>
      `;
        }
        return "";
    }
    renderCancelConnectionSetupButton() {
        if (!this.state.backend.isConnected && this.state.backend.isLoading) {
            return "<button id='explorviz-cancel-connection-setup-button'>Cancel Connection Setup</button>";
        }
        return "";
    }
    renderDisconnectFromBackendButton() {
        if (this.state.backend.isConnected) {
            return "<button id='explorviz-disconnect-from-backend-button'>Disconnect From Backend</button>";
        }
        return "";
    }
    renderSaveSnapshotButton() {
        if (this.state.debug.isDebugSessionStopped &&
            this.state.backend.isConnected &&
            this.state.debug.isInDebugSession) {
            return "<button id='explorviz-save-current-state-button'>Save Snapshot For Marked Variables</button>";
        }
        return "";
    }
    renderCreateLandscapeForDebugSessionButton() {
        if (this.state.backend.isConnected) {
            return "<button id='explorviz-create-landscape-for-debug-session-button'>Create Landscape For Debug Session</button>";
        }
        return "";
    }
    renderLoadDebugSessionLandscapesButton() {
        if (!this.state.backend.isConnected) {
            return "";
        }
        const currentDebugRoom = this.state.rooms.currentDebugRoom;
        const currentDebugRooms = this.state.rooms.currentDebugRooms;
        let html = "<button id='explorviz-load-debug-session-landscapes-button'>Load Debug Session Landscapes</button><br />";
        html += `
      <div id="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Alias</th>
              <th>Project Name</th>
              <th>Commit Id</th>
            </tr>
          </thead>
          <tbody>
    `;
        if (currentDebugRoom) {
            html += `
        <tr data-token-value="${this.escapeHtml(currentDebugRoom.value)}" class="current-room">
          <td>${this.escapeHtml(currentDebugRoom.alias)}</td>
          <td>${this.escapeHtml(currentDebugRoom.projectName)}</td>
          <td>${this.escapeHtml(currentDebugRoom.commitId)}</td>
        </tr>
      `;
        }
        if (currentDebugRooms && currentDebugRooms.length > 0) {
            for (const room of currentDebugRooms) {
                if (room.alias === currentDebugRoom?.alias) {
                    continue;
                }
                html += `
          <tr 
            data-token-value="${this.escapeHtml(room.value)}" 
            data-commit-id="${this.escapeHtml(room.commitId)}"
          >
            <td>${this.escapeHtml(room.alias)}</td>
            <td>${this.escapeHtml(room.projectName)}</td>
            <td>${this.escapeHtml(room.commitId)}</td>
          </tr>
        `;
            }
        }
        html += `
          </tbody>
        </table>
      </div>
    `;
        return html;
    }
    renderCurrentMarkedVariablesTable() {
        if (!this.state.debug.isDebugSessionStopped ||
            this.state.variables.debugVariableWatchlist.size === 0) {
            return "";
        }
        let html = `
      <div id="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Marked Variable Name</th>
              <th>Definition File</th>
              <th>Definition Line</th>
            </tr>
          </thead>
          <tbody>
    `;
        for (const [, watchedVariable] of this.state.variables.debugVariableWatchlist) {
            const definitionFile = path.basename(watchedVariable.definitionUri.fsPath);
            const definitionLine = watchedVariable.definitionLine + 1;
            html += `
        <tr>
          <td>${this.escapeHtml(watchedVariable.name)}</td>
          <td>${this.escapeHtml(definitionFile)}</td>
          <td>${definitionLine}</td>
        </tr>
      `;
        }
        html += `
          </tbody>
        </table>
        <button id='explorviz-remove-all-variables-from-debug-watch-button'>
          Remove All Variables From Debug Watch
        </button>
      </div>
    `;
        return html;
    }
    escapeHtml(value) {
        return value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}
SessionViewProvider.viewType = "explorviz-session-view";
exports.SessionViewProvider = SessionViewProvider;
function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=SessionViewProvider.js.map