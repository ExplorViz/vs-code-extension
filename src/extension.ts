// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { port, backend } from './extension_backend';
import io from 'socket.io-client';
import path from 'path';

const socket = io('http://localhost:' + port);

socket.on("ideDo", (data) => {
    console.log(data)
    vscode.commands.executeCommand('explorviz-vscode-extension.IdeTestCallback');
})
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
    
    const openEditor = vscode.window.visibleTextEditors[0]
    decorate(openEditor)

    const provider = new ApiCallCodeLensProvider();
    context.subscriptions.push(vscode.languages.registerCodeLensProvider('java', provider));
    context.subscriptions.push(vscode.languages.registerHoverProvider('java', provider));
   
	// vscode.languages.registerHoverProvider('java', {
    //     provideHover(document, position) {
    //         // Get the word at the current position
    //         const word = document.getText(document.getWordRangeAtPosition(position));
    
    //         // Check if the word is a custom decorator
    //         if (word === 'public') {
    //             return new vscode.Hover('This is a custom decorator');
    //         }
    //     }
    // });
    // vscode.editor.document.getText()
    // https://github.com/spring-projects/spring-petclinic
    // needs async
    let uri = vscode.Uri.file('C:/Lenny/Studium/spring-petclinic/src/main/java/org/springframework/samples/petclinic/owner/Pet.java');
    let success = await vscode.commands.executeCommand('vscode.openFolder', uri);

    console.log('Congratulations, your extension "explorviz-vscode-extension" is now active!');

    /// Decorations
    vscode.workspace.onWillSaveTextDocument(event => {
        const openEditor = vscode.window.visibleTextEditors.filter(
            editor => editor.document.uri === event.document.uri
        )[0]
        decorate(openEditor)
        // context.
        // provider.provideCodeLenses(openEditor.document, new vscode.CancellationTokenSource().token)
        // provider.provideHover(openEditor.document, )
    })

    ///// decorations end
    backend.listen(port, () => {
        console.log('Server started on port ' + port);
    });

    let disposable = vscode.commands.registerCommand('explorviz-vscode-extension.helloWorld', function () {
        let editor = vscode.window.activeTextEditor;
        let selectedText = editor?.document.getText(editor.selection)
        vscode.window.showInformationMessage('Hello World from ExplorViz Support!' + selectedText);
    });
    context.subscriptions.push(disposable);

    let VizSingleClickOnMesh = vscode.commands.registerCommand('explorviz-vscode-extension.VizSingleClickOnMesh', function () {
        socket.emit("vizDo", { action: "singleClickOnMesh" })
        vscode.window.showInformationMessage('VizSingleClickOnMesh');
    });
    context.subscriptions.push(VizSingleClickOnMesh);

    let VizDoubleClickOnMesh = vscode.commands.registerCommand('explorviz-vscode-extension.VizDoubleClickOnMesh', function () {
        socket.emit("vizDo", { action: "doubleClickOnMesh" })
        vscode.window.showInformationMessage('VizDoubleClickOnMesh');
    });
    context.subscriptions.push(VizDoubleClickOnMesh);

    let IdeTestCallback = vscode.commands.registerCommand('explorviz-vscode-extension.IdeTestCallback', function (arg1: any, arg2: any) {
        socket.emit("ideDO", { msg: "test" })
        console.log(arg1, arg2)
        vscode.window.showInformationMessage('IdeTestCallback ' + arg1);
    });
    context.subscriptions.push(IdeTestCallback);

    let webview = vscode.commands.registerCommand('explorviz-vscode-extension.webview', function () {
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

// This method is called when your extension is deactivated
export function deactivate() {}

let iconUri = vscode.Uri.file('https://as1.ftcdn.net/v2/jpg/03/87/72/16/1000_F_387721677_jktomouPue2J6vPQKSFKWJdO0MvsmoBL.jpg');
const decorationType = vscode.window.createTextEditorDecorationType({
    // backgroundColor: 'green',
    border: '2px solid white',
    // gutterIconPath: 'C:/Lenny/Studium/vs-code-extension/media/explorviz-logo-dark.png',
    // gutterIconSize: 'contain',
    
})

// https://vscode.rocks/decorations/
// editor: vscode.TextEditor
let classMethodArray: string[] = []

function decorate(editor: vscode.TextEditor) {
    let sourceCode = editor.document.getText()
    // class\s([\w\d]+)[\w\s]+(.+)|[\w\d\<>]+\s([\w]+)(\(\)|\([\w\s]+\))(.+)|(}{1}|{{1})
    // class\s([\w\d]+)[\w\s]+{

    
    // https://regex101.com/
    let regex = /(?<=class\s)[\w\d]+/
    let regexMethods = /[\w\d\<>]+\s([\w]+)(\(\)|\([\w\s]+\))\s{/
    let regexClassWithMethods = /(class\s)([\w\d]+)[\w\s]+(.+)|([\w\d\<>]+\s)([\w]+)(\(\)|\([\w\s]+\))\s/
    // let regex = /(class)/

    let decorationsArray = [] //: vscode.DecorationOptions[] = []
    classMethodArray = [];

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
                classMethodArray.push(match[2])
            }
            // Case: Method
            else if( match[5]) {
                matchLength = match[5].length
                matchIndex += match[4].length
                classMethodArray.push(match[5])
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


class ApiCallCodeLensProvider implements vscode.CodeLensProvider, vscode.HoverProvider {
    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const lines = text.split(/\r?\n/g);

        console.log(classMethodArray)
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            classMethodArray.map(elem => {
                if(line.includes("" + elem + "")) {
                    const codeLens = new vscode.CodeLens(new vscode.Range(i, 0, i, 0), {
                        title: "Open " + elem + " in ExplorViz",
                        command: "explorviz-vscode-extension.IdeTestCallback",
                        arguments: [elem, "und ein Zweiter"],
                        // tooltip: "Moin"
                    });
                    codeLenses.push(codeLens);
                }
            })
            // if (line.includes("public")) {
            //     const codeLens = new vscode.CodeLens(new vscode.Range(i, 0, i, 0), {
            //         title: "Public keyword found here",
            //         command: "explorviz-vscode-extension.IdeTestCallback",
            //         arguments: ["Das ist ein Argument in einem Array", "und ein Zweiter"],
            //         tooltip: "Moin"
            //     });
            //     codeLenses.push(codeLens);
            // }
        }
        return codeLenses;
    }
    public provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.Hover | undefined {
        const range = document.getWordRangeAtPosition(position);
        const word = document.getText(range);
        if (word === "public") {
            return new vscode.Hover("This keyword is used to specify that a member or a class is accessible from outside the class or the package.");
        }
    }
}


