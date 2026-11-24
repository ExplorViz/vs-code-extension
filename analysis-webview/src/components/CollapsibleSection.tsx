import React from 'react';

interface CollapsibleSectionProps {
    title: string;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}

export function CollapsibleSection({ title, isOpen, onToggle, children }: CollapsibleSectionProps) {
    return (
        <div
            style={{
                border: '1px solid var(--vscode-panel-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.35)))',
                borderRadius: '4px',
                marginBottom: '10px',
                background: 'var(--vscode-sideBarSectionHeader-background, transparent)'
            }}
        >
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={isOpen}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 10px',
                    background: 'var(--vscode-sideBarSectionHeader-background, rgba(128, 128, 128, 0.1))',
                    color: 'var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground))',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer',
                    textAlign: 'left'
                }}
            >
                <span style={{ fontSize: '10px', width: '10px' }}>{isOpen ? '▼' : '▶'}</span>
                <span>{title}</span>
            </button>
            {isOpen && (
                <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {children}
                </div>
            )}
        </div>
    );
}