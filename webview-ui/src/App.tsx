import React, { useState } from 'react';

declare const acquireVsCodeApi: () => { postMessage: (msg: any) => void };
const vscode = acquireVsCodeApi();

export default function App() {
    const [detailedLogging, setDetailedLogging] = useState(false);
    const [isBackgroundTaskEnabled, setIsBackgroundTaskEnabled] = useState(false);

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

    return (
        <div style={{ padding: '12px', fontFamily: 'var(--vscode-font-family)', color: 'var(--vscode-foreground)' }}>
            <h3>Analysis Controls</h3>
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
        </div>
    );
}