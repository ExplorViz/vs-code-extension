import * as vscode from "vscode";
import * as fs from "fs";
import path from "path";

import { LocationFind, OrderTuple } from "./types";
import { selectOption, monitoringData } from "./extension";
import { buildClassMethodArr } from "./buildClassMethod";

export async function goToLocationsByMeshId(
  meshId: string,
  vizData: OrderTuple[],
  isMethod: boolean
) {
  let finds: LocationFind = {
    dirs: [],
    javaFiles: [],
    javaFile: [],
  };

  console.log("isMethod: ", isMethod)
  // let location = getLocationNameHelper(meshId, vizData, false)
  let fqn = getFQNByMeshId(meshId, vizData);
  let fqnToSearchInDir = fqn;
  if(isMethod) {
    fqnToSearchInDir = fqn.replace( "." + meshId.split("_")[2], "")
  }
  console.log("FQN to find is", fqn);
  //fqn = "org.springframework.samples.petclinic.vet.Vet";
  if (vscode.workspace.workspaceFolders) {
    vscode.workspace.workspaceFolders.forEach(async (element) => {
      let dir = element.uri.path;
      dir = dir.substring(1);

      let tempFind;
      // change fqn for method case
      tempFind = getFindsByWorkDir(fqnToSearchInDir, dir);
      // console.log("tempFind", tempFind)
      finds.dirs = finds.dirs.concat(tempFind.dirs);
      if (tempFind.javaFile[0] != "undefined") {
        finds.javaFile = finds.javaFile.concat(tempFind.javaFile);
      }
      finds.javaFiles = finds.javaFiles.concat(tempFind.javaFiles);
    });
    // dir = vscode.workspace.workspaceFolders[0].uri.path
    // dir = dir.substring(1)
  }

  console.log("finds", finds, "\nfqn: ", fqn);

  if (finds.javaFile.length > 0) {
    if (finds.javaFile.length == 1) {
      console.log("Open java File: ", finds.javaFile);
      openFileCommand(finds.javaFile[0], fqn, vizData);
    } else {
      let selected = await selectOption(finds.javaFile, "Select file ", true);
      if (selected) {
        openFileCommand(selected, fqn, vizData);
        vscode.window.showInformationMessage(`Selected option: ${selected}`);
      }
    }
  } else if (finds.javaFiles.length != 0) {
    // Show selection which file to open
    console.log(finds.javaFiles);

    let selected = await selectOption(finds.javaFiles, "Select file ", true);
    if (selected) {
      openFileCommand(selected, fqn, vizData);
      vscode.window.showInformationMessage(`Selected option: ${selected}`);
    }
  } else {
    console.error("Nothing to open!", finds);
    vscode.window.showInformationMessage("Nothing to open!");
    return;
  }
}

function getFQNByMeshId(meshID: string, vizData: OrderTuple[]): string {
  let fqn = "";
  vizData.forEach((element) => {
    let foundIndex = element.meshes.meshIds.indexOf(meshID);
    if (foundIndex !== -1) {
      fqn = element.meshes.meshNames[foundIndex];
    }
  });

  return fqn;
}

function getFindsByWorkDir(fqn: string, workDir: string): LocationFind {
  let finds: LocationFind = {
    dirs: [],
    javaFiles: [],
    javaFile: [],
  };

  let dir = workDir;

  //TODO packageBaseDir as global var
  let packageBaseDir = "\\src\\main\\java";
  let fqnArr = fqn.split(".");
  let foundationName = fqnArr[0];
  let possibleInstanceCounter: number = Number(fqnArr[1]);

  
  let fqnAsPath = foundationName;
  if (isNaN(possibleInstanceCounter)) {
    possibleInstanceCounter = -1;
  } else {
    fqnAsPath += possibleInstanceCounter;
  }

  // let absoluteDirPath = dir + packageBaseDir + fqn

  dir = dir.replaceAll("/", "\\");
  let filesInWorkDir = searchjavaFilesAndDirs(dir);

  let isFoundation = false;

  foundationName = foundationName.replace("costumer", "customers");
  fqn = fqn.replace("costumer", "customers");
  let fqnWithoutFoundationPath = fqn.replace(foundationName + ".", "");
  fqnWithoutFoundationPath = fqnWithoutFoundationPath.replace(
    possibleInstanceCounter + ".",
    ""
  );
  fqnWithoutFoundationPath = fqnWithoutFoundationPath.replaceAll(".", "\\");

  filesInWorkDir.dirs.forEach((element) => {
    // is Foundation
    if (element.includes(foundationName)) {
      console.log("foundationDir: ", element, fqn);
      isFoundation = true;

      fqnWithoutFoundationPath =
        element + packageBaseDir + "\\" + fqnWithoutFoundationPath;
      console.log(fqnWithoutFoundationPath);

      let filesInFixedFqnPath = searchjavaFilesAndDirs(
        fqnWithoutFoundationPath
      );
      finds = filesInFixedFqnPath;
    }
  });

  // packageBaseDir and no foundation folder
  if (!isFoundation) {
    let filesInPackageBaseDir = searchjavaFilesAndDirs(
      dir + packageBaseDir + "\\" + fqnWithoutFoundationPath
    );
    console.log(fqn, fqnWithoutFoundationPath);

    finds = filesInPackageBaseDir;
  }

  // console.log("Java files found:", finds.javaFiles.length) // ,filesInFixedFqnPath.javaFiles)
  // console.log("Folders found:", finds.dirs.length) //, filesInFixedFqnPath.dirs)
  // console.log("Single Java file found:", finds.javaFile)
  return finds;
}

function searchjavaFilesAndDirs(dir: string): LocationFind {
  // console.log("bla")
  let javaFilesFinds: string[] = [];
  let dirFinds: string[] = [];
  let javaFile: string = "undefined";

  try {
    // try for single javaFile
    let file;
    console.log(dir + ".java");
    file = fs.readFileSync(dir + ".java");
    if (file) {
      return { javaFiles: [], dirs: [], javaFile: [dir + ".java"] };
    }

    // c:\Lenny\Studium\spring-petclinic-microservices\spring-petclinic-customers-service\src\main\java\org\springframework\samples\petclinic\customers\web\
  } catch (error) {
    console.log("No JavaFile continue with Folder");
    let files: any[] = [];
    try {
      files = fs.readdirSync(dir);

      files.forEach((file) => {
        const filePath = path.join(dir, file);
        const stats = fs.lstatSync(filePath);

        if (stats.isDirectory()) {
          dirFinds.push(filePath);
        } else if (stats.isFile()) {
          if (file.includes(".java")) {
            javaFilesFinds.push(filePath);
          }
        }
      });
    } catch (error) {
      console.log("Folder not found continue with work dirs");
      return {
        javaFiles: javaFilesFinds,
        dirs: dirFinds,
        javaFile: [javaFile],
      };
    }

    // console.log("bla")
    return { javaFiles: javaFilesFinds, dirs: dirFinds, javaFile: [javaFile] };
  }
  return { javaFiles: javaFilesFinds, dirs: dirFinds, javaFile: [javaFile] };
}

function openFileCommand(
  pathToLocation: string,
  fqn: string,
  vizData: OrderTuple[]
) {
  vscode.commands
    .executeCommand("workbench.action.focusFirstEditorGroup")
    .then(() => {
      console.log("First command finished executing.");
      // console.log(finds)
      let stats = fs.lstatSync(path.join(pathToLocation, ""));

      // console.log(pathToLocation)
      // console.log(pathToLocation.split(".")[0])

      if (!stats) {
        pathToLocation = pathToLocation.split(".")[0];
        stats = fs.lstatSync(path.join(pathToLocation, ""));
      }
      if (stats.isDirectory()) {
        // select file to open
        // find javaFiles

        console.error("is Dir:");
      } else if (stats.isFile()) {
        console.error("is File");
      }
      return vscode.commands.executeCommand(
        "editor.action.goToLocations",
        vscode.Uri.file(pathToLocation),
        new vscode.Position(0, 0),
        [new vscode.Position(0, 0)],
        "goto",
        "No File Found to go to"
      );
    })
    .then(() => {
      let classMethod = buildClassMethodArr(
        vscode.window.visibleTextEditors[0],
        vizData,
        monitoringData,
        true
      );
      let lineNUmber = -1;
      if (classMethod) {
        classMethod.forEach((element) => {
          // console.log(element.fqn)
          // console.log(fqn)
          if (fqn.search(element.fqn) != -1) {
            lineNUmber = element.lineNumber;
          }
        });
        // org.springframework.samples.petclinic.customers.web.PetRequest
        // petclinic-costumer-service.org.springframework.samples.petclinic.customers.web.PetRequest
      }
      console.log("Second command finished executing.");
      return vscode.commands.executeCommand("revealLine", {
        lineNumber: lineNUmber - 1,
        at: "top",
      });
    })
    .then(() => {
      console.log("Third command finished executing.");
    });
}
