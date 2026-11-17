# ExplorViz VS Code Extension

## Setup

After cloning the repository, install the project dependencies:

```bash
npm ci
```

This project uses npm and `package-lock.json`; do not use pnpm or yarn here. This requires Node.js and npm.

To add a dependency, use `npm install <package>` (or `npm install --save-dev <package>` for a development dependency). npm updates `package.json` and `package-lock.json` together. If you edit `package.json` manually, run `npm install --package-lock-only` to update the lockfile. Once the lockfile is up to date, use `npm ci` to install the exact locked dependency versions.

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

The `code` command must be available on your PATH.

## Debug a Java Project Using ExplorViz

Open the Java project you want to debug in the VS Code window running the ExplorViz extension. The project must provide a suitable VS Code debug configuration.

Then open the Command Palette using **Cmd+Shift+P** (macOS) or **Ctrl+Shift+P** (Windows/Linux) and select **ExplorViz: Start Debugging**.

VS Code starts the debugging workflow for the currently opened project. The ExplorViz webview does not need to be open for this.