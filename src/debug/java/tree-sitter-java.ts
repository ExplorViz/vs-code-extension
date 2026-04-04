import * as vscode from 'vscode';
import * as WebTreeSitter from 'web-tree-sitter';

let javaParserPromise: Promise<WebTreeSitter.Parser> | undefined;

export async function getJavaParser(context: vscode.ExtensionContext): Promise<WebTreeSitter.Parser> {
    if (!javaParserPromise) {
        javaParserPromise = (async () => {
            const runtimeUri = vscode.Uri.joinPath(
                context.extensionUri,
                'media',
                'web-tree-sitter.wasm'
            );

            const javaUri = vscode.Uri.joinPath(
                context.extensionUri,
                'media',
                'tree-sitter-java.wasm'
            );

            await WebTreeSitter.Parser.init({
                locateFile(scriptName: string) {
                    if (scriptName === 'web-tree-sitter.wasm') {
                        return runtimeUri.fsPath;
                    }
                    return scriptName;
                }
            });

            const language = await WebTreeSitter.Language.load(javaUri.fsPath);
            const parser = new WebTreeSitter.Parser();
            parser.setLanguage(language);

            return parser;
        })();
    }

    return javaParserPromise;
}



export interface JavaCallable {
    kind: 'method' | 'constructor';
    name: string;
    line: number;
    column: number;
    signature: string;
}

export function extractJavaCallables(
    parser: WebTreeSitter.Parser,
    source: string
): JavaCallable[] {
    const tree = parser.parse(source);
    const result: JavaCallable[] = [];

    if (!tree) {
        console.error("Failed to parse Java source code.");
        return result;
    }

    const nodesOfCallableNodeType = tree.rootNode.descendantsOfType([
        'method_declaration',
        'constructor_declaration'
    ]);

    for (const node of nodesOfCallableNodeType) {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) {
            console.warn(`Could not find name node for ${node.type} at line ${node.startPosition.row} and column ${node.startPosition.column}`);
             continue;
        }


        const signature = extractSignature(source, node);

        result.push({
            kind: node.type === 'constructor_declaration' ? 'constructor' : 'method',
            name: nameNode.text,
            line: node.startPosition.row,
            column: node.startPosition.column,
            signature: signature
        });
    }

    return result;

}

function extractSignature(source: string, node: WebTreeSitter.Node): string {
    const bodyNode = node.childForFieldName('body');

    if (bodyNode) {
        return source.slice(node.startIndex, bodyNode.startIndex).trim();
    }

    return source.slice(node.startIndex, node.endIndex).trim();
}
