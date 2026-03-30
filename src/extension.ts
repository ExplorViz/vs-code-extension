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
  StateValue,
  VariableEntry,
  ClassEntry
} from "./types";
import { ExplorVizApiCodeLens } from "./ExplorVizApiCodeLens";
import { buildClassMethodArr } from "./buildClassMethod";
import { goToLocationsByMeshId } from "./goToLocationByMeshId";
import { SessionViewProvider } from "./SessionViewProvider";
import { IFrameViewContainer } from "./IFrameViewContainer";
import { API, GitExtension, Repository } from "./api/git";
import { debug } from "console";

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

//Represents a variable as code inside a document
interface VariableSymbol{
  line: number;
  beginChar: number;
  endChar: number;
  name: string;
  documentUri: vscode.Uri;
}

// map for storing all variables found in the current editor
const variableTokens: Map<number, VariableSymbol[]> = new Map(); // line of the variable code -> VariableSymbol[] 


// code lenses for showing the explorvizbutton in editor
let debugCodelenses : vscode.CodeLens[] = [];
// emitter for notifying codeLensProvider about in the code lenses
const debugCodeLensEmitter = new vscode.EventEmitter<void>();


// Map for storing the variables with their values, that are searched during debugging 
export const debugVariableWatchlist : Map<string, Set<string>> = new Map(); // variableName -> Set("DefinitionFileName/DefinitionLine")
const debugVariableStateValues : Map<string, Map<string, StateValue[]>> = new Map(); // variableName -> (className -> [{objRreference, value, type}])

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
let stoppedDebugSession: vscode.DebugSession | undefined = undefined;
let stoppedDebugThreadId: number | undefined = undefined;

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

  if (envFrontendUrl) {
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
    
    // find and store all variables in file 
    getVariablesfromCurrentEditor(e);
  });

   vscode.window.onDidChangeTextEditorSelection(
    (e: vscode.TextEditorSelectionChangeEvent) => {
      const startLine = e.textEditor.selection.start.line;
      const startChar = e.textEditor.selection.start.character;

      debugCodelenses = [];
      if (isDebugSessionStopped){
        
        
        // if we are at breakpoint and cursor is at a variable, show the explorvizbutton for adding variable to debug watch
        if (e.textEditor.selection.isEmpty && variableTokens.has(startLine)){
          const varsInLine = variableTokens.get(startLine)!;
          for(const [index, variable] of varsInLine.entries()){
            if(startChar >= variable.beginChar && startChar <= variable.endChar){
              // update the codeLenses to show the Explorvizbutton for marking variables
              debugCodelenses = [
                new vscode.CodeLens(
                    new vscode.Range(startLine, startChar, startLine, startChar),
                    {
                        title: '🌍',
                        command: 'explorviz-vscode-extension.addVariableToDebugWatch',
                        arguments: [variable.line, index]
                    }
                )
              ];
              break;
        }}}

      }
      // notify codelens Provider about the change
      debugCodeLensEmitter.fire();
    
      
      if (pairProgrammingSessionName) {
        //startLine = e.textEditor.selection.start.line;
        //startChar = e.textEditor.selection.start.character;
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
      
    });



  // Seitenleiste einrichten
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
        //console.log(`> ${JSON.stringify(m, undefined, 2)}`);
        if(m?.command) {
            switch(m.command) {
              case "continue":
                isDebugSessionStopped = false;
                sessionViewProvider.refreshHTML();
                stoppedDebugSession = undefined;
                stoppedDebugThreadId = undefined;
                break;
              case "terminate":
                isDebugSessionStopped = false;
                sessionViewProvider.refreshHTML();
                stoppedDebugSession = undefined;
                stoppedDebugThreadId = undefined;
                break;
              case "disconnect":
                isDebugSessionStopped = false;
                sessionViewProvider.refreshHTML();
                stoppedDebugSession = undefined;
                stoppedDebugThreadId = undefined;
                break;
            }
        }
        },
        onDidSendMessage: m => {
        //console.log(`< ${JSON.stringify(m, undefined, 2)}`);

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
                  stoppedDebugSession = session;
                  stoppedDebugThreadId = m?.body?.threadId;

                  sessionViewProvider.refreshHTML();
                  
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
  registerCommandAddVariableToDebugWatch();
  registerCommandRemoveAllVariablesFromDebugWatch();

  registerDebugCodeLensProvider();

  // #endregion


  // https://github.com/microsoft/vscode/tree/main/extensions/git
  const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports;
  try {
    git = gitExtension?.getAPI(1); 
  } catch (error) {
    console.log(error);
  }

  // in case editor is already open when extension is activated
  // find variables in file
  getVariablesfromCurrentEditor(vscode.window.activeTextEditor);

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

// nimmmt liste von Pfaden, ersetzt gleiche teile durch "..." und gibt gekürzte liste zurück
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
    async () => {

      // checking if setup is correct
      if(!currentDebugRoom) {
        vscode.window.showInformationMessage("Please join a debug room!");
        return;
      }
      if(!isInspectITClientAttached) {
        vscode.window.showInformationMessage("Please initiate monitoring for this debug session!");
        return;
      }
      if(!isDebugSessionStopped || stoppedDebugSession === undefined|| stoppedDebugThreadId === undefined) {
        vscode.window.showInformationMessage(`Variable savement failed! Debug Session is not stopped!`);
        return;
      }
      const isFrontendConnected = await emitEvent<boolean, [string]>(
        'check-frontend-connection',
        (b): b is boolean => typeof b === 'boolean',
        frontendHttp!
      );
      if(isFrontendConnected === undefined || isFrontendConnected === false) {
        vscode.window.showErrorMessage("Something went wrong while checking the connection to the frontend!");
        return;
      }

      // store timestamp and current variable values
      console.log("Saving current state");
      const timestampInNano = BigInt(Date.now()) * 1_000_000n;
      await searchVariablesinCurrentStackFrame(stoppedDebugSession, stoppedDebugThreadId);
      
      // convert the stored variable state map into a object List that can be send over a socket 
      const emittedValues :VariableEntry[] = [];
      debugVariableStateValues.forEach(
        (classEntries, varName) =>{
          if(!classEntries || classEntries.size === 0) {
            // this variable was not found in any class
            return;
          }
          const variableEntry: VariableEntry = {
            varname: varName,
            classes: []
          };
          classEntries.forEach(
            (stateValues, className) => {
              const classEntry: ClassEntry = {
                className: className,
                values: stateValues
              };
              variableEntry.classes.push(classEntry);
            });
          emittedValues.push(variableEntry);
      });
      if(emittedValues.length === 0) {
        vscode.window.showInformationMessage("No variables found in the current stack frame to save!");
        return;
      }
      // send the variable state over a socket to the extension backend
      console.log("Emitting current state over socket: ", emittedValues);
      const saveSuccess = await emitEvent<boolean, [string, number, VariableEntry[]]>(
        "save-current-state",
        (payload): payload is boolean => typeof payload === "boolean",
        ...[currentDebugRoom!.value, Number(timestampInNano), emittedValues]
      );
      if (saveSuccess) {
        vscode.window.showInformationMessage("Current state has been saved!");
        console.log("Current state has been saved successfully!");
      } else {
        vscode.window.showErrorMessage("Unable to save current state!");
        console.error("Unable to save current state!");
      }
    }
  );
  extensionContext!.subscriptions.push(saveBreakPoint);
}

function registerCommandAddVariableToDebugWatch() {

  const debugWatchCommand = vscode.commands.registerCommand('explorviz-vscode-extension.addVariableToDebugWatch', async (line : number, index : number) => {
    // line is the line of the token that was marked index is only importend if multiple variables are on the same line
    let variableToken = variableTokens.get(line)?.[index]!;
    
    // get the definition-token of the variable
    let definitions : {range:vscode.Range, uri:vscode.Uri}[] = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', variableToken?.documentUri, new vscode.Position(line, variableToken.beginChar));

    // to uniquely identify the variable, we use the document path + line number of its definition
    let variableTokenPath = path.join(path.basename(variableToken.documentUri.fsPath), definitions[0].range.start.line.toString()); 
    
    
    if(debugVariableWatchlist.has(variableToken?.name)){
      const variableDefinitions = debugVariableWatchlist.get(variableToken?.name)!;
      // if the variable is already in watchlist, remove it
      if(variableDefinitions.has(variableTokenPath)){
        variableDefinitions.delete(variableTokenPath);
        if(variableDefinitions.size === 0){
          debugVariableWatchlist.delete(variableToken?.name);
          debugVariableStateValues.delete(variableToken?.name);
        }
        vscode.window.showInformationMessage(`Variable ${variableToken?.name} is unmarked!`);
        console.log(`Variable ${variableToken?.name} is unmarked!`);
      }// if variable with same name is in watchlist, add new definition path
      else{
        debugVariableWatchlist.get(variableToken?.name)!.add(variableTokenPath);
        vscode.window.showInformationMessage(`Variable ${variableToken?.name} is marked!`);
        console.log(`Variable ${variableToken?.name} is marked!`);
      }
    }// variable not in watchlist, add it
    else{
      debugVariableWatchlist.set(variableToken?.name, new Set([variableTokenPath]));
      debugVariableStateValues.set(variableToken?.name, new Map());
      vscode.window.showInformationMessage(`Variable ${variableToken?.name} is marked!`);
      console.log(`Variable ${variableToken?.name} is marked!`);
    }
    console.log("Current debugVariableWatchlist: ", debugVariableWatchlist);

    sessionViewProvider.refreshHTML();
    
  });
  // Command for adding variable to debug watch
  extensionContext!.subscriptions.push(debugWatchCommand);
}

function registerCommandRemoveAllVariablesFromDebugWatch() {
  const removeAllVariablesFromDebugWatchCommand = vscode.commands.registerCommand('explorviz-vscode-extension.removeAllVariablesFromDebugWatch', () => {
    debugVariableWatchlist.clear();
    debugVariableStateValues.clear();
    vscode.window.showInformationMessage(`All variables are unmarked!`);
    console.log(`All variables are unmarked!`);
    sessionViewProvider.refreshHTML();
  });
  extensionContext!.subscriptions.push(removeAllVariablesFromDebugWatchCommand);
}

function registerDebugCodeLensProvider(){
  // CodeLens Provider for showing "add to debug watch button" (the globe icon)
  // listens for changes from the emitter
  let debugCodeLensProvider: vscode.CodeLensProvider = {
    provideCodeLenses(document) {
      return debugCodelenses;
  },
    onDidChangeCodeLenses: debugCodeLensEmitter.event
  };

  extensionContext!.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: 'file', language: 'java' }, debugCodeLensProvider)
  );
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

      const ackPromise1 = emitEvent<boolean, [string]>(
        'check-frontend-connection',
        (b): b is boolean => typeof b === 'boolean',
        frontendHttp!
      );
      const isFrontendConnected = await ackPromise1;
      
      if(isFrontendConnected === undefined || isFrontendConnected === false) {
        vscode.window.showErrorMessage("Something went wrong while checking the connection to the frontend!");
        return;
      }

      const alias = debugSessionName;
      const projectName = workspaceFolder.name;
      const commitId = currentCommit;

      const ackPromise2 = emitEvent<{value: string; secret: string;}, [string, string, string]>(
        'create-landscape',
        (p): p is {value: string; secret: string;} => 
          typeof p === 'object' && p !== null &&
          'value' in p && typeof p.value === 'string' &&
          'secret' in p && typeof p.secret === 'string',
        ...[alias, projectName, commitId]
      );

      const tokenData = await ackPromise2;

      if(tokenData === undefined) {
        vscode.window.showErrorMessage("Unexpected error while creating debug room!");
        return;
      }

      currentDebugRoom = {
        value: tokenData.value,
        secret: tokenData.secret,
        alias: alias,
        projectName: projectName,
        commitId: commitId
      };
      vscode.commands.executeCommand('explorviz-vscode-extension.loadDebugSessionLandscapes');
      vscode.window.showInformationMessage(`The debug room (${currentDebugRoom.alias}) has been successfully created!`);
    }
  );
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
    }
  );
  extensionContext!.subscriptions.push(cancelConnectionSetup);
}

function registerCommandLoadDebugSessionLandscapes() {
  const loadDebugSessionLandscapes = vscode.commands.registerCommand(
    "explorviz-vscode-extension.loadDebugSessionLandscapes",
    async () => {

      if (!socket || socket.disconnected) {
        vscode.window.showErrorMessage(
          `You must first connect to the backend!`
        );
        return;
      }

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

      const ackPromise = emitEvent<DebugRoomList>(
        "load-debug-room-list",
        isValidDebugRoomList
      );

      const debugRoomList = await ackPromise;

      if (debugRoomList !== undefined) {
        currentDebugRooms = debugRoomList;
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
    const ocelotJarPath = vscode.Uri.joinPath(ocelotPath, "inspectit-ocelot-agent-2.7.1.jar");
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
  // the feature is currently disabled (commented out) beacause the InspectIt Ocelot agent clashes with the Debugging in VS Code

  //
  // const debuggedAppPID = await  getDebuggedApplicationPID();
  //   if(!debuggedAppPID) {
  //     vscode.window.showErrorMessage("Unable to find the debuggee PID. Please restart the debugger and try again! (Ctrl + Shift + F5)");
  //     return;
  //   }

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
    // await checkJavaInstalled();

    // await attachOcelotAgent();

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

/*async function askUserForJDKPath(): Promise<string | undefined> {
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
}*/


/**
 * Emit an event via socket and wait for an ack with a timeout.
 * If a type guard is provided, the ack payload is validated with it.
 * Otherwise the raw payload is returned as T (or undefined on timeout/invalid).
 */
function emitEvent<T, A extends any[] = []>(
  eventName: string,
  validator?: (p: unknown) => p is T,
  ...payload: [...A]
): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    if (!socket || socket.disconnected) {
      resolve(undefined);
      return;
    }

    let ackCalled = false;

    // emit with payload and ack callback
    socket.emit(eventName, ...payload, (ackPayload?: unknown) => {
      ackCalled = true;

      if (validator) {
        // use provided type guard
        if (validator(ackPayload)) {
          resolve(ackPayload);
        } else {
          resolve(undefined);
        }
      } else {
        // no validator: return ack payload as-is (or undefined)
        if (typeof ackPayload === "undefined") {
          resolve(undefined);
        } else {
          resolve(ackPayload as T);
        }
      }
    });

    // fallback timeout
    setTimeout(() => {
      if (!ackCalled) {
        resolve(undefined);
      }
    }, ackTimeoutMs);
  });
}


// ########### BEGIN Variable State Management and Search #############

// searches at the current active stack-frame of the given thread for the variables in debugSearchedVariables
// writes the found variable values in the debugSearchedVariables map
// assumes the current active stack-frame is on top of the stack-trace
async function searchVariablesinCurrentStackFrame(session : vscode.DebugSession, threadId: number){

  debugVariableStateValues.forEach( (variableStates, _) => {
    variableStates.clear();
  });
  console.log("Cleared debugVariableStateValues: ", debugVariableStateValues);
  // get all steck-frames for the given thread
  const stackTrace = await session.customRequest('stackTrace', {'threadId' : threadId});

  console.log("Searching Variables: ", debugVariableStateValues, " in Stackframe: ", stackTrace.stackFrames[0]);
  // search variables for the active stack-frame (top of the stack-trace)
  await searchVariablesInStackFrame(session, {stackFrameName: stackTrace.stackFrames[0].name,  stackFrameId: stackTrace.stackFrames[0].id});
  
  console.log("Found Variables: ", debugVariableStateValues);
}

enum VariableScopeIdentifier{
  local = -1, // variables scope belongs to the function where the debugger has stopped
  param = -2, // variables scope belongs to the parameters of the function where the debugger has stopped
  static = -3,
  global = -4, // variables scope belongs to the global context
  this = -5 // variables scope belongs to the current instance of the class with the function the debugger has stopped in
}

// searches all scopes of the given stack-frame for the variables in debugSearchedVariables
// writes the found variable values in the debugSearchedVariables map
async function searchVariablesInStackFrame(session: vscode.DebugSession, stackFrameInfo: {stackFrameName: string, stackFrameId: number}){
  // get all scopes for the given stack-frame
  const scopesResponse = await session.customRequest('scopes', {'frameId' : stackFrameInfo.stackFrameId});

  console.log("Scopes in StackFrame: ", scopesResponse.scopes);

  const searchedScopes = ["local", "param", "static", "global", "this"];
  // search for variables in all scopes
  for(const scope of scopesResponse.scopes){
    // we want to later assign the variable value to the fitting class, so we need to understand the scopes
    // the following is a heuristic approach and might not work for every debugger implementation
    const lowScopeName = scope.name.toLowerCase();
    let heurScopeName = searchedScopes.find(s => lowScopeName.includes(s));
    switch(heurScopeName){
      case "local":
        // our scope name is the stackframe name
        await searchVariablesByVariableReference(session, {scopeName: stackFrameInfo.stackFrameName, variableReference: scope.variablesReference, scopeId: VariableScopeIdentifier.local});
        break;
      case "param":
        await searchVariablesByVariableReference(session, {scopeName: stackFrameInfo.stackFrameName, variableReference: scope.variablesReference, scopeId: VariableScopeIdentifier.param});
        break;
      case "static":
        break;
      case "global":
        break;
      case "this":
        // we extract the class name from the stackframe name (assuming format ClassName.methodName)
        await searchVariablesByVariableReference(session, {scopeName: stackFrameInfo.stackFrameName.split(".")[0], variableReference: scope.variablesReference , scopeId: VariableScopeIdentifier.this});
        break;
      default:
        console.log("Skipping Scope: ", scope);
        continue;
    }
  }

  // when multiple variables with the same name exist, ask the user which one to save
  for(const [varName, varInfo] of debugVariableStateValues){
    if(varInfo.size > 1){
      console.log("Variable ", varName, " found in multiple scopes: ", Array.from(varInfo.keys()));
      const items: vscode.QuickPickItem[] = Array.from(varInfo.keys()).map(scopeName => ({
        label: scopeName
      }));

      const selected = await vscode.window.showQuickPick(items, {
          canPickMany: true,
          title: 'Variable "' + varName + '" was found in multiple contexts. Which one should be saved?',
          placeHolder: 'Choose contexts...'
      });

      if (!selected) {
          return;
      }

      varInfo.forEach((_, scopeName) => {
          // if the scopeName is not selected, delete it from the varInfo
          if(!selected.find(item => item.label === scopeName)){
              varInfo.delete(scopeName);
          }
      });
    }
  }
}


// searches the given scope for the variables in debugSearchedVariables
// writes the found variable values in the debugSearchedVariables map
async function searchVariablesByVariableReference(session: vscode.DebugSession, scopeInfo: {scopeName: string, variableReference: number, scopeId: number}, visited = new Set<number>()){
  /* scopeInfo.variableReference and .scopeId are not the same thing!! variableReference is used by the Debugger to to fetch variable States it can change  
  within one Debug session and is not unique. ScopeID is a unique identifier for Scopes that we either genarate or is given by a InstanceId in case of ClassInstances
  */
  // get all variables for the given variable reference (scope)
  let variablesResponse : any = [];
  try{
    console.log("Searching for variables in scope ", scopeInfo.scopeName, " with variableReference ", scopeInfo.variableReference , "and scopeId ", scopeInfo.scopeId);
    variablesResponse = await session.customRequest('variables', {'variablesReference' : scopeInfo.variableReference});
    console.log("Variables in Scope ", scopeInfo.variableReference, ": ", variablesResponse.variables);
  }
  catch(error){
    console.error("Error while fetching variables for scope ", scopeInfo.scopeName, " with variableReference ", scopeInfo.variableReference, "and scopeId ", scopeInfo.scopeId, ": ", error);
    return;
  }

  for(const variable of variablesResponse.variables){
    // check if the variable is one of the searched variables
    if (debugVariableStateValues.has(variable.name)) {
      if(!debugVariableStateValues.get(variable.name)!.has(scopeInfo.scopeName)){
        debugVariableStateValues.get(variable.name)!.set(scopeInfo.scopeName, []);
      }
      // add the found value to the variable info in debugSearchedVariables
      debugVariableStateValues.get(variable.name)!.get(scopeInfo.scopeName)!.push({value : variable.value, type : variable.type, objReference: scopeInfo.scopeId});
      console.log("Found searched Variable ", variable.name, " with value ", variable.value, "and type ", variable.type);
    }
    // if the variable is a structured variable, search in its children as well (avoid cycles with visited set)
    if(variable.variablesReference > 0){
      const splittedValue = variable.value.split("@"); // the value of a Strctured variable looks like value = WelcomController@50 were 50 is the unique identifier for this welcomecontroller object
      const scopeIDContainer = splittedValue.length === 2 ? splittedValue[1] : undefined; 
      if(!scopeIDContainer) {continue;}
      let scopeID = Number(scopeIDContainer.match(/\d+/)[0]);
      console.log("Variable ", variable.name, " is a structured variable with unique identifier: ", scopeID);
      if(scopeID !== undefined && !visited.has(scopeID)){
        visited.add(scopeID);
        console.log("Searching in StructuredVariable ", variable.name);
        await searchVariablesByVariableReference(session, {scopeName: variable.type, variableReference: variable.variablesReference, scopeId: scopeID}, visited);
      }
    }
    //console.log("Visited now looks like: ", visited);
  }
}

// ########### END Variable State Management and Search #############

// searches the semantic tokens of the current editor for variable usages
// fills the variableTokens map accordingly 
async function getVariablesfromCurrentEditor(editor: vscode.TextEditor | undefined) {
  if (!editor || editor.document.languageId !== "java") {return;}
  // new editor = new tokens, oldd ones arent needed
  variableTokens.clear();

  const timeOutMs = 10000; // 10 seconds
  const startTime = Date.now();

  // retry getting tokens until JavaLS is started or timeout is reached
  while (true){
    try{
      await getTokensFromEditor(editor);
      return;
    } catch (error) {
      console.log("Waiting for JavaLS to start...");
      if(Date.now() - startTime < timeOutMs) {
        await new Promise(r => setTimeout(r, 1000));
      } else {
        console.log("JavaLS seems to not start. Is it installed?");
        return;
      }
    }
  }
}

// fills the variableTokens map with variable usages found in the semantic tokens of the given editor
async function getTokensFromEditor(editor: vscode.TextEditor) {
  console.log("Getting semantic tokens for document:", editor.document.uri.fsPath);
    
  const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
      "vscode.provideDocumentSemanticTokens",
      editor.document.uri
  );

  // the legend is used to decode the semantic token response
  const legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
    "vscode.provideDocumentSemanticTokensLegend",
    editor.document.uri
  );

  const data = tokens.data;

  // we only want variables and similar tokens
  const variableIndex = legend.tokenTypes.indexOf("variable");
  const propertyIndex = legend.tokenTypes.indexOf("property");
  const parameterIndex = legend.tokenTypes.indexOf("parameter");

  let line = 0;
  let char = 0;

  // go through every token in the file and add its info to variableTokens if it is a variable
  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaChar = data[i + 1];
    const tokenTypeIndex = data[i + 3];

    line += deltaLine;
    char = deltaLine === 0 ? char + deltaChar : deltaChar;

    // if the token is one we search for, decode its information and save it in the variableTokens map
    if(tokenTypeIndex === variableIndex || tokenTypeIndex === propertyIndex || tokenTypeIndex === parameterIndex) {
      const length = data[i + 2];
      const tokenModifierBits = data[i + 4];
      const range = new vscode.Range(line, char, line, char + length);

      const text = editor.document.getText(range);

      //console.log("Found Variable usage: ", {text, modifiers, line, char, length});

      const tokenArr = variableTokens.get(line) ?? [];
      tokenArr.push({
        line: line,
        beginChar: char,
        endChar: char + length,
        name: text,
        documentUri: editor.document.uri
      });
      variableTokens.set(line, tokenArr);

    }
  }
  //console.log("Semantic Variable Tokens for document: ", editor.document.uri.fsPath , "are: ", variableTokens);
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