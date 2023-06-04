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
  TextSelection,
} from "./types";
import { ExplorVizApiCodeLens } from "./ExplorVizApiCodeLens";
import { buildClassMethodArr } from "./buildClassMethod";
import { goToLocationsByMeshId } from "./goToLocationByMeshId";
import { SessionViewProvider } from "./SessionViewProvider";
import { IFrameViewProvider } from "./IFrameViewProvider";

export let pairProgrammingSessionName: string | undefined = undefined;
export let showPairProgrammingHTML: boolean = false;
export let socket: Socket;

let backendHttp: string | undefined;
export let frontendHttp: string | undefined;
let provider: ExplorVizApiCodeLens | undefined;
let codeLensDisposable: vscode.Disposable | undefined;
let vizData: OrderTuple[] | undefined;
let disposableSessionViewProvider: vscode.Disposable | undefined;

// import * as vsls from 'vsls';
// import { getApi } from "vsls";

export let decorationType: vscode.TextEditorDecorationType;

export const monitoringDecorationType =
  vscode.window.createTextEditorDecorationType({
    backgroundColor: "lightyellow",
    border: "1px solid lightgrey",
    borderSpacing: "5px",
  });

const collabTextSelectionDecorationType =
  vscode.window.createTextEditorDecorationType({
    backgroundColor: "lightyellow",
    border: "1px solid lightblack",
    borderSpacing: "5px",
  });

export let monitoringData: MonitoringData[] = [];

let sessionViewProvier: SessionViewProvider;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  const settings = vscode.workspace.getConfiguration("explorviz");

  backendHttp = settings.get("backendUrl");

  backendHttp = settings.get("backendUrl");
  frontendHttp = settings.get("frontendUrl");

  decorationType = vscode.window.createTextEditorDecorationType({
    gutterIconPath: context.asAbsolutePath("./images/explorviz-globe.png"),
    gutterIconSize: "contain",
    isWholeLine: true,
  });

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

  vscode.window.onDidChangeActiveTextEditor(async (e) => {
    if (!e) {
      // https://github.com/microsoft/vscode/issues/108868#issuecomment-711799190
      return;
    }

    refreshEditorHightlights(context);
  });

  vscode.window.onDidChangeTextEditorSelection(
    (e: vscode.TextEditorSelectionChangeEvent) => {
      if (!pairProgrammingSessionName) {
        return;
      }

      const startLine = e.textEditor.selection.start.line;
      const startChar = e.textEditor.selection.start.character;
      const endLine = e.textEditor.selection.end.line;
      const endChar = e.textEditor.selection.end.character;
      const documentUri = e.textEditor.document.uri.toString();

      if (e.textEditor.selection.isEmpty) {
        // DEBUG
        //e.textEditor.setDecorations(collabTextSelectionDecorationType, []);
        emitTextSelection(null);
      } else {
        // DEBUG
        //e.textEditor.setDecorations(collabTextSelectionDecorationType, [
        //  new vscode.Range(startLine, startChar, endLine, endChar),
        //]);
        const textSelectionPayload: TextSelection = {
          documentUri: documentUri,
          startLine: startLine,
          startCharPos: startChar,
          endLine: endLine,
          endCharPos: endChar,
        };
        emitTextSelection(textSelectionPayload);
      }
    }
  );

  // register Shift + p commands

  registerCommandOpenInExplorViz(context);
  registerCommandConnectToRoom(context);
  registerCommandCreatePairProgramming(context);
  registerCommandJoinPairProgramming(context);
  registerCommandWebview(context);

  sessionViewProvier = new SessionViewProvider(context.extensionUri);
  disposableSessionViewProvider = vscode.window.registerWebviewViewProvider(
    SessionViewProvider.viewType,
    sessionViewProvier
  );
  context.subscriptions.push(disposableSessionViewProvider);

  console.log(
    'Congratulations, your extension "explorviz-vscode-extension" is now active!'
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}

// https://vscode.rocks/decorations/
// editor: vscode.TextEditor

function emitToBackend(dest: IDEApiDest, apiCall: IDEApiCall) {
  socket.emit(dest, apiCall);
}

function emitTextSelection(selectionPayload: TextSelection) {
  socket.emit("broadcast-text-selection", selectionPayload);
}

function cutSameStrings(arr: string[]): string[] {
  let trimmedArr: string[] = [];
  let arrFixed = arr.map((e) => e.replaceAll("/", "\\"));
  let test = arrFixed.map((e) => e.split("\\"));

  test.forEach((path) => {
    let trimmedPath = "";
    path.forEach((subPath, i) => {
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

    result.push(temp);
  });

  return result;
}

function refreshEditorHightlights(context: vscode.ExtensionContext) {
  if (!vizData) {
    return;
  }

  let classMethodArr = buildClassMethodArr(
    vscode.window.visibleTextEditors[0],
    vizData,
    monitoringData,
    true
  );

  provider = new ExplorVizApiCodeLens(classMethodArr, vizData);

  // CodeLens update Workaround
  // https://stackoverflow.com/a/69175803/3250397

  codeLensDisposable?.dispose();
  // hoverDisposable.dispose();

  codeLensDisposable = vscode.languages.registerCodeLensProvider(
    "java",
    provider
  );
  // hoverDisposable = vscode.languages.registerHoverProvider('java', provider);

  context.subscriptions.push(codeLensDisposable);
}

// Command registrations

function registerCommandOpenInExplorViz(context: vscode.ExtensionContext) {
  let openInExplorViz = vscode.commands.registerCommand(
    "explorviz-vscode-extension.OpenInExplorViz",
    function (name: string, fqn: string, vizData: OrderTuple[]) {
      let occurrences: FoundationOccurrences[] =
        getOccurrenceIDsFromVizData(vizData);

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
            //vscode.window.setStatusBarMessage(
            //  "Open " + name + " in ExplorViz"
            //);
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
          //vscode.window.setStatusBarMessage(
          // "Open " + name + " in ExplorViz"
          //);
        }
      });
    }
  );
  context.subscriptions.push(openInExplorViz);
}

function registerCommandJoinPairProgramming(context: vscode.ExtensionContext) {
  let connectToPairProgrammingSession = vscode.commands.registerCommand(
    "explorviz-vscode-extension.joinPairProgramming",
    async () => {
      if (!backendHttp) {
        vscode.window.showErrorMessage(
          `ExplorViz backend URL is not a valid string: ${backendHttp}. Check your settings.`
        );
        return;
      }

      if (!socket || socket.disconnected) {
        vscode.window.showErrorMessage(
          `You must first connect to the visualization.`
        );
        return;
      }

      const vsCodeInputOptions: vscode.InputBoxOptions = {
        prompt: "Enter the name of the pair programming session.",
      };

      const inputBox = await vscode.window.showInputBox(vsCodeInputOptions);
      if (!inputBox || inputBox.length < 3) {
        return;
      }

      socket.emit(
        "join-pair-programming-room",
        inputBox,
        (joinedSessionName: string | undefined) => {
          if (!joinedSessionName) {
            vscode.window.showErrorMessage(
              `Could not join session: ${inputBox}. Did you use a valid session name?`
            );
          } else {
            vscode.window.setStatusBarMessage(
              `Joined sessions: ${joinedSessionName}. Text selections are now shared among participants.`,
              4000
            );
            pairProgrammingSessionName = joinedSessionName;
            sessionViewProvier.refreshHTML();
          }
        }
      );

      socket.on("receive-text-selection", (textSelection: TextSelection) => {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
          return;
        }

        if (textSelection) {
          const { documentUri, startLine, startCharPos, endLine, endCharPos } =
            textSelection;

          if (editor.document.uri.toString() === documentUri) {
            editor.setDecorations(collabTextSelectionDecorationType, [
              new vscode.Range(startLine, startCharPos, endLine, endCharPos),
            ]);
          }
        } else {
          editor.setDecorations(collabTextSelectionDecorationType, []);
        }
      });
    }
  );
  context.subscriptions.push(connectToPairProgrammingSession);
}

function registerCommandCreatePairProgramming(
  context: vscode.ExtensionContext
) {
  let createPairProgramming = vscode.commands.registerCommand(
    "explorviz-vscode-extension.createPairProgramming",
    async () => {
      if (!backendHttp) {
        vscode.window.showErrorMessage(
          `ExplorViz backend URL is not a valid string: ${backendHttp}. Check your settings.`
        );
        return;
      }

      if (!socket || socket.disconnected) {
        vscode.window.showErrorMessage(
          `You must first connect to the visualization.`
        );
        return;
      }

      socket.emit(
        "create-pair-programming-room",
        (createdSession: string | undefined) => {
          if (!createdSession) {
            vscode.window.showErrorMessage(`Could not create session.`);
          } else {
            vscode.window.setStatusBarMessage(
              `Created and joined sessions: ${createdSession}. Text selections are now shared among participants.`,
              4000
            );
            pairProgrammingSessionName = createdSession;
            sessionViewProvier.refreshHTML();
          }
        }
      );

      socket.on("receive-text-selection", (textSelection: TextSelection) => {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
          return;
        }

        if (textSelection) {
          const { documentUri, startLine, startCharPos, endLine, endCharPos } =
            textSelection;

          if (editor.document.uri.toString() === documentUri) {
            editor.setDecorations(collabTextSelectionDecorationType, [
              new vscode.Range(startLine, startCharPos, endLine, endCharPos),
            ]);
          }
        } else {
          editor.setDecorations(collabTextSelectionDecorationType, []);
        }
      });
    }
  );
  context.subscriptions.push(createPairProgramming);
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

      socket = io(backendHttp, {
        path: "/v2/ide/",
      });

      socket.on("connect", () => {
        socket.emit(
          "join-custom-room",
          { roomId: inputBox },
          (joinedRoom: string | undefined) => {
            if (!joinedRoom) {
              vscode.window.showErrorMessage(
                `Could not join room: ${inputBox}. Did you use a valid room name?`
              );
            } else {
              vscode.window.setStatusBarMessage(
                `Joined room: ${joinedRoom}. `,
                2000
              );
              vscode.commands.executeCommand(
                "setContext",
                "explorviz.showPairProgrammingCommand",
                true
              );
              showPairProgrammingHTML = true;
              sessionViewProvier.refreshHTML();
            }
          }
        );
      });

      socket.on("receive-text-selection", (textSelection: TextSelection) => {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
          return;
        }

        if (textSelection) {
          const { documentUri, startLine, startCharPos, endLine, endCharPos } =
            textSelection;

          if (editor.document.uri.toString() === documentUri) {
            editor.setDecorations(collabTextSelectionDecorationType, [
              new vscode.Range(startLine, startCharPos, endLine, endCharPos),
            ]);
          }
        } else {
          editor.setDecorations(collabTextSelectionDecorationType, []);
        }
      });

      socket.on(IDEApiDest.IDEDo, (data) => {
        switch (data.action) {
          case IDEApiActions.JumpToMonitoringClass:
            monitoringData = data.monitoringData;
            break;

          case IDEApiActions.JumpToLocation:
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

          case IDEApiActions.Refresh:
            vizData = data.data;
            refreshEditorHightlights(context);
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
      const iFrameViewProvider = new IFrameViewProvider(context.extensionUri);

      context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
          IFrameViewProvider.viewType,
          iFrameViewProvider
        )
      );
    }
  );
  context.subscriptions.push(webview);
}
