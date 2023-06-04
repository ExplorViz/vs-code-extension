import * as vscode from "vscode";
import {
  frontendHttp,
  pairProgrammingSessionName,
  showPairProgrammingHTML,
  socket,
} from "./extension";

export class IFrameViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "explorviz-iframe-view";

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

    this.refreshHTML();

    this._view.webview.onDidReceiveMessage((data) => {
      console.log("its beatiful");
      /*switch (data.type) {
        case "executeExplorVizCommand": {
          vscode.commands.executeCommand(data.command);
          break;
        }
      }*/
    });
  }

  public refreshHTML() {
    if (this._view) {
      this._view.show?.(true);
      this._view.webview.html = this._getHtmlForWebview(this._view.webview);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
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
