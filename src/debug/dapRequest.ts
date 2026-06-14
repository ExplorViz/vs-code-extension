import * as vscode from "vscode";

export async function dapRequest<TResponse>(
  session: vscode.DebugSession,
  command: string,
  args?: unknown
): Promise<TResponse> {
  return session.customRequest(command, args) as Promise<TResponse>;
}
