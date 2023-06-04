//@ts-check

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  window.addEventListener("message", (event) => {
    const payload = event.data;
    if (payload) {
      forwardToExtension(payload);
    }
  });

  function forwardToExtension(data) {
    vscode.postMessage(data);
  }
})();
