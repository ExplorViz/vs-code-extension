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

export type RecommendedSettingsAtDebugStart =
  | "active"
  | "inactive"
  | "unknown";

export interface DebugState {
  debugRunId?: string;
  isInDebugSession: boolean;
  isDebugSessionStopped: boolean;
  stoppedDebugSession?: vscode.DebugSession;
  stoppedDebugThreadId?: number;
  debuggedAppPID?: number;
  capabilities: DebugAdapterCapabilities;
 /**
   * Describes whether the recommended workspace/debugger settings were already
   * active when the current debug session was started.
   *
   * This is relevant because some debugger settings only take effect for newly
   * started debug sessions. If ExplorViz is activated after a debug session has
   * already started, the value is "unknown".
   */
  recommendedSettingsAtDebugStart: RecommendedSettingsAtDebugStart;
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

export interface WorkspaceTypeIndexState {
  /**
   * Maps a simple type name to all qualified names found for that type name
   * in the current workspace.
   *
   * Example:
   * "User" -> Set([
   *   "com.example.domain.User",
   *   "com.example.dto.User"
   * ])
   *
   * The qualified name is language-specific:
   * - Java: package name + type name
   * - TypeScript/JavaScript/Python: usually module/file path + type name
   */
  qualifiedNamesBySimpleName: Map<string, Set<string>>;

  /**
   * Contains all simple type names that occur with more than one qualified name
   * in the current workspace.
   *
   * These names are potentially unsafe for heuristic matching when runtime debug
   * information only provides a simple class/type name instead of a fully
   * qualified name.
   *
   * Example:
   * If both "com.example.domain.User" and "com.example.dto.User" exist,
   * this set contains "User".
   */
  ambiguousSimpleNames: Set<string>;

  /**
   * Indicates whether the workspace type index has been built at least once.
   *
   * This is important because an empty index can mean two different things:
   * - the index has not been built yet
   * - the index was built, but no type ambiguities were found
   *
   * Matching code should treat unresolved simple-name matches more cautiously
   * while this flag is false.
   */
  isReady: boolean;
}

export interface ExtensionState {
  backend: BackendState;
  debug: DebugState;
  rooms: RoomState;
  codeLens: CodeLensState;
  variables: VariableState;
  workspaceTypeIndex: WorkspaceTypeIndexState;
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
      recommendedSettingsAtDebugStart: "unknown",
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

    workspaceTypeIndex: {
      qualifiedNamesBySimpleName: new Map<string, Set<string>>(),
      ambiguousSimpleNames: new Set<string>(),
      isReady: false,
    },
  };
}