import * as vscode from 'vscode';
import { classMethod, OrderTuple } from './types';

export class ExplorVizApiCodeLens implements vscode.CodeLensProvider, vscode.HoverProvider {
    classMethodArr: classMethod[];
    vizData: OrderTuple[];
    constructor(classMethodArr: classMethod[], vizData: OrderTuple[]) {
        console.log("vizDatA:", classMethodArr);
        this.classMethodArr = classMethodArr;
        this.vizData = vizData;
    }
    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {


        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const lines = text.split(/\r?\n/g);


        // console.log(this.classMethodArr)
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            this.classMethodArr.map(elem => {
                // if(line.includes("package")) {
                //     console.log(line)
                // }
                if (line.includes(elem.lineString)) {
                    // let occurence = this.foundationOccurrences.find(occ => {
                    //     occ.foundation == elem.fqn.split(".")[0]
                    // })
                    const codeLens = new vscode.CodeLens(new vscode.Range(i, 0, i, 0), {
                        title: "Open " + elem.name + " in ExplorViz",
                        // title: "Open " + elem.name + " in ExplorViz",
                        command: "explorviz-vscode-extension.OpenInExplorViz",
                        arguments: [elem.name, elem.fqn, this.vizData],
                        // tooltip: "Moin"
                    });
                    codeLenses.push(codeLens);
                }
            });
            // if (line.includes("public")) {
            //     const codeLens = new vscode.CodeLens(new vscode.Range(i, 0, i, 0), {
            //         title: "Public keyword found here",
            //         command: "explorviz-vscode-extension.IdeTestCallback",
            //         arguments: ["Das ist ein Argument in einem Array", "und ein Zweiter"],
            //         tooltip: "Moin"
            //     });
            //     codeLenses.push(codeLens);
            // }
        }
        return codeLenses;
    }

    public provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.Hover | undefined {
        const range = document.getWordRangeAtPosition(position);
        const word = document.getText(range);
        if (word === "public") {
            return new vscode.Hover("This keyword is used to specify that a member or a class is accessible from outside the class or the package.");
        }
    }
}
