// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import io, { Socket } from "socket.io-client";
import * as fs from "fs";
import os from "os";
import { load, dump } from "js-yaml";
import * as path from "path";
import { exec } from "child_process";

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
  InspectITConfig,
} from "./types";
import { ExplorVizApiCodeLens } from "./ExplorVizApiCodeLens";
import { buildClassMethodArr } from "./buildClassMethod";
import { goToLocationsByMeshId } from "./goToLocationByMeshId";
import { SessionViewProvider } from "./SessionViewProvider";
import { IFrameViewContainer } from "./IFrameViewContainer";
import { API, GitExtension, Repository } from "./api/git";

export type DebugRoom = { alias: string; secret: string; value: string; projectName: string; commitId: string; };
export type DebugRoomList = DebugRoom[];

export let pairProgrammingSessionName: string | undefined = undefined;
export let showPairProgrammingHTML: boolean = false;
export let socket: Socket;
export let currentMode: ModesEnum | undefined;
export let isConnectedToBackend: boolean = false;

export let backendHttp: string | undefined;
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

const ackTimeoutMs = 4000;

let jdkBinPath: string | undefined = undefined;


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

export let connectedToVis: boolean = false;
export let currentRoom: String | undefined;

export let isInDebugSession: boolean = false;
export let isInspectITClientAttached: boolean = false;

export let currentDebugRooms: DebugRoomList | undefined = undefined;
export let currentDebugRoom: DebugRoom | undefined = undefined;
export let isDebugSessionStopped: boolean = false;

export let isLoading: boolean = false; 


let debuggedAppPID: number | undefined;

// used to check wether the selected debug room is from our workspace
let git: API | undefined = undefined;


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  const settings = vscode.workspace.getConfiguration("explorviz");

  extensionContext = context;

  backendHttp = settings.get("backendUrl");
  frontendHttp = settings.get("frontendUrl");
  currentMode = ModesEnum[settings.get("defaultMode") as keyof typeof ModesEnum];

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
        const timeEvent = `${username},ide,${ideUsageTimerStart},${latestUsageTimer}\r\n`;
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
      const timeEvent = `${username},viz,${iFrameUsageTimerStart},${latestUsageTimer}\r\n`;
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


  sessionViewProvider = new SessionViewProvider(context.extensionUri);
  disposableSessionViewProvider = vscode.window.registerWebviewViewProvider(
    SessionViewProvider.viewType,
    sessionViewProvider
  );
  context.subscriptions.push(disposableSessionViewProvider);

  // connection with backend
  connectWithBackendSocket();

  // covers the case in which a debug session
  // has already been started before the extension was activated
  checkForDebugSession();
  // handle stopped events to update extension UI for a button called: Save breakpoint
  vscode.debug.registerDebugAdapterTrackerFactory('java', {
    createDebugAdapterTracker(session: vscode.DebugSession) {
      return {
        onWillReceiveMessage: m => {
        console.log(`> ${JSON.stringify(m, undefined, 2)}`);
        if(m?.command) {
            switch(m.command) {
              case "continue":
                isDebugSessionStopped = false;
                sessionViewProvider.refreshHTML();
                break;
            }
        }
        },
        onDidSendMessage: m => {
        console.log(`< ${JSON.stringify(m, undefined, 2)}`);

          if(m?.event) {
            switch(m.event) {

              case "processid":
                if(m?.body?.processId) {
                  debuggedAppPID = m.body.processId;
                }
                break;
              case "stopped":
                if(
                  m?.body?.reason === "breakpoint" || 
                  m?.body?.reason === "data breakpoint" || 
                  m?.body?.reason === "function breakpoint" || 
                  m?.body?.reason === "instruction breakpoint"
                ) {
                  isDebugSessionStopped = true;
                  sessionViewProvider.refreshHTML();
                  // todo: save breakpoint feature => save state (selection of which variables to save needed)
                }
                break;
              case "step":
                break;
              case "entry":
                break;
              case "goto":
                break;
            }
          }

        }
      };
    }
  });

  // #region Commands Registration (Shift + p for commands search)

  registerCommandOpenInExplorViz();
  registerCommandConnectToRoom();
  registerCommandCreatePairProgramming();
  registerCommandJoinPairProgramming();
  registerCommandWebview();
  registerCommandDisconnectFromRoom();
  registerCommandStartVisualizationForDebugSession();
  registerCommandStopVisualizationForDebugSession();
  registerCommandLoadDebugSessionLandscapes();
  registerCommandConnectToBackend();
  registerCommandDisconnectFromBackend();
  registerCommandCreateLandscapeForDebugSession();
  registerCancelConnectionSetup();
  registerCommandUpdateWebViewForJoinedDebugSessionLandscape();
  registerCommandSaveBreakpoint();

  // #endregion


  // https://github.com/microsoft/vscode/tree/main/extensions/git
  const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports;
  try {
    git = gitExtension?.getAPI(1); 
  } catch (error) {
    console.log(error);
  }

  console.log(
    'Congratulations, your extension "explorviz-vscode-extension" is now active!'
  );
}

// This method is called when your extension is deactivated
export function deactivate() { }

// https://vscode.rocks/decorations/
// editor: vscode.TextEditor
/**
 * Talking to the backend and/or iFrame through dedicated Events.
 * @param eventName Name of the event.
 * @param payload IDEApiCall
 */
function emitToBackend(eventName: string, payload: IDEApiCall) {
  if (currentMode === ModesEnum.websocket && socket && socket.connected) {
    socket.emit(eventName, payload);
  }

  if (currentMode === ModesEnum.crossWindow && iFrameViewContainer) {
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
  console.log("connectWithBackendSocket");
  if (!backendHttp) {
    vscode.window.showErrorMessage("ExplorViz backend URL not valid string:" + backendHttp);
    return;
  }

  /*if(socket) {
    socket.disconnect();
  }*/

  if(!socket || socket.disconnected) {
    socket = io(backendHttp, {
      path: "/v2/ide/",
      query: { client: 'extension' },
    });

    socket.on("connect", () => {
      isConnectedToBackend = socket.connected;
      isLoading = false;
      sessionViewProvider.refreshHTML();
    });
    socket.on("disconnect", () => {
      console.debug("disconnect");
      isConnectedToBackend = socket.connected;
      isLoading = false;
      sessionViewProvider.refreshHTML();
    });
    socket.on("connect_error", (error) => {
      const oldIsConnectedToBackend = isConnectedToBackend;
      isConnectedToBackend = socket.connected;
      if(socket.active) {
        // temporary failure, the socket will automatically try to reconnect
        // Therefore, connect_error event may gets fired multiple times until successfully connected
        const oldLoadingState = isLoading;
        isLoading = true;

        if(oldLoadingState !== isLoading){
          sessionViewProvider.refreshHTML();
        }
      }else {
        const oldLoadingState = isLoading;
        isLoading = false;

        if(oldLoadingState !== isLoading){
          sessionViewProvider.refreshHTML();
        }
      }

      if(oldIsConnectedToBackend !== isConnectedToBackend) {
        sessionViewProvider.refreshHTML();
      }
      console.debug(error.message);
    });
    // important to register it here (i.e. as soon as possible)
    socket.on("updates-debug-room-list", (debugRoomList: DebugRoomList) => {
      // idea: within our extension the user can click one of the rooms in that list to receive the 
      // source code base that was debugged and can jump to the saved breakpoints by selecting one of them
      // so it should act as a recorder (how to do this the most efficient way? What are possible restrictions?)
      console.log("current debug rooms:", debugRoomList);
      currentDebugRooms = debugRoomList;
      sessionViewProvider.refreshHTML();
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

/**
* This command shall be used to set the current mode.
*/
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
          case 'crossWindow':
            currentMode = ModesEnum.crossWindow;
            setConnectedToVis(true);
            break;
          case 'websocket':
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

/**
 * Describes the actual behaviour of establishing the connection to a room via a websocket.
 */
async function connectToRoomWebsocket() {
  connectWithBackendSocket(); 

  // TODO: Does the following part really fit here? The user should first have created a pair programming room before he can actually join one

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
        currentRoom = joinedRoom;
        sessionViewProvider.refreshHTML();
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
        setConnectedToVis(true);
        vscode.commands.executeCommand("workbench.view.explorer");
      }
    }
  );

  socket.on(IDEApiDest.IDEDo, (data) => {
    handleIncomingVizEvent(data);
  });
};

/**
 * Set the boolean connectedToVis = b.
 * @param b Boolean value
 */
function setConnectedToVis(b: boolean) {
  connectedToVis = b;
  /* extensionContext != webviewContext
    => The WebView does not get to be re-built.
    => We also need to refresh the WebViewContext.
  */
  sessionViewProvider.refreshHTML();
}

/**
 * Disconnect from IDE, if the socket has been connected in the first place.
 */
function disconnectIDE() {
  if (!socket || socket.disconnected) {
    return;
  }

  emitToBackend(IDEApiDest.VizDo, {
    action: IDEApiActions.DisconnectIDE,
    data: [],
    meshId: "",
    occurrenceID: -1,
    fqn: "",
    foundationCommunicationLinks: [],
  });

  socket.disconnect();
  currentMode = ModesEnum.crossWindow;
  currentRoom = ""; 
  sessionViewProvider.refreshHTML();

  vscode.window.setStatusBarMessage(
    `Disconnect from Websocket Mode.`
  );
}

/** 
* Command which is executed when the "Disconnect-Button" from the IDE is triggered.
*/
function registerCommandDisconnectFromRoom() {
  let disconnectFromRoom = vscode.commands.registerCommand(
    "explorviz-vscode-extension.disconnectFromRoom",
    async () => {
      if (currentMode === ModesEnum.websocket) {
        disconnectIDE();
      }
      setConnectedToVis(false);
    }
  );
  extensionContext!.subscriptions.push(disconnectFromRoom);
}

/**
 * Command which is activated when clicked on "Open Visualization".
 */
function registerCommandWebview() {
  let webview = vscode.commands.registerCommand(
    "explorviz-vscode-extension.webview",
    function () {
      // Deactivate the websocket flag.
      if (currentMode === ModesEnum.crossWindow) {
        disconnectIDE(); 
      }

      setConnectedToVis(true);

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











// #region Debug Session Feature 

/**
 * Command which is executed when the "Activate ExplorViz For Current Debug Session" button from the IDE is triggered
 */
function registerCommandStartVisualizationForDebugSession() {
  const startVisualizationForDebugSession = vscode.commands.registerCommand(
    "explorviz-vscode-extension.startVisualizationForDebugSession",
    async () => {
      try {

        if(isInspectITClientAttached) {
          vscode.window.showInformationMessage("ExplorViz already activated for this debug session!");
          return;
        }

        if(!currentDebugRoom) {
          vscode.window.showInformationMessage("Please join or create a landscape for this debug session");
          return;
        }


        if (!socket || socket.disconnected) {
          vscode.window.showErrorMessage(
            `You must first connect to the backend!`
          );
          return;
        }
        await attachInspectITClient();
        sessionViewProvider.refreshHTML();
      } catch (error) {
        vscode.window.showErrorMessage(
          `Some unexpected error happened: ${error}`
        );
        return;
      }
    }
  );
  extensionContext!.subscriptions.push(startVisualizationForDebugSession);
}

/**
 * Command which is executed when the "Deactivate ExplorViz For Current Debug Session" button from the IDE is triggered
 */
function registerCommandStopVisualizationForDebugSession() {
  const stopVisualizationForDebugSession = vscode.commands.registerCommand(
    "explorviz-vscode-extension.stopVisualizationForDebugSession",
    () => {
      vscode.window.showInformationMessage("TODO");

      isInspectITClientAttached = false;
      sessionViewProvider.refreshHTML();
    }
  );
  extensionContext!.subscriptions.push(stopVisualizationForDebugSession);
}

function registerCommandConnectToBackend() {
  const connectToBackend = vscode.commands.registerCommand(
    "explorviz-vscode-extension.connectToBackend",
    () => {
      console.log("Connect To Backend...");
      connectWithBackendSocket();
    });
    extensionContext!.subscriptions.push(connectToBackend);
}

function registerCommandDisconnectFromBackend() {
  const disconnectFromBackend = vscode.commands.registerCommand(
    "explorviz-vscode-extension.disconnectFromBackend",
    () => {
      console.log("Disconnect From Backend");
      if(socket){
        socket.disconnect();
        isConnectedToBackend = socket.connected;
      }
    });
    extensionContext!.subscriptions.push(disconnectFromBackend);
}

function registerCommandUpdateWebViewForJoinedDebugSessionLandscape() {
  const updateWebViewForJoinedDebugSessionLandscape = vscode.commands.registerCommand(
    "explorviz-vscode-extension.updateWebViewForJoinedDebugSessionLandscape",
    async (obj: any) => {

      console.log("obj", obj);

      const workspaceFolder = await askForWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder selected.");
        return;
      }
      const workspaceUri = workspaceFolder.uri;
      if (!workspaceUri) {
        vscode.window.showErrorMessage("No debuggee workspace URI found!");
        return;
      }
      const repository = git?.getRepository(workspaceUri);
      const currentCommit = repository?.state.HEAD?.commit;

      // only join a debug session room for workspaces that are controlled by a VCS so we
      // can be sure that snapshots are added to the right landscapes
      if(!currentCommit) {
        vscode.window.showInformationMessage("No commit for this workspace found! Please make sure that your workspace uses a VCS");
        return;
      }

      if(obj.commitId !== currentCommit) {
        vscode.window.showWarningMessage("Please join a landscape that was created for your workspace project");
        return;
      }
      currentDebugRoom = currentDebugRooms?.find(room => room.value === obj.tokenValue);

      sessionViewProvider.refreshHTML();
    });
  
    extensionContext!.subscriptions.push(updateWebViewForJoinedDebugSessionLandscape);
}

function registerCommandSaveBreakpoint() {
  // Things to consider regarding the replay feature (to be implemented): 
  // - saving a breakpoint that was added during a breakpoint session (by the user or conditional breakpoints)
  const saveBreakPoint = vscode.commands.registerCommand(
    "explorviz-vscode-extension.saveBreakpoint",
    () => {

      // we still need to check this because our save state function could
      // be called from within the command panel
      if(!isDebugSessionStopped) {
        return;
      }

      if(!currentDebugRoom) {
        vscode.window.showInformationMessage("Please join a debug room!");
        return;
      }

      if(!isInspectITClientAttached) {
        vscode.window.showInformationMessage("Please initiate monitoring for this debug session!");
        return;
      }
      const timestamp = Date.now();
      console.log("save current state");
      // Todo: how to handle if the user has made some "steps into" after reaching the breakpoint?
      // => we don't call it save breakpoint but save current state!

      socket.emit(
        'check-frontend-connection', 
        frontendHttp, 
        (payload: boolean | undefined) => {
          const isConnected = payload;

          if(!isConnected) {
            vscode.window.showErrorMessage("Please go to the settings in the frontend of ExplorViz to connect it to our extension!");
            return;
          }

          socket.emit('save-current-state', currentDebugRoom!.value, timestamp, (success: boolean) => {
            if(success) {
              vscode.window.showInformationMessage('Current state has been saved!');
            }else {
              vscode.window.showErrorMessage('Unable to save current state!');
            }
          });


        });
    });
  
    extensionContext!.subscriptions.push(saveBreakPoint);
}

function registerCommandCreateLandscapeForDebugSession() {
  const createLandscapeForDebugSession = vscode.commands.registerCommand(
    "explorviz-vscode-extension.createLandscapeForDebugSession",
    async () => {
      console.log("Create Debug Room");

      if (!socket || socket.disconnected) {
        vscode.window.showErrorMessage(
          `You must first connect to the backend!`
        );
        return;
      }

      const workspaceFolder = await askForWorkspaceFolder();
      if(!workspaceFolder) {
        return;
      }

      const workspaceUri = workspaceFolder?.uri;
      if (!workspaceUri) {
        vscode.window.showErrorMessage("No workspace URI found!");
        return;
      }
      const repository = git?.getRepository(workspaceUri);
      const currentCommit = repository?.state.HEAD?.commit;
      
      // only create a debug session room for workspaces that are controlled by a VCS
      // Why? So we can replay the debug session for the right code base 
      // (=> feature to be implemented soon, ofc there are things like non-determinism to consider)
      if(!currentCommit) {
        vscode.window.showInformationMessage("No commit for this workspace found! Please make sure that your workspace uses a VCS");
        return;
      }

      const debugSessionName = await askForDebugRoomName();
      if(!debugSessionName) {
        vscode.window.showErrorMessage("No name for debug session provided!");
        return;
      }

      let ackCalled = false;
      const ackPromise1 = new Promise<boolean | undefined>((resolve) => {
        socket.emit('check-frontend-connection', frontendHttp, (payload?: unknown) => {
          ackCalled = true;
          if(typeof payload === 'boolean') {
            resolve(payload);
          } else {
            resolve(undefined);
          }
        });

        setTimeout(() => {
          if (!ackCalled) {
            resolve(undefined);
          }
        }, ackTimeoutMs);
      });

      const isFrontendConnected = await ackPromise1;
      
      if(isFrontendConnected === undefined) {
        vscode.window.showErrorMessage("Something went wrong while checking the connection to the frontend!");
        return;
      }

      console.log("isFrontendConnected", isFrontendConnected);

      ackCalled = false;

      const alias = debugSessionName;
      const projectName = workspaceFolder.name;
      const commitId = currentCommit;

      const ackPromise2 = new Promise<{value: string; secret: string;} | undefined>((resolve) => {
        socket.emit('create-landscape', alias, projectName, commitId, (payload?: unknown) => {
          ackCalled = true;

          if(typeof payload === 'object' && payload !== null && 
             'value' in payload && typeof payload.value === 'string' &&
             'secret' in payload && typeof payload.secret === 'string') {
            resolve(payload as {value: string, secret: string});
          } else {
            resolve(undefined);
          }
        });

        setTimeout(() => {
            if (!ackCalled) {
              resolve(undefined);
            }
        }, ackTimeoutMs);
      });

      const tokenData = await ackPromise2;

      if(tokenData === undefined) {
        vscode.window.showErrorMessage("Unexpected error while creating debug room!");
        return;
      }

      console.log("tokenData", tokenData);


      currentDebugRoom = {
        value: tokenData.value,
        secret: tokenData.secret,
        alias: alias,
        projectName: projectName,
        commitId: commitId
      };
      console.log("currentDebugRoom", currentDebugRoom);
      vscode.commands.executeCommand('explorviz-vscode-extension.loadDebugSessionLandscapes');
      vscode.window.showInformationMessage(`The debug room (${currentDebugRoom.alias}) has been successfully created!`);
    });
  extensionContext!.subscriptions.push(createLandscapeForDebugSession);
}

function registerCancelConnectionSetup() {
  const cancelConnectionSetup = vscode.commands.registerCommand(
    "explorviz-vscode-extension.cancelConnectionSetup",
    () => {
      console.log("Cancel Connection Setup");
      if(socket) {
        socket.disconnect();
        // it would be more elegant if the values are set within the
        // disconnect event handler, but unfortunately it doesn't fire
        // when socket.disconnect(); is called in our case (why?)
        isConnectedToBackend = socket.connected;
        isLoading = false;

        // cancel connection setup button only displayed if isLoading is set to true
        // Therefore, we need to refresh
        sessionViewProvider.refreshHTML();
      }
    });
    extensionContext!.subscriptions.push(cancelConnectionSetup);
}

function registerCommandLoadDebugSessionLandscapes() {
  const loadDebugSessionLandscapes = vscode.commands.registerCommand(
    "explorviz-vscode-extension.loadDebugSessionLandscapes",
    async () => {

      console.log("Load Debug Session Landscapes");

      if (!socket || socket.disconnected) {
        vscode.window.showErrorMessage(
          `You must first connect to the backend!`
        );
        return;
      }

      // Use an ack with timeout so we don't hang silently if server doesn't call the ack.
      let ackCalled = false;

      const isValidDebugRoom = (obj: any): obj is DebugRoom => {
        return (
          obj &&
          typeof obj === "object" &&
          typeof obj.alias === "string" &&
          typeof obj.secret === "string" &&
          typeof obj.value === "string" &&
          typeof obj.projectName === "string" &&
          typeof obj.commitId === "string"
        );
      };

      const isValidDebugRoomList = (payload: unknown): payload is DebugRoomList => {
        if (!Array.isArray(payload)) {
          return false;
        }
        return payload.every((el) => isValidDebugRoom(el));
      };

      const ackPromise = new Promise<DebugRoomList | undefined>((resolve) => {
        socket.emit("load-debug-room-list", (payload?: unknown) => {
          ackCalled = true;
          console.log("debug room list (ack)", payload);

          if (isValidDebugRoomList(payload)) {
            resolve(payload);
          } else {
            console.warn("load-debug-room-list: received payload does not match DebugRoomList format,", payload);
            // Treat unexpected payloads as "no valid data"
            resolve(undefined);
          }
        });

        // Fallback timeout
        setTimeout(() => {
          if (!ackCalled) {
            console.warn("No ack received for load-debug-room-list within", ackTimeoutMs, "ms");
            resolve(undefined);
          }
        }, ackTimeoutMs);
      });

      const debugRoomList = await ackPromise;

      // If ack returned data, use it. Otherwise check if server will send 'updates-debug-room-list'.
      if (debugRoomList !== undefined) {
        // ackPromise liefert nur DebugRoomList (Array) oder undefined
        currentDebugRooms = debugRoomList;
        console.log("currentDebugRooms updated via updates-debug-room-list:", currentDebugRooms);
        sessionViewProvider.refreshHTML();
        return;
      }

      vscode.window.showErrorMessage("Did not receive debug room list from backend (no ack). Make sure the frontend is connected to the vs code backend.");
    });
    extensionContext!.subscriptions.push(loadDebugSessionLandscapes);
}


function getDebuggedApplicationPID(): Promise<number|undefined> {
  return new Promise<number|undefined>((resolve) => {
    let counter = 0;
    const interval = setInterval(() => {
      if((debuggedAppPID !== undefined) || counter === 50) {
        clearInterval(interval);
        resolve(debuggedAppPID);
      }
      counter++;
    }, 100);
  });
};


vscode.debug.onDidStartDebugSession( (session) => {
  console.log("Started debug session");

  // show command in command palette (see package.json)
  vscode.commands.executeCommand(
    "setContext",
    "explorviz.showStartVisualizationForDebugSessionCommand",
    true
  );

  // Needed to adapt the "ExplorViz: Session Information"-webview to include debug session related UI
  isInDebugSession = true;
  sessionViewProvider.refreshHTML();
});

vscode.debug.onDidTerminateDebugSession( (session) => {
  isInDebugSession = false;
  // TODO: take multiple debug sessions from different workspaces into account
  // (use a Map data structure for this with the workspace folder name as key)
  isInspectITClientAttached = false;
  sessionViewProvider.refreshHTML();
});


// should only be called when our program execution is stopped. TODO: what happens when we call it after we made a few next steps from a breakpoint?
function saveBreakpoint() {
  //TODO: the user should be able to name variables that are relevant to this breakpoint to be stored
  // and printed in the frontend
  //socket.emit("create-breakpoint", );
} 


function checkJavaInstalled() {
  return new Promise<boolean>((resolve, reject) => {
      exec('java --version', (error, stdout, stderr) => {
          if (error) {
              console.log(`Java not found: ${stderr}`);
              reject(`Java not found: ${stderr}`);
          } else {
              console.log('Java is installed');
              resolve(true);
          }
      });
  });
}

function attachOcelotAgent() {
  return new Promise<boolean>((resolve, reject) => {
    const ocelotPath = vscode.Uri.joinPath(extensionContext!.extensionUri, "ocelot");
    const ocelotJarPath = vscode.Uri.joinPath(ocelotPath, "inspectit-ocelot-agent-2.6.5.jar");
    const commandString = `java -jar ${ocelotJarPath.fsPath} ${debuggedAppPID} "{ \"inspectit\": { \"config\": { \"file-based\": {\"path\": \"${ocelotPath.fsPath}\" }}}}"`;
    exec(commandString, (error, stdout, stderr) => {
        if (error) {
            console.log(`Ocelot : ${stderr}`);
            reject(`Ocelot : ${stderr}`);
        } else {
            console.log('Ocelot attached');
            resolve(true);
        }
    });
});
}

function askForDebugRoomName() {
  return vscode.window.showInputBox({
    prompt: 'Please give the current debug room a name',
  });
}

async function askForWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showInformationMessage('No workspace folders are open.');
        return undefined;
    }

    if (workspaceFolders.length === 1) {
        // Automatically return the only workspace folder
        return workspaceFolders[0];
    }

    // Prompt the user to pick a workspace folder if there are multiple
    const folder = await vscode.window.showWorkspaceFolderPick({
        placeHolder: 'Select a workspace folder',
    });

    if (!folder) {
        vscode.window.showInformationMessage('No workspace folder selected.');
    }

    return folder;
}

async function attachInspectITClient() {

  const debuggedAppPID = await  getDebuggedApplicationPID();
    if(!debuggedAppPID) {
      vscode.window.showErrorMessage("Unable to find the debuggee PID. Please restart the debugger and try again! (Ctrl + Shift + F5)");
      return;
    }

  // Get the file path for the bundled YAML file
  const filePath = vscode.Uri.joinPath(extensionContext!.extensionUri, "ocelot", "inspectit.yml");
  try {
    // Read the YAML file from the extension's directory
    const data = fs.readFileSync(filePath.fsPath, 'utf8');
    // Parse the YAML data into a JavaScript object
    let yamlData: InspectITConfig = load(data) as InspectITConfig;

    // modify yml file such that ocelot agent collects spans for the right landscape
    yamlData.inspectit.tags.extra["explorviz.token.id"] = currentDebugRoom!.value;
    yamlData.inspectit.tags.extra["explorviz.token.secret"] = currentDebugRoom!.secret;
    yamlData.inspectit.tags.extra["service.name"] = currentDebugRoom!.projectName;
    yamlData.inspectit.tags.extra["landscape_token"] = currentDebugRoom!.value;
    yamlData.inspectit.tags.extra["token_secret"] = currentDebugRoom!.secret;
    yamlData.inspectit.tags.extra["application_name"] = currentDebugRoom!.projectName;
    const newYamlText = dump(yamlData);  
    // Now write the modified YAML back to the same file
    fs.writeFileSync(filePath.fsPath, newYamlText, 'utf8');


    // attach inspectIT Ocelot to debugged application
    await checkJavaInstalled();

    await attachOcelotAgent();

    isInspectITClientAttached = true;
    vscode.window.showInformationMessage("InspectIT Ocelot client attached!");
  } catch (error: any) {
    vscode.window.showErrorMessage("Error during attachment of inspectIT Ocelot client: " + error.message);
  }
}

function checkForDebugSession() {
  if(vscode.debug.activeDebugSession) {
    console.log("Started debug session");

    // show command in command palette (see package.json)
    vscode.commands.executeCommand(
      "setContext",
      "explorviz.showStartVisualizationForDebugSessionCommand",
      true
    );

    // Needed to adapt the "ExplorViz: Session Information"-webview to include debug session related UI
    isInDebugSession = true;
    sessionViewProvider.refreshHTML();
  }
}

async function askUserForJDKPath(): Promise<string | undefined> {
  const options: vscode.OpenDialogOptions = {
      canSelectMany: false,
      canSelectFolders: true, // Allow folder selection
      canSelectFiles: false, // Disallow file selection
      openLabel: "Select JDK Folder",
      title: "Select the folder containing your JDK installation",
  };

  const selectedFolder = await vscode.window.showOpenDialog(options);

  if (selectedFolder && selectedFolder.length > 0) {
      const jdkPath = selectedFolder[0].fsPath;
      const javaBinPath = path.join(jdkPath, "bin");

      // Check if the selected folder contains the `bin` directory
      if (!javaBinPath || !javaBinPath.endsWith("bin")) {
          vscode.window.showErrorMessage(
              "The selected folder does not appear to be a valid JDK installation. Please select the correct folder."
          );
          return undefined;
      }

      vscode.window.showInformationMessage(`JDK Path Selected: ${jdkPath}`);
      return javaBinPath;
  } else {
      vscode.window.showWarningMessage("No folder was selected.");
      return undefined;
  }
}

function onClickDebugRoom() {
  //vscode.window.showInformationMessage(`Please open the workspace ${} under its commit ${}`)
}



// #endregion







// TODOS:

// TODO: manchmal wird PID zum attachen nicht gefunden -> explorviz extension muss vor dem starten der debug session geöffnet worden sein
// TODO: um es den user einfacher zu machen sollte es ein menü in der explorviz extension geben, in welcher der debugger ebenfalls gestartet werden kann
// - Color rooms that contain the commit id of your current active workspace in a separate color
// TODO: accumulate spans from one breakpoint to the next breakpoint (replace timeline with breakpoint line)
//       => we need to adapt the span service TimestampLoader for an additional query statement to fetch the spans between newest and oldest timestamp
// - Implement save breakpoint feature
// - implement debug session replay and notify user when different variable values appear for the variables that got saved in a saved breakpoint
// - fix a buggy behaviour after you start a debug session before explorviz extension got activated (by clicking its icon in the activity bar)