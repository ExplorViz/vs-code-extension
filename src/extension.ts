// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { port, backend } from './extension_backend';
import io from 'socket.io-client';
import path from 'path';
import { classMethod, IDEApiActions, IDEApiCall, IDEApiDest, OrderTuple, ParentOrder } from './types';
import { ConsoleReporter } from '@vscode/test-electron';
import * as fs from 'fs';
import { promisify } from 'util';

const backendHttp = 'http://localhost:' + port
const socket = io(backendHttp);

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {



    const openEditor = vscode.window.visibleTextEditors[0]
    let provider = new ApiCallCodeLensProvider(buildClassMethodArr(vscode.window.visibleTextEditors[0], [], true), []);

    let codeLensDisposable = vscode.languages.registerCodeLensProvider('java', provider);
    context.subscriptions.push(codeLensDisposable);
    // let hoverDisposable = vscode.languages.registerHoverProvider('java', provider);

    socket.on(IDEApiDest.IDEDo, (data: IDEApiCall) => {

        // console.log(" socket.on(IDEApiDest.IDEDo, (data: IDEApiCall)")
        // console.log(data)

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
                provider = new ApiCallCodeLensProvider(classMethodArr, data.data);
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

    emitToBackend(IDEApiDest.VizDo, {
        action: IDEApiActions.GetVizData,
        data: [],
        meshId: "",
        occurrenceID: -1,
        fqn: ""
    })

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
        emitToBackend(IDEApiDest.VizDo, {
            action: IDEApiActions.GetVizData,
            data: [],
            meshId: "",
            occurrenceID: -1,
            fqn: ""
        })

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

    /// Decorations
    // vscode.workspace.onWillSaveTextDocument(event => {
    //     const openEditor = vscode.window.visibleTextEditors.filter(
    //         editor => editor.document.uri === event.document.uri
    //     )[0]
    //     // decorate(openEditor)

    //     // context.
    //     // provider.provideCodeLenses(openEditor.document, new vscode.CancellationTokenSource().token)
    //     // provider.provideHover(openEditor.document, )
    // })

    ///// decorations end
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
        // createAndDeleteFile("C:\\Lenny\\Studium\\spring-petclinic\\src\\main\\java\\org\\springframework\\samples\\petclinic\\owner");

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
        // emitToBackend("ideDO", { msg: "test" })
        // console.log(arg1, arg2)
        // vscode.commands.executeCommand('revealLine', { lineNumber: 41, at: 'top' });
        // console.log()

        // vscode.window.activeTextEditor = vscode.window.visibleTextEditors[0];
        // vscode.commands.executeCommand('revealLine', { lineNumber: 10, at: 'center' });

        vscode.window.showInformationMessage('IdeTestCallback ' + arg1);
    });
    context.subscriptions.push(IdeTestCallback);



    let OpenInExplorViz = vscode.commands.registerCommand('explorviz-vscode-extension.OpenInExplorViz', function (name: string, fqn: string, vizData: OrderTuple[]) {
        // console.log(name, fqn)
        // let occurrenceIDs: number[] = getOccurrenceIDsFromVizData(fqn)

        let occurrenceID = -1

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
const decorationType = vscode.window.createTextEditorDecorationType({
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
    else {
        console.error("VizData Empty!")
        return []
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
            // console.log(name)
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
        // if (match) {
        //     // console.log(match)
        // }
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


                // console.log(fqn)
                // console.log(name)
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

                // let name = match[5];
                // let fqn = classMethodArray[0].fqn + "." + match[5]

                // if (vizDataFQNs.includes(fqn)) {
                //     matchLength = match[5].length
                //     matchIndex += match[4].length
                //     // add generic return type <T extends Object> T doSome() {}
                //     classMethodArray.push({ lineString: name + "(", name: name, fqn: fqn, lineNumber: line })
                //     let decoration = { range }
                //     decorationsArray.push(decoration)

                // }
            }


        }
    }
    // console.log(classMethodArray[0].fqn)
    if (decorate) {
        editor.setDecorations(decorationType, decorationsArray)
    }

    console.log(classMethodArray)
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
    vizData: OrderTuple[];
    constructor(classMethodArr: classMethod[], vizData: OrderTuple[]) {
        console.log("vizDatA:", classMethodArr)
        this.classMethodArr = classMethodArr
        this.vizData = vizData
    }
    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {


        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const lines = text.split(/\r?\n/g);


        // console.log(this.classMethodArr)
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            this.classMethodArr.map(elem => {
                // if(line.includes("package")) {
                //     console.log(line)
                // }
                if (line.includes(elem.lineString)) {
                    // let occurence = this.foundationOccurrences.find(occ => {
                    //     occ.foundation == elem.fqn.split(".")[0]
                    // })

                    const codeLens = new vscode.CodeLens(new vscode.Range(i, 0, i, 0), {
                        title: "Open " + elem.name + " in ExplorViz",
                        // title: "Open " + elem.name + " in ExplorViz",
                        command: "explorviz-vscode-extension.OpenInExplorViz",
                        arguments: [elem.name, elem.fqn, this.vizData],
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

type LocationFind = {
    javaFiles: string[],
    dirs: string[],
    javaFile: string[]
}
async function goToLocationsByMeshId(meshId: string, vizData: OrderTuple[]) {

    let finds: LocationFind = {
        dirs: [],
        javaFiles: [],
        javaFile: []
    };

    // let location = getLocationNameHelper(meshId, vizData, false)
    let fqn = getFQNByMeshId(meshId, vizData)
    if (vscode.workspace.workspaceFolders) {
        vscode.workspace.workspaceFolders.forEach(async element => {
            let dir = element.uri.path
            dir = dir.substring(1)

            let tempFind
            tempFind = getFindsByWorkDir(fqn, dir);
            // console.log("tempFind", tempFind)
            finds.dirs = finds.dirs.concat(tempFind.dirs)
            if (tempFind.javaFile[0] != "undefined") {
                finds.javaFile = finds.javaFile.concat(tempFind.javaFile)
            }
            finds.javaFiles = finds.javaFiles.concat(tempFind.javaFiles)


        });
        // dir = vscode.workspace.workspaceFolders[0].uri.path
        // dir = dir.substring(1)

    }

    console.log("finds", finds)

    if (finds.javaFile.length > 0) {
        if (finds.javaFile.length == 1) {
            console.log("Open java File: ", finds.javaFile)
            openFileCommand(finds.javaFile[0], fqn, vizData)
        }
        else {
            let selected = await selectOption(finds.javaFile, "Select file ", true)
            if (selected) {
                openFileCommand(selected, fqn, vizData)
                vscode.window.showInformationMessage(`Selected option: ${selected}`);
            }
        }

    }
    else if (finds.javaFiles.length != 0) {
        // Show selection which file to open
        console.log(finds.javaFiles)

        let selected = await selectOption(finds.javaFiles, "Select file ", true)
        if (selected) {
            openFileCommand(selected, fqn, vizData)
            vscode.window.showInformationMessage(`Selected option: ${selected}`);
        }
    }
    else {
        console.error("Nothing to open!", finds)
        vscode.window.showInformationMessage("Nothing to open!")
        return
    }

}

function getFindsByWorkDir(fqn: string, workDir: string): LocationFind {
    let finds: LocationFind = {
        dirs: [],
        javaFiles: [],
        javaFile: []
    };

    let dir = workDir;



    let packageBaseDir = "\\src\\main\\java"
    let fqnArr = fqn.split(".")
    let foundationName = fqnArr[0]
    let possibleInstanceCounter: number = Number(fqnArr[1])


    let fqnAsPath = foundationName
    if (isNaN(possibleInstanceCounter)) {
        possibleInstanceCounter = -1;

    }
    else {
        fqnAsPath += possibleInstanceCounter
    }


    // let absoluteDirPath = dir + packageBaseDir + fqn

    dir = dir.replaceAll("/", "\\")
    let filesInWorkDir = searchjavaFilesAndDirs(dir)

    let isFoundation = false;

    foundationName = foundationName.replace("costumer", "customers")
    fqn = fqn.replace("costumer", "customers")
    let fqnWithoutFoundationPath = fqn.replace(foundationName + ".", "")
    fqnWithoutFoundationPath = fqnWithoutFoundationPath.replace(possibleInstanceCounter + ".", "")
    fqnWithoutFoundationPath = fqnWithoutFoundationPath.replaceAll(".", "\\")

    filesInWorkDir.dirs.forEach(element => {
        // is Foundation
        if (element.includes(foundationName)) {

            console.log("foundationDir: ", element, fqn)
            isFoundation = true

            fqnWithoutFoundationPath = element + packageBaseDir + "\\" + fqnWithoutFoundationPath
            console.log(fqnWithoutFoundationPath)

            let filesInFixedFqnPath = searchjavaFilesAndDirs(fqnWithoutFoundationPath)
            finds = filesInFixedFqnPath

        }
    });

    // packageBaseDir and no foundation folder        
    if (!isFoundation) {
        let filesInPackageBaseDir = searchjavaFilesAndDirs(dir + packageBaseDir + "\\" + fqnWithoutFoundationPath)
        console.log(fqn, fqnWithoutFoundationPath)

        finds = filesInPackageBaseDir
    }

    // console.log("Java files found:", finds.javaFiles.length) // ,filesInFixedFqnPath.javaFiles)
    // console.log("Folders found:", finds.dirs.length) //, filesInFixedFqnPath.dirs)
    // console.log("Single Java file found:", finds.javaFile)
    return finds
}

function cutSameStrings2(arr: string[]): string[] {
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


async function selectOption(options: string[], placeHolder: string, cutStrings: boolean): Promise<string | undefined> {
    let readableJavaFilesPaths = cutStrings ? cutSameStrings2(options) : options
    const selectedOption = await vscode.window.showQuickPick(readableJavaFilesPaths, { placeHolder: placeHolder });
    return options[readableJavaFilesPaths.indexOf(selectedOption + "")];
}

// async function selectOption(options: string[]) {
//     // let options = ["Option 1", "Option 2", "Option 3"];
//     let selectedOption = await vscode.window.showQuickPick(options);

//     if (selectedOption) {
//         vscode.window.showInformationMessage(`Selected option: ${selectedOption}`);
//         // return selectedOption
//     }
// }



function openFileCommand(pathToLocation: string, fqn: string, vizData: OrderTuple[]) {
    vscode.commands.executeCommand('workbench.action.focusNextGroup')
        .then(() => {

            console.log('First command finished executing.');
            // console.log(finds)
            let stats = fs.lstatSync(path.join(pathToLocation, ""));

            // console.log(pathToLocation)
            // console.log(pathToLocation.split(".")[0])

            if (!stats) {
                pathToLocation = pathToLocation.split(".")[0]
                stats = fs.lstatSync(path.join(pathToLocation, ""));
            }
            if (stats.isDirectory()) {
                // select file to open
                // find javaFiles

                console.error("is Dir:")

            }
            else if (stats.isFile()) {
                console.error("is File")
            }
            return vscode.commands.executeCommand('editor.action.goToLocations',
                vscode.Uri.file(pathToLocation),
                new vscode.Position(0, 0),
                [new vscode.Position(0, 0)],
                'goto',
                'No File Found to go to'
            )
        })
        .then(() => {

            let classMethod = buildClassMethodArr(vscode.window.visibleTextEditors[0], vizData, true);
            let lineNUmber = -1;
            if (classMethod) {
                classMethod.forEach(element => {
                    // console.log(element.fqn)
                    // console.log(fqn)
                    if (fqn.search(element.fqn) != -1) {
                        lineNUmber = element.lineNumber
                    }
                });
                // org.springframework.samples.petclinic.customers.web.PetRequest
                // petclinic-costumer-service.org.springframework.samples.petclinic.customers.web.PetRequest

            }
            console.log('Second command finished executing.');
            return vscode.commands.executeCommand('revealLine', { lineNumber: lineNUmber - 1, at: 'top' });

        })
        .then(() => {
            console.log('Third command finished executing.');
        });
}



function searchjavaFilesAndDirs(dir: string): LocationFind {
    // console.log("bla")
    let javaFilesFinds: string[] = [];
    let dirFinds: string[] = [];
    let javaFile: string = "undefined";

    try {
        // try for single javaFile
        let file;
        console.log(dir + ".java")
        file = fs.readFileSync(dir + ".java");
        if (file) {
            return { javaFiles: [], dirs: [], javaFile: [dir + ".java"] }
        }


        // c:\Lenny\Studium\spring-petclinic-microservices\spring-petclinic-customers-service\src\main\java\org\springframework\samples\petclinic\customers\web\
    } catch (error) {
        console.log("No JavaFile continue with Folder")
        let files: any[] = []
        try {
            files = fs.readdirSync(dir);

            files.forEach(file => {

                const filePath = path.join(dir, file);
                const stats = fs.lstatSync(filePath);

                if (stats.isDirectory()) {
                    dirFinds.push(filePath)
                }
                else if (stats.isFile()) {
                    if (file.includes(".java")) {
                        javaFilesFinds.push(filePath)
                    }
                }

            })
        } catch (error) {
            console.log("Folder not found continue with work dirs")
            return { javaFiles: javaFilesFinds, dirs: dirFinds, javaFile: [javaFile] }
        }

        // console.log("bla")
        return { javaFiles: javaFilesFinds, dirs: dirFinds, javaFile: [javaFile] }
    }
    return { javaFiles: javaFilesFinds, dirs: dirFinds, javaFile: [javaFile] }
}


type FoundationOccurrences = {
    foundation: string,
    occurrences: number[]
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

