import * as vscode from "vscode";
import {
  pairProgrammingSessionName,
  showPairProgrammingHTML,
  socket,
  currentMode,
  connectedToVis,
  currentRoom,
} from "./extension";
import { ModesEnum } from "./types";

export class SessionViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "explorviz-session-view";

  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,

      localResourceRoots: [this._extensionUri],
    };

    this._view.webview.onDidReceiveMessage((data) => {
      switch (data.type) {
        case "executeExplorVizCommand": {
          vscode.commands.executeCommand(data.command);
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

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading styles from our extension directory,
					and only allow scripts that have a specific nonce.
					(See the 'webview-sample' extension sample for img-src content security policy examples)
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${
          webview.cspSource
        }; script-src 'nonce-${nonce}';">
        
				<meta name="viewport" content="width=device-width, initial-scale=1.0">

        <link href="${vscodeCSSUri}" rel="stylesheet">
       
				<title>ExplorViz Session Information</title>
			</head>
			<body>

      <p>Start a collaboratively usable Software Visualization session to comprehend your software using the 3D city metaphor.</p>

      </br>

      ${renderOpenVizButton()}

      </br></br>

      ${renderConnectToVizButton()}
      </br>     
      </br>

      ${renderInputPP()}  
      </br>
      </br>

      <p>Current Mode:</p>
      ${currentMode.toString()}
      </br>
      </br>

      ${renderCurrentIDERoom()}

			<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
  }
}

function renderConnectToVizButton() {
  if (connectedToVis) {
    return "<button id='explorviz-disconnect-room-button'>Disconnect from Visualization</button>";
  } else {
    return "<button id='explorviz-join-room-button'>Connect to Visualization ...</button>";
  }
}

function renderOpenVizButton() {
  return "<button id='explorviz-open-viz-button'>Open Visualization</button>";
}

function renderCurrentIDERoom() {
  if (currentMode === ModesEnum.websocket) {
    return `<p>Joined Room:</p> ${currentRoom}`;
  }
  return "";
}

function renderInputPP() {
  if (showPairProgrammingHTML) {
    if (pairProgrammingSessionName) {
      return `
      <hr>
      </br>
      <label for="explorviz-join-pp-input">Connected to Pair Programming Session:</label>
      <input type="text" name="explorviz-join-pp-input" value="${pairProgrammingSessionName}" disabled>
      </br>
      `;
    } else {
      return "";
    }
  } else {
    return "";
  }
}

function renderCreatePPVizButton() {
  if (socket && socket.connected) {
    if (pairProgrammingSessionName) {
      return "<button id='explorviz-disconnect-pp-button' disabled>Disconnect Pair Programming Session</button>";
    } else {
      return `
      <hr>
      </br>
      <button id="explorviz-create-pp-button">Create Pair Programming Session</button>`;
    }
  } else {
    return "";
  }
}

function renderJoinPPButton() {
  if (showPairProgrammingHTML) {
    if (pairProgrammingSessionName) {
      // disconnect button of 'renderCreatePPVizButton' is shown
      return "";
    } else {
      return `<button id="explorviz-join-pp-button">Join Pair Programming Session</button>`;
    }
  } else {
    return "";
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
