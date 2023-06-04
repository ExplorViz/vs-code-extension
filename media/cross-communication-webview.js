//@ts-check

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  window.addEventListener("message", (event) => {
    console.log("test cross webview");
    const message = event.data;
    switch (message.type) {
      case "connectToViz": {
        //forwardToExtension("explorviz-vscode-extension.connectToRoom");
        break;
      }
    }
  });

  function forwardToExtension(stringCommand) {
    console.log("executecommand");
    vscode.postMessage({
      type: "executeExplorVizCommand",
      command: stringCommand,
    });
  }
})();
