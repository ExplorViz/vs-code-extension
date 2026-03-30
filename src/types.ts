export enum IDEApiDest {
  VizDo = "vizDo",
  IDEDo = "ideDo",
}

export type MonitoringData = {
  fqn: string;
  description: string;
};

export type TextSelection = {
  documentUri: string;
  startLine: number;
  startCharPos: number;
  endLine: number;
  endCharPos: number;
} | null;

export enum IDEApiActions {
  Refresh = "refresh",
  SingleClickOnMesh = "singleClickOnMesh",
  DoubleClickOnMesh = "doubleClickOnMesh",
  ClickTimeline = "clickTimeLine",
  GetVizData = "getVizData",
  JumpToLocation = "jumpToLocation",
  JumpToMonitoringClass = "jumpToMonitoringClass",
  ConnectIDE = "connectIDE",
  DisconnectIDE = "disconnectIDE",
  DisconnectFrontend = "disconnectFrontend",
}

export type CommunicationLink = {
  sourceMeshID: string;
  targetMeshID: string;
  meshID: string;
};

export type IDEApiCall = {
  action: IDEApiActions;
  data: OrderTuple[];
  meshId: string;
  occurrenceID: number;
  fqn: string;
  foundationCommunicationLinks: CommunicationLink[];
};

export type VizDataRaw = {
  applicationObject3D: any[];
  communicationLinks: CommunicationLink[];
};

export type ParentOrder = {
  fqn: string;
  children: ParentOrder[];
  meshId: string;
};

// export type ParentOrder = {
//   fqn: string;
//   meshId: string;
//   children: ParentOrder[];
//   methods: ParentOrder[];
// };

export type OrderTuple = {
  hierarchyModel: ParentOrder;
  meshes: { meshNames: string[]; meshIds: string[] };
};

export type ClassMethod = {
  name: string;
  fqn: string;
  lineString: string;
  lineNumber: number;
  // meshId: string,
  // fileLocation: string,
};

export type FoundationOccurrences = {
  foundation: string;
  occurrences: number[];
};

export type LocationFind = {
  javaFiles: string[];
  dirs: string[];
  javaFile: string[];
};

export enum ModesEnum {
  crossWindow = 'crossWindow',
  websocket = 'websocket',
};


export type InspectITConfig = {
  inspectit: {
    tags: {
      extra: {
        [key: string ]: string | number;
      }
    }
  }
};


// represents a value in of a variable at runtim
export type StateValue = {
  objReference: number; // unique identifier for the scope containing the variable (most often an object)
  value: string;
  type: string;
};

// represents a class with the values of the variables contained in defferent instances
export type ClassEntry = {
  className: string;
  values: StateValue[];
};

// represents a vaiable by its name and the classes its contained in
export type VariableEntry = {
  varname: string;
  classes: ClassEntry[];
};
