import React from 'react';

export const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '5px 7px',
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border, transparent)',
    borderRadius: '2px',
    fontSize: '12px'
};

export const labelRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '4px',
    fontSize: '12px'
};

export const checkboxRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    cursor: 'pointer'
};