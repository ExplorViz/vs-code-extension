import * as vscode from "vscode";
import io, { Socket } from "socket.io-client";
import { ExtensionConfig } from "../config/extensionConfig";
import { ExtensionState } from "../state/extensionState";
import { SessionViewProvider } from "../SessionViewProvider";
import { DebugRoomList } from "../debug/types";
import { emitEvent } from "./emitEvent";

export class BackendClient {
  private socket?: Socket;

  constructor(
    private readonly config: ExtensionConfig,
    private readonly state: ExtensionState,
    private readonly sessionViewProvider: SessionViewProvider
  ) {}

  connect(): void {
    console.debug("connectWithBackendSocket");

    if (!this.config.backendHttp) {
      vscode.window.showErrorMessage(
        `VS Code Backend Service URL not configured: ${this.config.backendHttp}`
      );
      return;
    }

    if (this.socket && !this.socket.disconnected) {
      return;
    }

    this.socket = io(this.config.backendHttp, {
      path: "/v2/ide/",
      query: { client: "extension" },
    });

    this.registerSocketListeners(this.socket);
  }

  disconnect(): void {
    if (!this.socket) {
      return;
    }

    this.socket.disconnect();

    this.state.backend.isConnected = this.socket.connected;
    this.state.backend.isLoading = false;

    this.sessionViewProvider.refreshHTML();
  }

  cancelConnectionSetup(): void {
    this.disconnect();
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  isDisconnected(): boolean {
    return !this.socket || this.socket.disconnected;
  }

  async emit<T, A extends unknown[] = []>(
    eventName: string,
    validator?: (p: unknown) => p is T,
    ...payload: A
  ): Promise<T | undefined> {
    if (!this.socket) {
      return undefined;
    }

    return emitEvent<T, A>(this.socket, eventName, validator, ...payload);
  }

  private registerSocketListeners(socket: Socket): void {
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

      if (
        oldIsConnected !== this.state.backend.isConnected ||
        oldIsLoading !== this.state.backend.isLoading
      ) {
        this.sessionViewProvider.refreshHTML();
      }

      console.debug(error.message);
    });

    socket.on("updates-debug-room-list", (debugRoomList: DebugRoomList) => {
      this.state.rooms.currentDebugRooms = debugRoomList;
      this.sessionViewProvider.refreshHTML();
    });
  }
}