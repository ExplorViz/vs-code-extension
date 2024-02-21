//@ts-check

import { currentMode } from '../src/extension';
import { ModesEnum } from '../src/types';

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (data) {
      if (data.event) {
        let iframe = document.getElementById("explorviz-iframe");

        if (iframe && currentMode === ModesEnum.crossWindow) {
          // @ts-ignore
          const iFrameWindow = iframe.contentWindow;
          // forward extension request to iframe
          iFrameWindow.postMessage(data.data, data.targetOrigin);
        }
      } else {
        if (currentMode === ModesEnum.crossWindow) {
          // forward iframe request to extension
          forwardToExtension(data);
        }
      }
    }
  });

  /**
   * Forward data from IFrame to extension.
   * @param {*} data  Data, which shall be forwarded
   */
  function forwardToExtension(data) {
    vscode.postMessage(data);
  }
})();
