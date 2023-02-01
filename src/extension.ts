// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { port, backend } from './extension_backend';
import io from 'socket.io-client';
import path from 'path';
import { classMethod, IDEApiActions, IDEApiCall, IDEApiDest, OrderTuple, ParentOrder } from './types';
import { ConsoleReporter } from '@vscode/test-electron';
import * as fs from 'fs';

const socket = io('http://localhost:' + port);



// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
    const openEditor = vscode.window.visibleTextEditors[0]
    let provider = new ApiCallCodeLensProvider(buildClassMethodArr(vscode.window.visibleTextEditors[0], [], true));

    let codeLensDisposable = vscode.languages.registerCodeLensProvider('java', provider);
    context.subscriptions.push(codeLensDisposable);
    // let hoverDisposable = vscode.languages.registerHoverProvider('java', provider);

    socket.on("ideDo", (data: IDEApiCall) => {

        // console.log(data)
        let classMethodArr = buildClassMethodArr(vscode.window.visibleTextEditors[0], data.data, true);
        provider = new ApiCallCodeLensProvider(classMethodArr);
        // console.log("ideDo data received")
        // console.log(data.data[0])



        codeLensDisposable.dispose();
        // hoverDisposable.dispose();

        // buildClassMethodArr(vscode.window.visibleTextEditors[0])
        codeLensDisposable = vscode.languages.registerCodeLensProvider('java', provider);
        // hoverDisposable = vscode.languages.registerHoverProvider('java', provider);

        context.subscriptions.push(codeLensDisposable);
        // context.subscriptions.push(hoverDisposable);

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

                break;
            case IDEApiActions.SingleClickOnMesh:
                // goToLocationsByMeshId(data.meshId, data.data)
                break;
            default:
                break;
        }


    })




    socket.emit(IDEApiDest.VizDo, { action: "getVizData" })

    vscode.workspace.onDidSaveTextDocument(event => {
        socket.emit(IDEApiDest.VizDo, { action: "getVizData" })

    })

    vscode.workspace.onDidOpenTextDocument(event => {
        socket.emit(IDEApiDest.VizDo, { action: "getVizData" })

    })

    vscode.workspace.onDidChangeTextDocument(event => {
        socket.emit(IDEApiDest.VizDo, { action: "getVizData" })

    })

    vscode.window.onDidChangeActiveTextEditor(event => {
        socket.emit(IDEApiDest.VizDo, { action: "getVizData" })

    })

    console.log('Congratulations, your extension "explorviz-vscode-extension" is now active!');

    /// Decorations
    vscode.workspace.onWillSaveTextDocument(event => {
        const openEditor = vscode.window.visibleTextEditors.filter(
            editor => editor.document.uri === event.document.uri
        )[0]
        // decorate(openEditor)

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
        // console.log(arg1, arg2)
        // vscode.commands.executeCommand('revealLine', { lineNumber: 41, at: 'top' });
        // console.log()

        // vscode.window.activeTextEditor = vscode.window.visibleTextEditors[0];
        // vscode.commands.executeCommand('revealLine', { lineNumber: 10, at: 'center' });

        vscode.window.showInformationMessage('IdeTestCallback ' + arg1);
    });
    context.subscriptions.push(IdeTestCallback);



    let OpenInExplorViz = vscode.commands.registerCommand('explorviz-vscode-extension.OpenInExplorViz', function (name: string, fqn: string) {
        // console.log(name, fqn)
        socket.emit("vizDo", { action: "doubleClickOnMesh", fqn: fqn })
        vscode.window.showInformationMessage('Open ' + name + " in ExplorViz");
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
const decorationType = vscode.window.createTextEditorDecorationType({
    // backgroundColor: 'green',
    // border: '2px solid white',
    gutterIconPath: 'C:/Lenny/Studium/vs-code-extension/media/explorviz-logo-dark.png',
    gutterIconSize: 'contain',

})

// https://vscode.rocks/decorations/
// editor: vscode.TextEditor

function buildClassMethodArr(editor: vscode.TextEditor, vizData: OrderTuple[], decorate: boolean): classMethod[] {
    let classMethodArray: classMethod[] = []
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

    let vizDataFQNs: string[] = []
    if (vizData.length !== 0) {
        vizData.forEach(oTuple => {
            let foundationName = oTuple.meshes.meshNames[0]
            oTuple.meshes.meshNames.forEach(element => {
                vizDataFQNs.push(element.replace(foundationName + ".", ""))
            });

        });
        // console.log(vizDataFQNs)


    }


    for (let line = 0; line < sourceCodeArr.length; line++) {

        // Get Package name especially FQN
        // case Package
        if (sourceCodeArr[line].includes("package ")) {
            let fqn = sourceCodeArr[line].split(" ")[1].split(";")[0]
            let name = fqn.split(".")[fqn.split(".").length - 1]
            let lineString = sourceCodeArr[line].split(";")[0]

            classMethodArray.push({ lineString: lineString, name: name, fqn: fqn, lineNumber: line })

            // classMethodArray.push({line: sourceCodeArr[line].split(/\r?\n/g)[0], name: name, fqn: name})
            // let match = sourceCodeArr[line].match(regexClassWithMethods)

            let matchLength = name.length;
            let range = new vscode.Range(
                new vscode.Position(line, 0),
                new vscode.Position(line, 0 + matchLength)
            )
            let decoration = { range }
            decorationsArray.push(decoration)
            continue
        }
        // Case Imports
        else if (sourceCodeArr[line].includes("import ")) {
            let fqn = sourceCodeArr[line].split(" ")[1].split(";")[0]
            let name = fqn.split(".")[fqn.split(".").length - 1]
            let lineString = sourceCodeArr[line].split(";")[0]
            console.log(name)
            if (vizDataFQNs.includes(lineString.split(" ")[1])) {
                // console.log(name)

                classMethodArray.push({ lineString: lineString, name: name, fqn: fqn, lineNumber: line })
                let matchLength = name.length;
                let range = new vscode.Range(
                    new vscode.Position(line, 0),
                    new vscode.Position(line, 0 + matchLength)
                )
                let decoration = { range }
                decorationsArray.push(decoration)
            }
            continue

        }

        // let packageName = classMethodArray[0].fqn
        let match = sourceCodeArr[line].match(regexClassWithMethods)
        if (match) {
            // console.log(match)
        }
        // console.log(match ? match[1] : "isNull")
        if (match !== null && match.index !== undefined) {


            let matchLength = match[0].length;
            let matchIndex = match.index;

            let range = new vscode.Range(
                new vscode.Position(line, matchIndex),
                new vscode.Position(line, matchIndex + matchLength)
            )


            // Case: Class
            if (match[1]) {
                matchLength = match[2].length
                matchIndex += match[1].length
                let name = match[2];
                let fqn = classMethodArray[0].fqn + "." + name



                if (vizDataFQNs.includes(fqn)) {
                    // + - * / % = \w @
                    classMethodArray.push({ lineString: match[0], name: name, fqn: fqn, lineNumber: line })
                    classMethodArray.push({ lineString: " " + match[2] + "(", name: name, fqn: fqn, lineNumber: line })
                    classMethodArray.push({ lineString: "	" + match[2] + "(", name: name, fqn: fqn, lineNumber: line })
                    classMethodArray.push({ lineString: "+" + match[2] + "(", name: name, fqn: fqn, lineNumber: line })
                    classMethodArray.push({ lineString: "-" + match[2] + "(", name: name, fqn: fqn, lineNumber: line })
                    classMethodArray.push({ lineString: "*" + match[2] + "(", name: name, fqn: fqn, lineNumber: line })
                    classMethodArray.push({ lineString: "/" + match[2] + "(", name: name, fqn: fqn, lineNumber: line })
                    classMethodArray.push({ lineString: "%" + match[2] + "(", name: name, fqn: fqn, lineNumber: line })
                    classMethodArray.push({ lineString: "=" + match[2] + "(", name: name, fqn: fqn, lineNumber: line })
                    classMethodArray.push({ lineString: "@" + match[2] + "(", name: name, fqn: fqn, lineNumber: line })
                    let decoration = { range }
                    decorationsArray.push(decoration)

                }

            }
            // Case: Method
            else if (match[5]) {
                let name = match[5];
                let fqn = classMethodArray[0].fqn + "." + match[5]

                if (vizDataFQNs.includes(fqn)) {
                    matchLength = match[5].length
                    matchIndex += match[4].length
                    // add generic return type <T extends Object> T doSome() {}
                    classMethodArray.push({ lineString: name + "(", name: name, fqn: fqn, lineNumber: line })
                    let decoration = { range }
                    decorationsArray.push(decoration)

                }
            }


        }
    }
    console.log(classMethodArray[0].fqn)
    if (decorate) {
        editor.setDecorations(decorationType, decorationsArray)
    }

    return classMethodArray
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


class ApiCallCodeLensProvider implements vscode.CodeLensProvider, vscode.HoverProvider {
    classMethodArr: classMethod[];
    constructor(classMethodArr: classMethod[]) {
        this.classMethodArr = classMethodArr
    }
    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {


        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const lines = text.split(/\r?\n/g);


        console.log(this.classMethodArr)
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            this.classMethodArr.map(elem => {
                // if(line.includes("package")) {
                //     console.log(line)
                // }
                if (line.includes(elem.lineString)) {
                    const codeLens = new vscode.CodeLens(new vscode.Range(i, 0, i, 0), {
                        title: "Open " + elem.name + " in ExplorViz",
                        // title: "Open " + elem.name + " in ExplorViz",
                        command: "explorviz-vscode-extension.OpenInExplorViz",
                        arguments: [elem.name, elem.fqn],
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

function getFQNByMeshId(meshID: string, vizData: OrderTuple[]): string {
    let fqn = ""
    vizData.forEach(element => {
        let foundIndex = element.meshes.meshIds.indexOf(meshID)
        if (foundIndex != -1) {
            fqn = element.meshes.meshNames[foundIndex]
        }
    });

    return fqn

}

function goToLocationsByMeshId(meshId: string, vizData: OrderTuple[]) {


    // let location = getLocationNameHelper(meshId, vizData, false)
    let dir = ""
    if (vscode.workspace.workspaceFolders) {
        dir = vscode.workspace.workspaceFolders[0].uri.path
        dir = dir.substring(1)
    }

    const folderStructure = ['SpringBootAdminApplication.java'];
    let fqn = getFQNByMeshId(meshId, vizData)

    // const folderStructure1 = fqn.split(".");

    let projectBaseDir = ".src.main.java."
    fqn = fqn.replace(".", projectBaseDir)
    let fqnArr = fqn.split(".")
    fqnArr[0] = ""
    fqn = ""
    fqnArr.forEach((elem, i) => {
        if (i == fqnArr.length - 1) {
            fqn += elem
        }
        else {
            fqn += elem + "."
        }
    })
    fqn = fqn.replaceAll(".", "/")

    // const folderStructure2 = fqn.split(".");
    // const folderStructure3 = folderStructure2.concat([".java"])

    let javaFilePaths = searchForJavaFiles(dir, folderStructure);

    let finds: string[] = []
    fqn = fqn + ".java"
    javaFilePaths.forEach(javaFile => {
        if (javaFile.search(fqn) != -1) {
            finds.push(javaFile)
        }
        // else if(javaFile.search(fqn) != -1) {
        //     let temp = javaFile.split(fqn)
        //     finds.push(temp[0] + temp[1])
        //     return
        // }
    });
    // results = results.concat(searchForFolders(dir,folderStructure1))

    // console.log(folderStructure)
    // console.log(folderStructure2)


    console.log("dir: ", dir)
    console.log("fqn: ", fqn)
    // console.log(javaFilePaths)
    console.log(finds)



    // fs.stat(location, function (err, stat) {
    //     if (err) {
    //         console.log(`The folder "${location}" does not exist.`);
    //         // goToLocationsByMeshId(meshId, vizData)
    //         return;
    //     }

    //     if (stat.isDirectory()) {
    //         console.log(`The folder "${location}" exists.`);
    //         return;
    //     }
    //     else {
    //         console.log(`The path "${location}" is not a folder.`);
    //         // goToLocationsByMeshId(meshId, vizData)

    //     }
    // });

    vscode.commands.executeCommand('editor.action.goToLocations',
        vscode.Uri.file(finds[0]),
        new vscode.Position(20, 0),
        [new vscode.Position(20, 0)],
        'goto',
        'sheesh'
    );

}

function searchForJavaFiles(dir: string, folderStructure: string[]): string[] {
    const results: string[] = [];
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stats = fs.lstatSync(filePath);
        if (stats.isDirectory()) {
            // if (file === folderStructure[0] || file.search(folderStructure[0]) !== -1) {
            //     const subdir = path.join(dir, file);
            //     results.push(...searchForFolders(subdir, folderStructure.slice(1)));
            // } else {
            results.push(...searchForJavaFiles(filePath, folderStructure));
            // }
        }
        else if (stats.isFile()) {
            if (file.search('.java') != -1) {
                let temp = path.join(dir, file)
                temp = temp.replaceAll("\\", "/")
                results.push(temp)
            }
            // else {

            //     results.push(...searchForFolders(filePath, folderStructure));
            // }
        }
    });

    // if (folderStructure.length === 0) {
    //     results.push(dir);
    // }

    return results;
}
