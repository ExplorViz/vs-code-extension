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
