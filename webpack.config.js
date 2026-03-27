//@ts-check

"use strict";

const path = require("path");
const fs = require('fs');

// Ensure runtime proto files are copied into the dist folder so the extension
// can load them at runtime (we avoid adding extra webpack plugins).
const copyProtoDir = () => {
  const src = path.resolve(__dirname, 'src', 'debug', 'protos');
  const dest = path.resolve(__dirname, 'dist', 'protos');
  if (!fs.existsSync(src)) return;

  /**
   * @param {string} srcDir
   * @param {string} destDir
   * @returns {void}
   */
  const copyRecursive = (srcDir, destDir) => {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        copyRecursive(srcPath, destPath);
      } else {
        try {
          fs.copyFileSync(srcPath, destPath);
        } catch (e) {
          // ignore copy errors
        }
      }
    }
  };

  try {
    copyRecursive(src, dest);
    console.log('Copied protos to', dest);
  } catch (e) {
    console.warn('Failed to copy protos to dist:', e);
  }
};

// perform copy at config evaluation time
copyProtoDir();

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: "node", // VS Code extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
  mode: "none", // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

  entry: "./src/extension.ts", // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
  },
  externals: {
    vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    // modules added here also need to be added in the .vscodeignore file
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
    ],
  },
  devtool: "nosources-source-map",
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
};
module.exports = [extensionConfig];
