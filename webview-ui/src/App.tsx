import React, { useState } from 'react';

declare const acquireVsCodeApi: () => { postMessage: (msg: any) => void };
const vscode = acquireVsCodeApi();

export default function App() {
    const [detailedLogging, setDetailedLogging] = useState(false);

    const handleTrigger = () => {
        vscode.postMessage({
            type: 'triggerDaemon',
            detailedLogging
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