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
export type ClassName = string;
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

  containingTypeName?: ClassName; // (directly) contains this watched variable

  /**
   * Optional best-effort subtype cache.
   * This is not guaranteed to be complete.
   */
  knownSubtypeNames?: ClassName[];
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
export interface StateValue  {
  objReference?: number; // unique identifier for the scope containing the variable (most often an object)
  value: string;
  type: string;
    matchConfidence?: MatchConfidence; // how confident we are that this runtime value corresponds to the watched variable
};

export type MatchConfidence = "declaration-location" | "owner-type" | "known-subtype" | "name-only";

// represents a class with the values of the variables contained in different instances
export interface ClassEntry {
  className: ClassName;
  values: StateValue[];
};

// represents a vaiable by its name and the classes its contained in
export interface VariableEntry {
  name: VariableName;
  classes: ClassEntry[];
};