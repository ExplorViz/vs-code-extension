import * as vscode from "vscode";
import {
  OwnerType,
  DebugRoom,
  DebugRoomList,
  DocumentUriString,
  LineOfCode,
  RuntimeVariableValue,
  VariableName,
  VariableSymbol,
  WatchedVariable,
  WatchedVariableId,
  RuntimeOwnerGroup,
  VariableSnapshotEntry,
} from "../debug/types";

export interface BackendState {
  isConnected: boolean;
  isLoading: boolean;
}

export interface DebugAdapterCapabilities {
  supportsVariableType: boolean;
}
export interface DebugState {
  isInDebugSession: boolean;
  isDebugSessionStopped: boolean;
  stoppedDebugSession?: vscode.DebugSession;
  stoppedDebugThreadId?: number;
  debuggedAppPID?: number;
  capabilities: DebugAdapterCapabilities;
}

export interface RoomState {
  currentDebugRooms?: DebugRoomList;
  currentDebugRoom?: DebugRoom;
}

export interface CodeLensState {
  debugCodeLenses: vscode.CodeLens[];
  debugCodeLensEmitter: vscode.EventEmitter<void>;
}

export type VariableTokens = Map<LineOfCode, VariableSymbol[]>;
export type VariableTokensByUri = Map<DocumentUriString, VariableTokens>;

export interface VariableState {
  variableTokensByUri: VariableTokensByUri;
  debugVariableWatchlist: Map<WatchedVariableId, WatchedVariable>;

/**
 * Maps each watched source variable to all runtime values found for it.
 *
 * A watched field can have multiple values because multiple instances
 * of the containing class may exist at runtime.
 */
  variableSnapshotEntryByWatchedVariableId: Map<WatchedVariableId, VariableSnapshotEntry>;
}

export interface ExtensionState {
  backend: BackendState;
  debug: DebugState;
  rooms: RoomState;
  codeLens: CodeLensState;
  variables: VariableState;
}

export function createExtensionState(): ExtensionState {
  return {
    backend: {
      isConnected: false,
      isLoading: false,
    },

    debug: {
      isInDebugSession: false,
      isDebugSessionStopped: false,
      capabilities: {
        supportsVariableType: false,
      },
    },

    rooms: {},

    codeLens: {
      debugCodeLenses: [],
      debugCodeLensEmitter: new vscode.EventEmitter<void>(),
    },

    variables: {
      variableTokensByUri: new Map(),
      debugVariableWatchlist: new Map(),
      variableSnapshotEntryByWatchedVariableId: new Map(),
    },
  };
}