import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { 
    exportTraceBundle, initExporter, disposeExporter, setExporterTokenSecret, setExporterServiceName } from './otlpExporter';

/**
 * Normalize file paths consistently for comparison and storage.
 * Handles file:// URIs, resolves symlinks, and normalizes separators.
 */
function normalizePath(p: string | undefined): string {
  if (!p) return '';
  const original = p;
  try {
    if (p.startsWith('file://')) {
      p = decodeURIComponent(new URL(p).pathname);
    }
  } catch (e) {
    // ignore
  }
  const result = path.normalize(path.resolve(p));
  if (original !== result) {
    try {
      debugOut.appendLine(`[normalizePath] "${original}" → "${result}"`);
    } catch (e) {
    }
  }
  return result;
}

type BreakpointMeta = {
  fqn: string;
  file: string;
  line: number;
  classFqn?: string;
  methodName?: string;
};

let installedBreakpoints: vscode.Breakpoint[] = [];
const breakpointMeta = new Map<vscode.Breakpoint, BreakpointMeta>();
const metaByFileLine = new Map<string, BreakpointMeta>();
const traceIdBySession = new Map<string, string>();
let tracingEnabled = false;
const lastSpanByThread = new Map<number, { traceId: string; spanId: string }>();
// active span stacks per thread to model nested entry/exit
const activeSpansByThread = new Map<number, Array<any>>();
// Track last active span per trace (for cross-thread async handoff)
const lastActiveSpanByTrace = new Map<string, { spanId: string; threadId: number; timestamp: number }>();
let maxBreakpoints = 1000;
let collectorEndpoint = 'grpc://localhost:55678';
// remember preferred method per class (to keep stable naming/relations)
const preferredMethodByClass = new Map<string, { method: string; namespace?: string }>();

// Configurable service name for OTLP exports
let configuredServiceName = 'spring-petclinic';

// Only create spans for frames that match these important package/class prefixes
// or when we have explicit managed metadata for the frame. Adjust as needed.
let importantScopes: string[] = [
  'org.springframework.samples',
];

// Track which classes have had init spans created per trace to avoid duplicates
const initializedClassesByTrace = new Map<string, Set<string>>();

// Cache of class dependencies: classFqn -> Set of dependent class FQNs
const classDependencyCache = new Map<string, Set<string>>();

// Cache of resolved class FQNs by simple name within a file
const importCacheByFile = new Map<string, Map<string, string>>();

/**
 * Analyze a Java source file and extract class dependencies.
 * Returns a set of fully-qualified class names that this class depends on.
 */
function analyzeClassDependencies(filePath: string, classFqn: string): Set<string> {
  // Return cached result if available
  if (classDependencyCache.has(classFqn)) {
    return classDependencyCache.get(classFqn)!;
  }

  const deps = new Set<string>();
  
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const pkg = text.match(/\bpackage\s+([\w\.]+)\s*;/)?.[1];
    
    // Build import map for this file
    const importMap = new Map<string, string>();
    const wildcardPkgs: string[] = [];
    const importRe = /import\s+([\w\.]+)(?:\.(\*))?\s*;/g;
    let im: RegExpExecArray | null;
    while ((im = importRe.exec(text)) !== null) {
      const full = im[1];
      const isWild = !!im[2];
      if (isWild) {
        wildcardPkgs.push(full);
      } else {
        const parts = full.split('.');
        const simple = parts[parts.length - 1];
        importMap.set(simple, full);
      }
    }
    importCacheByFile.set(filePath, importMap);
    
    // Standard library prefixes to exclude
    const stdPrefixes = ['java.', 'javax.', 'kotlin.', 'scala.', 'com.sun.', 'sun.', 'org.slf4j.', 'org.apache.commons.'];
    
    const resolveClassName = (simpleName: string): string | undefined => {
      if (!simpleName || simpleName.length < 2) return undefined;
      // Skip primitives and common Java types
      if (['int', 'long', 'boolean', 'double', 'float', 'byte', 'char', 'short', 'void', 
           'String', 'Integer', 'Long', 'Boolean', 'Double', 'Float', 'Object', 'Class',
           'List', 'Map', 'Set', 'Collection', 'Optional', 'Stream'].includes(simpleName)) return undefined;
      if (isLikelyJdkType(simpleName)) return undefined;
      
      let fq: string | undefined;
      if (importMap.has(simpleName)) {
        fq = importMap.get(simpleName);
      } else if (pkg) {
        // Assume same package
        fq = `${pkg}.${simpleName}`;
        if (!findJavaFileForClass(fq)) return undefined;
      } else {
        // Try wildcard imports that match important scopes
        for (const wp of wildcardPkgs) {
          if (importantScopes.some(p => wp.startsWith(p) || wp.indexOf(p) >= 0)) {
            const candidate = `${wp}.${simpleName}`;
            if (findJavaFileForClass(candidate)) {
              fq = candidate;
              break;
            }
          }
        }
      }
      
      if (!fq) return undefined;
      // Exclude standard library
      for (const sp of stdPrefixes) {
        if (fq.startsWith(sp)) return undefined;
      }
      // Must be in important scopes (strict prefix match)
      if (!isInImportantScopes(fq)) return undefined;
      return fq;
    };

    // 1. Extends/implements
    const extendsMatch = text.match(/\bclass\s+\w+\s+extends\s+([A-Z][A-Za-z0-9_]*)/);
    if (extendsMatch) {
      const fq = resolveClassName(extendsMatch[1]);
      if (fq) deps.add(fq);
    }
    
    const implementsMatch = text.match(/\bimplements\s+([A-Z][A-Za-z0-9_,\s]+)/);
    if (implementsMatch) {
      const interfaces = implementsMatch[1].split(/[,\s]+/).filter(s => s.match(/^[A-Z]/));
      for (const iface of interfaces) {
        const fq = resolveClassName(iface.trim());
        if (fq) deps.add(fq);
      }
    }

    // 2. Field declarations (private/public/protected ClassName fieldName)
    const fieldRe = /(?:private|public|protected|final|static|\s)+\s+([A-Z][A-Za-z0-9_]*)\s+\w+\s*[;=]/g;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(text)) !== null) {
      const fq = resolveClassName(fm[1]);
      if (fq) deps.add(fq);
    }

    // 3. Constructor/method parameters with types
    const paramRe = /\(\s*(?:final\s+)?([A-Z][A-Za-z0-9_]*)\s+\w+/g;
    let pm: RegExpExecArray | null;
    while ((pm = paramRe.exec(text)) !== null) {
      const fq = resolveClassName(pm[1]);
      if (fq) deps.add(fq);
    }

    // 4. new ClassName() constructor calls
    const newRe = /new\s+([A-Z][A-Za-z0-9_]*)\s*\(/g;
    let nm: RegExpExecArray | null;
    while ((nm = newRe.exec(text)) !== null) {
      const fq = resolveClassName(nm[1]);
      if (fq) deps.add(fq);
    }

    // 5. Static method calls ClassName.method()
    const staticRe = /([A-Z][A-Za-z0-9_]*)\.[\w]+\s*\(/g;
    let sm: RegExpExecArray | null;
    while ((sm = staticRe.exec(text)) !== null) {
      const fq = resolveClassName(sm[1]);
      if (fq) deps.add(fq);
    }

    // 6. Method return types
    const methodRe = /(?:public|private|protected|static|\s)+\s+([A-Z][A-Za-z0-9_]*)\s+\w+\s*\(/g;
    let mm: RegExpExecArray | null;
    while ((mm = methodRe.exec(text)) !== null) {
      const fq = resolveClassName(mm[1]);
      if (fq) deps.add(fq);
    }

    // Remove self-reference
    deps.delete(classFqn);

  } catch (e) {
    // Ignore file read errors
  }

  classDependencyCache.set(classFqn, deps);
  return deps;
}

/**
 * Generate init spans for a class and its dependencies that haven't been seen yet.
 * Returns an array of OTLP spans to add to the bundle.
 */
function generateDependencyInitSpans(
  traceId: string,
  classFqn: string,
  filePath: string,
  parentSpanId: string,
  now: number,
  depth: number = 0
): any[] {
  const spans: any[] = [];
  
  // Limit recursion depth to avoid infinite loops
  if (depth > 5) return spans;
  
  // Get or create the set of initialized classes for this trace
  let initialized = initializedClassesByTrace.get(traceId);
  if (!initialized) {
    initialized = new Set<string>();
    initializedClassesByTrace.set(traceId, initialized);
  }

  // If we've already processed this class in this trace, skip
  if (initialized.has(classFqn)) {
    return spans;
  }
  initialized.add(classFqn);

  // Get dependencies
  const deps = analyzeClassDependencies(filePath, classFqn);
  
  // Separate superclass from other dependencies for proper chain
  let superclassFqn: string | undefined;
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const extendsMatch = text.match(/\bclass\s+\w+\s+extends\s+([A-Z][A-Za-z0-9_]*)/);
    if (extendsMatch) {
      // Resolve the superclass name
      const simpleName = extendsMatch[1];
      const importMap = importCacheByFile.get(filePath);
      if (importMap && importMap.has(simpleName)) {
        superclassFqn = importMap.get(simpleName);
      } else {
        const pkg = text.match(/\bpackage\s+([\w\.]+)\s*;/)?.[1];
        if (pkg) superclassFqn = `${pkg}.${simpleName}`;
      }
      // Validate it's in important scopes (strict prefix match)
      if (superclassFqn && !isInImportantScopes(superclassFqn)) {
        superclassFqn = undefined;
      }
    }
  } catch (e) {}

  // Create init spans for dependencies (excluding superclass, handled separately)
  for (const depFqn of deps) {
    if (!initialized.has(depFqn) && depFqn !== superclassFqn) {
      initialized.add(depFqn);
      
      const simpleClass = depFqn.split('.').pop() || depFqn;
      const depSpanId = crypto.randomBytes(8).toString('hex');
      
      const depSpan = {
        traceId: traceId,
        spanId: depSpanId,
        parentSpanId: parentSpanId,
        name: `${simpleClass}.<clinit>`,
        startTimeUnixNano: String(now * 1000000),
        endTimeUnixNano: String(now * 1000000),
        attributes: [
          { key: 'code.function', value: { stringValue: '<clinit>' } },
          { key: 'code.namespace', value: { stringValue: depFqn } },
          { key: 'java.fqn', value: { stringValue: `${depFqn}.<clinit>` } },
          { key: 'dependency.of', value: { stringValue: classFqn } },
        ],
      };
      spans.push(depSpan);
    }
  }

  // Handle superclass specially - create an <init> span as a CHILD of the current class's init
  // This reflects the JVM behavior where super() is called from within the constructor
  if (superclassFqn && !initialized.has(superclassFqn)) {
    initialized.add(superclassFqn);
    
    const simpleClass = superclassFqn.split('.').pop() || superclassFqn;
    const superSpanId = crypto.randomBytes(8).toString('hex');
    
    const superSpan = {
      traceId: traceId,
      spanId: superSpanId,
      parentSpanId: parentSpanId, // Parent is the current class's init
      name: `${simpleClass}.<init>`,
      startTimeUnixNano: String(now * 1000000),
      endTimeUnixNano: String(now * 1000000),
      attributes: [
        { key: 'code.function', value: { stringValue: '<init>' } },
        { key: 'code.namespace', value: { stringValue: superclassFqn } },
        { key: 'java.fqn', value: { stringValue: `${superclassFqn}.<init>` } },
      ],
    };
    spans.push(superSpan);
    
    // Recursively get dependencies of the superclass
    try {
      // Find the superclass file
      const superFiles = findJavaFileForClass(superclassFqn);
      if (superFiles) {
        const recursiveSpans = generateDependencyInitSpans(traceId, superclassFqn, superFiles, superSpanId, now, depth + 1);
        spans.push(...recursiveSpans);
      }
    } catch (e) {}
  }

  return spans;
}

/**
 * Try to find a Java source file for a given fully-qualified class name.
 */
function findJavaFileForClass(classFqn: string): string | undefined {
  // Convert FQN to path pattern: org.example.MyClass -> org/example/MyClass.java
  const pathParts = classFqn.split('.');
  const simpleClass = pathParts.pop();
  const packagePath = pathParts.join('/');
  
  // Look in workspace folders
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        const commonDirs = ['src/main/java', 'src', 'java'];
        for (const dir of commonDirs) {
          const candidate = path.join(folder.uri.fsPath, dir, packagePath, `${simpleClass}.java`);
          if (fs.existsSync(candidate)) {
            return candidate;
          }
        }
      }
    }
  } catch (e) {}
  return undefined;
}

/**
 * Clean up trace-specific tracking when a trace is flushed.
 */
function cleanupTraceTracking(traceId: string) {
  initializedClassesByTrace.delete(traceId);
}

/**
 * Configure tracing parameters. Call before startTracing.
 */
export function configureTracing(options: {
  serviceName?: string;
  scopes?: string[];
  endpoint?: string;
  maxBreakpoints?: number;
  landscapeToken?: string;
  tokenSecret?: string;
}) {
  if (options.serviceName) {
    configuredServiceName = options.serviceName;
    setExporterServiceName(options.serviceName);
  }
  if (options.scopes && options.scopes.length > 0) importantScopes = options.scopes;
  if (options.endpoint) collectorEndpoint = options.endpoint;
  if (options.maxBreakpoints) maxBreakpoints = options.maxBreakpoints;
  if (options.landscapeToken || options.tokenSecret) {
    setExporterTokenSecret(options.landscapeToken, options.tokenSecret);
  }
  // debugOut.appendLine(`[Config] service=${configuredServiceName} scopes=${importantScopes.join(',')} endpoint=${collectorEndpoint}`);
}

/**
 * Check if a fully-qualified class name is within the configured important scopes.
 * This is the single point of truth for scope filtering.
 */
function isInImportantScopes(fqn?: string): boolean {
  if (!fqn) return false;
  const normalized = String(fqn).trim();
  if (!normalized || normalized === 'undefined') return false;
  
  // Must match at least one important scope prefix
  for (const scope of importantScopes) {
    if (normalized.startsWith(scope)) return true;
  }
  return false;
}

function isLikelyJdkType(simpleName?: string): boolean {
  if (!simpleName) return true;
  const s = String(simpleName).trim();
  if (!s) return true;
  return [
    'String', 'Object', 'Class', 'Integer', 'Long', 'Double', 'Float', 'Boolean', 'Character', 'Byte', 'Short',
    'List', 'Map', 'Set', 'Collection', 'Optional', 'Stream', 'Page',
    'RuntimeException', 'Exception', 'Error', 'Throwable',
    'IllegalArgumentException', 'IllegalStateException', 'NullPointerException',
    'UnsupportedOperationException', 'IndexOutOfBoundsException', 'NoSuchElementException',
  ].includes(s);
}

const debugOut = vscode.window.createOutputChannel('ExplorViz Debug');


export type PreviewResult = { count: number; samples: BreakpointMeta[] };

export async function startTracing(options?: { limit?: number; dryRun?: boolean }) {
  if (tracingEnabled) return;
  tracingEnabled = true;
  if (options?.limit) maxBreakpoints = options.limit;

  // Find java files and set breakpoints at method-like lines (simple heuristic)
  const files = await vscode.workspace.findFiles('**/*.java');
  const bps: vscode.Breakpoint[] = [];
  for (const fileUri of files) {
    if (bps.length >= maxBreakpoints) break;
    try {
      const doc = await vscode.workspace.openTextDocument(fileUri);
      const lines = doc.getText().split(/\r?\n/);
      for (let i = 0; i < lines.length && bps.length < maxBreakpoints; i++) {
        const line = lines[i].trim();
        // crude heuristic: method declaration lines often contain ')' and '{'
        if ((line.endsWith(') {') || line.endsWith('){') || line.match(/\)\s*throws\s+/))) {
          // skip common control-flow statements (if/for/while/..) and annotations
          const controlStmt = /^\s*(if|for|while|switch|catch|else|do|synchronized)\b/;
          if (controlStmt.test(line) || line.startsWith('@')) continue;
          const uri = fileUri;
          const bp = new vscode.SourceBreakpoint(new vscode.Location(uri, new vscode.Position(i, 0)), true);
          bps.push(bp);
          // build meta and try to infer package/class/method
          const meta: BreakpointMeta = {
            fqn: `${path.basename(fileUri.fsPath)}:${i + 1}`,
            file: fileUri.fsPath,
            line: i + 1,
          };
          try {
            const headerText = doc.getText().split(/\r?\n/).slice(0, i + 1).join('\n');
            const pkgMatch = headerText.match(/\bpackage\s+([\w\.]+)\s*;/);
            const packageName = pkgMatch ? pkgMatch[1] : undefined;
            let className: string | undefined = undefined;
            for (let j = i; j >= 0; j--) {
              const ln = doc.lineAt(j).text;
              const cls = ln.match(/\b(class|interface|enum)\s+([A-Za-z_\$][A-Za-z0-9_\$]*)/);
              if (cls) {
                className = cls[2];
                break;
              }
            }
            const classFqn = className ? (packageName ? `${packageName}.${className}` : className) : undefined;
            const methodMatch = lines[i].match(/([A-Za-z_\$][A-Za-z0-9_\$]*)\s*\(/);
            const methodName = methodMatch ? methodMatch[1] : undefined;
            meta.classFqn = classFqn;
            meta.methodName = methodName;
          } catch (e) {
            // ignore inference errors
          }
          // Only install breakpoints for classes within important scopes
          const shouldInstall = isInImportantScopes(meta.classFqn);
          // Do not install breakpoints for configuration sources (e.g. *Config, *Configuration)
          if (isConfigurationSource(meta.file, meta.classFqn)) {
            // remove previously pushed placeholder breakpoint and skip
            bps.pop();
            continue;
          }
          if (!shouldInstall) {
            // remove the previously pushed breakpoint placeholder
            bps.pop();
            continue;
          }
          breakpointMeta.set(bp, meta);
          // Use classFqn:methodName:line instead of file:line to handle inheritance
          // (parent/child classes may have same line numbers, debugger returns actual execution file)
          const storeKey = meta.classFqn && meta.methodName 
            ? `${meta.classFqn}:${meta.methodName}:${meta.line}`
            : `${normalizePath(meta.file)}:${meta.line}`;
          metaByFileLine.set(storeKey, meta);
        }
      }
    } catch (e) {
      console.warn('startTracing: failed to open', fileUri.toString(), e);
    }
  }
  installedBreakpoints = bps;
  if (bps.length > 0) {
    vscode.debug.addBreakpoints(bps);
    vscode.window.showInformationMessage(`ExplorViz: Installed ${bps.length} breakpoints for tracing (limit ${maxBreakpoints})`);
    try {
      initExporter(collectorEndpoint);
    } catch (e) {}
  } else {
    vscode.window.showInformationMessage(`ExplorViz: No candidate methods found for tracing`);
  }
}

export function stopTracing() {
  if (!tracingEnabled) return;
  tracingEnabled = false;
  try {
    // Remove all breakpoints (both user-installed and tracing-installed)
    const allBreakpoints = vscode.debug.breakpoints;
    if (allBreakpoints.length > 0) {
      vscode.debug.removeBreakpoints(allBreakpoints);
    }
  } catch (e) {
    console.warn('stopTracing: failed to remove breakpoints', e);
  } finally {
    try {
      stopBatching();
    } catch (e) {}
    try {
      disposeExporter();
    } catch (e) {}

    // Clean up all state maps to prevent memory leaks
    installedBreakpoints = [];
    breakpointMeta.clear();
    metaByFileLine.clear();
    lastSpanByThread.clear();
    activeSpansByThread.clear();
    lastActiveSpanByTrace.clear();
    traceIdBySession.clear();
    preferredMethodByClass.clear();
    pendingByTrace.clear();
    initializedClassesByTrace.clear();
    classDependencyCache.clear();
    importCacheByFile.clear();
  }
  vscode.window.showInformationMessage('ExplorViz: Tracing stopped and breakpoints removed');
}

export async function handleStoppedEvent(session: vscode.DebugSession, body: any) {
  const threadId = body?.threadId;
  if (!threadId) return;

  try {
    const stackTraceResp = await session.customRequest('stackTrace', { threadId, startFrame: 0, levels: 50 });
    const frames = stackTraceResp?.stackFrames;
    if (!frames || frames.length === 0) return;
    const top = frames[0];
    const source = top.source;
    const file = normalizePath(source?.path || '<unknown>');
    const name = top.name || '<anonymous>';
    const line = top.line || top.startLine || 0;

    // Also synthesize a full-stack OTLP bundle from the retrieved frames and export it.
    try {
      const bundle = stackFramesToBundle(session, threadId, frames);
      if (bundle) {
        addBundleToBatch(bundle);
      }
    } catch (e) {}

    // Determine whether this stopped event corresponds to one of our managed breakpoints.
    const topKey = `${file}:${line}`;
    debugOut.appendLine(`[handleStoppedEvent] looking for breakpoint at normalized key: ${topKey}`);
    
    // Check if we have any entries for this line
    const allKeysForThisLine = Array.from(metaByFileLine.keys()).filter(k => k.endsWith(`:${line}`));
    debugOut.appendLine(`[handleStoppedEvent] keys matching line ${line}: ${allKeysForThisLine.join(' | ')}`);
    
    // Try multiple key formats to find the breakpoint metadata
    let topMeta = metaByFileLine.get(topKey) as any;
    
    // If not found by file:line, try to match by method name on same line (handles inheritance)
    if (!topMeta && allKeysForThisLine.length > 0) {
      const frameStr = String(name || '').trim();
      debugOut.appendLine(`[handleStoppedEvent] frame name: "${frameStr}"`);
      
      // Try multiple patterns to extract method name from frame
      let frameMethod: string | undefined;
      
      // Pattern 1: ClassName.methodName( or methodName(
      const match1 = frameStr.match(/\.([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
      if (match1) frameMethod = match1[1];
      
      // Pattern 2: just methodName( at start
      if (!frameMethod) {
        const match2 = frameStr.match(/^([A-Za-z_$<>][A-Za-z0-9_$<>]*)\s*\(/);
        if (match2) frameMethod = match2[1];
      }
      
      // Pattern 3: ClassName.methodName without parens
      if (!frameMethod) {
        const match3 = frameStr.match(/\.([A-Za-z_$][A-Za-z0-9_$]*)\s*$/);
        if (match3) frameMethod = match3[1];
      }
      
      // Pattern 4: just methodName without parens or dots
      if (!frameMethod && frameStr && !frameStr.includes(' ') && !frameStr.includes('.')) {
        frameMethod = frameStr;
      }
      
      debugOut.appendLine(`[handleStoppedEvent] extracted frameMethod: "${frameMethod || 'NONE'}"`);
      
      // Collect all method names from stored keys
      const storedMethodNames = new Set<string>();
      for (const key of allKeysForThisLine) {
        const meta = metaByFileLine.get(key) as any;
        if (meta && meta.methodName) {
          storedMethodNames.add(meta.methodName);
        }
      }
      
      // Try to match by method name if we extracted one
      if (frameMethod) {
        for (const key of allKeysForThisLine) {
          const meta = metaByFileLine.get(key) as any;
          if (meta && meta.methodName) {
            debugOut.appendLine(`[handleStoppedEvent] comparing "${frameMethod}" vs "${meta.methodName}" (key: ${key})`);
            if (meta.methodName === frameMethod) {
              topMeta = meta;
              debugOut.appendLine(`[handleStoppedEvent] MATCHED by method name!`);
              break;
            }
          }
        }
      }
      
      // Fallback: only if no method extraction happened AND only one unique method stored
      // This handles cases where we can't extract method name but there's only one option
      if (!topMeta && !frameMethod && storedMethodNames.size === 1) {
        const meta = metaByFileLine.get(allKeysForThisLine[0]) as any;
        if (meta) {
          topMeta = meta;
          debugOut.appendLine(`[handleStoppedEvent] MATCHED by fallback (no frame method extracted, single stored method: ${Array.from(storedMethodNames)[0]})`);
        }
      }
    }

    let prev = (activeSpansByThread.get(threadId) || []).slice(-1)[0];
      
      // If current thread has no active span, check trace-level context for async handoff
      if (!prev) {
        const traceId = lastSpanByThread.get(threadId)?.traceId ?? traceIdBySession.get(session.id);
        if (traceId) {
          const globalLast = lastActiveSpanByTrace.get(traceId);
          // Use global last span as parent if from a different thread (async handoff)
          // and within reasonable time window (< 5 seconds)
          if (globalLast && globalLast.threadId !== threadId && (Date.now() - globalLast.timestamp) < 5000) {
            prev = globalLast;
          }
        }
      }
      
      // Resolution order: active span on this thread → last span on this thread →
      // session-level trace ID → new random ID (saved to session for future threads).
      // Using the session-level trace ID as fallback ensures that spans on new/unseen
      // threads (e.g. Spring worker threads, Thymeleaf rendering threads) all join the
      // same trace rather than creating isolated orphan traces.
      let traceId = prev?.traceId ?? lastSpanByThread.get(threadId)?.traceId ?? traceIdBySession.get(session.id);
      if (!traceId) {
        traceId = randomHex(16);
        traceIdBySession.set(session.id, traceId);
      }
      const spanId = randomHex(8);
      const now = Date.now();
      let codeFunction = topMeta?.methodName ?? name;
      const codeNamespace = topMeta?.classFqn;
      let chosenFunction = (codeNamespace && preferredMethodByClass.has(codeNamespace)) ? preferredMethodByClass.get(codeNamespace)!.method : (findMeaningfulNearby(frames, 0, 8)?.method || codeFunction);
      // detect JVM static class initializer frames and prefer '<clinit>' for class-init spans
      try {
        const topNameStr = String(codeFunction || name || '');
        if (topNameStr.includes('<clinit>') || String(name || '').includes('<clinit>')) {
          chosenFunction = '<clinit>';
        }
      } catch (e) {}
      // If class exists but no meaningful function, synthesize a constructor/init
      if ((!chosenFunction || String(chosenFunction).trim() === '') && codeNamespace) chosenFunction = '<init>';
      const simpleClass = codeNamespace ? String(codeNamespace).split('.').pop() : undefined;
      const spanName = simpleClass ? `${simpleClass}.${chosenFunction}` : chosenFunction;
      // New spanRec has no parent; the previous span on this thread will be updated
      // to point at this child (reverse relationship).
      const spanRec = { traceId, spanId, parentSpanId: undefined as any, name: spanName, startTime: now, attributes: { 'code.function': chosenFunction, 'code.namespace': codeNamespace, 'java.fqn': codeNamespace && chosenFunction ? `${codeNamespace}.${chosenFunction}` : undefined }, serviceName: topMeta?.classFqn ?? path.basename(file) ?? 'unknown-service' };
      const stack = activeSpansByThread.get(threadId) || [];
      
      // For constructors and static initializers, generate dependency init spans
      // This ensures related classes have init spans when first encountered
      if (codeNamespace && file && (chosenFunction === '<init>' || chosenFunction === '<clinit>')) {
        try {
          const depInitSpans = generateDependencyInitSpans(traceId, codeNamespace, file, spanId, now);
          if (depInitSpans.length > 0) {
            // Add these spans to the batch immediately
            const svc = codeNamespace;
            const bundle = { 
              resourceSpans: [{ 
                resource: { attributes: [{ key: 'service.name', value: { stringValue: configuredServiceName } }] }, 
                scopeSpans: [{ scope: { name: 'explorviz.debug', version: '0.1' }, spans: depInitSpans }] 
              }] 
            };
            addBundleToBatch(bundle);
          }
          } catch (e) {}
      }
      if (prev) {
        try { prev.parentSpanId = spanId; } catch (e) {}
      }
      stack.push(spanRec);
      activeSpansByThread.set(threadId, stack);
      lastSpanByThread.set(threadId, { traceId, spanId });
      lastActiveSpanByTrace.set(traceId, { spanId, threadId, timestamp: Date.now() });

    // automatically remove tracing-managed breakpoints for this location
    try {
      const normalize = (p: string | undefined) => {
        if (!p) return '';
        try {
          if (p.startsWith('file://')) {
            // handle file:// URI
            return path.normalize(decodeURIComponent(new URL(p).pathname));
          }
        } catch (e) {
          // ignore
        }
        return path.normalize(p);
      };

      const targetPath = normalize(file);
      const matches: vscode.Breakpoint[] = [];

      // More robust: scan the current vscode.debug.breakpoints list and pick any
      // SourceBreakpoint that matches our metadata for this file:line. This handles
      // situations where breakpoint object instances differ from our stored array.
      for (const bp of vscode.debug.breakpoints) {
        if (bp instanceof vscode.SourceBreakpoint) {
          const loc = bp.location;
          const bpFile = normalize(loc.uri.fsPath);
          const bpLine = loc.range.start.line + 1; // 1-based
          const fileKey = `${bpFile}:${bpLine}`;
          const meta = breakpointMeta.get(bp);
          
          // Check both file:line and classFqn:methodName:line formats
          let hasMetadata = metaByFileLine.has(fileKey);
          if (!hasMetadata && meta) {
            const classFqnKey = meta.classFqn && meta.methodName 
              ? `${meta.classFqn}:${meta.methodName}:${meta.line}`
              : fileKey;
            hasMetadata = metaByFileLine.has(classFqnKey);
          }
          
          // remove only breakpoints that we have metadata for
          if (bpFile === targetPath && bpLine === line && hasMetadata) {
            matches.push(bp);
          }
        }
      }

      if (matches.length > 0) {
        vscode.debug.removeBreakpoints(matches);
        // update installedBreakpoints array and metadata maps
        installedBreakpoints = installedBreakpoints.filter(b => !matches.includes(b));
        for (const b of matches) {
          const removed = breakpointMeta.get(b);
          if (removed) {
            // Delete both old file:line format and new classFqn:methodName:line format
            const fileKey = `${removed.file}:${removed.line}`;
            metaByFileLine.delete(fileKey);
            if (removed.classFqn && removed.methodName) {
              const classFqnKey = `${removed.classFqn}:${removed.methodName}:${removed.line}`;
              metaByFileLine.delete(classFqnKey);
            }
          } else {
            // Maybe the breakpoint we removed wasn't  in our breakpointMeta map
            // (object identity mismatch). Try to delete by both formats anyway.
            const loc = (b as vscode.SourceBreakpoint).location;
            const bpFile = normalize(loc.uri.fsPath);
            const bpLine = loc.range.start.line + 1;
            const fileKey = `${bpFile}:${bpLine}`;
            // Delete old format
            if (metaByFileLine.has(fileKey)) {
              metaByFileLine.delete(fileKey);
            }
            // Try to find and delete new format by searching all keys for this line
            for (const key of Array.from(metaByFileLine.keys())) {
              if (key.endsWith(`:${bpLine}`) && !key.includes(':' + bpFile)) {
                // This is likely a new format key (classFqn:methodName:line) for same line
                const meta = metaByFileLine.get(key);
                if (meta && meta.line === bpLine) {
                  metaByFileLine.delete(key);
                }
              }
            }
          }
          breakpointMeta.delete(b);
        }
      }
    } catch (e) {
      console.warn('handleStoppedEvent: failed to remove breakpoint', e);
    }
    // attempt to continue execution so the app is not left paused
    try {
      await session.customRequest('continue', { threadId });
    } catch (e) {
      console.warn('handleStoppedEvent: auto-continue failed', e);
    }
  } catch (err) {
    console.warn('handleStoppedEvent: failed to retrieve stackTrace', err);
  }
}

function randomHex(bytes: number) {
  return crypto.randomBytes(bytes).toString('hex');
}

function isTrivialFunction(fn?: string): boolean {
  if (!fn) return true;
  const n = String(fn);
  // Very short names are likely generated/synthetic
  if (n.length <= 2) return true;
  // lambda/synthetic patterns
  if (n.includes('$') && n.match(/lambda\$|\$\$/)) return true;
  // Single-character names
  if (/^[a-z]$/.test(n)) return true;
  // Bridge methods, synthetic accessors
  if (n.startsWith('access$') || n.startsWith('bridge$')) return true;
  return false;
}

function isConfigurationSource(filePath?: string, classFqn?: string): boolean {
  const fp = (filePath || '').toLowerCase();
  const cf = (classFqn || '').toLowerCase();
  // path segments like /config/ or /configuration/
  if (fp.includes('/config/') || fp.includes('\\config\\') || fp.includes('/configuration/') || fp.includes('\\configuration\\')) return true;
  // filename contains config-like token
  const base = path.basename(fp);
  if (base.includes('config') || base.includes('configuration') || base.includes('settings') || base.includes('properties') || base.includes('application')) return true;
  // fully-qualified class name contains config token
  if (/\bconfig(uration)?\b/.test(cf)) return true;
  return false;
}

function findMeaningfulFrame(frames: any[], startIndex: number, maxLook = 6) {
  // search up towards shallower frames (indices smaller than startIndex)
  for (let k = startIndex; k >= Math.max(0, startIndex - maxLook); k--) {
    const f = frames[k];
    if (!f) continue;
    const name = String(f.name || '');
    // extract simple method name token
    const maybe = (name.match(/([A-Za-z0-9_$<>-]+)\s*\(/) || name.match(/([A-Za-z0-9_$<>-]+)$/));
    const cand = maybe ? maybe[1] : name;
    if (!isTrivialFunction(cand)) {
      const src = f?.source;
      const file = src?.path || '<unknown>';
      const line = f?.line || f?.startLine || 0;
      // try to infer namespace similar to other code
      let codeNamespace: string | undefined = undefined;
      try {
        const text = fs.readFileSync(file, 'utf8');
        const pkg = text.match(/\bpackage\s+([\w\.]+)\s*;/)?.[1];
        if (pkg) {
          // attempt to find enclosing class name nearby
          const classMatch = text.match(/\b(class|interface|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
          if (classMatch) codeNamespace = `${pkg}.${classMatch[2]}`;
        }
      } catch (_e) {}
      return { method: cand, namespace: codeNamespace, file, line, index: k };
    }
  }
  return null;
}

function findMeaningfulNearby(frames: any[], index: number, maxLook = 6) {
  // Prefer deeper (more specific) frames first, then search upwards.
  // This helps find leaf methods that represent the real work.
  const end = Math.min(frames.length - 1, index + maxLook);
  for (let k = index; k <= end; k++) {
    const f = frames[k];
    if (!f) continue;
    const name = String(f.name || '');
    const maybe = (name.match(/([A-Za-z0-9_$<>-]+)\s*\(/) || name.match(/([A-Za-z0-9_$<>-]+)$/));
    const cand = maybe ? maybe[1] : name;
    if (!isTrivialFunction(cand)) {
      const src = f?.source;
      const file = src?.path || '<unknown>';
      const line = f?.line || f?.startLine || 0;
      let codeNamespace: string | undefined = undefined;
      try {
        const text = fs.readFileSync(file, 'utf8');
        const pkg = text.match(/\bpackage\s+([\w\.]+)\s*;/)?.[1];
        if (pkg) {
          const classMatch = text.match(/\b(class|interface|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
          if (classMatch) codeNamespace = `${pkg}.${classMatch[2]}`;
        }
      } catch (_e) {}
      return { method: cand, namespace: codeNamespace, file, line, index: k };
    }
  }
  // fallback: search upwards (shallower frames)
  return findMeaningfulFrame(frames, index, maxLook);
}

function stackFramesToBundle(session: vscode.DebugSession, threadId: number, frames: any[]): any | null {
  if (!frames || frames.length === 0) return null;
  let traceId = traceIdBySession.get(session.id);
if (!traceId) {
  traceId = randomHex(16);
  traceIdBySession.set(session.id, traceId);
}
  const now = Date.now();

  // create spans from deepest -> top so parent links point to the child (reverse)
  // We'll then reverse the spans array so exported order is top->leaf.
  const spans: any[] = [];
  let childSpanId: string | undefined = undefined; // id of the child (deeper) span
  for (let ii = frames.length - 1; ii >= 0; ii--) {
    const i = ii;
    const f = frames[i];
    const src = f?.source;
    const file = src?.path || '<unknown>';
    const line = f?.line || f?.startLine || 0;
    const name = f?.name || '<anonymous>';

    // try to enrich with managed metadata if available; if missing, parse from frame name
    const meta = metaByFileLine.get(`${file}:${line}`);
    let codeFunction = meta?.methodName ?? undefined;
    let codeNamespace = meta?.classFqn ?? undefined;
    const frameName = String(name || '');

    const inferClassFqnFromSource = (srcPath: string | undefined, simpleName: string | undefined) => {
      if (!simpleName) return undefined;
      if (!srcPath) return simpleName;
      try {
        const text = fs.readFileSync(srcPath, 'utf8');
        const pkg = text.match(/\bpackage\s+([\w\.]+)\s*;/)?.[1];
        if (pkg) return `${pkg}.${simpleName}`;
        return simpleName;
      } catch (e) {
        return simpleName;
      }
    };

    if (!codeFunction || !codeNamespace) {
      // Try to parse fully-qualified method like org.pkg.Class.method(...) or Class.method(...)
      const m = frameName.match(/^([A-Za-z0-9_$.]+)\.([A-Za-z0-9_$<>-]+)\s*\(/);
      if (m) {
        const potentialNamespace = m[1];
        const potentialMethod = m[2];
        if (!codeNamespace) {
          if (potentialNamespace.indexOf('.') >= 0) {
            codeNamespace = potentialNamespace;
          } else {
            codeNamespace = inferClassFqnFromSource(file, potentialNamespace);
          }
        }
        if (!codeFunction) codeFunction = potentialMethod;
      } else {
        // try simple Class.method without parentheses
        const m2 = frameName.match(/^([A-Za-z0-9_$.]+)\.([A-Za-z0-9_$<>-]+)$/);
        if (m2) {
          const potentialNamespace = m2[1];
          const potentialMethod = m2[2];
          if (!codeNamespace) codeNamespace = inferClassFqnFromSource(file, potentialNamespace);
          if (!codeFunction) codeFunction = potentialMethod;
        } else {
          // fallback: try last token before '(' or end-of-string
          const m3 = frameName.match(/([A-Za-z0-9_$<>-]+)\s*\(/) || frameName.match(/([A-Za-z0-9_$<>-]+)$/);
          if (m3 && !codeFunction) codeFunction = m3[1];
        }
      }
    }
    if (!codeFunction) {
      // Prefer detecting JVM static class initializer frames (<clinit>)
      try {
        if (String(frameName || '').includes('<clinit>')) {
          codeFunction = '<clinit>';
        }
      } catch (e) {}
      // If we have a namespace (class) but no function, synthesize a constructor/init
      if (!codeFunction) {
        if (codeNamespace) codeFunction = '<init>';
        else codeFunction = frameName || '<anonymous>';
      }
    }
    if (codeNamespace === 'undefined') codeNamespace = undefined;

    const spanId = randomHex(8);
    // determine whether this frame is important enough to create a span
    // Only include spans from classes within the configured importantScopes prefixes
    let isImportant = false;
    try {
      const ns = (codeNamespace || (meta && meta.classFqn) || '').toString();
      // Use strict scope checking - must start with one of the important scope prefixes
      isImportant = isInImportantScopes(ns);
    } catch (e) {}
    if (!isImportant) {
      // skip framework frames; keep childSpanId unchanged
      continue;
    }

    // prefer a more meaningful (less trivial) frame for the operation name
    let chosenFunction = codeFunction;
    let chosenNamespace = codeNamespace;
    try {
      // If we have a preferred method for this class, use it
      if (codeNamespace && preferredMethodByClass.has(codeNamespace)) {
        const pref = preferredMethodByClass.get(codeNamespace)!;
        chosenFunction = pref.method;
        if (pref.namespace) chosenNamespace = pref.namespace;
      } else {
        const found = findMeaningfulNearby(frames, i, 8);
        if (found && found.method && found.method !== codeFunction) {
          (meta as any) = meta || {};
          (meta as any).originalMethod = codeFunction;
          chosenFunction = found.method;
          if (found.namespace) chosenNamespace = found.namespace;
          // remember this preference for the class to keep naming stable
          if (chosenNamespace) preferredMethodByClass.set(chosenNamespace, { method: chosenFunction, namespace: chosenNamespace });
        }
      }
    } catch (e) {}

    // const spanName = sanitizeOperationName(chosenFunction);
    const simpleClass = chosenNamespace ? String(chosenNamespace).split('.').pop() : undefined;
    const spanName = simpleClass ? `${simpleClass}.${chosenFunction}` : chosenFunction;
    // parentSpanId points to the child span id to reverse the relationship
    const span = {
      traceId,
      spanId,
      parentSpanId: childSpanId || undefined,
      name: spanName,
      startTime: now,
      endTime: now,
      attributes: {
        'code.function': chosenFunction,
        'code.namespace': chosenNamespace,
        'java.fqn': chosenNamespace && chosenFunction
  ? `${chosenNamespace}.${chosenFunction}`
  : (chosenNamespace || undefined),
      },
    };

    // OTLP-compatible span
    const otlpSpan = {
      traceId: String(span.traceId),
      spanId: String(span.spanId),
      parentSpanId: String(span.parentSpanId || ''),
      name: span.name,
      startTimeUnixNano: String((span.startTime ?? now) * 1000000),
      endTimeUnixNano: String((span.endTime ?? now) * 1000000),
      attributes: Object.entries(span.attributes || {}).map(([k, v]) => ({
  key: k,
  value: { stringValue: String(v) }
}))

    };

    // debug log each generated OTLP span (trace/span/parent/name/mesh)
    // try {
    //   const mesh = span.attributes && (span.attributes['java.fqn'] || span.attributes['code.namespace']);
    //   debugOut.appendLine(`generated span: trace=${otlpSpan.traceId} span=${otlpSpan.spanId} parent=${otlpSpan.parentSpanId} name=${otlpSpan.name} mesh=${String(mesh)}`);
    // } catch (e) {}

    spans.push(otlpSpan);

    // Generate init spans for class dependencies (related classes)
    // This ensures that when class A uses class B, we create a B.<clinit> span
    if (chosenNamespace && file && file !== '<unknown>') {
      try {
        const depInitSpans = generateDependencyInitSpans(
          traceId,
          chosenNamespace,
          file,
          otlpSpan.spanId,
          now
        );
        for (const depSpan of depInitSpans) {
          spans.push(depSpan);
        }
      } catch (e) {
        // debugOut.appendLine(`failed to generate dependency init spans: ${String(e)}`);
      }
    }

    // Heuristic: detect class usages mentioned on the same source line and
    // synthesize lightweight "usage" spans for them so relations appear
    // even when the referenced class isn't an explicit frame method.
    try {
      const srcPath = file;
      const srcLine = line;
      if (srcPath && srcLine && srcPath !== '<unknown>') {
        try {
          const text = fs.readFileSync(srcPath, 'utf8');
          const lines = text.split(/\r?\n/);
          const l = (lines[srcLine - 1] || '').trim();
          if (l && l.length > 0) {
            // find capitalized identifiers (likely class names)
            const candidates = Array.from(new Set((l.match(/\b[A-Z][A-Za-z0-9_]+\b/g) || [])));
            // limit to a few to avoid noise
            for (let ci = 0; ci < Math.min(candidates.length, 3); ci++) {
              const token = candidates[ci];
              // skip if token looks like current class or method
              const simpleClass = chosenNamespace ? String(chosenNamespace).split('.').pop() : (codeNamespace ? String(codeNamespace).split('.').pop() : undefined);
              if (!token || (simpleClass && token === simpleClass)) continue;
              if (isLikelyJdkType(token)) continue;
              // Resolve token to a likely fully-qualified name using imports/package
              const pkg = text.match(/\bpackage\s+([\w\.]+)\s*;/)?.[1];
              const importMap = new Map<string, string>();
              const wildcardPkgs: string[] = [];
              try {
                const importRe = /import\s+([\w\.]+)(?:\.(\*))?\s*;/g;
                let im: RegExpExecArray | null;
                while ((im = importRe.exec(text)) !== null) {
                  const full = im[1];
                  const isWild = !!im[2];
                  if (isWild) wildcardPkgs.push(full);
                  else {
                    const parts = full.split('.');
                    const simple = parts[parts.length - 1];
                    importMap.set(simple, full);
                  }
                }
              } catch (e) {}

              // common java/stdlib prefixes to exclude
              const stdPrefixes = ['java.', 'javax.', 'kotlin.', 'scala.', 'com.sun.', 'sun.'];

              let fq: string | undefined = undefined;
              if (importMap.has(token)) fq = importMap.get(token);
              else if (pkg) {
                const candidate = `${pkg}.${token}`;
                if (findJavaFileForClass(candidate)) fq = candidate;
              }
              else {
                // try wildcard imports that match important scopes only
                for (const wp of wildcardPkgs) {
                  if (importantScopes.some(p => wp.startsWith(p) || wp.indexOf(p) >= 0)) {
                    const candidate = `${wp}.${token}`;
                    if (findJavaFileForClass(candidate)) {
                      fq = candidate;
                      break;
                    }
                  }
                }
              }

              if (!fq) continue;
              // exclude standard-library classes like List, Page, etc.
              let isStd = false;
              for (const sp of stdPrefixes) { if (fq.startsWith(sp)) { isStd = true; break; } }
              if (isStd) continue;

              const inferredNs = fq;
              // only create usage spans for classes within important scopes
              if (!isInImportantScopes(inferredNs)) continue;

              const usageSpanId = randomHex(8);
              const usageSpan = {
                traceId: traceId,
                spanId: usageSpanId,
                parentSpanId: otlpSpan.spanId || '',
                name: `${token}.usage`,
                startTimeUnixNano: String((now) * 1000000),
                endTimeUnixNano: String((now) * 1000000),
                attributes: [
                  { key: 'code.function', value: { stringValue: 'usage' } },
                  { key: 'code.namespace', value: { stringValue: inferredNs } },
                  { key: 'java.fqn', value: { stringValue: `${inferredNs}.usage` } },
                ],
              };
              spans.push(usageSpan);
              // debugOut.appendLine(`synthesized usage span for ${inferredNs} under ${otlpSpan.spanId}`);
            }
          }
        } catch (e) {
          // ignore file-read errors
        }
      }
    } catch (e) {}
    // this span becomes the child for the next (shallower) frame
    childSpanId = spanId;
  }

  // single resource for this bundle
  const serviceName = configuredServiceName;


  const resourceSpans = [
    {
      resource: { attributes: [
    { key: 'service.name', value: { stringValue: serviceName } },
    { key: 'telemetry.sdk.language', value: { stringValue: 'java' } }
  ] },
      scopeSpans: [
        {
          scope: { name: 'explorviz.debug', version: '0.1' },
          spans: spans,
        },
      ],
    },
  ];

  return { resourceSpans };
}

// Accumulated spans per traceId grouped by service name.
// Spans are flushed after idle timeout only when no active spans remain for the trace.
const idleFlushMs = 500; // shorter idle window so sequential requests flush promptly
const pendingByTrace = new Map<string, { services: Map<string, { spans: any[]; resourceAttributes: any[] }>; timer?: NodeJS.Timeout }>();


function addBundleToBatch(bundle: any) {
  if (!bundle || !Array.isArray(bundle.resourceSpans)) return;
  // Instead of exporting immediately, accumulate spans per-trace until the
  // trace becomes idle (no new spans for `idleFlushMs`) and then flush.
  // This preserves parent-child nesting across the whole trace.

  for (const rs of bundle.resourceSpans) {
    // resource attributes may be an array of {key, value} per OTLP
    const attrs = rs.resource?.attributes || [];
    let svc = 'unknown-service';
    for (const a of attrs) {
      try {
        if (String(a.key) === 'service.name') {
          const v = a.value && (a.value.stringValue || a.value.string_value || a.value) ? (a.value.stringValue || a.value.string_value || a.value) : undefined;
          if (v) { svc = String(v); break; }
        }
      } catch (e) {}
    }
    const spans: any[] = [];
    for (const ss of (rs.scopeSpans || [])) {
      for (const s of (ss.spans || [])) {
        spans.push(s);
      }
    }

      // Ensure spans have a java.fqn (synthesize fallback when possible). If
      // we cannot derive an FQN, skip the span to avoid noisy/unattributed spans.
      const filtered = spans.filter(s => {
        const f = ensureSpanHasFqn(s);
        if (!f) {
          // try { debugOut.appendLine(`skipping span without java.fqn: trace=${s?.traceId} span=${s?.spanId} name=${s?.name}`); } catch (e) {}
          return false;
        }
        return true;
      });

      // Group spans by their traceId and service so we can accumulate a whole trace
      for (const s of filtered) {
      const traceId = String(s.traceId || '');
      if (!traceId) continue;
      let trec = pendingByTrace.get(traceId);
      if (!trec) {
        trec = { services: new Map<string, { spans: any[]; resourceAttributes: any[] }>() };
        pendingByTrace.set(traceId, trec);
      }
      let svcRec = trec.services.get(svc);
      if (!svcRec) {
        svcRec = { spans: [], resourceAttributes: [
          { key: 'service.name', value: svc },
          { key: 'host.name', value: os.hostname() },
          { key: 'process.pid', value: String(process.pid) },
        ] };
        trec.services.set(svc, svcRec);
      }
      svcRec.spans.push(s);
      // schedule an idle flush attempt for this trace
      scheduleTraceFlush(traceId);
    }
  }
}

function flushTrace(traceId: string) {
  const trec = pendingByTrace.get(traceId);
  if (!trec) return;
  // If there are still active spans for this trace, defer flushing
  if (hasActiveSpans(traceId)) {
    // debugOut.appendLine(`flushTrace: trace ${traceId} still has active spans; deferring flush`);
    scheduleTraceFlush(traceId);
    return;
  }
  const resourceSpans: any[] = [];
  for (const [svc, rec] of trec.services.entries()) {
    const ordered = orderSpansParentFirst(rec.spans || []);
    resourceSpans.push({ resource: { attributes: rec.resourceAttributes }, scopeSpans: [{ scope: { name: 'explorviz.debug', version: '0.1' }, spans: ordered }] });
  }
  const bundle = { resourceSpans };
  try {
    exportTraceBundle(bundle);
    // debugOut.appendLine(`flushed trace ${traceId} with ${resourceSpans.reduce((s, r) => s + (r.scopeSpans?.[0]?.spans?.length || 0), 0)} spans`);
  } catch (e) {
    // debugOut.appendLine('failed to export trace bundle: ' + String(e));
  }
  if (trec.timer) clearTimeout(trec.timer as any);
  pendingByTrace.delete(traceId);
  cleanupTraceTracking(traceId);
}

function scheduleTraceFlush(traceId: string) {
  const trec = pendingByTrace.get(traceId);
  if (!trec) return;
  if (trec.timer) return;
  trec.timer = setTimeout(() => {
    try {
      flushTrace(traceId);
    } catch (e) {
    }
  }, idleFlushMs) as unknown as NodeJS.Timeout;
}

/**
 * Check whether a trace still has active (unfinished) spans.
 * Only checks for dangling parent references in the accumulated span set.
 *
 * NOTE: We intentionally do NOT check activeSpansByThread here. The idle timer
 * (idleFlushMs) is the primary throttle for flush attempts, and this function
 * only validates parent-child completeness inside the accumulated batch.
 * Thread-local stacks can lag behind real execution in debugger-driven tracing,
 * so using them here would cause unnecessary flush deferrals.
 */
function hasActiveSpans(traceId: string): boolean {
  // Check for dangling parent references — if a span's parentSpanId
  //    points to a spanId that isn't in the accumulated set, more spans
  //    are expected.
  const trec = pendingByTrace.get(traceId);
  if (trec) {
    const knownSpanIds = new Set<string>();
    for (const [, svcRec] of trec.services) {
      for (const sp of svcRec.spans) {
        const sid = normalizeOtlpId(sp.spanId);
        if (sid) knownSpanIds.add(sid);
      }
    }
    for (const [, svcRec] of trec.services) {
      for (const sp of svcRec.spans) {
        const pid = normalizeOtlpId(sp.parentSpanId);
        if (pid && !knownSpanIds.has(pid)) {
          // debugOut.appendLine(`hasActiveSpans: span ${sp.spanId} references missing parent ${pid}`);
          return true;
        }
      }
    }
  }

  return false;
}

function flushAllTraces() {
  for (const traceId of Array.from(pendingByTrace.keys())) {
    try { flushTrace(traceId); } catch (e) { /* debugOut.appendLine('flushAllTraces failed: ' + String(e)); */ }
  }
}

function normalizeOtlpId(id?: string) {
  if (!id) return '';
  let v = String(id).trim();
  if (v.startsWith('0x') || v.startsWith('0X')) v = v.slice(2);
  v = v.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  return v;
}

function orderSpansParentFirst(spans: any[]) {
  if (!spans || spans.length === 0) return [];
  const map = new Map<string, any>();
  const indeg = new Map<string, number>();
  const children = new Map<string, string[]>();
  const originalOrder: string[] = [];

  for (const s of spans) {
    const id = normalizeOtlpId(s.spanId || '');
    if (!id) continue;
    map.set(id, s);
    indeg.set(id, 0);
    children.set(id, []);
    originalOrder.push(id);
  }

  for (const s of spans) {
    const id = normalizeOtlpId(s.spanId || '');
    if (!id) continue;
    const p = normalizeOtlpId(s.parentSpanId || '');
    if (p && map.has(p)) {
      indeg.set(id, (indeg.get(id) || 0) + 1);
      const arr = children.get(p) || [];
      arr.push(id);
      children.set(p, arr);
    }
  }

  // Kahn's algorithm
  const q: string[] = [];
  for (const [id, d] of indeg.entries()) if ((d || 0) === 0) q.push(id);
  const ordered: string[] = [];
  while (q.length) {
    const id = q.shift()!;
    ordered.push(id);
    const ch = children.get(id) || [];
    for (const c of ch) {
      indeg.set(c, (indeg.get(c) || 0) - 1);
      if ((indeg.get(c) || 0) === 0) q.push(c);
    }
  }

  // If cycles or missing parents leave some spans unordered, append them in original order
  const remaining = originalOrder.filter(id => !ordered.includes(id));
  ordered.push(...remaining);

  return ordered.map(id => map.get(id)).filter(Boolean);
}

function getSpanAttribute(span: any, key: string): string | undefined {
  if (!span || !span.attributes) return undefined;
  try {
    // OTLP attributes are represented as [{ key, value: { stringValue } }, ...]
    for (const a of span.attributes) {
      if (!a) continue;
      if (String(a.key) === key) {
        const v = a.value && (a.value.stringValue || a.value.string_value || a.value);
        if (v !== undefined && v !== null) return String(v);
      }
    }
  } catch (e) {}
  return undefined;
}

function getSpanFqn(span: any): string | undefined {
  // Return existing java.fqn or try to synthesize a fallback from other attributes.
  const existing = getSpanAttribute(span, 'java.fqn');
  if (existing && String(existing).trim() !== '' && String(existing) !== 'undefined') return existing;

  const ns = getSpanAttribute(span, 'code.namespace');
  const fn = getSpanAttribute(span, 'code.function') || getSpanAttribute(span, 'name') || (span && span.name);
  if (ns && fn) return `${ns}.${fn}`;

  const fileAttr = getSpanAttribute(span, 'java.file') || getSpanAttribute(span, 'file');
  if (fileAttr && fn) {
    try {
      const bn = path.basename(String(fileAttr));
      const base = bn.replace(/\.[^.]+$/, '');
      return `${base}.${fn}`;
    } catch (e) {
      return `${fileAttr}.${fn}`;
    }
  }
  return undefined;
}

function ensureSpanHasFqn(span: any): string | undefined {
  const f = getSpanFqn(span);
  if (!f) return undefined;
  // ensure attribute present on OTLP-style span.attributes (array of {key, value})
  try {
    const has = getSpanAttribute(span, 'java.fqn');
    if (!has) {
      span.attributes = span.attributes || [];
      span.attributes.push({ key: 'java.fqn', value: { stringValue: String(f) } });
    }
  } catch (e) {}
  return f;
}

function stopBatching() {
  // Cancel all pending timers and force-flush everything
  for (const [_tid, trec] of pendingByTrace) {
    if (trec.timer) clearTimeout(trec.timer as any);
  }
  flushAllTraces();
}

