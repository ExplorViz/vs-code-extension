import * as vscode from "vscode";
import { classMethod, MonitoringData, OrderTuple } from "./types";
import { decorationType, monitoringDecorationType } from "./extension";

export function buildClassMethodArr(
  editor: vscode.TextEditor,
  vizData: OrderTuple[],
  monitoringData: MonitoringData[],
  decorate: boolean
): classMethod[] {
  let classMethodArray: classMethod[] = [];
  let sourceCode = editor.document.getText();
  // class\s([\w\d]+)[\w\s]+(.+)|[\w\d\<>]+\s([\w]+)(\(\)|\([\w\s]+\))(.+)|(}{1}|{{1})
  // class\s([\w\d]+)[\w\s]+{
  // https://regex101.com/
  let regexClass = /(class\s)([\w\d]+)[\w\s]+(.+)/;
  let regexMethods = /([\w\d\<>]+\s)([\w]+)\((.*?)\)\s/;
  let regexClassWithMethods =
    /(class\s)([\w\d]+)[\w\s]+(.+)|([\w\d\<>]+\s)([\w]+)\((.*?)\)\s/;
  // let regex = /(class)/
  let decorationsArray = []; //: vscode.DecorationOptions[] = []
  classMethodArray = [];

  let monitoringDecorationArray = [];
  const sourceCodeArr = sourceCode.split("\n");

  let vizDataFQNs: string[] = [];

  if (vizData.length !== 0) {
    vizData.forEach((oTuple) => {
      let foundationName = oTuple.meshes.meshNames[0];
      oTuple.meshes.meshNames.forEach((element) => {
        vizDataFQNs.push(element.replace(foundationName + ".", ""));
      });
    });
    // console.log(vizDataFQNs)
  } else {
    console.error("VizData Empty!");
    return [];
  }

  let className = "";

  for (let line = 0; line < sourceCodeArr.length; line++) {
    // Get Package name especially FQN
    // case Package
    if (sourceCodeArr[line].includes("package ")) {
      let fqn = sourceCodeArr[line].split(" ")[1].split(";")[0];
      let name = fqn.split(".")[fqn.split(".").length - 1];
      let lineString = sourceCodeArr[line].split(";")[0];

      classMethodArray.push({
        lineString: lineString,
        name: name,
        fqn: fqn,
        lineNumber: line,
      });

      // classMethodArray.push({line: sourceCodeArr[line].split(/\r?\n/g)[0], name: name, fqn: name})
      // let match = sourceCodeArr[line].match(regexClassWithMethods)
      let matchLength = name.length;
      let range = new vscode.Range(
        new vscode.Position(line, 0),
        new vscode.Position(line, 0 + matchLength)
      );
      let decoration = { range };
      decorationsArray.push(decoration);
      continue;
    }

    // Case Imports
    else if (sourceCodeArr[line].includes("import ")) {
      let fqn = sourceCodeArr[line].split(" ")[1].split(";")[0];
      let name = fqn.split(".")[fqn.split(".").length - 1];
      let lineString = sourceCodeArr[line].split(";")[0];
      // console.log(name)
      if (vizDataFQNs.includes(lineString.split(" ")[1])) {
        // console.log(name)
        classMethodArray.push({
          lineString: lineString,
          name: name,
          fqn: fqn,
          lineNumber: line,
        });
        let matchLength = name.length;
        let range = new vscode.Range(
          new vscode.Position(line, 0),
          new vscode.Position(line, 0 + matchLength)
        );
        let decoration = { range };
        decorationsArray.push(decoration);
      }
      continue;
    }

    // let packageName = classMethodArray[0].fqn
    let match = sourceCodeArr[line].match(regexClassWithMethods);
    // if (match) {
    //     // console.log(match)
    // }
    // console.log(match ? match[1] : "isNull")
    if (match !== null && match.index !== undefined) {
      let matchLength = match[0].length;
      let matchIndex = match.index;

      let range = new vscode.Range(
        new vscode.Position(line, matchIndex),
        new vscode.Position(line, matchIndex + matchLength)
      );

      // Case: Class
      if (match[1]) {
        matchLength = match[2].length;
        matchIndex += match[1].length;
        let name = match[2];
        className = name;
        let fqn = classMethodArray[0].fqn + "." + name;

        let isMonitored: MonitoringData = {
          fqn: "no fqn set",
          description: "no desc set",
        };

        monitoringData.forEach((md) => {
          if (md.fqn.includes(fqn)) {
            isMonitored = md;
          }
        });

        if (isMonitored.fqn != "no fqn set") {
          let monitoringDecoration = { range };
          monitoringDecorationArray.push(monitoringDecoration);

          const diagnosticCollection =
            vscode.languages.createDiagnosticCollection(
              "ExplorViz Monitoringtool"
            );

          // Add a diagnostic to the collection
          const diagnostic = new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 10),
            isMonitored.description,
            vscode.DiagnosticSeverity.Error
          );
          diagnosticCollection.set(vscode.Uri.file(isMonitored.fqn), [
            diagnostic,
          ]);
          // diagnosticCollection.set(vscode.Uri.file('my-file.txt'), [diagnostic]);
          // console.log("isMonitored:", isMonitored)
        }

        // console.log(fqn)
        // console.log(name)
        if (vizDataFQNs.includes(fqn)) {
          // + - * / % = \w @
          // Cases could be implemented with regex as well
          classMethodArray.push({
            lineString: match[0],
            name: name,
            fqn: fqn,
            lineNumber: line,
          });
          classMethodArray.push({
            lineString: " " + match[2] + "(",
            name: name,
            fqn: fqn,
            lineNumber: line,
          });
          classMethodArray.push({
            lineString: "	" + match[2] + "(",
            name: name,
            fqn: fqn,
            lineNumber: line,
          });
          classMethodArray.push({
            lineString: "+" + match[2] + "(",
            name: name,
            fqn: fqn,
            lineNumber: line,
          });
          classMethodArray.push({
            lineString: "-" + match[2] + "(",
            name: name,
            fqn: fqn,
            lineNumber: line,
          });
          classMethodArray.push({
            lineString: "*" + match[2] + "(",
            name: name,
            fqn: fqn,
            lineNumber: line,
          });
          classMethodArray.push({
            lineString: "/" + match[2] + "(",
            name: name,
            fqn: fqn,
            lineNumber: line,
          });
          classMethodArray.push({
            lineString: "%" + match[2] + "(",
            name: name,
            fqn: fqn,
            lineNumber: line,
          });
          classMethodArray.push({
            lineString: "=" + match[2] + "(",
            name: name,
            fqn: fqn,
            lineNumber: line,
          });
          classMethodArray.push({
            lineString: "@" + match[2] + "(",
            name: name,
            fqn: fqn,
            lineNumber: line,
          });
          let decoration = { range };
          decorationsArray.push(decoration);
        }
      }

      // Case: Method
      else if (match[5]) {
        console.log(match[5]);
        let name = match[5];
        let fqn = classMethodArray[0].fqn + "." + className + "." + match[5];
        let test = vizDataFQNs.includes(fqn);
        if (vizDataFQNs.includes(fqn)) {
          matchLength = match[5].length;
          matchIndex += match[4].length;

          classMethodArray.push({
            lineString: name + "(",
            name: name,
            fqn: fqn,
            lineNumber: line,
          });
          let decoration = { range };
          decorationsArray.push(decoration);
        }
      }
    }
  }
  // console.log(classMethodArray[0].fqn)
  if (decorate) {
    console.log("decorateType", decorationType);
    console.log("decorationsArray", decorationsArray);
    editor.setDecorations(decorationType, decorationsArray);
    editor.setDecorations(monitoringDecorationType, monitoringDecorationArray);
  }

  console.log("classMethodArray: ", classMethodArray);
  return classMethodArray;
}
