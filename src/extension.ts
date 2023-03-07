// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import io, { Socket } from "socket.io-client";

import {
  FoundationOccurrences,
  IDEApiActions,
  IDEApiCall,
  IDEApiDest,
  OrderTuple,
  ParentOrder,
  MonitoringData,
} from "./types";
import { ExplorVizApiCodeLens } from "./ExplorVizApiCodeLens";
import { buildClassMethodArr } from "./buildClassMethod";
import { goToLocationsByMeshId } from "./goToLocationByMeshId";

let backendHttp: string | undefined;
let frontendHttp: string | undefined;
let socket: Socket;

// import * as vsls from 'vsls';
// import { getApi } from "vsls";

export let decorationType: vscode.TextEditorDecorationType;
export const monitoringDecorationType =
  vscode.window.createTextEditorDecorationType({
    backgroundColor: "green",
    border: "2px solid white",
  });

export let monitoringData: MonitoringData[] = [];

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // const vsls = (await getApi())!;

  // vscode.workspace.getConfiguration().update("workbench.editor.defaultViewMode", "splitRight", vscode.ConfigurationTarget.Global);

  decorationType = vscode.window.createTextEditorDecorationType({
    gutterIconPath: context.asAbsolutePath("./images/explorviz-globe.png"),
    gutterIconSize: "contain",
    isWholeLine: true,
  });

  const settings = vscode.workspace.getConfiguration("explorviz");

  backendHttp = settings.get("backendUrl");

  backendHttp = settings.get("backendUrl");
  frontendHttp = settings.get("frontendUrl");

  if (!backendHttp) {
    console.error("ExplorViz backend URL not valid string", backendHttp);
    return;
  }

  socket = io(backendHttp);

  // console.log("vsls", vsls);
  // vsls.onActivity!((e) => {
  //   console.log("onActivity", e);
  // });

  // vsls.onDidChangePeers(async (e) => {
  //   console.log("onDidChangePeers", e);
  // });

  vscode.workspace.onDidChangeTextDocument(async (e) => {
    // let peer = await vsls.getPeerForTextDocumentChangeEvent(e);
    // console.log("onDidChangeTextDocument", e, peer);

    refreshVizData();
  });

  // vsls.onDidChangeSession(async (e) => {
  //   console.log("onDidChangeSession", e);
  // });

  const openEditor = vscode.window.visibleTextEditors[0];
  let provider = new ExplorVizApiCodeLens(
    buildClassMethodArr(
      vscode.window.visibleTextEditors[0],
      [],
      monitoringData,
      true
    ),
    []
  );

  let codeLensDisposable = vscode.languages.registerCodeLensProvider(
    "java",
    provider
  );
  context.subscriptions.push(codeLensDisposable);
  // let hoverDisposable = vscode.languages.registerHoverProvider('java', provider);

  socket.on("connect", () => {
    console.log(`Socket ID is ${socket.id}`);
  });

  socket.on(IDEApiDest.IDEDo, (data) => {
    switch (data.action) {
      case IDEApiActions.JumpToMonitoringClass:
        // console.log(data.fqn);
        monitoringData = data.monitoringData;
        // vscode.commands.executeCommand('explorviz-vscode-extension.OpenInExplorViz', [data.fqn, data.fqn, []]);
        // goToLocationsByMeshId("c8ac970b7df05858a78fe54f355cf0390af912fa4a1d97f4f2297798dcd95fd3", data.data)
        break;

      case IDEApiActions.JumpToLocation:
        console.log("GoTo Mesh: " + data.meshId, data.meshId.split("_").length);

        let isMethod: boolean = data.meshId.split("_").length == 3
        goToLocationsByMeshId(data.meshId, data.data, isMethod);

        break;
      case IDEApiActions.ClickTimeline:
        vscode.commands.executeCommand(
          "explorviz-vscode-extension.IdeTestCallback"
        );
        break;
      case IDEApiActions.DoubleClickOnMesh:
        break;
      case IDEApiActions.GetVizData:
        let classMethodArr = buildClassMethodArr(
          vscode.window.visibleTextEditors[0],
          data.data,
          monitoringData,
          true
        );
        console.log("GetVizData: ", data.data);
        provider = new ExplorVizApiCodeLens(classMethodArr, data.data);
        // console.log("ideDo data received")
        // console.log(data.data[0])

        codeLensDisposable.dispose();
        // hoverDisposable.dispose();

        // buildClassMethodArr(vscode.window.visibleTextEditors[0])
        codeLensDisposable = vscode.languages.registerCodeLensProvider(
          "java",
          provider
        );
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
  });

  // emitToBackend(IDEApiDest.VizDo, {
  //     action: IDEApiActions.GetVizData,
  //     data: [],
  //     meshId: "",
  //     occurrenceID: -1,
  //     fqn: ""
  // })

  vscode.workspace.onDidSaveTextDocument((event) => {
    // emitToBackend(IDEApiDest.VizDo, { action: "getVizData" })
    emitToBackend(IDEApiDest.VizDo, {
      action: IDEApiActions.GetVizData,
      data: [],
      meshId: "",
      occurrenceID: -1,
      fqn: "",
      foundationCommunicationLinks: [],
    });
  });

  vscode.workspace.onDidOpenTextDocument((event) => {
    // emitToBackend(IDEApiDest.VizDo, { action: "getVizData" })
    // emitToBackend(IDEApiDest.VizDo, {
    //     action: IDEApiActions.GetVizData,
    //     data: [],
    //     meshId: "",
    //     occurrenceID: -1,
    //     fqn: ""
    // })
  });

  vscode.workspace.onDidChangeTextDocument((event) => {
    // emitToBackend(IDEApiDest.VizDo, { action: "getVizData" })
  });

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

  // bad workaround to open new files on left side
  // let openToFirstSplitColumn = vscode.workspace.onDidOpenTextDocument((e) => {
  //   const editor = vscode.window.activeTextEditor;

  //   // })
  //   if (editor) {
  //     // console.log(e.fileName)
  //     if (editor.viewColumn === vscode.ViewColumn.Two) {
  //       vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  //       vscode.commands.executeCommand(
  //         "vscode.open",
  //         editor.document.uri,
  //         vscode.ViewColumn.One
  //       );
  //       // vscode.commands.executeCommand('workbench.action.splitEditor');
  //     }
  //   }
  // });

  // context.subscriptions.push(openToFirstSplitColumn);
  console.log(
    'Congratulations, your extension "explorviz-vscode-extension" is now active!'
  );

  let disposable = vscode.commands.registerCommand(
    "explorviz-vscode-extension.helloWorld",
    function () {
      let editor = vscode.window.activeTextEditor;
      let selectedText = editor?.document.getText(editor.selection);

      let dir = "";
      if (vscode.workspace.workspaceFolders) {
        dir = vscode.workspace.workspaceFolders[0].uri.path;
        dir = dir.substring(1);
      }
      vscode.window.showInformationMessage(
        "Hello World from ExplorViz Support!" + selectedText
      );
    }
  );
  context.subscriptions.push(disposable);

  let VizSingleClickOnMesh = vscode.commands.registerCommand(
    "explorviz-vscode-extension.VizSingleClickOnMesh",
    function () {
      // emitToBackend("vizDo", { action: "singleClickOnMesh" })
      vscode.window.showInformationMessage("VizSingleClickOnMesh");
    }
  );
  context.subscriptions.push(VizSingleClickOnMesh);

  let VizDoubleClickOnMesh = vscode.commands.registerCommand(
    "explorviz-vscode-extension.VizDoubleClickOnMesh",
    function () {
      // emitToBackend(IDEApiDest.VizDo, { action: "doubleClickOnMesh" })
      vscode.window.showInformationMessage("VizDoubleClickOnMesh");
    }
  );
  context.subscriptions.push(VizDoubleClickOnMesh);

  let IdeTestCallback = vscode.commands.registerCommand(
    "explorviz-vscode-extension.IdeTestCallback",
    function (arg1: any, arg2: any) {
      vscode.window.showInformationMessage("IdeTestCallback " + arg1);
    }
  );
  context.subscriptions.push(IdeTestCallback);

  let OpenInExplorViz = vscode.commands.registerCommand(
    "explorviz-vscode-extension.OpenInExplorViz",
    function (name: string, fqn: string, vizData: OrderTuple[]) {
      let occurrences: FoundationOccurrences[] =
        getOccurrenceIDsFromVizData(vizData);
      // console.log(vizData)
      // console.log(occurrences)

      let vizFoundation = "foundation unset";
      let selection;
      vizData.forEach((viz) => {
        vizFoundation = viz.hierarchyModel.fqn;
      });

      occurrences.forEach(async (occ) => {
        if (
          vizFoundation.includes(occ.foundation) &&
          occ.occurrences.length !== 0
        ) {
          console.log("Found");
          selection = await selectOption(
            ["Base Foundation"].concat(occ.occurrences.map(String)),
            "Open occurrence of " + occ.foundation,
            false
          );
          if (selection) {
            if(selection == "Base Foundation") {
              selection = "-1"
            }
            emitToBackend(IDEApiDest.VizDo, {
              action: IDEApiActions.DoubleClickOnMesh,
              fqn: fqn,
              data: [],
              meshId: "",
              occurrenceID: parseInt(selection),
              foundationCommunicationLinks: [],
      
            });
            vscode.window.showInformationMessage(
              "Open " + name + " in ExplorViz"
            );
          }
        } else {
          emitToBackend(IDEApiDest.VizDo, {
            action: IDEApiActions.DoubleClickOnMesh,
            fqn: fqn,
            data: [],
            meshId: "",
            occurrenceID: -1,
            foundationCommunicationLinks: [],
    
          });
          vscode.window.showInformationMessage(
            "Open " + name + " in ExplorViz"
          );
        }
      });
    }
  );
  context.subscriptions.push(OpenInExplorViz);

  let webview = vscode.commands.registerCommand(
    "explorviz-vscode-extension.webview",
    function () {
      vscode.window.showInformationMessage("Webview from ExplorViz Support!");
      let panel = vscode.window.createWebviewPanel(
        "websiteViewer", // Identifies the type of the webview. Used internally
        "ExplorViz", // Title of the panel displayed to the user
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.file(context.extensionPath)],
        }
      );
      panel.webview.html = getWebviewContent();
    }
  );
  context.subscriptions.push(webview);

  let webviewStartup = vscode.window.createWebviewPanel(
    "websiteViewer", // Identifies the type of the webview. Used internally
    "ExplorViz", // Title of the panel displayed to the user
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(context.extensionPath)],
    }
  );
  webviewStartup.webview.html = getWebviewContent();
}

// This method is called when your extension is deactivated
export function deactivate() {}

// https://vscode.rocks/decorations/
// editor: vscode.TextEditor

function emitToBackend(dest: IDEApiDest, apiCall: IDEApiCall) {
  // console.log(socket)
  socket.emit(dest, apiCall);
}

function getWebviewContent() {
  let websiteUrl = frontendHttp;
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
  let trimmedArr: string[] = [];
  let arrFixed = arr.map(e => e.replaceAll("/", "\\"))
  let test = arrFixed.map((e) => e.split("\\"));
  // console.log("test.length", test.length)

  test.forEach((path) => {
    let trimmedPath = "";
    path.forEach((subPath, i) => {
      // console.log(i, subPath, path.length)
      if (path.length - 1 === i || path.length - 2 === i) {
        trimmedPath += "/" + subPath;
      } else {
        test.forEach((pathTotest) => {
          if (pathTotest.includes(subPath)) {
            // trimmedPath += "./"
          } else if (!trimmedPath.includes(subPath)) {
            trimmedPath += ".../" + subPath + "/...";
          }
        });
      }
    });

    trimmedArr.push(trimmedPath);
  });

  trimmedArr.forEach((element) => {
    console.log("trimmed:", element);
  });
  return trimmedArr;
}

export async function selectOption(
  options: string[],
  placeHolder: string,
  cutStrings: boolean
): Promise<string | undefined> {
  let readableJavaFilesPaths = cutStrings ? cutSameStrings(options) : options;
  const selectedOption = await vscode.window.showQuickPick(
    readableJavaFilesPaths,
    { placeHolder: placeHolder }
  );
  return options[readableJavaFilesPaths.indexOf(selectedOption + "")];
}

function getOccurrenceIDsFromVizData(
  vizData: OrderTuple[]
): FoundationOccurrences[] {
  // [
  //  {fqn: "asd.fgh.asd.", occurences: [1, 2, 3...]},
  //  {fqn: "asd.fgh.asd.asd", occurences: [1, 2, 3...]},
  // ...]
  // let result: FoundationOccurrences[] = [{ foundation: "petclinic-demo", occurrences: [1,2,3] }];
  // let result: FoundationOccurrences[] = [{ foundation: "petclinic-api-gateway", occurrences: [] }];

  let result: FoundationOccurrences[] = [];
  vizData.forEach((foundation) => {
    let temp: FoundationOccurrences = {
      foundation: foundation.meshes.meshNames[0].split(".")[0],
      occurrences: [],
    };

    foundation.meshes.meshNames.forEach((f) => {
      let possibleOccurrenceCounter = parseInt(f.split(".")[1]);
      if (!isNaN(possibleOccurrenceCounter)) {
        if (!temp.occurrences.includes(possibleOccurrenceCounter)) {
          temp.occurrences.push(possibleOccurrenceCounter);
        }
      }
    });

    // console.log(temp)
    result.push(temp);
  });

  return result;
}

export function refreshVizData() {
  emitToBackend(IDEApiDest.VizDo, {
    action: IDEApiActions.GetVizData,
    data: [],
    meshId: "",
    occurrenceID: -1,
    fqn: "",
    foundationCommunicationLinks: []
  });
}
