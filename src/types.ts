export enum IDEApiDest {
    VizDo = "vizDo",
    IDEDo = "ideDo",
  }
  
export enum IDEApiActions {
    SingleClickOnMesh = "singleClickOnMesh",
    DoubleClickOnMesh = "doubleClickOnMesh",
    ClickTimeline = "clickTimeLine",
    GetVizData = "getVizData",
    JumpToLocation = "jumpToLocation"
  
  }
  
export type IDEApiCall = {
    action: IDEApiActions,
    data: OrderTuple[],
    meshId: string
  }
  
export type ParentOrder = {
    fqn: string,
    childs: ParentOrder[],
    meshId: string,
  }
  
export type OrderTuple = {
    hierarchyModel: ParentOrder,
    meshes: {meshNames: string[], meshIds: string[]}
  }

export type classMethod = {
    name: string,
    fqn: string,
    lineString: string,
    lineNumber: number,
    // meshId: string,
    // fileLocation: string,
}
