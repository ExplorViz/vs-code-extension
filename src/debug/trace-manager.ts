import * as vscode from "vscode";
import { extractJavaCallables, getJavaParser, JavaCallable } from "./java/tree-sitter-java";

export const javaFileUriToJavaCallables: Map<string, JavaCallable[]> = new Map();
export const managedBreakpoints: vscode.SourceBreakpoint[] = [];

export async function placeBreakpointsToAllMethods(context?: vscode.ExtensionContext) {

    if(!context) {
        vscode.window.showErrorMessage("Context is required to place breakpoints.");
        return;
    }

    const languagePatterns = [
        { lang: 'java', glob: '**/*.java' },
        { lang: 'javascript', glob: '**/*.js' },
        { lang: 'typescript', glob: '**/*.ts' },
        { lang: 'python', glob: '**/*.py' },
    ];

    const excludePatterns = [
        '**/node_modules/**',
        '**/vendor/**',
        '**/dist/**',
        '**/build/**',
        '**/out/**',
        '**/target/**',
    ];

    for (const languagePattern of languagePatterns) {
        const files = await vscode.workspace.findFiles(languagePattern.glob, buildExcludeGlob(excludePatterns));
        if (files.length === 0) {
            continue;
        }

        switch(languagePattern.lang) {
            case 'java':
                // Implement Java-specific breakpoint placement logic
                await handleJavaFile(context, files);
                await placeJavaBreakpoints(files);
                break;
            // Add cases for other languages if needed
        }
    }

    //console.log("Map: ", javaFileUriToJavaCallables);

}



function buildExcludeGlob(excludePatterns: string[]): string | undefined {
    if (excludePatterns.length === 0) {
        return undefined;
    }
    return `{${excludePatterns.join(',')}}`;
}

async function handleJavaFile(context: vscode.ExtensionContext, files: vscode.Uri[]) {
    const javaParser = await getJavaParser(context);
    for (const file of files) {
        const data = await vscode.workspace.fs.readFile(file);
        const source = new TextDecoder('utf-8').decode(data);
        const callables = extractJavaCallables(javaParser, source);
        javaFileUriToJavaCallables.set(file.toString(), callables);
    }
}

async function placeJavaBreakpoints(files: vscode.Uri[]) {
    const existingSourceBreakpoints = vscode.debug.breakpoints.filter(
        (bp): bp is vscode.SourceBreakpoint => bp instanceof vscode.SourceBreakpoint
    );

    const newBreakpoints: vscode.SourceBreakpoint[] = [];

    for (const file of files) {
        const callables = javaFileUriToJavaCallables.get(file.toString());
        if (!callables) {
            continue;
        }

        for (const callable of callables) {
            const alreadyExists = existingSourceBreakpoints.some(bp =>
                bp.location.uri.toString() === file.toString() &&
                bp.location.range.start.line === callable.line
            );

            if (alreadyExists) {
                continue;
            }

            const breakpoint = new vscode.SourceBreakpoint(
                new vscode.Location(
                    file,
                    new vscode.Position(callable.line, callable.column)
                )
            );

            newBreakpoints.push(breakpoint);
        }
    }

    if (newBreakpoints.length > 0) {
        vscode.debug.addBreakpoints(newBreakpoints);
        managedBreakpoints.push(...newBreakpoints);
    }
}

export function clearManagedBreakpoints() {
    if (managedBreakpoints.length === 0) {
        return;
    }    
    vscode.debug.removeBreakpoints(managedBreakpoints);
    managedBreakpoints.length = 0;
}
