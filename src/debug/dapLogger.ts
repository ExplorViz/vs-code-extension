import * as vscode from "vscode";

export function registerDapLogger(context: vscode.ExtensionContext): void {
  const channel = vscode.window.createOutputChannel("ExplorViz DAP");
  context.subscriptions.push(channel);

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterTrackerFactory("java", {
      createDebugAdapterTracker(session: vscode.DebugSession) {
        channel.appendLine(`=== Session started: ${session.name}`);
        return {
          onWillReceiveMessage: (m) => logMessage(channel, "VS Code    -> java-debug", m),
          onDidSendMessage: (m) => logMessage(channel, "java-debug -> VS Code   ", m),
          onError: (e) => channel.appendLine(`ERROR: ${e.message}`),
          onExit: (code) => channel.appendLine(`=== Debug adapter exited (code ${code})`),
        };
      },
    })
  );
}

function logMessage(channel: vscode.OutputChannel, direction: string, m: any): void {
  const time = new Date().toISOString().slice(11, 23);
  const name = m?.command ?? m?.event ?? "";
  const status = m?.type === "response" ? (m.success ? " ok" : " FAILED") : "";
  const details = JSON.stringify(m?.arguments ?? m?.body ?? {});
  channel.appendLine(`${time}  ${direction}  ${m?.type} ${name}${status}  ${details.slice(0, 300)}`);
}