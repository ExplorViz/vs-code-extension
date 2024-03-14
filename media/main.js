//@ts-check

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

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

  function executeExtensionCommand(stringCommand) {
    vscode.postMessage({
      type: "executeExplorVizCommand",
      command: stringCommand,
    });
  }
})();
