"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendClient = void 0;
const vscode = __importStar(require("vscode"));
const socket_io_client_1 = __importDefault(require("socket.io-client"));
const emitEvent_1 = require("./emitEvent");
class BackendClient {
    constructor(config, state, sessionViewProvider) {
        this.config = config;
        this.state = state;
        this.sessionViewProvider = sessionViewProvider;
    }
    connect() {
        console.debug("connectWithBackendSocket");
        if (!this.config.backendHttp) {
            vscode.window.showErrorMessage(`VS Code Backend Service URL not configured: ${this.config.backendHttp}`);
            return;
        }
        if (this.socket && !this.socket.disconnected) {
            return;
        }
        this.socket = (0, socket_io_client_1.default)(this.config.backendHttp, {
            path: "/v2/ide/",
            query: { client: "extension" },
        });
        this.registerSocketListeners(this.socket);
    }
    disconnect() {
        if (!this.socket) {
            return;
        }
        this.socket.disconnect();
        this.state.backend.isConnected = this.socket.connected;
        this.state.backend.isLoading = false;
        this.sessionViewProvider.refreshHTML();
    }
    cancelConnectionSetup() {
        this.disconnect();
    }
    isConnected() {
        return this.socket?.connected ?? false;
    }
    isDisconnected() {
        return !this.socket || this.socket.disconnected;
    }
    async emit(eventName, validator, ...payload) {
        if (!this.socket) {
            return undefined;
        }
        return (0, emitEvent_1.emitEvent)(this.socket, eventName, validator, ...payload);
    }
    registerSocketListeners(socket) {
        socket.on("connect", () => {
            this.state.backend.isConnected = socket.connected;
            this.state.backend.isLoading = false;
            this.sessionViewProvider.refreshHTML();
        });
        socket.on("disconnect", () => {
            this.state.backend.isConnected = socket.connected;
            this.state.backend.isLoading = false;
            this.sessionViewProvider.refreshHTML();
        });
        socket.on("connect_error", (error) => {
            const oldIsConnected = this.state.backend.isConnected;
            const oldIsLoading = this.state.backend.isLoading;
            this.state.backend.isConnected = socket.connected;
            this.state.backend.isLoading = socket.active;
            if (oldIsConnected !== this.state.backend.isConnected ||
                oldIsLoading !== this.state.backend.isLoading) {
                this.sessionViewProvider.refreshHTML();
            }
            console.debug(error.message);
        });
        socket.on("updates-debug-room-list", (debugRoomList) => {
            this.state.rooms.currentDebugRooms = debugRoomList;
            this.sessionViewProvider.refreshHTML();
        });
    }
}
exports.BackendClient = BackendClient;
//# sourceMappingURL=backendClient.js.map