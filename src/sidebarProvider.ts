import * as vscode from 'vscode';
import * as path from 'path';
import * as http from 'http';
import * as fs from 'fs';
import WebSocket from 'ws';
import { FullAnalysisConfig } from './models/fullAnalysisConfig';

export class ExplorVizControlProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'explorviz.controlView';

    private statusBarItem: vscode.StatusBarItem;
    private wsClient: WebSocket | undefined;
    private currentView: vscode.WebviewView | undefined;

    private isAnalysisRunning = false;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.text = '$(sync~spin) ExplorViz: Analysis running...';
        this.statusBarItem.tooltip = 'A full analysis is currently running in the background';
        context.subscriptions.push(this.statusBarItem);
    }

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
            if (data.type === 'webviewReady') {
                webviewView.webview.postMessage({
                    type: 'analysisStateChanged',
                    isRunning: this.isAnalysisRunning
                });
            }

            if (data.type === 'triggerDaemon') {
                await this.triggerPythonDaemon(data.detailedLogging);
            }

            if (data.type === 'toggleBackground') {
                await this.sendToggleBackgroundToDaemon(data.enabled);
            }

            if (data.type === 'startFullAnalysis') {
                const config = FullAnalysisConfig.fromUnknown(data.config);
                this.sendStartFullAnalysisToDaemon(config);
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

    private sendStartFullAnalysisToDaemon(config: FullAnalysisConfig) {
        const port = this.context.globalState.get<number>('explorvizDaemonPort');
        if (!port) {
            vscode.window.showErrorMessage('ExplorViz Daemon port not found.');
            return;
        }

        if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
            this.connectDaemonWebSocket(port);
        }

        const payload = JSON.stringify(config);

        const req = http.request(
            {
                hostname: '127.0.0.1',
                port,
                path: '/start-full-analysis',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            },
            (res) => {
                let body = '';
                res.on('data', (chunk) => {
                    body += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        this.setAnalysisRunning(true);
                    } else {
                        this.setAnalysisRunning(false);
                        vscode.window.showErrorMessage(
                            `Daemon rejected analysis (${res.statusCode}): ${body}`
                        );
                    }
                });
            }
        );

        req.on('error', (err) => {
            this.setAnalysisRunning(false);
            vscode.window.showErrorMessage(`Failed to send analysis config to daemon: ${err.message}`);
        });

        req.write(payload);
        req.end();
    }

    private setAnalysisRunning(running: boolean) {
        this.isAnalysisRunning = running;
        if (running) {
            this.statusBarItem.show();
        } else {
            this.statusBarItem.hide();
        }
        this.currentView?.webview.postMessage({
            type: 'analysisStateChanged',
            isRunning: this.isAnalysisRunning
        });
    }

    private connectDaemonWebSocket(port: number) {
        if (this.wsClient) {
            this.wsClient.terminate();
            this.wsClient = undefined;
        }

        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/analysis`);
        this.wsClient = ws;

        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.event === 'analysis_finished') {
                    this.setAnalysisRunning(false);
                }
            } catch {
                // Ignore
            }
        });

        ws.on('close', () => {
            this.setAnalysisRunning(false);
        });

        ws.on('error', (err) => {
            console.error('[ExplorViz Extension] WebSocket error:', err.message);
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const filePath = path.join(this.context.extensionPath, 'out', 'webview', 'index.html');
        return fs.readFileSync(filePath, 'utf8');
    }
}