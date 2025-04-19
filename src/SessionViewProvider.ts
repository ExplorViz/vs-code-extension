import * as vscode from "vscode";
import {
  pairProgrammingSessionName,
  showPairProgrammingHTML,
  socket,
  currentMode,
  connectedToVis,
  currentRoom,
  isInDebugSession,
  isDebugSessionStopped,
  currentDebugRooms,
  isConnectedToBackend,
  isLoading,
  backendHttp,
  currentDebugRoom,
  isInspectITClientAttached
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
          if(data.optional){
            vscode.commands.executeCommand(data.command, data.optional);
          }else {
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
      ${renderConnectToBackendButton()}
      ${renderLoadingAnimation()}
      ${renderCancelConnectionSetupButton()}
      ${renderDisconnectFromBackendButton()}

      </br>

      ${renderCreateLandscapeForDebugSessionButton()}

      </br>

      ${renderLoadDebugSessionLandscapesButton()}

      </br>

      ${renderActivateDeactivateExplorVizButton()}

      </br></br>

      ${renderSaveBreakpointButton()}
      ` +
      /*</br></br>

      ${renderOpenVizButton()}

      </br></br>
      ${renderConnectToVizButton()}
      </br>     
      </br>

      ${renderInputPP()}  
      </br>
      </br>

      <p>Current Mode:</p>
      ${currentMode ?? "None"}
      </br>
      </br>
      ${renderCurrentIDERoom()}
      */
      `
			<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
  }
}

function renderConnectToBackendButton() {
  if(!isConnectedToBackend && !isLoading) {
    return "<button id='explorviz-connect-to-backend-button'>Connect To Backend</button>";
  }
  return "";
}

function renderLoadingAnimation() {
  if(!isConnectedToBackend && isLoading) {
    return `
      <p>Trying to set up a connection to the backend... Please make sure the backend is reachable under ${backendHttp}</p>
      <div id="loading"></div>
    `; 
  }
  return "";
}

function renderCancelConnectionSetupButton() {
  if(!isConnectedToBackend && isLoading) {
    return "<button id='explorviz-cancel-connection-setup-button'>Cancel Connection Setup</button>";
  }
  return "";
}

function renderDisconnectFromBackendButton() {
  if(isConnectedToBackend) {
    return "<button id='explorviz-disconnect-from-backend-button'>Disconnect From Backend</button>";
  }
  return "";
}
 

function renderActivateDeactivateExplorVizButton() {
  if( isConnectedToBackend && isInDebugSession && !isInspectITClientAttached) {
    return "<button id='explorviz-visualize-debug-session-button'>Initiate Monitoring For This Debug Session</button>";
  }
  if(isConnectedToBackend && isInDebugSession && isInspectITClientAttached){
    return "<p>ExplorViz is activated for the current debug session</p>";//"<button id='explorviz-deactivate-button'>Deactivate ExplorViz For Current Debug Session</button>";
  }
  return "";
}

function renderSaveBreakpointButton() {
  if(isDebugSessionStopped && isInspectITClientAttached) {
    return "<button id='explorviz-save-current-state-button'>Save Current State</button>";
  }
  return "";
}

function renderCreateLandscapeForDebugSessionButton() {
  if(isConnectedToBackend) {
    return "<button id='explorviz-create-landscape-for-debug-session-button'>Create Landscape For Debug Session</button>";
  }
  return "";
}

function renderLoadDebugSessionLandscapesButton() {


  let temp = "<button id='explorviz-load-debug-session-landscapes-button'>Load Debug Session Landscapes</button></br>";
  /*if(!currentDebugRooms || currentDebugRooms.length === 0) {
    return "<button id='explorviz-load-debug-room-list-button'>Load Debug Room List</button>";
  }*/
  temp += `<div id="table-wrapper">
    <table>
      <thead>
        <tr>
          <th>Alias</th>
          <th>Project Name</th>
          <th>Commit Id</th>`
          +
          //<th>No. of Breakpoints</th>
        `</tr>
      </thead>
      <tbody>
    `;


  if(currentDebugRoom) {
    temp += `
      <tr data-token-value="${currentDebugRoom.value}" class="current-room"><td>${currentDebugRoom.alias}</td><td>${currentDebugRoom.projectName}</td><td>${currentDebugRoom.commitId}</td>` + /*<td>TODO</td>*/`</tr>
      `;
  }

  if(currentDebugRooms && currentDebugRooms.length > 0){
    for (const room of currentDebugRooms) {
      if(room.alias === currentDebugRoom?.alias){
        continue;
      }
      temp += `<tr data-token-value="${room.value}" data-commit-id="${room.commitId}"><td>${room.alias}</td><td>${room.projectName}</td><td>${room.commitId}</td>` + /*<td>TODO</td>*/`</tr>`;
    }
  }
   temp += `
      </tbody>
    </table>
  </div>
  `;

  if(isConnectedToBackend) {
    return temp;
  }else {
    return "";
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
