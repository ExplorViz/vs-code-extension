import * as vscode from "vscode";

export interface ExtensionConfig {
  backendHttp?: string;
  frontendHttp?: string;
}

export function loadExtensionConfig(): ExtensionConfig {
  const settings = vscode.workspace.getConfiguration("explorviz");

  const configuredBackendUrl = settings.get<string>("backendUrl");
  const configuredFrontendUrl = settings.get<string>("frontendUrl");

  const envBackendUrl = process.env.VS_CODE_BACKEND_URL;
  const envFrontendUrl = process.env.FRONTEND_URL;

  if (envBackendUrl) {
    console.debug(
      `ATTENTION: Setting 'backendUrl' has no effect, since it is overridden by environment variable 'VS_CODE_BACKEND_URL' with value: ${envBackendUrl}`
    );
  }

  if (envFrontendUrl) {
    console.debug(
      `ATTENTION: Setting 'frontendUrl' has no effect, since it is overridden by environment variable 'FRONTEND_URL' with value: ${envFrontendUrl}`
    );
  }

  return {
    backendHttp: envBackendUrl ?? configuredBackendUrl,
    frontendHttp: envFrontendUrl ?? configuredFrontendUrl,
  };
}