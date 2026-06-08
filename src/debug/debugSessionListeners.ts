import * as vscode from "vscode";
import { ExtensionState } from "../state/extensionState";
import { SessionViewProvider } from "../SessionViewProvider";
import { getVariablesFromCurrentEditor } from "./variableTokenScanner";

export function registerDebugSessionListeners(
  context: vscode.ExtensionContext,
  state: ExtensionState,
  sessionViewProvider: SessionViewProvider
): void {
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(() => {
      console.debug("Started debug session");

      state.debug.isInDebugSession = true;
      sessionViewProvider.refreshHTML();
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession(() => {
      state.debug.isInDebugSession = false;
      state.debug.isDebugSessionStopped = false;
      state.debug.stoppedDebugSession = undefined;
      state.debug.stoppedDebugThreadId = undefined;

      sessionViewProvider.refreshHTML();
    })
  );

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterTrackerFactory("java", {
      createDebugAdapterTracker(session: vscode.DebugSession) {
        return {
          onWillReceiveMessage: (m) => {
            if (!m?.command) {
              return;
            }

            switch (m.command) {
              case "continue":
              case "terminate":
              case "disconnect":
                state.debug.isDebugSessionStopped = false;
                state.debug.stoppedDebugSession = undefined;
                state.debug.stoppedDebugThreadId = undefined;
                sessionViewProvider.refreshHTML();
                break;
            }
          },

          onDidSendMessage: (m) => {
            if (!m?.event) {
              return;
            }

            switch (m.event) {
              case "processid":
                if (m?.body?.processId) {
                  state.debug.debuggedAppPID = m.body.processId;
                }
                break;

              case "stopped":
                if (
                  m?.body?.reason === "breakpoint" ||
                  m?.body?.reason === "data breakpoint" ||
                  m?.body?.reason === "function breakpoint" ||
                  m?.body?.reason === "instruction breakpoint"
                ) {
                  state.debug.isDebugSessionStopped = true;
                  state.debug.stoppedDebugSession = session;
                  state.debug.stoppedDebugThreadId = m?.body?.threadId;
                  getVariablesFromCurrentEditor(state, vscode.window.activeTextEditor);
                  sessionViewProvider.refreshHTML();
                }
                break;
            }
          },
        };
      },
    })
  );

  if (vscode.debug.activeDebugSession) {
    console.debug("Debug session already active");

    state.debug.isInDebugSession = true;
    sessionViewProvider.refreshHTML();
  }
}