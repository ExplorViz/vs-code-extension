// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { port, backend } from './extension_backend';
import io from 'socket.io-client';

import { FoundationOccurrences, IDEApiActions, IDEApiCall, IDEApiDest, OrderTuple, ParentOrder } from './types';
import { ExplorVizApiCodeLens } from './ExplorVizApiCodeLens';
import { buildClassMethodArr } from './buildClassMethod';
import { goToLocationsByMeshId } from './goToLocationByMeshId';

const backendHttp = 'http://localhost:' + port
const socket = io(backendHttp);

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
    const openEditor = vscode.window.visibleTextEditors[0]
    let provider = new ExplorVizApiCodeLens(buildClassMethodArr(vscode.window.visibleTextEditors[0], [], true), []);

    let codeLensDisposable = vscode.languages.registerCodeLensProvider('java', provider);
    context.subscriptions.push(codeLensDisposable);
    // let hoverDisposable = vscode.languages.registerHoverProvider('java', provider);

    socket.on(IDEApiDest.IDEDo, (data: IDEApiCall) => {


        switch (data.action) {
            case IDEApiActions.JumpToLocation:
                console.log('GoTo Mesh: ' + data.meshId);
                goToLocationsByMeshId(data.meshId, data.data)

                break;
            case IDEApiActions.ClickTimeline:
                vscode.commands.executeCommand('explorviz-vscode-extension.IdeTestCallback');
                break;
            case IDEApiActions.DoubleClickOnMesh:

                break;
            case IDEApiActions.GetVizData:
                let classMethodArr = buildClassMethodArr(vscode.window.visibleTextEditors[0], data.data, true);
                console.log("GetVizData: ", data.data)
                provider = new ExplorVizApiCodeLens(classMethodArr, data.data);
                // console.log("ideDo data received")
                // console.log(data.data[0])

                codeLensDisposable.dispose();
                // hoverDisposable.dispose();

                // buildClassMethodArr(vscode.window.visibleTextEditors[0])
                codeLensDisposable = vscode.languages.registerCodeLensProvider('java', provider);
                // hoverDisposable = vscode.languages.registerHoverProvider('java', provider);

                context.subscriptions.push(codeLensDisposable);
                // context.subscriptions.push(hoverDisposable);

                // console.log("IDEApiActions.GetVizData")
                break;
            case IDEApiActions.SingleClickOnMesh:
                // goToLocationsByMeshId(data.meshId, data.data)
                break;
            default:
                break;
        }


    })

    // emitToBackend(IDEApiDest.VizDo, {
    //     action: IDEApiActions.GetVizData,
    //     data: [],
    //     meshId: "",
    //     occurrenceID: -1,
    //     fqn: ""
    // })

    vscode.workspace.onDidSaveTextDocument(event => {
        // emitToBackend(IDEApiDest.VizDo, { action: "getVizData" })
        emitToBackend(IDEApiDest.VizDo, {
            action: IDEApiActions.GetVizData,
            data: [],
            meshId: "",
            occurrenceID: -1,
            fqn: ""
        })

    })

    vscode.workspace.onDidOpenTextDocument(event => {
        // emitToBackend(IDEApiDest.VizDo, { action: "getVizData" })
        // emitToBackend(IDEApiDest.VizDo, {
        //     action: IDEApiActions.GetVizData,
        //     data: [],
        //     meshId: "",
        //     occurrenceID: -1,
        //     fqn: ""
        // })

    })

    vscode.workspace.onDidChangeTextDocument(event => {
        // emitToBackend(IDEApiDest.VizDo, { action: "getVizData" })

    })

    // vscode.window.onDidChangeActiveTextEditor(event => {
    //     // emitToBackend(IDEApiDest.VizDo, { action: "getVizData" })
    //     emitToBackend(IDEApiDest.VizDo, {
    //         action: IDEApiActions.GetVizData,
    //         data: [],
    //         meshId: "",
    //         occurrenceID: -1,
    //         fqn: ""
    //     })

    // })

    console.log('Congratulations, your extension "explorviz-vscode-extension" is now active!');

    backend.listen(port, () => {
        console.log('Server started on port ' + port);
    });

    let disposable = vscode.commands.registerCommand('explorviz-vscode-extension.helloWorld', function () {
        let editor = vscode.window.activeTextEditor;
        let selectedText = editor?.document.getText(editor.selection)

        let dir = ""
        if (vscode.workspace.workspaceFolders) {
            dir = vscode.workspace.workspaceFolders[0].uri.path
            dir = dir.substring(1)
        }
        vscode.window.showInformationMessage('Hello World from ExplorViz Support!' + selectedText);
    });
    context.subscriptions.push(disposable);

    let VizSingleClickOnMesh = vscode.commands.registerCommand('explorviz-vscode-extension.VizSingleClickOnMesh', function () {
        // emitToBackend("vizDo", { action: "singleClickOnMesh" })
        vscode.window.showInformationMessage('VizSingleClickOnMesh');
    });
    context.subscriptions.push(VizSingleClickOnMesh);

    let VizDoubleClickOnMesh = vscode.commands.registerCommand('explorviz-vscode-extension.VizDoubleClickOnMesh', function () {
        // emitToBackend(IDEApiDest.VizDo, { action: "doubleClickOnMesh" })
        vscode.window.showInformationMessage('VizDoubleClickOnMesh');
    });
    context.subscriptions.push(VizDoubleClickOnMesh);

    let IdeTestCallback = vscode.commands.registerCommand('explorviz-vscode-extension.IdeTestCallback', function (arg1: any, arg2: any) {

        vscode.window.showInformationMessage('IdeTestCallback ' + arg1);
    });
    context.subscriptions.push(IdeTestCallback);

    let OpenInExplorViz = vscode.commands.registerCommand('explorviz-vscode-extension.OpenInExplorViz', function (name: string, fqn: string, vizData: OrderTuple[]) {
        let occurrences: FoundationOccurrences[] = getOccurrenceIDsFromVizData(vizData)
        console.log(vizData)
        console.log(occurrences)

        let vizFoundation = "foundation unset"
        let selection;
        vizData.forEach(viz => {
            vizFoundation = viz.hierarchyModel.fqn
        });

        occurrences.forEach(async occ => {
            if (vizFoundation.includes(occ.foundation) && occ.occurrences.length != 0) {
                console.log("Found")
                selection = await selectOption(occ.occurrences.map(String), "Open occurrence of " + occ.foundation, false)
                if (selection) {
                    emitToBackend(IDEApiDest.VizDo, { action: IDEApiActions.DoubleClickOnMesh, fqn: fqn, data: [], meshId: "", occurrenceID: parseInt(selection) })
                    vscode.window.showInformationMessage('Open ' + name + " in ExplorViz");
                }
            }
            else {
                emitToBackend(IDEApiDest.VizDo, { action: IDEApiActions.DoubleClickOnMesh, fqn: fqn, data: [], meshId: "", occurrenceID: -1 })
                vscode.window.showInformationMessage('Open ' + name + " in ExplorViz");
            }
        });



    });
    context.subscriptions.push(OpenInExplorViz);

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
export function deactivate() { }

let iconUri = vscode.Uri.file('https://as1.ftcdn.net/v2/jpg/03/87/72/16/1000_F_387721677_jktomouPue2J6vPQKSFKWJdO0MvsmoBL.jpg');
export const decorationType = vscode.window.createTextEditorDecorationType({
    // backgroundColor: 'green',
    // border: '2px solid white',
    gutterIconPath: 'C:/Lenny/Studium/vs-code-extension/media/explorviz-logo-dark.png',
    gutterIconSize: 'contain',
    isWholeLine: true

})

// https://vscode.rocks/decorations/
// editor: vscode.TextEditor


function emitToBackend(dest: IDEApiDest, apiCall: IDEApiCall) {
    socket.emit(dest, apiCall)
}

function getWebviewContent() {
    let websiteUrl = 'http://localhost:4200/visualization';
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


function cutSameStrings(arr: string[]): string[] {
    let trimmedArr: string[] = []
    let test = arr.map(e => e.split("\\"))

    test.forEach(path => {
        let trimmedPath = ""
        path.forEach((subPath, i) => {
            // console.log(i, subPath, path.length)
            if ((path.length - 1 == i) || (path.length - 2 == i)) {
                trimmedPath += "/" + subPath
            }
            else {
                test.forEach((pathTotest) => {
                    if (pathTotest.includes(subPath)) {
                        // trimmedPath += "./"
                    }
                    else if (!trimmedPath.includes(subPath)) {
                        trimmedPath += ".../" + subPath + "/..."
                    }
                });
            }
        });

        trimmedArr.push(trimmedPath)
    });

    trimmedArr.forEach(element => {
        console.log("trimmed:", element)

    });
    return trimmedArr
}


export async function selectOption(options: string[], placeHolder: string, cutStrings: boolean): Promise<string | undefined> {
    let readableJavaFilesPaths = cutStrings ? cutSameStrings(options) : options
    const selectedOption = await vscode.window.showQuickPick(readableJavaFilesPaths, { placeHolder: placeHolder });
    return options[readableJavaFilesPaths.indexOf(selectedOption + "")];
}

function getOccurrenceIDsFromVizData(vizData: OrderTuple[]): FoundationOccurrences[] {

    // [
    //  {fqn: "asd.fgh.asd.", occurences: [1, 2, 3...]},
    //  {fqn: "asd.fgh.asd.asd", occurences: [1, 2, 3...]},
    // ...]
    // let result: FoundationOccurrences[] = [{ foundation: "petclinic-demo", occurrences: [1,2,3] }];
    // let result: FoundationOccurrences[] = [{ foundation: "petclinic-api-gateway", occurrences: [] }];

    let result: FoundationOccurrences[] = []
    vizData.forEach(foundation => {
        let temp: FoundationOccurrences = {
            foundation: foundation.meshes.meshNames[0].split(".")[0],
            occurrences: []
        }

        foundation.meshes.meshNames.forEach(f => {


            let possibleOccurrenceCounter = parseInt(f.split(".")[1])
            if (!isNaN(possibleOccurrenceCounter)) {
                if (!temp.occurrences.includes(possibleOccurrenceCounter)) {
                    temp.occurrences.push(possibleOccurrenceCounter);
                }
            }
        });

        // console.log(temp)
        result.push(temp)
    });

    return result
}

