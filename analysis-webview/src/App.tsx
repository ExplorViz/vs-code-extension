import React, { useEffect, useState } from 'react';
import { ActiveTab } from './types';
import { FullAnalysisTab } from './components/FullAnalysisTab';
import { FullAnalysisConfig } from '../../src/models/fullAnalysisConfig';
import type { AnalysisStatusBanner } from '../../src/sidebarProvider';

declare const acquireVsCodeApi: () => { postMessage: (msg: any) => void };
const vscode = acquireVsCodeApi();

export default function App() {
    const [detailedLogging, setDetailedLogging] = useState(false);
    const [isBackgroundTaskEnabled, setIsBackgroundTaskEnabled] = useState(false);
    const [activeTab, setActiveTab] = useState<ActiveTab>('full');
    const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);
    const [analysisBanner, setAnalysisBanner] = useState<AnalysisStatusBanner | null>(null);

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
            }
        };

        window.addEventListener('message', handleMessage);
        vscode.postMessage({ type: 'webviewReady' });

        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleTrigger = () => {
        vscode.postMessage({
            type: 'triggerDaemon',
            detailedLogging
        });
    };

    const handleBackgroundTaskToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        const checked = e.target.checked;
        setIsBackgroundTaskEnabled(checked);

        vscode.postMessage({
            type: 'toggleBackground',
            enabled: checked
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

            <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={detailedLogging}
                        onChange={(e) => setDetailedLogging(e.target.checked)}
                    />
                    Enable Detailed Logging
                </label>
            </div>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={isBackgroundTaskEnabled}
                        onChange={handleBackgroundTaskToggle}
                    />
                    Enable Background Task
                </label>
            </div>

            <button
                onClick={handleTrigger}
                style={{
                    width: '100%',
                    padding: '8px',
                    background: 'var(--vscode-button-background)',
                    color: 'var(--vscode-button-foreground)',
                    border: 'none',
                    cursor: 'pointer'
                }}
            >
                Trigger Daemon Print
            </button>

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