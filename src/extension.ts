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
let provider: ExplorVizApiCodeLens | undefined;
let codeLensDisposable: vscode.Disposable | undefined;

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
  const settings = vscode.workspace.getConfiguration("explorviz");

  backendHttp = settings.get("backendUrl");

  backendHttp = settings.get("backendUrl");
  frontendHttp = settings.get("frontendUrl");

  console.log("test alex1");

  decorationType = vscode.window.createTextEditorDecorationType({
    gutterIconPath: context.asAbsolutePath("./images/explorviz-globe.png"),
    gutterIconSize: "contain",
    isWholeLine: true,
  });

  const openEditor = vscode.window.visibleTextEditors[0];

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

  vscode.workspace.onDidSaveTextDocument((event) => {
    emitToBackend(IDEApiDest.VizDo, {
      action: IDEApiActions.GetVizData,
      data: [],
      meshId: "",
      occurrenceID: -1,
      fqn: "",
      foundationCommunicationLinks: [],
    });
  });

  vscode.workspace.onDidChangeTextDocument(async (e) => {
    refreshVizData();
  });

  // register Shift + p commands

  registerCommandOpenInExplorViz(context);
  registerCommandConnectToRoom(context);
  registerCommandWebview(context);

  console.log(
    'Congratulations, your extension "explorviz-vscode-extension" is now active!'
  );
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
  let arrFixed = arr.map((e) => e.replaceAll("/", "\\"));
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

function refreshVizData() {
  emitToBackend(IDEApiDest.VizDo, {
    action: IDEApiActions.GetVizData,
    data: [],
    meshId: "",
    occurrenceID: -1,
    fqn: "",
    foundationCommunicationLinks: [],
  });
}

// Command registrations

function registerCommandOpenInExplorViz(context: vscode.ExtensionContext) {
  let openInExplorViz = vscode.commands.registerCommand(
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
            if (selection === "Base Foundation") {
              selection = "-1";
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
  context.subscriptions.push(openInExplorViz);
}

function registerCommandConnectToRoom(context: vscode.ExtensionContext) {
  let connectToRoom = vscode.commands.registerCommand(
    "explorviz-vscode-extension.connectToRoom",
    async () => {
      if (!backendHttp) {
        console.error("ExplorViz backend URL not valid string", backendHttp);
        return;
      }

      const vsCodeInputOptions: vscode.InputBoxOptions = {
        prompt: "Enter the room name from the ExplorViz frontend.",
      };

      const inputBox = await vscode.window.showInputBox(vsCodeInputOptions);
      if (!inputBox || inputBox.length < 3) {
        return;
      }
      vscode.window.showInformationMessage(inputBox);

      socket = io(backendHttp);

      socket.on("connect", () => {
        socket.emit("join-custom-room", { roomId: inputBox });
      });

      socket.on(IDEApiDest.IDEDo, (data) => {
        console.log("joooooo", data);
        switch (data.action) {
          case IDEApiActions.JumpToMonitoringClass:
            // console.log(data.fqn);
            monitoringData = data.monitoringData;
            // vscode.commands.executeCommand('explorviz-vscode-extension.OpenInExplorViz', [data.fqn, data.fqn, []]);
            // goToLocationsByMeshId("c8ac970b7df05858a78fe54f355cf0390af912fa4a1d97f4f2297798dcd95fd3", data.data)
            break;

          case IDEApiActions.JumpToLocation:
            console.log(
              "GoTo Mesh: " + data.meshId,
              data.meshId.split("_").length
            );

            let isMethod: boolean = data.meshId.split("_").length === 3;
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

            codeLensDisposable?.dispose();
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
    }
  );
  context.subscriptions.push(connectToRoom);
}

function registerCommandWebview(context: vscode.ExtensionContext) {
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
}
