//@ts-check

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  window.addEventListener("message", (event) => {
    const payload = event.data;
    if (payload) {
      if (payload.event) {
        let iframe = document.getElementById("explorviz-iframe");

        if (iframe) {
          // @ts-ignore
          const iFrameWindow = iframe.contentWindow;
          // forward extension request to iframe
          iFrameWindow.postMessage(payload.data, "http://localhost:4200");
        }
      } else {
        // forward iframe request to extension
        forwardToExtension(payload);
      }
    }
  });

  function forwardToExtension(data) {
    vscode.postMessage(data);
  }
})();
