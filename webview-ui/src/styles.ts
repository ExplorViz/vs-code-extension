import React from 'react';

export type AnalysisBannerStatus = 'completed' | 'failed' | 'cancelled' | string;

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

export const analysisTriggerGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column'
};

export const analysisStatusBannerBaseStyle: React.CSSProperties = {
    marginTop: '8px',
    padding: '8px 10px',
    borderRadius: '4px',
    border: '1px solid var(--vscode-panel-border, currentColor)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '8px',
    fontSize: '12px'
};

const bannerVariantStyles: Record<'completed' | 'failed' | 'cancelled', React.CSSProperties> = {
    completed: {
        backgroundColor: 'rgba(46, 160, 67, 0.18)',
        borderColor: 'var(--vscode-testing-iconPassed, #2ea043)',
        color: 'var(--vscode-foreground)'
    },
    failed: {
        backgroundColor: 'var(--vscode-inputValidation-errorBackground, rgba(248, 81, 73, 0.18))',
        borderColor: 'var(--vscode-inputValidation-errorBorder, #f85149)',
        color: 'var(--vscode-foreground)'
    },
    cancelled: {
        backgroundColor: 'var(--vscode-inputValidation-warningBackground, rgba(210, 153, 34, 0.18))',
        borderColor: 'var(--vscode-inputValidation-warningBorder, #d29922)',
        color: 'var(--vscode-foreground)'
    }
};

export function getAnalysisBannerStyle(status: AnalysisBannerStatus): React.CSSProperties {
    const variant =
        status === 'completed' || status === 'failed' || status === 'cancelled'
            ? bannerVariantStyles[status]
            : bannerVariantStyles.failed;

    return {
        ...analysisStatusBannerBaseStyle,
        ...variant
    };
}

export const analysisStatusBannerContentStyle: React.CSSProperties = {
    minWidth: 0,
    flex: 1
};

export const analysisStatusBannerTitleStyle: React.CSSProperties = {
    fontWeight: 600,
    wordBreak: 'break-word'
};

export const analysisStatusBannerTokenStyle: React.CSSProperties = {
    fontWeight: 500,
    opacity: 0.95
};

export const analysisStatusBannerErrorStyle: React.CSSProperties = {
    margin: '4px 0 0',
    wordBreak: 'break-word',
    opacity: 0.95
};

export const analysisStatusBannerDismissStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: 600,
    lineHeight: 1,
    padding: '0 2px',
    opacity: 0.9,
    flexShrink: 0
};