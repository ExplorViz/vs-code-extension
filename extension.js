const vscode = require('vscode');
const { port, backend } = require('./extension_backend.js')
const io = require('socket.io-client');
const { ConsoleReporter } = require('@vscode/test-electron');
const { machine } = require('os');
const socket = io('http://localhost:' + port);

socket.on("ideDo", (data) => {
    console.log(data)
    vscode.commands.executeCommand('explorviz-support.IdeTestCallback');
})

// https://vscode.rocks/decorations/
const decorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'green',
    border: '2px solid white',
})

// Projekt settings zue Einrichtung nutzen, um extenesion an ein Projekt zu binden
// ExplirViz Burtton für ide setup
// FQN fullqualifiedname
// Monotoring Mock
/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    // vscode.editor.document.getText()
    // https://github.com/spring-projects/spring-petclinic
    // needs async
    let uri = vscode.Uri.file('C:/Lenny/Studium/spring-petclinic/src/main/java/org/springframework/samples/petclinic/owner/Pet.java');
    let success = await vscode.commands.executeCommand('vscode.openFolder', uri);

    console.log('Congratulations, your extension "explorviz-support" is now active!');

    /// Decorations
    vscode.workspace.onWillSaveTextDocument(event => {
        const openEditor = vscode.window.visibleTextEditors.filter(
            editor => editor.document.uri === event.document.uri
        )[0]
        decorate(openEditor)
    })

    ///// decorations end
    backend.listen(port, () => {
        console.log('Server started on port ' + port);
    });

    let disposable = vscode.commands.registerCommand('explorviz-support.helloWorld', function () {
        let editor = vscode.window.activeTextEditor;
        let selectedText = editor?.document.getText(editor.selection)
        vscode.window.showInformationMessage('Hello World from ExplorViz Support!' + selectedText);
    });
    context.subscriptions.push(disposable);

    let VizSingleClickOnMesh = vscode.commands.registerCommand('explorviz-support.VizSingleClickOnMesh', function () {
        socket.emit("vizDo", { action: "singleClickOnMesh" })
        vscode.window.showInformationMessage('VizSingleClickOnMesh');
    });
    context.subscriptions.push(VizSingleClickOnMesh);

    let VizDoubleClickOnMesh = vscode.commands.registerCommand('explorviz-support.VizDoubleClickOnMesh', function () {
        socket.emit("vizDo", { action: "doubleClickOnMesh" })
        vscode.window.showInformationMessage('VizDoubleClickOnMesh');
    });
    context.subscriptions.push(VizDoubleClickOnMesh);

    let IdeTestCallback = vscode.commands.registerCommand('explorviz-support.IdeTestCallback', function () {
        socket.emit("ideDO", { msg: "test" })
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
        vscode.ViewColumn.Two,
        {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(context.extensionPath)]
        }
    );
    webviewStartup.webview.html = getWebviewContent();



}

// https://vscode.rocks/decorations/
// editor: vscode.TextEditor
function decorate(editor) {
    let sourceCode = editor.document.getText()
    // class\s([\w\d]+)[\w\s]+(.+)|[\w\d\<>]+\s([\w]+)(\(\)|\([\w\s]+\))(.+)|(}{1}|{{1})
    // class\s([\w\d]+)[\w\s]+{

    
    // https://regex101.com/
    let regex = /(?<=class\s)[\w\d]+/
    let regexMethods = /[\w\d\<>]+\s([\w]+)(\(\)|\([\w\s]+\))\s{/
    let regexClassWithMethods = /(class\s)([\w\d]+)[\w\s]+(.+)|([\w\d\<>]+\s)([\w]+)(\(\)|\([\w\s]+\))\s/
    // let regex = /(class)/

    let decorationsArray = [] //: vscode.DecorationOptions[] = []

    const sourceCodeArr = sourceCode.split('\n')

    for (let line = 0; line < sourceCodeArr.length; line++) {
        let match = sourceCodeArr[line].match(regexClassWithMethods)
        if(match) {
            console.log(match)
        }
        // console.log(match ? match[1] : "isNull")
        if (match !== null && match.index !== undefined) {
            let matchLength = match[0].length;
            let matchIndex = match.index;
            // Case: Class
            if(match[1]) {
                matchLength = match[2].length
                matchIndex += match[1].length
            }
            // Case: Method
            else if( match[5]) {
                matchLength = match[5].length
                matchIndex += match[4].length
            }

            let range = new vscode.Range(
                new vscode.Position(line, matchIndex),
                new vscode.Position(line, matchIndex + matchLength)
            )

            let decoration = { range }

            decorationsArray.push(decoration)
        }
    }

    editor.setDecorations(decorationType, decorationsArray)
}
// This method is called when your extension is deactivated
function deactivate() { }

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
