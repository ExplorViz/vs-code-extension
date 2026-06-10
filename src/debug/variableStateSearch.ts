import * as vscode from "vscode";
import { DebugProtocol } from "@vscode/debugprotocol";

import { ExtensionState } from "../state/extensionState";
import {
  MatchConfidence,
  OwnerType,
  RuntimeOwnerGroup,
  RuntimeVariableValue,
  VariableName,
  WatchedVariable,
} from "./types";

type ScopeKind = "local" | "param" | "this" | "static" | "global" | "object";

type RuntimePathSegment = {
  name: string;
  type?: string;
};

interface RuntimeContext {
  scopeKind: ScopeKind;
  ownerName?: string;
  ownerType?: string;
  path: RuntimePathSegment[];
}

interface RuntimeVariableMatch {
  watchedVariableId: string;
  watchedVariable: WatchedVariable;

  runtimeVariable: DebugProtocol.Variable;

  value: string;
  type?: string;

  ownerName?: string;
  ownerType?: string;
  path: RuntimePathSegment[];

  matchConfidence: MatchConfidence;
}

interface RuntimeMatchQuickPickItem extends vscode.QuickPickItem {
  itemType: "owner-type-group" | "runtime-match";
  ownerTypeKey: string;
  match?: RuntimeVariableMatch;
}

interface SnapshotSelectionContext {
  consumedOwnerTypesByVariableName: Map<VariableName, Set<string>>;
}

interface ResolvedDeclarationLocation {
  uri?: vscode.Uri;
  sourceName?: string;
  sourceReference?: number;
  line: number;
  column: number;
}

export async function searchVariablesInCurrentStackFrames(
  state: ExtensionState,
  session: vscode.DebugSession,
  threadId: number
): Promise<void> {
  clearCurrentSnapshotValues(state);

  const runtimeVariableMatchesByWatchedVariableId = new Map<string, RuntimeVariableMatch[]>();

  const selectionContext: SnapshotSelectionContext = {
    consumedOwnerTypesByVariableName: new Map(),
  };

  const stackTrace = await dapRequest<DebugProtocol.StackTraceResponse["body"]>(
    session,
    "stackTrace",
    {
      threadId,
    } satisfies DebugProtocol.StackTraceArguments
  );

  const stackFrames = stackTrace.stackFrames;

  if (stackFrames.length === 0) {
    vscode.window.showInformationMessage("No stack frame found.");
    return;
  }

  for (const stackFrame of stackFrames) {
    await searchVariablesInStackFrame(
      state,
      session,
      stackFrame,
      runtimeVariableMatchesByWatchedVariableId
    );
  }

  await resolveMatchesAndStoreStateValues(
    state,
    runtimeVariableMatchesByWatchedVariableId,
    selectionContext
  );

  console.log(
    "Search completed. Collected variables:",
    state.variables.variableSnapshotEntryByWatchedVariableId
  );
}

function clearCurrentSnapshotValues(state: ExtensionState): void {
  state.variables.variableSnapshotEntryByWatchedVariableId.clear();
}

async function searchVariablesInStackFrame(
  state: ExtensionState,
  session: vscode.DebugSession,
  stackFrame: DebugProtocol.StackFrame,
  matchesByWatchedVariableId: Map<string, RuntimeVariableMatch[]>
): Promise<void> {
  const scopesResponse = await dapRequest<DebugProtocol.ScopesResponse["body"]>(
    session,
    "scopes",
    {
      frameId: stackFrame.id,
    } satisfies DebugProtocol.ScopesArguments
  );

  const scopes = scopesResponse.scopes;

  for (const scope of scopes) {
    const scopeKind = classifyScope(scope.name);

    if (!scopeKind) {
      console.log("Skipping scope:", scope.name);
      continue;
    }

    const rootContext: RuntimeContext = {
      scopeKind,
      ownerName: scope.name,
      ownerType: undefined,
      path: [
        {
          name: `${stackFrame.name}.${scope.name}`,
          type: scopeKind,
        },
      ],
    };

    await searchVariablesByReference(
      state,
      session,
      scope.variablesReference,
      rootContext,
      new Set<number>(),
      matchesByWatchedVariableId
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
  visitedReferences: Set<number>,
  matchesByWatchedVariableId: Map<string, RuntimeVariableMatch[]>
): Promise<void> {
  if (variablesReference <= 0 || visitedReferences.has(variablesReference)) {
    return;
  }

  visitedReferences.add(variablesReference);

  const variablesResponse =
    await dapRequest<DebugProtocol.VariablesResponse["body"]>(
      session,
      "variables",
      {
        variablesReference,
      } satisfies DebugProtocol.VariablesArguments
    );

  const variables = variablesResponse.variables;

  for (const runtimeVariable of variables) {
    await collectIfWatchedVariable(
      state,
      session,
      runtimeVariable,
      context,
      matchesByWatchedVariableId
    );

    if (runtimeVariable.variablesReference <= 0) {
      continue;
    }

    const runtimeName = getRuntimeVariableDisplayName(runtimeVariable);
    const runtimeType = getRuntimeVariableType(runtimeVariable);

    const childContext: RuntimeContext = {
      scopeKind: "object",
      ownerName: runtimeName,
      ownerType: runtimeType,
      path: appendRuntimePathSegment(context.path, {
        name: runtimeName,
        type: runtimeType,
      }),
    };

    await searchVariablesByReference(
      state,
      session,
      runtimeVariable.variablesReference,
      childContext,
      visitedReferences,
      matchesByWatchedVariableId
    );
  }
}

async function collectIfWatchedVariable(
  state: ExtensionState,
  session: vscode.DebugSession,
  runtimeVariable: DebugProtocol.Variable,
  context: RuntimeContext,
  matchesByWatchedVariableId: Map<string, RuntimeVariableMatch[]>
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

    const runtimeName = getRuntimeVariableDisplayName(runtimeVariable);
    const runtimeType = getRuntimeVariableType(runtimeVariable);

    const match: RuntimeVariableMatch = {
      watchedVariableId,
      watchedVariable,

      runtimeVariable,

      value: runtimeName,
      type: runtimeType,

      ownerName: context.ownerName,
      ownerType: context.ownerType,
      path: appendRuntimePathSegment(context.path, {
        name: runtimeName,
        type: runtimeType,
      }),

      matchConfidence,
    };

    const matches = matchesByWatchedVariableId.get(watchedVariableId) ?? [];
    matches.push(match);
    matchesByWatchedVariableId.set(watchedVariableId, matches);

    console.log(
      "Collected watched variable candidate:",
      watchedVariable.name,
      "value:",
      runtimeVariable.value,
      "type:",
      runtimeType,
      "confidence:",
      matchConfidence,
      "path:",
      formatRuntimePath(match.path),
      "owner type:",
      context.ownerType
    );
  }
}

async function getMatchConfidence(
  session: vscode.DebugSession,
  runtimeVariable: DebugProtocol.Variable,
  watchedVariable: WatchedVariable,
  context: RuntimeContext
): Promise<MatchConfidence | undefined> {
  if (runtimeVariable.name !== watchedVariable.name) {
    return undefined;
  }

  /*const declarationLocation = await tryResolveDeclarationLocation(
    session,
    runtimeVariable
  );

  if (
    declarationLocation &&
    sameDefinitionLocation(declarationLocation, watchedVariable)
  ) {
    return "declaration-location";
  }*/

  return getHeuristicMatchConfidence(runtimeVariable, watchedVariable, context);
}

function getHeuristicMatchConfidence(
  runtimeVariable: DebugProtocol.Variable,
  watchedVariable: WatchedVariable,
  context: RuntimeContext
): MatchConfidence | undefined {
  // always false if this method fires
  /*if (runtimeVariable.name !== watchedVariable.name) {
    return undefined;
  }*/

  if (!context.ownerType || !watchedVariable.containingTypeName) {
    return "name-only";
  }

  // TODO: might be problematic for same class names within different packages
  const ownerType = normalizeJavaTypeName(context.ownerType);
  const containingTypeName = normalizeJavaTypeName(
    watchedVariable.containingTypeName
  );

  if (ownerType === containingTypeName) {
    return "owner-type";
  }

  const knownSubtypeNames = watchedVariable.knownSubtypeNames ?? [];

  const normalizedKnownSubtypeNames =
    knownSubtypeNames.map(normalizeJavaTypeName);

  if (normalizedKnownSubtypeNames.includes(ownerType)) {
    return "known-subtype";
  }

  return "name-only";
}

async function resolveMatchesAndStoreStateValues(
  state: ExtensionState,
  matchesByWatchedVariableId: Map<string, RuntimeVariableMatch[]>,
  selectionContext: SnapshotSelectionContext
): Promise<void> {
  for (const [watchedVariableId, matches] of matchesByWatchedVariableId) {
    if (matches.length === 0) {
      continue;
    }

    const availableMatches = filterAlreadyConsumedMatchesForVariableName(
      matches,
      selectionContext
    );

    if (availableMatches.length === 0) {
      console.log(
        `No remaining runtime matches for watched variable "${matches[0]?.watchedVariable.name}".`
      );
      continue;
    }

    const selectedMatches = await selectMatchesForWatchedVariable(
      availableMatches
    );

    if (selectedMatches.length === 0) {
      continue;
    }

    markSelectedOwnerTypesAsConsumedForVariableName(
      selectedMatches,
      selectionContext
    );

    const ownerGroup = createRuntimeOwnerGroup(selectedMatches);

    selectedMatches.forEach(match => console.log("MATCH: ", match.watchedVariable.definitionUri));

    state.variables.variableSnapshotEntryByWatchedVariableId.set(
      watchedVariableId,
      {ownerGroup: ownerGroup, name: selectedMatches[0].watchedVariable.name, id: watchedVariableId, definitionUri: selectedMatches[0].watchedVariable.definitionUri}
    );
  }
}

function createRuntimeOwnerGroup(
  matches: RuntimeVariableMatch[]
): RuntimeOwnerGroup {
  if (matches.length === 0) {
    throw new Error("Cannot create RuntimeOwnerGroup from empty matches.");
  }

  const ownerTypeKeys = new Set(matches.map(getOwnerTypeKey));

  if (ownerTypeKeys.size !== 1) {
    throw new Error(
      `Cannot create RuntimeOwnerGroup from matches with different owner types: ${Array.from(
        ownerTypeKeys
      ).join(", ")}`
    );
  }

  const firstMatch = matches[0];

  return {
    ownerType: firstMatch.ownerType ?? "unknown",
    values: matches.map((match) => ({
      value: match.value,
      type: match.type ?? "unknown",
      matchConfidence: match.matchConfidence,
      runtimePath: formatRuntimePath(match.path),
    })),
  };
}

function filterAlreadyConsumedMatchesForVariableName(
  matches: RuntimeVariableMatch[],
  selectionContext: SnapshotSelectionContext
): RuntimeVariableMatch[] {
  return matches.filter((match) => {
    const variableName = match.watchedVariable.name;
    const ownerTypeKey = getOwnerTypeKey(match);

    const consumedOwnerTypes =
      selectionContext.consumedOwnerTypesByVariableName.get(variableName);

    return !consumedOwnerTypes?.has(ownerTypeKey);
  });
}

function markSelectedOwnerTypesAsConsumedForVariableName(
  selectedMatches: RuntimeVariableMatch[],
  selectionContext: SnapshotSelectionContext
): void {
  for (const match of selectedMatches) {
    const variableName = match.watchedVariable.name;
    const ownerTypeKey = getOwnerTypeKey(match);

    const consumedOwnerTypes =
      selectionContext.consumedOwnerTypesByVariableName.get(variableName) ??
      new Set<string>();

    consumedOwnerTypes.add(ownerTypeKey);

    selectionContext.consumedOwnerTypesByVariableName.set(
      variableName,
      consumedOwnerTypes
    );
  }
}

// Only shows the best matches, preventing user from information overload of unimportant matches 
async function selectMatchesForWatchedVariable(
  matches: RuntimeVariableMatch[]
): Promise<RuntimeVariableMatch[]> {
  const declarationLocationMatches = matches.filter(
    (match) => match.matchConfidence === "declaration-location"
  );

  if (declarationLocationMatches.length === 1) {
    return declarationLocationMatches;
  }

  if (declarationLocationMatches.length > 1) {
    // Give user the option to select specific instances (or all)
    return askUserToSelectRuntimeMatches(declarationLocationMatches);
  }

  const ownerTypeMatches = matches.filter(
    (match) => match.matchConfidence === "owner-type"
  );

  if (ownerTypeMatches.length === 1) {
    return ownerTypeMatches;
  }

  if (ownerTypeMatches.length > 1) {
    return askUserToSelectRuntimeMatches(ownerTypeMatches);
  }

  const knownSubtypeMatches = matches.filter(
    (match) => match.matchConfidence === "known-subtype"
  );

  if (knownSubtypeMatches.length === 1) {
    return knownSubtypeMatches;
  }

  if (knownSubtypeMatches.length > 1) {
    return askUserToSelectRuntimeMatches(knownSubtypeMatches);
  }

  if (matches.length === 1) {
    return matches;
  }

  return askUserToSelectRuntimeMatches(matches);
}

async function askUserToSelectRuntimeMatches(
  matches: RuntimeVariableMatch[]
): Promise<RuntimeVariableMatch[]> {
  const firstMatch = matches[0];

  return new Promise((resolve) => {
    const quickPick =
      vscode.window.createQuickPick<RuntimeMatchQuickPickItem>();

    quickPick.canSelectMany = true;

    const ownerTypeCount = groupMatchesByOwnerType(matches).size;

    quickPick.title =
      ownerTypeCount > 1
        ? `Choose runtime values for "${firstMatch.watchedVariable.name}" from one owner type`
        : `Choose runtime values for "${firstMatch.watchedVariable.name}"`;

    quickPick.placeholder =
      "Select one owner type group or individual runtime values from the same owner type.";

    quickPick.items = buildRuntimeMatchQuickPickItems(matches);

    let selectedOwnerTypeKey: string | undefined;
    let isProgrammaticSelectionUpdate = false;
    let accepted = false;

    quickPick.onDidChangeSelection((selectedItems) => {
      if (isProgrammaticSelectionUpdate) {
        return;
      }

      const selected = Array.from(selectedItems);

      if (selected.length === 0) {
        selectedOwnerTypeKey = undefined;
        return;
      }

      const selectedOwnerTypeKeys = new Set(
        selected.map((item) => item.ownerTypeKey)
      );

      if (selectedOwnerTypeKeys.size > 1) {
        vscode.window.showWarningMessage(
          "Please select runtime values from only one owner type."
        );

        if (!selectedOwnerTypeKey) {
          selectedOwnerTypeKey = Array.from(selectedOwnerTypeKeys)[0];
        }

        isProgrammaticSelectionUpdate = true;

        try {
          quickPick.selectedItems = selected.filter(
            (item) => item.ownerTypeKey === selectedOwnerTypeKey
          );
        } finally {
          isProgrammaticSelectionUpdate = false;
        }

        return;
      }

      selectedOwnerTypeKey = Array.from(selectedOwnerTypeKeys)[0];

      const selectedOwnerTypeGroup = selected.find(
        (item) => item.itemType === "owner-type-group"
      );

      if (!selectedOwnerTypeGroup) {
        return;
      }

      const ownerTypeKey = selectedOwnerTypeGroup.ownerTypeKey;

      const allItemsOfSelectedOwnerType = quickPick.items.filter(
        (item) => item.ownerTypeKey === ownerTypeKey
      );

      const alreadySelectedKeys = new Set(
        selected.map(getRuntimeMatchQuickPickItemKey)
      );

      const needsSelectionUpdate = allItemsOfSelectedOwnerType.some(
        (item) => !alreadySelectedKeys.has(getRuntimeMatchQuickPickItemKey(item))
      );

      if (!needsSelectionUpdate) {
        return;
      }

      isProgrammaticSelectionUpdate = true;

      try {
        quickPick.selectedItems = allItemsOfSelectedOwnerType;
      } finally {
        isProgrammaticSelectionUpdate = false;
      }
    });

    quickPick.onDidAccept(() => {
      accepted = true;

      const selectedItems = Array.from(quickPick.selectedItems);

      const selectedMatches = resolveSelectedRuntimeMatches(
        selectedItems,
        matches
      );

      quickPick.hide();
      resolve(selectedMatches);
    });

    quickPick.onDidHide(() => {
      quickPick.dispose();

      if (!accepted) {
        resolve([]);
      }
    });

    quickPick.show();
  });
}

function getRuntimeMatchQuickPickItemKey(
  item: RuntimeMatchQuickPickItem
): string {
  if (item.itemType === "owner-type-group") {
    return `group:${item.ownerTypeKey}`;
  }

  if (item.match) {
    return [
      "match",
      item.ownerTypeKey,
      item.match.watchedVariableId,
      item.match.value,
      item.match.type ?? "unknown",
      formatRuntimePath(item.match.path),
    ].join("::");
  }

  return `item:${item.ownerTypeKey}:${item.label}:${item.description ?? ""}`;
}



function buildRuntimeMatchQuickPickItems(
  matches: RuntimeVariableMatch[]
): RuntimeMatchQuickPickItem[] {
  const matchesByOwnerType = groupMatchesByOwnerType(matches);

  const items: RuntimeMatchQuickPickItem[] = [];

  for (const [ownerTypeKey, ownerTypeMatches] of matchesByOwnerType) {
    items.push({
      itemType: "owner-type-group",
      ownerTypeKey,
      label: `$(layers) All ${ownerTypeKey} instances`,
      description: `${ownerTypeMatches.length} runtime match(es)`,
      detail: "Select this to include all runtime values with this owner type.",
      alwaysShow: true,
    });

    for (const match of ownerTypeMatches) {
      items.push({
        itemType: "runtime-match",
        ownerTypeKey,
        match,
        label: `$(symbol-field) ${match.watchedVariable.name}: ${match.type}`,
        description: match.ownerType
          ? `owner: ${match.ownerType}`
          : "owner: unknown",
        detail: [
          `value: ${match.value}`,
          `confidence: ${match.matchConfidence}`,
          `path: ${formatRuntimePath(match.path)}`,
        ].join("\n"),
      });
    }
  }

  return items;
}

function groupMatchesByOwnerType(
  matches: RuntimeVariableMatch[]
): Map<string, RuntimeVariableMatch[]> {
  const grouped = new Map<string, RuntimeVariableMatch[]>();

  for (const match of matches) {
    const ownerTypeKey = getOwnerTypeKey(match);

    const ownerTypeMatches = grouped.get(ownerTypeKey) ?? [];
    ownerTypeMatches.push(match);
    grouped.set(ownerTypeKey, ownerTypeMatches);
  }

  return grouped;
}

function resolveSelectedRuntimeMatches(
  selectedItems: RuntimeMatchQuickPickItem[],
  allMatches: RuntimeVariableMatch[]
): RuntimeVariableMatch[] {
  if (selectedItems.length === 0) {
    return [];
  }

  const selectedMatches = new Set<RuntimeVariableMatch>();

  const selectedOwnerTypeGroups = selectedItems.filter(
    (item) => item.itemType === "owner-type-group"
  );

  for (const selectedOwnerTypeGroup of selectedOwnerTypeGroups) {
    const ownerTypeKey = selectedOwnerTypeGroup.ownerTypeKey;

    for (const match of allMatches) {
      if (getOwnerTypeKey(match) === ownerTypeKey) {
        selectedMatches.add(match);
      }
    }
  }

  for (const selectedItem of selectedItems) {
    if (selectedItem.itemType !== "runtime-match") {
      continue;
    }

    if (!selectedItem.match) {
      continue;
    }

    selectedMatches.add(selectedItem.match);
  }

  return Array.from(selectedMatches);
}

function getOwnerTypeKey(match: RuntimeVariableMatch): string {
  return normalizeJavaTypeName(match.ownerType ?? "unknown"); // normalization needed?
}

// runtimeVariable.declarationLocationReference is undefined almost always
/*async function tryResolveDeclarationLocation(
  session: vscode.DebugSession,
  runtimeVariable: DebugProtocol.Variable
): Promise<ResolvedDeclarationLocation | undefined> {
  const locationReference = runtimeVariable.declarationLocationReference;

  if (typeof locationReference !== "number" || locationReference <= 0) {
    return undefined;
  }

  try {
    const locationsResponse =
      await dapRequest<DebugProtocol.LocationsResponse["body"]>(
        session,
        "locations",
        {
          locationReference,
        } satisfies DebugProtocol.LocationsArguments
      );

    if (!locationsResponse) {
      return undefined;
    }

    const source = locationsResponse.source;

    return {
      uri: source.path ? vscode.Uri.file(source.path) : undefined,
      sourceName: source.name,
      sourceReference: source.sourceReference,

      // VS Code works internally 0-based.
      line: locationsResponse.line - 1,
      column:
        typeof locationsResponse.column === "number"
          ? locationsResponse.column - 1
          : 0,
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

  const sameLine = declarationLocation.line === watchedVariable.definitionLine;

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
}*/

function normalizeJavaTypeName(typeName: string): string {
  return (
    typeName
      .replace(/\s*\(.*\)$/, "")
      .replace(/\[\]$/, "")
      .split(".")
      .pop() ?? typeName
  );
}

function getRuntimeVariableDisplayName(
  variable: DebugProtocol.Variable
): string {
  const name = variable.name.trim();

  return name && name.length > 0 ? name : "<anonymous>";
}

function getRuntimeVariableType(
  variable: DebugProtocol.Variable
): string | undefined {
  const type = variable.type?.trim();

  if (type && type.length > 0) {
    return type;
  }

  return extractTypeNameFromVariableValue(variable.value);
}

function extractTypeNameFromVariableValue(value: string): string | undefined {
  const match = value.match(
    /^([A-Za-z_$][\w$]*(?:\$[A-Za-z_$][\w$]*)?(?:\.[A-Za-z_$][\w$]*)*)@\d+/
  );

  return match?.[1];
}

function appendRuntimePathSegment(
  path: RuntimePathSegment[],
  segment: RuntimePathSegment
): RuntimePathSegment[] {
  const name = segment.name.trim();
  const type = segment.type?.trim();

  if (name === "<anonymous>" && !type) {
    return path;
  }

  return [
    ...path,
    {
      name,
      type,
    },
  ];
}

function formatRuntimePath(path: RuntimePathSegment[]): string {
  return path
    .map((segment) => {
      if (segment.type) {
        return `${segment.name}: ${segment.type}`;
      }

      return segment.name;
    })
    .join(" → ");
}

async function dapRequest<TResponse>(
  session: vscode.DebugSession,
  command: string,
  args?: unknown
): Promise<TResponse> {
  return session.customRequest(command, args) as Promise<TResponse>;
}