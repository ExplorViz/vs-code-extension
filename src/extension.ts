// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import io, { Socket } from "socket.io-client";
import * as fs from "fs";
import os from "os";

import {
  FoundationOccurrences,
  IDEApiActions,
  IDEApiCall,
  IDEApiDest,
  OrderTuple,
  //ParentOrder,
  MonitoringData,
  TextSelection,
  ModesEnum,
} from "./types";
import { ExplorVizApiCodeLens } from "./ExplorVizApiCodeLens";
import { buildClassMethodArr } from "./buildClassMethod";
import { goToLocationsByMeshId } from "./goToLocationByMeshId";
import { SessionViewProvider } from "./SessionViewProvider";
import { IFrameViewContainer } from "./IFrameViewContainer";

export let pairProgrammingSessionName: string | undefined = undefined;
export let showPairProgrammingHTML: boolean = false;
export let socket: Socket;
export let currentMode: ModesEnum = ModesEnum.crossWindow;

let backendHttp: string | undefined;
export let frontendHttp: string | undefined;
export let crossOriginCommunication: boolean = false;
let provider: ExplorVizApiCodeLens | undefined;
let codeLensDisposable: vscode.Disposable | undefined;
let vizData: OrderTuple[] | undefined;
let disposableSessionViewProvider: vscode.Disposable | undefined;
let latestTextSelection: TextSelection | undefined;

let iFrameViewContainer: IFrameViewContainer | undefined;

const username = process.env.VSCODE_EXP_USERNAME;
//const scenarioNumber = process.env.SCENARIO_NUMBER;

const homedir = os.homedir();
const pathToState = `${homedir}/explorviz-experiment-logging.csv`;

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

let sessionViewProvider: SessionViewProvider;

let extensionContext: vscode.ExtensionContext | undefined;

let iFrameUsageTimerStart: number | null = null;
let iFrameUsageTimerEnd: number | null = null;
let ideUsageTimerStart: number | null = null;
let ideUsageTimerEnd: number | null = null;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  const settings = vscode.workspace.getConfiguration("explorviz");

  extensionContext = context;

  backendHttp = settings.get("backendUrl");
  frontendHttp = settings.get("frontendUrl");

  const envBackendUrl = process.env.VS_CODE_BACKEND_URL;

  if (envBackendUrl) {
    backendHttp = envBackendUrl;
    console.debug(
      `ATTENTION: Setting 'backendUrl' has no effect, since it is overridden by environment variable 'VS_CODE_BACKEND_URL' with value: ${envBackendUrl}`
    );
  }

  const envFrontendUrl = process.env.FRONTEND_URL;

  if (envBackendUrl) {
    frontendHttp = envFrontendUrl;
    console.debug(
      `ATTENTION: Setting 'frontendHttp' has no effect, since it is overridden by environment variable 'FRONTEND_URL' with value: ${envFrontendUrl}`
    );
  }

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

  const csvHeader = `username,type,startepoch,elapsedmill\r\n`;
  fs.appendFileSync(pathToState, csvHeader);

  vscode.window.onDidChangeActiveTextEditor(async (e) => {
    if (!e) {
      // https://github.com/microsoft/vscode/issues/108868#issuecomment-711799190

      // triggered when iFrame is in focus
      iFrameUsageTimerStart = Date.now();
      ideUsageTimerEnd = Date.now();

      // save delta for ide, since now iFrame is inFocus
      if (ideUsageTimerStart) {
        const latestUsageTime = ideUsageTimerEnd - ideUsageTimerStart;
        const timeEvent = `${username},ide,${ideUsageTimerStart},${latestUsageTime}\r\n`;
        fs.appendFileSync(pathToState, timeEvent);
      }
      return;
    }

    // triggered when editor is in focus
    iFrameUsageTimerEnd = Date.now();
    ideUsageTimerStart = Date.now();

    // save delta for iFrame, since now ide is inFocus
    if (iFrameUsageTimerStart) {
      const latestUsageTime = iFrameUsageTimerEnd - iFrameUsageTimerStart;
      const timeEvent = `${username},viz,${iFrameUsageTimerStart},${latestUsageTime}\r\n`;
      fs.appendFileSync(pathToState, timeEvent);
    }

    refreshEditorHighlights();
    applyLatestTextSelection();
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

  registerCommandOpenInExplorViz();
  registerCommandConnectToRoom();
  registerCommandCreatePairProgramming();
  registerCommandJoinPairProgramming();
  registerCommandWebview();
  registerCommandDisconnectFromRoom();

  sessionViewProvider = new SessionViewProvider(context.extensionUri);
  disposableSessionViewProvider = vscode.window.registerWebviewViewProvider(
    SessionViewProvider.viewType,
    sessionViewProvider
  );
  context.subscriptions.push(disposableSessionViewProvider);

  console.log(
    'Congratulations, your extension "explorviz-vscode-extension" is now active!'
  );
}

// This method is called when your extension is deactivated
export function deactivate() { }

// https://vscode.rocks/decorations/
// editor: vscode.TextEditor

function emitToBackend(eventName: string, payload: IDEApiCall) {
  if (socket && socket.connected) {
    socket.emit(eventName, payload);
  }

  if (iFrameViewContainer) {
    iFrameViewContainer.postMessage(eventName, payload);
  }
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
        test.forEach((pathToTest) => {
          if (pathToTest.includes(subPath)) {
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
  //  {fqn: "asd.fgh.asd.", occurrences: [1, 2, 3...]},
  //  {fqn: "asd.fgh.asd.asd", occurrences: [1, 2, 3...]},
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

function refreshEditorHighlights() {
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

  codeLensDisposable = vscode.languages.registerCodeLensProvider(
    "java",
    provider
  );

  extensionContext!.subscriptions.push(codeLensDisposable);
}

function removeEditorHighlights() {
  codeLensDisposable?.dispose();
  const activeEditor = vscode.window.visibleTextEditors[0];
  if (activeEditor) {
    activeEditor.setDecorations(decorationType, []);
  }
}

// Command registrations

function registerCommandOpenInExplorViz() {
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
  extensionContext!.subscriptions.push(openInExplorViz);
}

function registerCommandJoinPairProgramming() {
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

      joinPairProgrammingRoom(inputBox);
    }
  );
  extensionContext!.subscriptions.push(connectToPairProgrammingSession);
}

function registerCommandCreatePairProgramming() {
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
            setShowPairProgrammingHTML(true);
          }
        }
      );

      socket.on("receive-text-selection", (textSelection: TextSelection) => {
        latestTextSelection = textSelection;
        applyLatestTextSelection();
      });
    }
  );
  extensionContext!.subscriptions.push(createPairProgramming);
}

function applyLatestTextSelection() {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return;
  }

  if (latestTextSelection) {
    const { documentUri, startLine, startCharPos, endLine, endCharPos } =
      latestTextSelection;

    if (editor.document.uri.toString() === documentUri) {
      editor.setDecorations(collabTextSelectionDecorationType, [
        new vscode.Range(startLine, startCharPos, endLine, endCharPos),
      ]);
    }
  } else {
    editor.setDecorations(collabTextSelectionDecorationType, []);
  }
}

export function connectWithBackendSocket() {
  if (!backendHttp) {
    console.error("ExplorViz backend URL not valid string", backendHttp);
    return;
  }

  if (!socket || socket.disconnected) {
    socket = io(backendHttp, {
      path: "/v2/ide/",
    });
  }
}

export function joinPairProgrammingRoom(roomName: string) {
  if (process.env.VS_CODE_AUTO_COLLAB_JOIN === "false") {
    console.debug("AUTO_COLLAB_JOIN is set to false, won't join PP room.");
    return;
  }

  if (pairProgrammingSessionName) {
    return;
  }

  socket.emit(
    "join-pair-programming-room",
    roomName,
    (joinedSessionName: string | undefined) => {
      if (!joinedSessionName) {
        vscode.window.showErrorMessage(
          `Could not join session: ${roomName}. Did you use a valid session name?`
        );
      } else {
        vscode.window.setStatusBarMessage(
          `Joined sessions: ${joinedSessionName}. Text selections are now shared among participants.`,
          4000
        );
        pairProgrammingSessionName = joinedSessionName;
        sessionViewProvider.refreshHTML();
      }
    }
  );

  socket.on("receive-text-selection", (textSelection: TextSelection) => {
    latestTextSelection = textSelection;
    applyLatestTextSelection();
  });
}

// This function shall be used to set the current mode.
function registerCommandConnectToRoom() {
  let connectToRoom = vscode.commands.registerCommand(
    "explorviz-vscode-extension.connectToRoom",
    async () => {
      // Choose the Mode.
      const dropDownMenu: vscode.QuickPickItem[] = Object.values(ModesEnum).map(value => ({
        label: value.toString()
      }));

      vscode.window.showQuickPick(dropDownMenu).then(selectedMode => {
        switch (selectedMode?.label) {
          case 'Cross Window':
            currentMode = ModesEnum.crossWindow;
            // TODO: Activate CrossWindow?
            break;
          case 'Websocket':
            currentMode = ModesEnum.websocket;
            connectToRoomWebsocket();
            break;
        }
        sessionViewProvider.refreshHTML();
      });
    }
  );
  extensionContext!.subscriptions.push(connectToRoom);
}

// Function, which describes the actual behaviour of the establishing of the connection to a room via a websocket.
function connectToRoomWebsocket() {
    async () => {
      connectWithBackendSocket();

      // Enter the IDE-Room
      const vsCodeInputOptions: vscode.InputBoxOptions = {
        prompt: "Enter the room name from the ExplorViz frontend.",
      };

      const inputBox = await vscode.window.showInputBox(vsCodeInputOptions);
      if (!inputBox || inputBox.length < 3) {
        vscode.window.showErrorMessage(
          `Join-Room: Please enter a valid IDE room with length ≥3.`
        );
        return;
      }

      // Socket.on() should behave the same way, but this way I can print an error message.
      if (!socket || socket.disconnected) {
        vscode.window.showErrorMessage(
          `Join-Room: No connection was established.`
        );
        return;
      }

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
            setShowPairProgrammingHTML(true);
            // Activate the websocket mode for the current session.
            // Deactivate the cross-window mode.
            if (currentMode === ModesEnum.websocket) {
              emitToBackend(IDEApiDest.VizDo, {
                action: IDEApiActions.ConnectIDE,
                data: [],
                meshId: "",
                occurrenceID: -1,
                fqn: "",
                foundationCommunicationLinks: [],
              }); 

              vscode.window.showInformationMessage(
                `Disconnect from Cross-Window Mode.`
              );
            }
            /* extensionContext != webviewContext
            => The WebView does not get to be re-build.
            => We also need to refresh the WebViewContext.
            */
            sessionViewProvider.refreshHTML();
            vscode.commands.executeCommand("workbench.view.explorer");
          }
        }
      );

      socket.on(IDEApiDest.IDEDo, (data) => {
        handleIncomingVizEvent(data);
      });
    };
}

function disconnectIDE() {
  currentMode = ModesEnum.crossWindow; 

  emitToBackend(IDEApiDest.VizDo, {
    action: IDEApiActions.DisconnectIDE,
    data: [],
    meshId: "",
    occurrenceID: -1,
    fqn: "",
    foundationCommunicationLinks: [],
  });

  socket.disconnect();
  sessionViewProvider.refreshHTML();

  vscode.window.setStatusBarMessage(
    `Disconnect from Websocket Mode.`
  );
}

// Command which is executed the "Disconnect-Button" from the IDE is triggered.
function registerCommandDisconnectFromRoom() {
  let disconnectFromRoom = vscode.commands.registerCommand(
    "explorviz-vscode-extension.disconnectFromRoom",
    async () => {
      disconnectIDE();
    }
  );
  extensionContext!.subscriptions.push(disconnectFromRoom);
}

// Function which is activated when clicked on "Open Visualization".
// TODO: How to deactivate/isolate Cross-Window?
function registerCommandWebview() {
  let webview = vscode.commands.registerCommand(
    "explorviz-vscode-extension.webview",
    function () {
      // Deactivate the websocket flag.
      if (currentMode === ModesEnum.crossWindow) {
        disconnectIDE(); 
      }

      let panel = vscode.window.createWebviewPanel(
        "websiteViewer", // Identifies the type of the webview. Used internally
        "ExplorViz", // Title of the panel displayed to the user
        vscode.ViewColumn.Nine,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.file(extensionContext!.extensionPath),
          ],
        }
      );
      iFrameViewContainer = new IFrameViewContainer(
        extensionContext!.extensionUri,
        panel.webview
      );
      panel.webview.html = iFrameViewContainer.getHtmlForWebview();

      panel.onDidDispose((_e) => {
        removeEditorHighlights();
      });
      vscode.commands.executeCommand("workbench.view.explorer");
    }
  );
  extensionContext!.subscriptions.push(webview);
}

export function handleIncomingVizEvent(data: any) {
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
      refreshEditorHighlights();
      break;

    case IDEApiActions.SingleClickOnMesh:
      // goToLocationsByMeshId(data.meshId, data.data)
      break;

    case IDEApiActions.DisconnectFrontend:
      vscode.window.showErrorMessage("The frontend disconnected.");
      disconnectIDE();
      break;

    default:
      break;
  }
}

export function setCrossOriginCommunication(value: boolean) {
  crossOriginCommunication = value;
}

export function setShowPairProgrammingHTML(value: boolean) {
  if (value !== showPairProgrammingHTML) {
    showPairProgrammingHTML = value;
    //sessionViewProvider.refreshHTML();
  }
}
