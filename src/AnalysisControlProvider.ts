import * as vscode from 'vscode';
import * as path from 'path';
import * as http from 'http';
import * as fs from 'fs';
import WebSocket from 'ws';
import { FullAnalysisConfig } from './models/fullAnalysisConfig';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
    affectsDaemonServiceUrls,
    DaemonServiceUrls,
    readDaemonServiceUrls
} from './models/types';

const execFileAsync = promisify(execFile);
const DEFAULT_BRANCH_OPTION = 'use current branch';
interface GitRepoInfo {
    repoPath: string;
    branches: string[];
}

export type AnalysisStatusBanner = {
    status: "completed" | "failed" | "cancelled";
    landscapeToken: string;
    error?: string;
};

export class AnalysisControlProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'explorviz.analysisControlView';

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
        this.currentView = webviewView;

        const visibilitySub = webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                void this.postGitRepositoryInfo(webviewView.webview);
                webviewView.webview.postMessage({
                    type: 'analysisStateChanged',
                    isRunning: this.isAnalysisRunning
                });
            }
        });

        const workspaceSub = vscode.workspace.onDidChangeWorkspaceFolders(() => {
            void this.postGitRepositoryInfo();
        });

        const configSub = vscode.workspace.onDidChangeConfiguration((event) => {
            if (affectsDaemonServiceUrls(event)) {
                void this.syncServiceUrlsToDaemon();
            }
        });

        webviewView.onDidDispose(() => {
            configSub.dispose();
            visibilitySub.dispose();
            workspaceSub.dispose();
            if (this.currentView === webviewView) {
                this.currentView = undefined;
            }
        });

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'out', 'analysis-webview'))
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        const port = this.context.globalState.get<number>('explorvizDaemonPort');
        if (port) {
            void this.syncServiceUrlsToDaemon(port);
            if (!this.wsClient || this.wsClient.readyState === WebSocket.CLOSED) {
                this.connectDaemonWebSocket(port);
            }
        }

        webviewView.webview.onDidReceiveMessage(async (data) => {
            if (data.type === 'webviewReady') {
                webviewView.webview.postMessage({
                    type: 'analysisStateChanged',
                    isRunning: this.isAnalysisRunning
                });
                await this.postGitRepositoryInfo(webviewView.webview);
            }

            if (data.type === 'triggerDaemon') {
                await this.triggerPythonDaemon(data.detailedLogging);
            }

            if (data.type === 'toggleBackground') {
                await this.sendToggleBackgroundToDaemon(data.enabled);
            }

            if (data.type === 'startFullAnalysis') {
                const config = FullAnalysisConfig.fromUnknown(data.config);

                if (!config.repository.branch || config.repository.branch === DEFAULT_BRANCH_OPTION) {
                    const activeBranch = await this.resolveCurrentBranch(config.repository.repoPath);
                    if (activeBranch) {
                        config.repository.branch = activeBranch;
                    }
                }

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

                        this.currentView?.webview.postMessage({
                            type: 'clearAnalysisBanner',
                        });
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
                if (msg?.event === 'analysis_finished') {
                    this.setAnalysisRunning(false);

                    const rawStatus = typeof msg.status === 'string' ? msg.status : 'unknown';
                    const normalizedStatus: AnalysisStatusBanner['status'] =
                        rawStatus === 'completed'
                            ? 'completed'
                            : rawStatus === 'cancelled'
                                ? 'cancelled'
                                : 'failed';

                    const banner: AnalysisStatusBanner = {
                        status: normalizedStatus,
                        landscapeToken: typeof msg.landscapeToken === 'string' ? msg.landscapeToken : '',
                        error: typeof msg.error === 'string' ? msg.error : undefined,
                    };


                    this.currentView?.webview.postMessage({
                        type: 'fullAnalysisFinished',
                        banner,
                    });
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
        const filePath = path.join(this.context.extensionPath, 'out', 'analysis-webview', 'index.html');
        return fs.readFileSync(filePath, 'utf8');
    }

    private getWorkspaceCandidatePath(): string | undefined {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return undefined;
        }
        return folders[0].uri.fsPath;
    }

    private async loadGitRepositoryInfo(): Promise<GitRepoInfo> {
        const cwd = this.getWorkspaceCandidatePath();
        if (!cwd) {
            return { repoPath: '', branches: [] };
        }

        try {
            const { stdout: topLevelOut } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd });
            const repoPath = topLevelOut.trim();

            const { stdout: branchOut } = await execFileAsync(
                'git',
                [
                    'for-each-ref',
                    '--format=%(refname:short)',
                    'refs/heads',
                ],
                { cwd: repoPath }
            );

            const branches = branchOut
                .split(/\r?\n/)
                .map((b) => b.trim())
                .filter((b) => b.length > 0);

            return { repoPath, branches };
        } catch {
            return { repoPath: '', branches: [] };
        }
    }

    private async resolveCurrentBranch(repoPath: string): Promise<string> {
        if (!repoPath) {
            return '';
        }

        try {
            const { stdout } = await execFileAsync(
                'git',
                ['branch', '--show-current'],
                { cwd: repoPath }
            );
            const branchName = stdout.trim();

            if (!branchName || branchName === 'HEAD') {
                return '';
            }

            return branchName;
        } catch {
            return '';
        }
    }

    private async postGitRepositoryInfo(targetWebview?: vscode.Webview) {
        const webview = targetWebview ?? this.currentView?.webview;
        if (!webview) {
            return;
        }

        const info = await this.loadGitRepositoryInfo();
        webview.postMessage({
            type: 'gitRepositoryInfo',
            repoPath: info.repoPath,
            branches: info.branches
        });
    }

    private async syncServiceUrlsToDaemon(
        targetPort?: number,
        urls: DaemonServiceUrls = readDaemonServiceUrls()
    ): Promise<void> {
        const port = targetPort ?? this.context.globalState.get<number>('explorvizDaemonPort');
        if (!port) {
            return;
        }

        const payload = JSON.stringify(urls);

        const req = http.request(
            {
                hostname: '127.0.0.1',
                port,
                path: '/api/config/service-urls',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            },
            (res) => {
                res.on('data', () => { });
            }
        );

        req.on('error', (err) => {
            console.error('[ExplorViz Extension] Failed to sync service URLs to daemon:', err.message);
        });

        req.write(payload);
        req.end();
    }
}