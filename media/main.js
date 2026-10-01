//@ts-check

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  const commandByButtonId = {
    "explorviz-connect-to-backend-button": "explorviz-vscode-extension.connectToBackend",
    "explorviz-disconnect-from-backend-button": "explorviz-vscode-extension.disconnectFromBackend",
    "explorviz-cancel-connection-setup-button": "explorviz-vscode-extension.cancelConnectionSetup",
    "explorviz-create-landscape-for-debug-session-button": "explorviz-vscode-extension.createLandscapeForDebugSession",
    "explorviz-load-debug-session-landscapes-button": "explorviz-vscode-extension.loadDebugSessionLandscapes",
    "explorviz-visualize-debug-session-button": "explorviz-vscode-extension.startVisualizationForDebugSession",
    "explorviz-deactivate-button": "explorviz-vscode-extension.stopVisualizationForDebugSession",
    "explorviz-save-current-state-button": "explorviz-vscode-extension.saveCurrentStateForMarkedVariables",
    "explorviz-remove-all-variables-from-debug-watch-button": "explorviz-vscode-extension.removeAllVariablesFromDebugWatch",
    "explorviz-join-room-button": "explorviz-vscode-extension.connectToRoom",
    "explorviz-disconnect-room-button": "explorviz-vscode-extension.disconnectFromRoom",
    "explorviz-create-pp-button": "explorviz-vscode-extension.createPairProgramming",
    "explorviz-join-pp-button": "explorviz-vscode-extension.joinPairProgramming",
    "explorviz-open-viz-button": "explorviz-vscode-extension.webview"
  };

  const sessionContent = document.querySelector("#explorviz-session-content");
  if (sessionContent) {
    sessionContent.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const button = target.closest("button");
      const command = button && commandByButtonId[button.id];
      if (command) {
        executeExtensionCommand(command);
      }

      const row = target.closest("tr[data-token-value]");
      if (row) {
        executeExtensionCommand(
          "explorviz-vscode-extension.updateWebViewForJoinedDebugSessionLandscape",
          {
            tokenValue: row.getAttribute("data-token-value"),
            commitId: row.getAttribute("data-commit-id")
          }
        );
      }
    });
  }

  // Handle messages sent from the extension to the webview
  window.addEventListener("message", (event) => {
    const message = event.data; // The json data that the extension sent
    switch (message.type) {
      case "updateSessionContent": {
        if (sessionContent && typeof message.html === "string") {
          sessionContent.innerHTML = message.html;
        }
        break;
      }
      case "connectToViz": {
        executeExtensionCommand("explorviz-vscode-extension.connectToRoom");
        break;
      }
    }
  });

  function executeExtensionCommand(stringCommand, optional) {
    vscode.postMessage({
      type: "executeExplorVizCommand",
      command: stringCommand,
      optional: optional
    });
  }

  vscode.postMessage({ type: "ready" });
})();
