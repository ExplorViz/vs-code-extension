import * as vscode from "vscode";
import { ExtensionState } from "../state/extensionState";
import { MatchConfidence, StateValue, WatchedVariable } from "./types";

type ScopeKind = "local" | "param" | "this" | "static" | "global" | "object";

interface RuntimeContext {
  scopeKind: ScopeKind;
  ownerName?: string;
  ownerType?: string;
  objectId?: number;
}

interface ResolvedDeclarationLocation {
  uri?: vscode.Uri;
  sourceName?: string;
  sourceReference?: number;
  line: number;
  column: number;
}

export async function searchVariablesInCurrentStackFrame(
  state: ExtensionState,
  session: vscode.DebugSession,
  threadId: number
): Promise<void> {
  clearCurrentSnapshotValues(state);

  const stackTrace = await session.customRequest("stackTrace", {
    threadId,
  });

  const stackFrames = stackTrace?.stackFrames ?? [];

  if (stackFrames.length === 0) {
    vscode.window.showInformationMessage("No stack frame found.");
    return;
  }

  for (const stackFrame of stackFrames) {
    await searchVariablesInStackFrame(
      state,
      session,
      stackFrame.id
    );
  }

  console.log(
    "Found watched variable values:",
    state.variables.debugVariableStateValues
  );
}

function clearCurrentSnapshotValues(state: ExtensionState): void {
  state.variables.debugVariableStateValues.clear();

  for (const watchedVariableId of state.variables.debugVariableWatchlist.keys()) {
    state.variables.debugVariableStateValues.set(watchedVariableId, []);
  }
}

async function searchVariablesInStackFrame(
  state: ExtensionState,
  session: vscode.DebugSession,
  frameId: number
): Promise<void> {
  const scopesResponse = await session.customRequest("scopes", {
    frameId,
  });

  const scopes = scopesResponse?.scopes ?? [];

  for (const scope of scopes) {
    const scopeKind = classifyScope(scope.name);

    if (!scopeKind) {
      console.log("Skipping scope:", scope.name);
      continue;
    }

    await searchVariablesByReference(
      state,
      session,
      scope.variablesReference,
      {
        scopeKind,
      },
      new Set<number>()
    );
  }
}

function classifyScope(scopeName: unknown): ScopeKind | undefined {
  const lower = String(scopeName).toLowerCase();

  if (lower.includes("local")) {
    return "local";
  }

  if (lower.includes("arg") || lower.includes("param")) {
    return "param";
  }

  if (lower.includes("this")) {
    return "this";
  }

  if (lower.includes("static")) {
    return "static";
  }

  if (lower.includes("global")) {
    return "global";
  }

  return undefined;
}

async function searchVariablesByReference(
  state: ExtensionState,
  session: vscode.DebugSession,
  variablesReference: number,
  context: RuntimeContext,
  visitedReferences: Set<number>
): Promise<void> {
  if (variablesReference <= 0 || visitedReferences.has(variablesReference)) {
    return;
  }

  visitedReferences.add(variablesReference);

  let variablesResponse: any;

  try {
    variablesResponse = await session.customRequest("variables", {
      variablesReference,
    });
  } catch (error) {
    console.error("Could not fetch variables:", error);
    return;
  }

  const variables = variablesResponse?.variables ?? [];

  for (const runtimeVariable of variables) {
    await collectIfWatchedVariable(
      state,
      session,
      runtimeVariable,
      context
    );

    if (runtimeVariable.variablesReference > 0) {
      const objectId = extractObjectIdFromVariableValue(
        runtimeVariable.value
      );

      await searchVariablesByReference(
        state,
        session,
        runtimeVariable.variablesReference,
        {
          scopeKind: "object",
          ownerName: runtimeVariable.name,
          ownerType: runtimeVariable.type,
          objectId,
        },
        visitedReferences
      );
    }
  }
}

async function collectIfWatchedVariable(
  state: ExtensionState,
  session: vscode.DebugSession,
  runtimeVariable: any,
  context: RuntimeContext
): Promise<void> {
  for (const [
    watchedVariableId,
    watchedVariable,
  ] of state.variables.debugVariableWatchlist) {
    const matchConfidence = await getMatchConfidence(
      session,
      runtimeVariable,
      watchedVariable,
      context
    );

    if (!matchConfidence) {
      continue;
    }

    const values =
      state.variables.debugVariableStateValues.get(watchedVariableId) ?? [];

    const stateValue: StateValue = {
      value: String(runtimeVariable.value ?? ""),
      type: String(runtimeVariable.type ?? ""),
      objReference: context.objectId,
      matchConfidence,
    };

    values.push(stateValue);
    state.variables.debugVariableStateValues.set(watchedVariableId, values);

    console.log(
      "Found watched variable:",
      watchedVariable.name,
      "value:",
      runtimeVariable.value,
      "type:",
      runtimeVariable.type,
      "confidence:",
      matchConfidence
    );
  }
}

async function getMatchConfidence(
  session: vscode.DebugSession,
  runtimeVariable: any,
  watchedVariable: WatchedVariable,
  context: RuntimeContext
): Promise<MatchConfidence | undefined> {
  if (runtimeVariable.name !== watchedVariable.name) {
    return undefined;
  }

  const declarationLocation = await tryResolveDeclarationLocation(
    session,
    runtimeVariable
  );

  if (
    declarationLocation &&
    sameDefinitionLocation(declarationLocation, watchedVariable)
  ) {
    return "declaration-location";
  }

  return getHeuristicMatchConfidence(
    runtimeVariable,
    watchedVariable,
    context
  );
}

function getHeuristicMatchConfidence(
  runtimeVariable: any,
  watchedVariable: WatchedVariable,
  context: RuntimeContext
): MatchConfidence | undefined {
  if (runtimeVariable.name !== watchedVariable.name) {
    return undefined;
  }

  if (!context.ownerType || !watchedVariable.containingTypeName) {
    return "name-only";
  }

  const ownerType = normalizeJavaTypeName(context.ownerType);
  const containingTypeName = normalizeJavaTypeName(
    watchedVariable.containingTypeName
  );

  if (ownerType === containingTypeName) {
    return "owner-type";
  }

  const knownSubtypeNames = watchedVariable.knownSubtypeNames ?? [];

  if (
    knownSubtypeNames
      .map(normalizeJavaTypeName)
      .includes(ownerType)
  ) {
    return "known-subtype";
  }

  return undefined;
}

async function tryResolveDeclarationLocation(
  session: vscode.DebugSession,
  runtimeVariable: any
): Promise<ResolvedDeclarationLocation | undefined> {
  const locationReference = runtimeVariable.declarationLocationReference;

  if (typeof locationReference !== "number" || locationReference <= 0) {
    return undefined;
  }

  try {
    const locationsResponse = await session.customRequest("locations", {
      locationReference,
    });

    const body: LocationsResponse | undefined = locationsResponse?.body ?? locationsResponse;

    if (!body?.source || typeof body.line !== "number") {
      return undefined;
    }

    const source = body.source;

    return {
      uri: source.path ? vscode.Uri.file(source.path) : undefined,
      sourceName: source.name,
      sourceReference: source.sourceReference,

      // VS Code arbeitet intern 0-basiert.
      // Falls dein Debug Adapter bereits 0-basiert liefert, hier -1 entfernen.
      line: body.line - 1,
      column: typeof body.column === "number" ? body.column - 1 : 0,
    };
  } catch (error) {
    console.warn(
      "Could not resolve declaration location for variable:",
      runtimeVariable.name,
      error
    );

    return undefined;
  }
}

function sameDefinitionLocation(
  declarationLocation: ResolvedDeclarationLocation,
  watchedVariable: WatchedVariable
): boolean {
  if (!declarationLocation.uri) {
    return false;
  }

  const sameUri =
    normalizeFileUri(declarationLocation.uri) ===
    normalizeFileUri(watchedVariable.definitionUri);

  const sameLine =
    declarationLocation.line === watchedVariable.definitionLine;

  const columnCloseEnough =
    Math.abs(declarationLocation.column - watchedVariable.definitionChar) <= 2;

  return sameUri && sameLine && columnCloseEnough;
}

function normalizeFileUri(uri: vscode.Uri): string {
  const normalizedPath = uri.fsPath.replace(/\\/g, "/");

  if (process.platform === "win32") {
    return normalizedPath.toLowerCase();
  }

  return normalizedPath;
}

function normalizeJavaTypeName(typeName: string): string {
  return typeName
    .replace(/\s*\(.*\)$/, "")
    .replace(/\[\]$/, "")
    .split(".")
    .pop() ?? typeName;
}

function extractObjectIdFromVariableValue(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const atIndex = value.lastIndexOf("@");

  if (atIndex === -1 || atIndex === value.length - 1) {
    return undefined;
  }

  const suffix = value.slice(atIndex + 1);
  const match = suffix.match(/\d+/);

  if (!match) {
    return undefined;
  }

  const objectId = Number(match[0]);

  return Number.isFinite(objectId) ? objectId : undefined;
}