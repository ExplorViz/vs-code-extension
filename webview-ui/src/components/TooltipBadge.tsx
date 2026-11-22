import React from 'react';

interface TooltipBadgeProps {
    text: string;
}

export function TooltipBadge({ text }: TooltipBadgeProps) {
    return (
        <span
            title={text}
            aria-label={text}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '15px',
                height: '15px',
                borderRadius: '50%',
                border: '1px solid var(--vscode-descriptionForeground)',
                color: 'var(--vscode-descriptionForeground)',
                fontSize: '10px',
                fontWeight: 700,
                lineHeight: 1,
                cursor: 'help',
                flexShrink: 0,
                userSelect: 'none'
            }}
        >
            ?
        </span>
    );
}