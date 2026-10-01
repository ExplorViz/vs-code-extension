"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommands = void 0;
const backendCommands_1 = require("./backendCommands");
const debugRoomCommands_1 = require("./debugRoomCommands");
const debugCommands_1 = require("./debugCommands");
const variableCommands_1 = require("./variableCommands");
const snapshotCommand_1 = require("./snapshotCommand");
function registerCommands(context, config, state, backendClient, sessionViewProvider, git) {
    (0, backendCommands_1.registerBackendCommands)(context, backendClient);
    (0, debugCommands_1.registerDebugCommands)(context);
    (0, debugRoomCommands_1.registerDebugRoomCommands)(context, config, state, backendClient, sessionViewProvider, git);
    (0, variableCommands_1.registerVariableCommands)(context, state, sessionViewProvider);
    (0, snapshotCommand_1.registerSnapshotCommand)(context, config, state, backendClient);
}
exports.registerCommands = registerCommands;
//# sourceMappingURL=registerCommands.js.map