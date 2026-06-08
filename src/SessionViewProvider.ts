import * as vscode from "vscode";
import * as path from "path";

import { ExtensionState } from "./state/extensionState";
import { ExtensionConfig } from "./config/extensionConfig";

export class SessionViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "explorviz-session-view";

  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly state: ExtensionState,
    private readonly config: ExtensionConfig
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    this._view.webview.onDidReceiveMessage((data) => {
      switch (data.type) {
        case "executeExplorVizCommand": {
          if (data.optional) {
            vscode.commands.executeCommand(data.command, data.optional);
          } else {
            vscode.commands.executeCommand(data.command);
          }
          break;
        }
      }
    });

    this.refreshHTML();
  }

  public refreshHTML() {
    if (this._view) {
      this._view.show?.(true);
      this._view.webview.html = this._getHtmlForWebview(this._view.webview);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "main.js")
    );

    const vscodeCSSUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css")
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">

  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${
    webview.cspSource
  }; script-src 'nonce-${nonce}';">

  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <link href="${vscodeCSSUri}" rel="stylesheet">

  <title>ExplorViz Session Information</title>
</head>
<body>

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

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private renderConnectToBackendButton() {
    if (!this.state.backend.isConnected && !this.state.backend.isLoading) {
      return "<button id='explorviz-connect-to-backend-button'>Connect To Backend</button>";
    }

    return "";
  }

  private renderLoadingAnimation() {
    if (!this.state.backend.isConnected && this.state.backend.isLoading) {
      return `
        <p>Trying to set up a connection to the backend... Please make sure the backend is reachable under ${this.escapeHtml(
          this.config.backendHttp ?? "undefined"
        )}</p>
        <div id="loading"></div>
      `;
    }

    return "";
  }

  private renderCancelConnectionSetupButton() {
    if (!this.state.backend.isConnected && this.state.backend.isLoading) {
      return "<button id='explorviz-cancel-connection-setup-button'>Cancel Connection Setup</button>";
    }

    return "";
  }

  private renderDisconnectFromBackendButton() {
    if (this.state.backend.isConnected) {
      return "<button id='explorviz-disconnect-from-backend-button'>Disconnect From Backend</button>";
    }

    return "";
  }

  private renderSaveSnapshotButton() {
    if (
      this.state.debug.isDebugSessionStopped &&
      this.state.backend.isConnected &&
      this.state.debug.isInDebugSession
    ) {
      return "<button id='explorviz-save-current-state-button'>Save Snapshot For Marked Variables</button>";
    }

    return "";
  }

  private renderCreateLandscapeForDebugSessionButton() {
    if (this.state.backend.isConnected) {
      return "<button id='explorviz-create-landscape-for-debug-session-button'>Create Landscape For Debug Session</button>";
    }

    return "";
  }

  private renderLoadDebugSessionLandscapesButton() {
    if (!this.state.backend.isConnected) {
      return "";
    }

    const currentDebugRoom = this.state.rooms.currentDebugRoom;
    const currentDebugRooms = this.state.rooms.currentDebugRooms;

    let html =
      "<button id='explorviz-load-debug-session-landscapes-button'>Load Debug Session Landscapes</button><br />";

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
        <tr data-token-value="${this.escapeHtml(
          currentDebugRoom.value
        )}" class="current-room">
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

  private renderCurrentMarkedVariablesTable() {
    if (
      !this.state.debug.isDebugSessionStopped ||
      this.state.variables.debugVariableWatchlist.size === 0
    ) {
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

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}