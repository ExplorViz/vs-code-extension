import * as vscode from "vscode";
import { ExtensionState } from "../state/extensionState";
import { SessionViewProvider } from "../SessionViewProvider";
import { getVariablesFromCurrentEditor } from "./variableTokenScanner";
import { DebugProtocol } from "@vscode/debugprotocol";
import { dapRequest } from "./dapRequest";
import { areRecommendedWorkspaceSettingsActive } from "../settings/recommendedWorkspaceSettings";

export function registerDebugSessionListeners(
  context: vscode.ExtensionContext,
  state: ExtensionState,
  sessionViewProvider: SessionViewProvider
): void {
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(() => {
      console.debug("Started debug session");
      state.debug.isInDebugSession = true;
      state.debug.debugRunId = crypto.randomUUID();
      state.debug.recommendedSettingsAtDebugStart =
        areRecommendedWorkspaceSettingsActive() ? "active" : "inactive";
      vscode.commands.executeCommand("setContext", "explorviz.showSaveCurrentStateForMarkedVariablesCommand", true);
      sessionViewProvider.refreshHTML();
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession(() => {
      state.debug.isInDebugSession = false;
      state.debug.debugRunId = undefined;
      state.debug.isDebugSessionStopped = false;
      state.debug.stoppedDebugSession = undefined;
      state.debug.stoppedDebugThreadId = undefined;
      state.debug.recommendedSettingsAtDebugStart = "unknown";

      sessionViewProvider.refreshHTML();
    })
  );

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterTrackerFactory("java", {
      createDebugAdapterTracker(session: vscode.DebugSession) {
        return {
          onWillReceiveMessage: (m) => {

            if (m?.type === "request" && m?.command === "initialize") {
              state.debug.capabilities = {
                supportsVariableType: (m.arguments as DebugProtocol.InitializeRequestArguments)?.supportsVariableType ?? false,
              };
              return;
            }

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
                state.debug.isDebugSessionStopped = true;
                state.debug.stoppedDebugSession = session;
                state.debug.stoppedDebugThreadId = m?.body?.threadId;
                if (
                  m?.body?.reason === "breakpoint" ||
                  m?.body?.reason === "data breakpoint" ||
                  m?.body?.reason === "function breakpoint" ||
                  m?.body?.reason === "instruction breakpoint"
                ) {
                  getVariablesFromCurrentEditor(state, vscode.window.activeTextEditor);
                }
                sessionViewProvider.refreshHTML();
                break;
            }
          },
        };
      },
    })
  );
}


export async function restoreStoppedDebugStateIfPossible(
  state: ExtensionState,
  sessionViewProvider: SessionViewProvider
): Promise<void> {
  const session = vscode.debug.activeDebugSession;

  if (!session) {
    return;
  }

  state.debug.isInDebugSession = true;
  state.debug.stoppedDebugSession = session;
  state.debug.recommendedSettingsAtDebugStart = "unknown";

  const threadId =
    getThreadIdFromActiveStackFrame() ??
    await inferStoppedThreadIdFromDebugAdapter(session);

  if (threadId === undefined) {
    state.debug.isDebugSessionStopped = false;
    state.debug.stoppedDebugThreadId = undefined;
    sessionViewProvider.refreshHTML();
    return;
  }

  state.debug.isDebugSessionStopped = true;
  state.debug.stoppedDebugThreadId = threadId;

  await getVariablesFromCurrentEditor(state, vscode.window.activeTextEditor);

  sessionViewProvider.refreshHTML();
}

function getThreadIdFromActiveStackFrame(): number | undefined {
  const item = vscode.debug.activeStackItem;

  if (item instanceof vscode.DebugStackFrame) {
    return item.threadId;
  }

  return undefined;
}

async function inferStoppedThreadIdFromDebugAdapter(
  session: vscode.DebugSession
): Promise<number | undefined> {
  let threadsResponse: DebugProtocol.ThreadsResponse["body"];
  try {
    threadsResponse = await dapRequest<DebugProtocol.ThreadsResponse["body"]>(session, "threads");
  } catch {
    return undefined;
  }
  

  for (const thread of threadsResponse.threads) {
    try {
      const stackTraceResponse =
        await dapRequest<DebugProtocol.StackTraceResponse["body"]>(
          session, 
          "stackTrace", 
          {
            threadId: thread.id,
            startFrame: 0,
            levels: 1,
          } satisfies DebugProtocol.StackTraceArguments
        );

      if (stackTraceResponse.stackFrames.length > 0) {
        return thread.id;
      }
    } catch {
      // If there are active threads or if the adapter is currently unable to provide a stack trace,
      // the stack trace may fail. In that case, we'll try the next thread.
    }
  }

  return undefined;
}

