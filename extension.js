const vscode = require('vscode');
const {port, backend} = require('./extension_backend.js')
const io = require('socket.io-client');
const socket = io('http://localhost:' + port);

socket.on("ideDo", (data) => {
    console.log(data)
    vscode.commands.executeCommand('explorviz-support.IdeTestCallback');
})

// Projekt settings zue Einrichtung nutzen, um extenesion an ein Projekt zu binden
// ExplirViz Burtton für ide setup
// FQN fullqualifiedname
// Monotoring Mock
/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	console.log('Congratulations, your extension "explorviz-support" is now active!');
    
    backend.listen(port, () => {
        console.log('Server started on port ' + port);
      });

	let disposable = vscode.commands.registerCommand('explorviz-support.helloWorld', function () {
		vscode.window.showInformationMessage('Hello World from ExplorViz Support!');
	});
    context.subscriptions.push(disposable);

    let VizSingleClickOnMesh = vscode.commands.registerCommand('explorviz-support.VizSingleClickOnMesh', function () {
        socket.emit("vizDo", {action: "singleClickOnMesh"})
		vscode.window.showInformationMessage('VizSingleClickOnMesh');
	});
    context.subscriptions.push(VizSingleClickOnMesh);

    let VizDoubleClickOnMesh = vscode.commands.registerCommand('explorviz-support.VizDoubleClickOnMesh', function () {
        socket.emit("vizDo", {action: "doubleClickOnMesh"})
		vscode.window.showInformationMessage('VizDoubleClickOnMesh');
	});
    context.subscriptions.push(VizDoubleClickOnMesh);

    let IdeTestCallback = vscode.commands.registerCommand('explorviz-support.IdeTestCallback', function () {
        socket.emit("ideDO", {msg: "test"})
		vscode.window.showInformationMessage('IdeTestCallback');
	});
    context.subscriptions.push(IdeTestCallback);

	let webview = vscode.commands.registerCommand('explorviz-support.webview', function () {	
		vscode.window.showInformationMessage('Webview from ExplorViz Support!');
		let panel = vscode.window.createWebviewPanel(
            'websiteViewer', // Identifies the type of the webview. Used internally
            'ExplorViz', // Title of the panel displayed to the user
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(context.extensionPath)]
            }
        );
        panel.webview.html = getWebviewContent();
	});
	context.subscriptions.push(webview);

    let webviewStartup = vscode.window.createWebviewPanel(
        'websiteViewer', // Identifies the type of the webview. Used internally
        'ExplorViz', // Title of the panel displayed to the user
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(context.extensionPath)]
        }
    );
    webviewStartup.webview.html = getWebviewContent();
}

// This method is called when your extension is deactivated
function deactivate() {}

function getWebviewContent() {
    let websiteUrl = 'http://localhost:4200';
	return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
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
        <iframe src="${websiteUrl}" width="100%" height="100%"></iframe>
    </body>
    </html>`;
}
module.exports = {
	activate,
	deactivate
}
