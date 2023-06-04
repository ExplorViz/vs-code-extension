import * as vscode from "vscode";
import {
  frontendHttp,
  handleIncomingVizEvent,
  pairProgrammingSessionName,
  showPairProgrammingHTML,
  socket,
} from "./extension";

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
      console.log("its beatiful");
      handleIncomingVizEvent(data);
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

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading styles from our extension directory,
					and only allow scripts that have a specific nonce.
					(See the 'webview-sample' extension sample for img-src content security policy examples)
				-->

				<meta http-equiv="Content-Security-Policy" 
          content="frame-src http://localhost:4200;
          default-src *;
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

      <iframe src="${frontendHttp}" width="100%" height="1000px"></iframe>

			<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
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
