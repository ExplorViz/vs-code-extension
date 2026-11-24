import { AnalysisStatusBanner } from "../../../src/AnalysisControlProvider";
import {
    analysisStatusBannerContentStyle,
    analysisStatusBannerDismissStyle,
    analysisStatusBannerErrorStyle,
    analysisStatusBannerTitleStyle,
    analysisStatusBannerTokenStyle,
    getAnalysisBannerStyle,
} from '../styles';

type StartAnalysisBannerProps = {
    banner: AnalysisStatusBanner | null;
    onDismiss: () => void;
};

export function AnalysisStatusBannerView({
    banner,
    onDismiss,
}: StartAnalysisBannerProps) {
    const renderStatusLabel = (status: AnalysisStatusBanner["status"]): string => {
        switch (status) {
            case "completed":
                return "Analysis successful";
            case "cancelled":
                return "Analysis cancelled";
            case "failed":
            default:
                return "Analysis failed";
        }
    }

    if (!banner) {
        return null;
    }

    return (
        <div
            role="status"
            aria-live="polite"
            style={getAnalysisBannerStyle(banner.status)}
        >
            <div style={analysisStatusBannerContentStyle}>
                <div style={analysisStatusBannerTitleStyle}>
                    {renderStatusLabel(banner.status)}
                    {banner.landscapeToken ? (
                        <span style={analysisStatusBannerTokenStyle}>
                            {' '}
                            ({banner.landscapeToken})
                        </span>
                    ) : null}
                </div>

                {banner.status === 'failed' && banner.error ? (
                    <p style={analysisStatusBannerErrorStyle}>{banner.error}</p>
                ) : null}
            </div>

            <button
                type="button"
                aria-label="Dismiss status message"
                title="Dismiss"
                style={analysisStatusBannerDismissStyle}
                onClick={onDismiss}
            >
                ×
            </button>
        </div>
    );
}