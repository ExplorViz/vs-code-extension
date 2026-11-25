import React, { useEffect, useState } from 'react';
import { ActiveTab } from './types';
import { FullAnalysisTab } from './components/FullAnalysisTab';
import { FullAnalysisConfig } from '../../src/models/fullAnalysisConfig';
import type {
    AnalysisStatusBanner,
    AutoOpenVisualizationSettings,
    VisualizationOpenTarget,
} from '../../src/models/types';

declare const acquireVsCodeApi: () => { postMessage: (msg: any) => void };
const vscode = acquireVsCodeApi();

export default function App() {
    const [activeTab, setActiveTab] = useState<ActiveTab>('full');
    const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);
    const [analysisBanner, setAnalysisBanner] = useState<AnalysisStatusBanner | null>(null);
    const [autoOpenEnabled, setAutoOpenEnabled] = useState(true);
    const [autoOpenTarget, setAutoOpenTarget] = useState<VisualizationOpenTarget>('browser');

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (!message || typeof message !== 'object') {
                return;
            }

            if (message?.type === 'analysisStateChanged') {
                setIsAnalysisRunning(Boolean(message.isRunning));
            } else if (message.type === 'fullAnalysisFinished' && message.banner) {
                setAnalysisBanner(message.banner as AnalysisStatusBanner);
            } else if (message.type === 'clearAnalysisBanner') {
                setAnalysisBanner(null);
            } else if (message.type === 'autoOpenSettingsChanged' && message.settings) {
                const settings = message.settings as AutoOpenVisualizationSettings;
                setAutoOpenEnabled(Boolean(settings.enabled));
                setAutoOpenTarget(settings.target === 'vscode' ? 'vscode' : 'browser');
            }
        };

        window.addEventListener('message', handleMessage);
        vscode.postMessage({ type: 'webviewReady' });

        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleAutoOpenToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        const checked = e.target.checked;
        setAutoOpenEnabled(checked);

        vscode.postMessage({
            type: 'updateAutoOpenSettings',
            enabled: checked,
            target: autoOpenTarget,
        });
    };

    const handleAutoOpenTargetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const nextTarget: VisualizationOpenTarget =
            e.target.value === 'vscode' ? 'vscode' : 'browser';
        setAutoOpenTarget(nextTarget);

        vscode.postMessage({
            type: 'updateAutoOpenSettings',
            enabled: autoOpenEnabled,
            target: nextTarget,
        });
    };

    const handleStartAnalysis = (config: FullAnalysisConfig) => {
        vscode.postMessage({
            type: 'startFullAnalysis',
            config
        });
    };

    const handleDismissBanner = () => {
        setAnalysisBanner(null);
    };

    return (
        <div
            style={{
                padding: '12px',
                fontFamily: 'var(--vscode-font-family)',
                color: 'var(--vscode-foreground)',
                fontSize: '13px'
            }}
        >
            <h3 style={{ marginTop: 0, marginBottom: '12px' }}>Analysis Controls</h3>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={autoOpenEnabled}
                        onChange={handleAutoOpenToggle}
                    />
                    Open Visualization Automatically
                </label>

                {autoOpenEnabled && (
                    <div
                        style={{
                            marginTop: '8px',
                            marginLeft: '22px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}
                    >
                        <label htmlFor="auto-open-target" style={{ fontSize: '12px' }}>
                            Open in:
                        </label>
                        <select
                            id="auto-open-target"
                            value={autoOpenTarget}
                            onChange={handleAutoOpenTargetChange}
                            style={{
                                flex: 1,
                                padding: '4px 6px',
                                background: 'var(--vscode-dropdown-background)',
                                color: 'var(--vscode-dropdown-foreground)',
                                border: '1px solid var(--vscode-dropdown-border)',
                                borderRadius: '2px',
                                fontFamily: 'var(--vscode-font-family)',
                                fontSize: '12px',
                            }}
                        >
                            <option value="browser">Browser</option>
                            <option value="vscode">VS Code</option>
                        </select>
                    </div>
                )}
            </div>

            <div style={{ marginTop: '20px' }}>
                <div
                    role="tablist"
                    style={{
                        display: 'flex',
                        borderBottom: '1px solid var(--vscode-panel-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.35)))',
                        marginBottom: '12px'
                    }}
                >
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'full'}
                        onClick={() => setActiveTab('full')}
                        style={{
                            flex: 1,
                            padding: '8px 6px',
                            background: 'transparent',
                            color:
                                activeTab === 'full'
                                    ? 'var(--vscode-panelTitle-activeForeground, var(--vscode-foreground))'
                                    : 'var(--vscode-panelTitle-inactiveForeground, var(--vscode-descriptionForeground))',
                            border: 'none',
                            borderBottom:
                                activeTab === 'full'
                                    ? '2px solid var(--vscode-panelTitle-activeBorder, var(--vscode-focusBorder, #007acc))'
                                    : '2px solid transparent',
                            fontWeight: activeTab === 'full' ? 600 : 400,
                            fontSize: '12px',
                            cursor: 'pointer'
                        }}
                    >
                        Full Analysis
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'lightweight'}
                        onClick={() => setActiveTab('lightweight')}
                        style={{
                            flex: 1,
                            padding: '8px 6px',
                            background: 'transparent',
                            color:
                                activeTab === 'lightweight'
                                    ? 'var(--vscode-panelTitle-activeForeground, var(--vscode-foreground))'
                                    : 'var(--vscode-panelTitle-inactiveForeground, var(--vscode-descriptionForeground))',
                            border: 'none',
                            borderBottom:
                                activeTab === 'lightweight'
                                    ? '2px solid var(--vscode-panelTitle-activeBorder, var(--vscode-focusBorder, #007acc))'
                                    : '2px solid transparent',
                            fontWeight: activeTab === 'lightweight' ? 600 : 400,
                            fontSize: '12px',
                            cursor: 'pointer'
                        }}
                    >
                        Lightweight Analysis
                    </button>
                </div>

                <div style={{ display: activeTab === 'lightweight' ? 'block' : 'none' }} role="tabpanel" />
                <div style={{ display: activeTab === 'full' ? 'block' : 'none' }}>
                    <FullAnalysisTab
                        isAnalysisRunning={isAnalysisRunning}
                        analysisBanner={analysisBanner}
                        onDismissBanner={handleDismissBanner}
                        onStartAnalysis={handleStartAnalysis}
                    />
                </div>
            </div>
        </div>
    );
}