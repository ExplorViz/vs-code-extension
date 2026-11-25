import * as vscode from 'vscode';

export interface DaemonServiceUrls {
    codeAnalyzerUrl: string;
    offlineFrontendUrl: string;
    onlineFrontendUrl: string;
}

export const SERVICE_URL_CONFIG_KEYS = {
    codeAnalyzerUrl: 'explorviz.codeAnalyzerUrl',
    offlineFrontendUrl: 'explorviz.offlineFrontendUrl',
    onlineFrontendUrl: 'explorviz.onlineFrontendUrl'
} as const;

export const DEFAULT_DAEMON_SERVICE_URLS: DaemonServiceUrls = {
    codeAnalyzerUrl: 'http://127.0.0.1:8078',
    offlineFrontendUrl: 'http://127.0.0.1:4200',
    onlineFrontendUrl: ''
};

export function readDaemonServiceUrls(): DaemonServiceUrls {
    const cfg = vscode.workspace.getConfiguration();
    return {
        codeAnalyzerUrl: cfg
            .get<string>(
                SERVICE_URL_CONFIG_KEYS.codeAnalyzerUrl,
                DEFAULT_DAEMON_SERVICE_URLS.codeAnalyzerUrl
            )
            .trim(),
        offlineFrontendUrl: cfg
            .get<string>(
                SERVICE_URL_CONFIG_KEYS.offlineFrontendUrl,
                DEFAULT_DAEMON_SERVICE_URLS.offlineFrontendUrl
            )
            .trim(),
        onlineFrontendUrl: cfg
            .get<string>(
                SERVICE_URL_CONFIG_KEYS.onlineFrontendUrl,
                DEFAULT_DAEMON_SERVICE_URLS.onlineFrontendUrl
            )
            .trim(),
    };
}

export function affectsDaemonServiceUrls(event: vscode.ConfigurationChangeEvent): boolean {
    return Object.values(SERVICE_URL_CONFIG_KEYS).some((key) =>
        event.affectsConfiguration(key)
    );
}

export type VisualizationOpenTarget = 'browser' | 'vscode';

export type AutoOpenVisualizationSettings = {
    enabled: boolean;
    target: VisualizationOpenTarget;
};

export type AnalysisStatusBanner = {
    status: "completed" | "failed" | "cancelled";
    landscapeToken: string;
    error?: string;
};