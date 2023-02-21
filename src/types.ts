export enum IDEApiDest {
  VizDo = "vizDo",
  IDEDo = "ideDo",
}

export type MonitoringData = {
  fqn: string;
  description: string;
};

export enum IDEApiActions {
  Refresh = "refresh",
  SingleClickOnMesh = "singleClickOnMesh",
  DoubleClickOnMesh = "doubleClickOnMesh",
  ClickTimeline = "clickTimeLine",
  GetVizData = "getVizData",
  JumpToLocation = "jumpToLocation",
  JumpToMonitoringClass = "jumpToMonitoringClass",
}

export type IDEApiCall = {
  action: IDEApiActions;
  data: OrderTuple[];
  meshId: string;
  occurrenceID: number;
  fqn: string;
};

export type ParentOrder = {
  fqn: string;
  childs: ParentOrder[];
  meshId: string;
};

export type OrderTuple = {
  hierarchyModel: ParentOrder;
  meshes: { meshNames: string[]; meshIds: string[] };
};

export type classMethod = {
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
