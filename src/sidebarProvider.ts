import * as vscode from 'vscode';
import * as path from 'path';
import * as http from 'http';
import * as fs from 'fs';

export class ExplorVizControlProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'explorviz.controlView';

    constructor(private readonly context: vscode.ExtensionContext) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken,
    ) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'out', 'webview'))
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            if (data.type === 'triggerDaemon') {
                await this.triggerPythonDaemon(data.detailedLogging);
            }

            if (data.type === 'toggleBackground') {
                await this.sendToggleBackgroundToDaemon(data.enabled);
            }
        });
    }

    private async triggerPythonDaemon(detailedLogging: boolean) {
        const port = this.context.globalState.get<number>('explorvizDaemonPort');
        if (!port) {
            vscode.window.showErrorMessage('ExplorViz Daemon port not found.');
            return;
        }

        const payload = JSON.stringify({ action: 'trigger', detailedLogging });

        const req = http.request({
            hostname: '127.0.0.1',
            port: port,
            path: '/trigger',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': payload.length
            }
        }, (res) => {
            res.on('data', () => { });
        });

        req.on('error', (err) => {
            vscode.window.showErrorMessage(`Failed to reach daemon: ${err.message}`);
        });

        req.write(payload);
        req.end();
    }

    private async sendToggleBackgroundToDaemon(enabled: boolean) {
        const port = this.context.globalState.get<number>('explorvizDaemonPort');
        if (!port) {
            vscode.window.showErrorMessage('ExplorViz Daemon port not found.');
            return;
        }

        const payload = JSON.stringify({ enabled });

        const req = http.request({
            hostname: '127.0.0.1',
            port: port,
            path: '/toggle-background-task',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': payload.length
            }
        }, (res) => {
            res.on('data', () => { });
        });

        req.on('error', (err) => {
            vscode.window.showErrorMessage(`Failed to reach daemon: ${err.message}`);
        });

        req.write(payload);
        req.end();
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const filePath = path.join(this.context.extensionPath, 'out', 'webview', 'index.html');
        return fs.readFileSync(filePath, 'utf8');
    }
}