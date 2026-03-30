//@ts-check

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  const connectToBackendButton = document.querySelector('#explorviz-connect-to-backend-button');
  if (connectToBackendButton) {
    connectToBackendButton.addEventListener("click", () => {
      executeExtensionCommand("explorviz-vscode-extension.connectToBackend");
    });
  }

  const disconnectFromBackendButton = document.querySelector('#explorviz-disconnect-from-backend-button');
  if (disconnectFromBackendButton) {
    disconnectFromBackendButton.addEventListener("click", () => {
      executeExtensionCommand("explorviz-vscode-extension.disconnectFromBackend");
    });
  }

  const cancelConnectionSetupButton = document.querySelector('#explorviz-cancel-connection-setup-button');
  if (cancelConnectionSetupButton) {
    cancelConnectionSetupButton.addEventListener("click", () => {
      executeExtensionCommand("explorviz-vscode-extension.cancelConnectionSetup");
    });
  }

  const createLandscapeForDebugSessionButton = document.querySelector('#explorviz-create-landscape-for-debug-session-button');
  if (createLandscapeForDebugSessionButton) {
    createLandscapeForDebugSessionButton.addEventListener("click", () => {
      executeExtensionCommand("explorviz-vscode-extension.createLandscapeForDebugSession");
    });
  }

  const loadDebugSessionLandscapesButton = document.querySelector('#explorviz-load-debug-session-landscapes-button');
  if (loadDebugSessionLandscapesButton) {
    loadDebugSessionLandscapesButton.addEventListener("click", () => {
      executeExtensionCommand("explorviz-vscode-extension.loadDebugSessionLandscapes");
    });
  }

  const visualizeDebugSessionButton = document.querySelector('#explorviz-visualize-debug-session-button');
  if (visualizeDebugSessionButton) {
    visualizeDebugSessionButton.addEventListener("click", () => {
      executeExtensionCommand("explorviz-vscode-extension.startVisualizationForDebugSession");
    });
  }

  const deactivateButton = document.querySelector('#explorviz-deactivate-button');
  if (deactivateButton) {
    deactivateButton.addEventListener("click", () => {
      executeExtensionCommand("explorviz-vscode-extension.stopVisualizationForDebugSession");
    });
  }

  const saveCurrentStateButton = document.querySelector('#explorviz-save-current-state-button');
  if (saveCurrentStateButton) {
    saveCurrentStateButton.addEventListener("click", () => {
      executeExtensionCommand("explorviz-vscode-extension.saveBreakpoint");
    });
  }

  const deleteVariablesFromDebugWatchButton = document.querySelector('#explorviz-remove-all-variables-from-debug-watch-button');
  if (deleteVariablesFromDebugWatchButton) {
    deleteVariablesFromDebugWatchButton.addEventListener("click", () => {
      executeExtensionCommand("explorviz-vscode-extension.removeAllVariablesFromDebugWatch");
    });
  }

  const connectToVizButton = document.querySelector(
    "#explorviz-join-room-button"
  );

  if (connectToVizButton) {
    connectToVizButton.addEventListener("click", () => {
      executeExtensionCommand("explorviz-vscode-extension.connectToRoom");
    });
  }

  const disconnectFromVizButton = document.querySelector(
    "#explorviz-disconnect-room-button"
  );

  if (disconnectFromVizButton) {
    disconnectFromVizButton.addEventListener("click", () => {
      executeExtensionCommand(
        "explorviz-vscode-extension.disconnectFromRoom"
      );
    });
  }

  const createPPButton = document.querySelector("#explorviz-create-pp-button");

  if (createPPButton) {
    createPPButton.addEventListener("click", () => {
      executeExtensionCommand(
        "explorviz-vscode-extension.createPairProgramming"
      );
    });
  }

  const joinPPButton = document.querySelector("#explorviz-join-pp-button");

  if (joinPPButton) {
    joinPPButton.addEventListener("click", () => {
      executeExtensionCommand("explorviz-vscode-extension.joinPairProgramming");
    });
  }

  const openVizButton = document.querySelector("#explorviz-open-viz-button");

  if (openVizButton) {
    openVizButton.addEventListener("click", () => {
      executeExtensionCommand("explorviz-vscode-extension.webview");
    });
  }

  // Handle messages sent from the extension to the webview
  window.addEventListener("message", (event) => {
    const message = event.data; // The json data that the extension sent
    switch (message.type) {
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

 // Event delegation: listen to clicks on the tbody of the table within .table-wrapper
 const wrapper = document.querySelector("#table-wrapper");
 if(wrapper) {
  const trs = wrapper.querySelectorAll('tr');
  trs.forEach(tr => {
    tr.addEventListener('click', () => {
      const tokenValue = tr.getAttribute("data-token-value");
      const commitId = tr.getAttribute("data-commit-id");
      executeExtensionCommand("explorviz-vscode-extension.updateWebViewForJoinedDebugSessionLandscape", { tokenValue, commitId });
    });
   });
 }
 
})();
