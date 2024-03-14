import * as vscode from "vscode";
import * as fs from "fs";
import path from "path";

import { LocationFind, OrderTuple } from "./types";
import { selectOption, monitoringData } from "./extension";
import { buildClassMethodArr } from "./buildClassMethod";
const settings = vscode.workspace.getConfiguration("explorviz");

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

  let fqn = getFQNByMeshId(meshId, vizData);
  let fqnToSearchInDir = fqn;
  if (isMethod) {
    fqnToSearchInDir = fqn.replace("." + meshId.split("_")[2], "");
  }
  if (vscode.workspace.workspaceFolders) {
    vscode.workspace.workspaceFolders.forEach(async (element) => {
      let dir = element.uri.path;
      dir = path.normalize(dir);

      // Case for windows file paths to exclude intial \
      // element.uri.path gives e.g. \c:\...\spring-petclinic
      if (dir.substring(0, 1) === "\\") {
        dir = dir.substring(1);
      }

      let tempFind;
      // change fqn for method case
      tempFind = getFindsByWorkDir(fqnToSearchInDir, dir);
      finds.dirs = finds.dirs.concat(tempFind.dirs);
      if (tempFind.javaFile[0] !== "undefined") {
        finds.javaFile = finds.javaFile.concat(tempFind.javaFile);
      }
      finds.javaFiles = finds.javaFiles.concat(tempFind.javaFiles);
    });
    // dir = vscode.workspace.workspaceFolders[0].uri.path
    // dir = dir.substring(1)
  }

  if (finds.javaFile.length > 0) {
    if (finds.javaFile.length === 1) {
      await openFileCommand(finds.javaFile[0], fqn, vizData);
    } else {
      let selected = await selectOption(finds.javaFile, "Select file ", true);
      if (selected) {
        await openFileCommand(selected, fqn, vizData);
        vscode.window.showInformationMessage(`Selected option: ${selected}`);
      }
    }
  } else if (finds.javaFiles.length !== 0) {
    // Show selection which file to open

    let selected = await selectOption(finds.javaFiles, "Select file ", true);
    if (selected) {
      await openFileCommand(selected, fqn, vizData);
      vscode.window.showInformationMessage(`Selected option: ${selected}`);
    }
  } else {
    //console.error("Nothing to open!", finds);
    vscode.window.showInformationMessage(
      "Entity not found in source code (could be dependency code)."
    );
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
  let packageBaseDir = settings.get("packageBaseDir");
  if (typeof packageBaseDir === "string") {
    packageBaseDir = path.normalize(packageBaseDir);
  } else {
    packageBaseDir = "";
  }
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

  // dir = dir.replaceAll("/", "/");
  let filesInWorkDir = searchjavaFilesAndDirs(path.normalize(dir));

  let isFoundation = false;

  foundationName = foundationName.replace("costumer", "customers");
  fqn = fqn.replace("costumer", "customers");
  let fqnWithoutFoundationPath = fqn.replace(foundationName + ".", "");
  fqnWithoutFoundationPath = fqnWithoutFoundationPath.replace(
    possibleInstanceCounter + ".",
    ""
  );
  fqnWithoutFoundationPath = fqnWithoutFoundationPath.replaceAll(".", "/");

  filesInWorkDir.dirs.forEach((element) => {
    // is Foundation
    if (element.includes(foundationName)) {
      isFoundation = true;

      fqnWithoutFoundationPath =
        element + packageBaseDir + "/" + fqnWithoutFoundationPath;

      let filesInFixedFqnPath = searchjavaFilesAndDirs(
        path.normalize(fqnWithoutFoundationPath)
      );
      finds = filesInFixedFqnPath;
    }
  });

  // packageBaseDir and no foundation folder
  if (!isFoundation) {
    let filesInPackageBaseDir = searchjavaFilesAndDirs(
      path.normalize(dir + packageBaseDir + "/" + fqnWithoutFoundationPath)
    );

    finds = filesInPackageBaseDir;
  }
  return finds;
}

function searchjavaFilesAndDirs(dir: string): LocationFind {
  let javaFilesFinds: string[] = [];
  let dirFinds: string[] = [];
  let javaFile: string = "undefined";

  try {
    // try for single javaFile
    let file;
    file = fs.readFileSync(dir + ".java");
    if (file) {
      return { javaFiles: [], dirs: [], javaFile: [dir + ".java"] };
    }
  } catch (error) {
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
      return {
        javaFiles: javaFilesFinds,
        dirs: dirFinds,
        javaFile: [javaFile],
      };
    }

    return { javaFiles: javaFilesFinds, dirs: dirFinds, javaFile: [javaFile] };
  }
  return { javaFiles: javaFilesFinds, dirs: dirFinds, javaFile: [javaFile] };
}

async function openFileCommand(
  pathToLocation: string,
  fqn: string,
  vizData: OrderTuple[]
) {
  // workaround to not open file in the same editorgroup as ExplorViz
  // Normally, you would lock the editorgroup
  // This cannot be done programatically at the moment, but requires user interaction

  const layout: any = await vscode.commands.executeCommand(
    "vscode.getEditorLayout"
  );

  if (layout.groups.length === 1) {
    // force split screen first
    console.log("layout", layout.groups);
    await vscode.commands.executeCommand("vscode.setEditorLayout", {
      orientation: 1,
      groups: [{ groups: [{}, {}], size: 0.5 }],
    });
    await vscode.commands.executeCommand(
      "workbench.action.moveActiveEditorGroupRight"
    );
  }

  await vscode.commands.executeCommand(
    "workbench.action.focusFirstEditorGroup"
  );

  let normalizedPath = path.normalize(pathToLocation);

  let stats = fs.lstatSync(path.join(normalizedPath, ""));

  if (!stats) {
    normalizedPath = normalizedPath.split(".")[0];
    stats = fs.lstatSync(path.join(normalizedPath, ""));
  }
  if (stats.isDirectory()) {
    // select file to open
    // find javaFiles

    console.error("is Dir:");
  } else if (stats.isFile()) {
    console.error("is File");
  }

  await vscode.commands.executeCommand(
    "editor.action.goToLocations",
    vscode.Uri.file(normalizedPath),
    new vscode.Position(0, 0),
    [new vscode.Position(0, 0)],
    "goto",
    "No File Found to go to"
  );

  let classMethod = buildClassMethodArr(
    vscode.window.visibleTextEditors[0],
    vizData,
    monitoringData,
    true
  );
  let lineNUmber = -1;
  if (classMethod) {
    classMethod.forEach((element) => {
      if (fqn.search(element.fqn) !== -1) {
        lineNUmber = element.lineNumber;
      }
    });
  }
  return vscode.commands.executeCommand("revealLine", {
    lineNumber: lineNUmber - 1,
    at: "top",
  });
}
