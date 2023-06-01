import * as vscode from "vscode";
import { classMethod, OrderTuple } from "./types";

export class ExplorVizApiCodeLens
  implements vscode.CodeLensProvider, vscode.HoverProvider
{
  classMethodArr: classMethod[];
  vizData: OrderTuple[];
  constructor(classMethodArr: classMethod[], vizData: OrderTuple[]) {
    this.classMethodArr = classMethodArr;
    this.vizData = vizData;
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const codeLenses: vscode.CodeLens[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/g);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      this.classMethodArr.map((elem) => {
        if (line.includes(elem.lineString)) {
          const codeLens = new vscode.CodeLens(new vscode.Range(i, 0, i, 0), {
            title: "Open " + elem.name + " in ExplorViz",
            command: "explorviz-vscode-extension.OpenInExplorViz",
            arguments: [elem.name, elem.fqn, this.vizData],
            //tooltip: "Open in ExplorViz"
          });
          codeLenses.push(codeLens);
        }
      });
    }
    return codeLenses;
  }

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.Hover | undefined {
    const range = document.getWordRangeAtPosition(position);
    const word = document.getText(range);
    if (word === "public") {
      return new vscode.Hover(
        "This keyword is used to specify that a member or a class is accessible from outside the class or the package."
      );
    }
  }
}
