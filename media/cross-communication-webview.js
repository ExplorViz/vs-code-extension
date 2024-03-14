//@ts-check

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (data) {
      let roomId = document.getElementById("roomId");
      if (roomId === null) {
      if (data.event) {
        let iframe = document.getElementById("explorviz-iframe");

        if (iframe) {
          // @ts-ignore
          const iFrameWindow = iframe.contentWindow;
          // forward extension request to iframe
          iFrameWindow.postMessage(data.data, data.targetOrigin);
        }
      } else {
        // forward iframe request to extension
        forwardToExtension(data);
      }
      }
    }
  });

  function forwardToExtension(data) {
    vscode.postMessage(data);
  }
})();
