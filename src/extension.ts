// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "explorviz-extension" is now active!'
  );

  let highlightCommand = vscode.commands.registerCommand(
    "explorviz-extension.highlightClass",
    () => {
      vscode.window.showInformationMessage("Test Alex");
    }
  );

  const fullWebServerUri = `http://samoa.se.informatik.uni-kiel.de:8090`;

  let setupCommand = vscode.commands.registerCommand(
    "explorviz-extension.setup",
    () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      //vscode.window.showInformationMessage(new Date().toLocaleString());
      const panel = vscode.window.createWebviewPanel(
        "catCoding", // Identifies the type of the webview. Used internally
        "ExplorViz", // Title of the panel displayed to the user
        vscode.ViewColumn.One, // Editor column to show the new webview panel in.
        { enableScripts: true }
      );
      // And set its HTML content

      const cspSource = panel.webview.cspSource;

      panel.webview.html = `<!DOCTYPE html>
      <html lang="en">
      <style>
        html, body {
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;      
          overflow-y: hidden;  
        }
      </style>
      <head>
          <meta
            http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${fullWebServerUri} ${cspSource} http:;
            img-src ${cspSource} http:;
            script-src ${cspSource};
            style-src ${cspSource};"
          />          
          <meta charset="UTF-8">
          <meta name="viewport">
          <title>ExplorViz</title>
      </head>
      <body>
      <iframe src="${fullWebServerUri}" width="100%" height="100%" title="ExplorViz"> />
      </body>
      </html>`;
    }
  );

  context.subscriptions.push(setupCommand, highlightCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
