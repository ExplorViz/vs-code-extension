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
    readDaemonServiceUrls,
    AnalysisStatusBanner,
    VisualizationOpenTarget,
    AutoOpenVisualizationSettings
} from './models/types';

const execFileAsync = promisify(execFile);
const DEFAULT_BRANCH_OPTION = 'use current branch';
interface GitRepoInfo {
    repoPath: string;
    branches: string[];
}

const AUTO_OPEN_ENABLED_KEY = 'explorviz.autoOpenVisualization.enabled';
const AUTO_OPEN_TARGET_KEY = 'explorviz.autoOpenVisualization.target';

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
                webviewView.webview.postMessage({
                    type: 'autoOpenSettingsChanged',
                    settings: this.getAutoOpenSettings(),
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
                webviewView.webview.postMessage({
                    type: 'autoOpenSettingsChanged',
                    settings: this.getAutoOpenSettings(),
                });
                await this.postGitRepositoryInfo(webviewView.webview);
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

            if (data.type === 'updateAutoOpenSettings') {
                await this.updateAutoOpenSettings({
                    enabled: typeof data.enabled === 'boolean' ? data.enabled : undefined,
                    target: data.target === 'vscode' || data.target === 'browser' ? data.target : undefined,
                });
            }
        });
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

                    const landscapeToken = typeof msg.landscapeToken === 'string' ? msg.landscapeToken : '';
                    const banner: AnalysisStatusBanner = {
                        status: normalizedStatus,
                        landscapeToken: landscapeToken,
                        error: typeof msg.error === 'string' ? msg.error : undefined,
                    };


                    this.currentView?.webview.postMessage({
                        type: 'fullAnalysisFinished',
                        banner,
                    });

                    if (normalizedStatus === 'completed') {
                        const { enabled, target } = this.getAutoOpenSettings();
                        if (enabled) {
                            const targetUrl = this.buildFinishedAnalysisUrl(landscapeToken);
                            if (targetUrl) {
                                if (target === 'vscode') {
                                    void this.openUrlInVsCodeTab(targetUrl);
                                } else {
                                    void this.openUrlInExternalBrowser(targetUrl);
                                }
                            }
                        }
                    }
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

    private buildFinishedAnalysisUrl(landscapeToken: string): string | undefined {
        const trimmedToken = landscapeToken.trim();
        if (!trimmedToken) {
            return undefined;
        }

        const serviceUrls = readDaemonServiceUrls();
        const baseUrl = serviceUrls.offlineFrontendUrl?.trim();
        if (!baseUrl) {
            return undefined;
        }

        try {
            const url = new URL(baseUrl);
            const normalizedPath = url.pathname.replace(/\/+$/, '');
            url.pathname = `${normalizedPath}/visualization`;
            url.searchParams.set('landscapeToken', trimmedToken);
            return url.toString();
        } catch {
            return undefined;
        }
    }

    private async openUrlInExternalBrowser(rawUrl: string): Promise<void> {
        try {
            const uri = vscode.Uri.parse(rawUrl, true);
            if (uri.scheme !== 'http' && uri.scheme !== 'https') {
                console.warn(`[ExplorViz Extension] Blocked non-HTTP(S) URL: ${rawUrl}`);
                return;
            }
            await vscode.env.openExternal(uri);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showWarningMessage(`Could not open analysis URL in browser: ${message}`);
        }
    }

    private async openUrlInVsCodeTab(rawUrl: string): Promise<void> {
        try {
            const uri = vscode.Uri.parse(rawUrl, true);
            if (uri.scheme !== 'http' && uri.scheme !== 'https') {
                console.warn(`[ExplorViz Extension] Blocked non-HTTP(S) URL: ${rawUrl}`);
                return;
            }
            await vscode.commands.executeCommand('simpleBrowser.show', uri.toString(true));
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showWarningMessage(`Could not open analysis URL in VS Code tab: ${message}`);
        }
    }

    private getAutoOpenSettings(): AutoOpenVisualizationSettings {
        const enabled = this.context.globalState.get<boolean>(AUTO_OPEN_ENABLED_KEY, true);
        const rawTarget = this.context.globalState.get<string>(AUTO_OPEN_TARGET_KEY, 'browser');
        const target: VisualizationOpenTarget = rawTarget === 'vscode' ? 'vscode' : 'browser';
        return { enabled, target };
    }

    private async updateAutoOpenSettings(
        next: Partial<AutoOpenVisualizationSettings
    ): Promise<AutoOpenVisualizationSettings> {
        const current = this.getAutoOpenSettings();
        const updated: AutoOpenVisualizationSettings = {
            enabled: next.enabled ?? current.enabled,
            target: next.target === 'vscode' || next.target === 'browser' ? next.target : current.target,
        };

        await this.context.globalState.update(AUTO_OPEN_ENABLED_KEY, updated.enabled);
        await this.context.globalState.update(AUTO_OPEN_TARGET_KEY, updated.target);

        this.currentView?.webview.postMessage({
            type: 'autoOpenSettingsChanged',
            settings: updated,
        });

        return updated;
    }
}