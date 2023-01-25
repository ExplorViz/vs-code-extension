export enum IDEApiDest {
    VizDo = "vizDo",
    IDEDo = "ideDo",
  }
  
export enum IDEApiActions {
    SingleClickOnMesh = "singleClickOnMesh",
    DoubleClickOnMesh = "doubleClickOnMesh",
    ClickTimeline = "clickTimeLine",
    GetVizData = "getVizData"
  
  }
  
export type IDEApiCall = {
    action: IDEApiActions,
    data: OrderTuple[]
  }
  
export type ParentOrder = {
    name: string,
    childs: ParentOrder[]
  }
  
export type OrderTuple = {
    hierarchyModel: ParentOrder,
    meshNames: string[]
  }