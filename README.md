
# ExplorViz VS Code Extension

## Start the Extension Without the Extension Host Debugger

Pressing **F5** or selecting **Run Extension** starts the Extension Development Host with an attached debugger. To start the extension in development mode **without** the debugger:

1. Stop any running F5 session by pressing **Shift+F5**.
2. Open a terminal in the root directory of this extension project.
3. Compile the extension and open a new VS Code window:

   ```bash
   npm run compile
   code --new-window --extensionDevelopmentPath="$PWD"
   ```

The new window loads the extension from the current project directory. Running an installed extension normally does not require an Extension Host debugger.

## Debug a Java Project Using ExplorViz

Open the Java project you want to debug in VS Code. The project must provide a suitable VS Code debug configuration.

Then open the Command Palette using **Cmd+Shift+P** and select **ExplorViz: Start Debugging**.

VS Code starts the debugging workflow for the currently opened project. The ExplorViz webview does not need to be open for this.
