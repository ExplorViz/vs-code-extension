import * as vscode from "vscode";
import {
  connectWithBackendSocket,
  currentMode,
  frontendHttp,
  handleIncomingVizEvent,
  //joinPairProgrammingRoom,
  //pairProgrammingSessionName,
  //setShowPairProgrammingHTML,
  setCrossOriginCommunication,
  socket,
} from "./extension";
import { IDEApiCall, ModesEnum } from "./types";

export class IFrameViewContainer {
  public static readonly viewType = "explorviz-iframe-view";

  private view: vscode.Webview;

  private extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri, webview: vscode.Webview) {
    this.extensionUri = extensionUri;
    this.view = webview;

    webview.options = {
      // Allow scripts in the webview
      enableScripts: true,

      localResourceRoots: [this.extensionUri],
    };

    this.refreshHTML();

    this.view.onDidReceiveMessage((data) => {
      vscode.commands.executeCommand(
        "setContext",
        "explorviz.showPairProgrammingCommand",
        true
      );
      setCrossOriginCommunication(true);
      //setShowPairProgrammingHTML(true);
      handleIncomingVizEvent(data);

      if (!socket || socket.disconnected) {
        connectWithBackendSocket();
      }
      //joinPairProgrammingRoom("experiment");
    });
  }

  /**
   * Post a message to the webview.
   * @param eventName Name of the event.
   * @param payload IDEApiCall
   */
  public postMessage(eventName: string, payload: IDEApiCall) {
    this.view.postMessage({
      event: eventName,
      data: payload,
      targetOrigin: frontendHttp,
    });
  }

  public refreshHTML() {
    if (this.view) {
      this.view.html = this._getHtmlForWebview(this.view);
    }
  }

  public getHtmlForWebview() {
    return this.view.html;
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "media",
        "cross-communication-webview.js"
      )
    );

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    var htmlCode = `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading styles from our extension directory,
					and only allow scripts that have a specific nonce.
					(See the 'webview-sample' extension sample for img-src content security policy examples)
				-->

				<meta http-equiv="Content-Security-Policy" 
          content="frame-src ${frontendHttp};
          style-src ${webview.cspSource};
          script-src 'nonce-${nonce}';"
        >
        
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            html, body {
                height: 100%;
                margin: 0;
                overflow: hidden;
            }
        </style>
        <title>Website Viewer</title>        
			</head>
			<body>    

      <iframe id="explorviz-iframe" src="${frontendHttp}" width="100%" height="1000px"></iframe>`;

    if (currentMode === ModesEnum.websocket) {
      htmlCode += `<div id="roomId">dummy</div>`;
    }

    htmlCode += `
			<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;

    return htmlCode;
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
