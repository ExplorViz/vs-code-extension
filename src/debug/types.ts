import * as vscode from "vscode";

export interface DebugRoom { 
    alias: string; 
    secret: string; 
    value: string; 
    projectName: string; 
    commitId: string; 
};



export type DebugRoomList = DebugRoom[];
export type LineOfCode = number;
export type ColumnOfCode = number; 
export type VariableName = string;
export type OwnerType = string;
export type DocumentUriString = string;
export type WatchedVariableId = string;

export interface WatchedVariable {
  name: VariableName;

  // Location the user has selected for watching the variable
  usageUri: vscode.Uri;
  usageLine: LineOfCode;
  usageBeginChar: ColumnOfCode;
  usageEndChar: ColumnOfCode;

  // Location where JavaLS resolves the variable
  definitionUri: vscode.Uri;
  definitionLine: LineOfCode;
  definitionChar: ColumnOfCode;

  containingTypeName?: OwnerType; // (directly) contains this watched variable. Non stable, heuristically approach since containingType can be a inherited class at runtime

  /**
   * Optional best-effort subtype cache.
   * This is not guaranteed to be complete.
   */
  knownSubtypeNames?: OwnerType[];
}

//Represents a variable as code inside a document
export interface VariableSymbol {
  line: LineOfCode;
  beginChar: ColumnOfCode;
  endChar: ColumnOfCode;
  name: VariableName;
  documentUri: vscode.Uri;
}

// represents a value of a variable at runtime
export interface RuntimeVariableValue  {
  /**
   * Runtime-local identity of the owner object of this value.
   * Extracted from debugger strings like "DebugClass@41".
   * Only intended to be compared within the same debug session.
   */
  objectReference?: string;
  value: string;
  type: string;
  matchConfidence?: MatchConfidence; // how confident we are that this runtime value corresponds to the watched variable
  runtimePath?: string;
};

export type MatchConfidence = "declaration-location" | "owner-type" | "known-subtype" | "name-only";

// represents a class with the values of the variables contained in different instances
export interface RuntimeOwnerGroup {
  ownerType: OwnerType;
  values: RuntimeVariableValue[];
};

// represents a vaiable by its name and the classes its contained in
export interface VariableSnapshotEntry  {
  id: WatchedVariableId;
  name: VariableName;
  definitionUri: vscode.Uri;
  /**
   * Runtime owner group in which this watched variable name was found
   * and for which the user has confirmed that it should be included in the snapshot (in case of multiple matches)
   */
  ownerGroup: RuntimeOwnerGroup;
};

export type VariableSnapshotEntryDto = Omit<VariableSnapshotEntry, "definitionUri"> & {
  definitionUri: string;
};

export interface DebugSnapshotDataDto {
  landscapeToken: string;
  debugRunId: string;
  repositoryName: string;
  commitHash: string;
  epochNano: number;
  variables: VariableSnapshotEntryDto[];
}