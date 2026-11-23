import React, { useState } from 'react';
import { ApplicationEntry, FullAnalysisConfig, SamplingPeriod } from '../types';
import { checkboxRowStyle, inputStyle, labelRowStyle } from '../styles';
import { CollapsibleSection } from './CollapsibleSection';
import { TooltipBadge } from './TooltipBadge';

interface FullAnalysisTabProps {
    isAnalysisRunning: boolean;
    onStartAnalysis: (config: FullAnalysisConfig) => void;
}

const parseOptionalInt = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? null : parsed;
};

export function FullAnalysisTab({ isAnalysisRunning, onStartAnalysis }: FullAnalysisTabProps) {
    const [openSections, setOpenSections] = useState({
        repository: false,
        filters: false,
        analysisConfig: false
    });

    // Repository fields
    const [branch, setBranch] = useState('use current branch');
    const [startCommit, setStartCommit] = useState('');
    const [endCommit, setEndCommit] = useState('');
    const [commitCount, setCommitCount] = useState<string>('1');
    const [maxLoc, setMaxLoc] = useState<string>('');
    const [firstParentCommitsOnly, setFirstParentCommitsOnly] = useState(true);
    const [skipCommitsWithoutRelevantChanges, setSkipCommitsWithoutRelevantChanges] = useState(false);

    // Filters fields
    const [inclusionSearchExpressions, setInclusionSearchExpressions] = useState('');
    const [exclusionSearchExpression, setExclusionSearchExpression] = useState('');
    const [commitSamplingInterval, setCommitSamplingInterval] = useState<string>('');
    const [commitSamplingPeriod, setCommitSamplingPeriod] = useState<SamplingPeriod>('disabled');

    // Analysis Configuration fields
    const [applications, setApplications] = useState<ApplicationEntry[]>([
        { id: 'app-1', name: '', root: '' }
    ]);
    const [landscapeToken, setLandscapeToken] = useState('');
    const [socialFetchEndDate, setSocialFetchEndDate] = useState('');
    const [socialFetchTimeFrame, setSocialFetchTimeFrame] = useState<string>('');
    const [includeDataStructures, setIncludeDataStructures] = useState(true);
    const [fetchSocialData, setFetchSocialData] = useState(false);
    const [syncSocialWindow, setSyncSocialWindow] = useState(false);

    const toggleSection = (key: keyof typeof openSections) => {
        setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleAddApplication = () => {
        const nextId = `app-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setApplications((prev) => [...prev, { id: nextId, name: '', root: '' }]);
    };

    const handleRemoveApplication = (id: string) => {
        setApplications((prev) => prev.filter((app) => app.id !== id));
    };

    const handleApplicationChange = (id: string, field: 'name' | 'root', value: string) => {
        setApplications((prev) =>
            prev.map((app) => (app.id === id ? { ...app, [field]: value } : app))
        );
    };

    const handleStartAnalysis = () => {
        if (isAnalysisRunning) {
            return;
        }

        const config: FullAnalysisConfig = {
            repository: {
                branch: branch.trim() || 'use current branch',
                startCommit: startCommit.trim(),
                endCommit: endCommit.trim(),
                commitCount: parseOptionalInt(commitCount),
                maxLoc: parseOptionalInt(maxLoc),
                firstParentCommitsOnly,
                skipCommitsWithoutRelevantChanges
            },
            filters: {
                inclusionSearchExpressions: inclusionSearchExpressions.trim(),
                exclusionSearchExpression: exclusionSearchExpression.trim(),
                commitSamplingInterval: parseOptionalInt(commitSamplingInterval),
                commitSamplingPeriod
            },
            analysisConfiguration: {
                applications: applications.map(({ name, root }) => ({
                    name: name.trim(),
                    root: root.trim()
                })),
                landscapeToken: landscapeToken.trim(),
                socialFetchEndDate: socialFetchEndDate.trim(),
                socialFetchTimeFrame: parseOptionalInt(socialFetchTimeFrame),
                includeDataStructures,
                fetchSocialData,
                syncSocialWindow
            }
        };

        onStartAnalysis(config);
    };

    return (
        <div role="tabpanel">
            <CollapsibleSection
                title="Repository"
                isOpen={openSections.repository}
                onToggle={() => toggleSection('repository')}
            >
                <div>
                    <div style={labelRowStyle}>
                        <label htmlFor="repo-branch">Branch</label>
                        <TooltipBadge text="The branch to analyze from the open repository. Uses the current branch if none is selected." />
                    </div>
                    <input
                        id="repo-branch"
                        type="text"
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        style={inputStyle}
                    />
                </div>

                <div>
                    <div style={labelRowStyle}>
                        <label htmlFor="repo-start-commit">Start Commit</label>
                        <TooltipBadge text="Optional: The hash of the commit where the analysis should start." />
                    </div>
                    <input
                        id="repo-start-commit"
                        type="text"
                        value={startCommit}
                        placeholder="Oldest Commit"
                        onChange={(e) => setStartCommit(e.target.value)}
                        style={inputStyle}
                    />
                </div>

                <div>
                    <div style={labelRowStyle}>
                        <label htmlFor="repo-end-commit">End Commit</label>
                        <TooltipBadge text="Optional: The hash of the commit where the analysis should end." />
                    </div>
                    <input
                        id="repo-end-commit"
                        type="text"
                        value={endCommit}
                        placeholder="Newest Commit"
                        onChange={(e) => setEndCommit(e.target.value)}
                        style={inputStyle}
                    />
                </div>

                <div>
                    <div style={labelRowStyle}>
                        <label htmlFor="repo-commit-count">Commit Count</label>
                        <TooltipBadge text="Determines how many of the newest commits should be analyzed." />
                    </div>
                    <input
                        id="repo-commit-count"
                        type="number"
                        value={commitCount}
                        onChange={(e) => setCommitCount(e.target.value)}
                        style={inputStyle}
                    />
                </div>

                <div>
                    <div style={labelRowStyle}>
                        <label htmlFor="repo-max-loc">Max LOC</label>
                        <TooltipBadge
                            text={
                                "Optional limit on lines of code for full source analysis. " +
                                "Files with more lines are still included, but only " +
                                "programming language, LOC, and size are computed. " +
                                "Leave empty to analyze all files fully."
                            }
                        />
                    </div>
                    <input
                        id="repo-max-loc"
                        type="number"
                        placeholder="all"
                        value={maxLoc}
                        onChange={(e) => setMaxLoc(e.target.value)}
                        style={inputStyle}
                    />
                </div>

                <div>
                    <label style={checkboxRowStyle}>
                        <input
                            type="checkbox"
                            checked={firstParentCommitsOnly}
                            onChange={(e) => setFirstParentCommitsOnly(e.target.checked)}
                        />
                        <span>First-Parent Commits Only</span>
                        <TooltipBadge
                            text={
                                "When enabled, only commits on the first-parent chain are analyzed. " +
                                "Commits from merged feature branches are excluded."
                            }
                        />
                    </label>
                </div>

                <div>
                    <label style={checkboxRowStyle}>
                        <input
                            type="checkbox"
                            checked={skipCommitsWithoutRelevantChanges}
                            onChange={(e) => setSkipCommitsWithoutRelevantChanges(e.target.checked)}
                        />
                        <span>Skip Commits Without Relevant File Changes</span>
                        <TooltipBadge
                            text={
                                "When enabled, commits with no added, modified, or deleted files in " +
                                "the configured application roots and include/exclude filters are ignored. " +
                                "Evolution parent links skip those commits to save analysis time."
                            }
                        />
                    </label>
                </div>
            </CollapsibleSection>

            <CollapsibleSection
                title="Filters"
                isOpen={openSections.filters}
                onToggle={() => toggleSection('filters')}
            >
                <div>
                    <div style={labelRowStyle}>
                        <label htmlFor="filter-inclusion">Inclusion Search Expressions</label>
                        <TooltipBadge
                            text={
                                "Limit the analysis to specific subdirectories or files within the " +
                                "repository using a comma-separated list of search expressions relative " +
                                "to the repository root. If empty, all files will be included."
                            }
                        />
                    </div>
                    <input
                        id="filter-inclusion"
                        type="text"
                        value={inclusionSearchExpressions}
                        placeholder="Include all"
                        onChange={(e) => setInclusionSearchExpressions(e.target.value)}
                        style={inputStyle}
                    />
                </div>

                <div>
                    <div style={labelRowStyle}>
                        <label htmlFor="filter-exclusion">Exclusion Search Expression</label>
                        <TooltipBadge
                            text={
                                "Exclude specific subdirectories or files from the analysis using a " +
                                "comma-separated list of search expressions relative to the repository root. " +
                                "If empty, no files will be excluded."
                            }
                        />
                    </div>
                    <input
                        id="filter-exclusion"
                        type="text"
                        value={exclusionSearchExpression}
                        placeholder="Exclude none"
                        onChange={(e) => setExclusionSearchExpression(e.target.value)}
                        style={inputStyle}
                    />
                </div>

                <div>
                    <div style={labelRowStyle}>
                        <label htmlFor="filter-sampling-interval">Commit Sampling Interval</label>
                        <TooltipBadge
                            text={
                                "Analyze every Nth commit (e.g. 5 = commits 1, 6, 11, …). " +
                                "Commits that are not selected are skipped entirely. " +
                                "Leave empty to disable interval sampling."
                            }
                        />
                    </div>
                    <input
                        id="filter-sampling-interval"
                        type="number"
                        value={commitSamplingInterval}
                        placeholder="disabled"
                        onChange={(e) => setCommitSamplingInterval(e.target.value)}
                        style={inputStyle}
                    />
                </div>

                <div>
                    <div style={labelRowStyle}>
                        <label htmlFor="filter-sampling-period">Commit Sampling Period</label>
                        <TooltipBadge
                            text={
                                "Alternative to interval sampling: analyze the first commit in " +
                                "each day, week, month, or year. All other commits in those periods " +
                                "are skipped."
                            }
                        />
                    </div>
                    <select
                        id="filter-sampling-period"
                        value={commitSamplingPeriod}
                        onChange={(e) => setCommitSamplingPeriod(e.target.value as SamplingPeriod)}
                        style={inputStyle}
                    >
                        <option value="disabled">disabled</option>
                        <option value="Day">Day</option>
                        <option value="Week">Week</option>
                        <option value="Month">Month</option>
                        <option value="Year">Year</option>
                    </select>
                </div>
            </CollapsibleSection>

            <CollapsibleSection
                title="Analysis Configuration"
                isOpen={openSections.analysisConfig}
                onToggle={() => toggleSection('analysisConfig')}
            >
                <div
                    style={{
                        border: '1px solid var(--vscode-panel-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.25)))',
                        borderRadius: '3px',
                        padding: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '12px' }}>
                            <span>Applications</span>
                            <TooltipBadge
                                text={
                                    "One or more logical applications: each has a name and an " +
                                    "optional project root path relative to the repository root. " +
                                    "Use multiple rows for monorepos."
                                }
                            />
                        </div>
                    </div>

                    {applications.map((app, index) => (
                        <div
                            key={app.id}
                            style={{
                                padding: '8px',
                                borderRadius: '3px',
                                background: 'rgba(128, 128, 128, 0.08)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                            }}
                        >
                            <div>
                                <div style={labelRowStyle}>
                                    <label htmlFor={`app-name-${app.id}`}>Application name</label>
                                </div>
                                <input
                                    id={`app-name-${app.id}`}
                                    type="text"
                                    value={app.name}
                                    placeholder="e.g. order-service"
                                    onChange={(e) => handleApplicationChange(app.id, 'name', e.target.value)}
                                    style={inputStyle}
                                />
                            </div>

                            <div>
                                <div style={labelRowStyle}>
                                    <label htmlFor={`app-root-${app.id}`}>Application Root</label>
                                </div>
                                <input
                                    id={`app-root-${app.id}`}
                                    type="text"
                                    value={app.root}
                                    placeholder="relative to repo root, optional"
                                    onChange={(e) => handleApplicationChange(app.id, 'root', e.target.value)}
                                    style={inputStyle}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveApplication(app.id)}
                                    style={{
                                        padding: '3px 8px',
                                        background: 'var(--vscode-button-secondaryBackground, rgba(128, 128, 128, 0.2))',
                                        color: 'var(--vscode-button-secondaryForeground, var(--vscode-foreground))',
                                        border: 'none',
                                        borderRadius: '2px',
                                        fontSize: '11px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <button
                            type="button"
                            onClick={handleAddApplication}
                            style={{
                                padding: '4px 8px',
                                background: 'var(--vscode-button-secondaryBackground, var(--vscode-button-background))',
                                color: 'var(--vscode-button-secondaryForeground, var(--vscode-button-foreground))',
                                border: 'none',
                                borderRadius: '2px',
                                fontSize: '11px',
                                cursor: 'pointer'
                            }}
                        >
                            Add application
                        </button>
                    </div>
                </div>

                <div>
                    <div style={labelRowStyle}>
                        <label htmlFor="config-landscape-token">Landscape Token</label>
                        <TooltipBadge text="The landscape token for the ExplorViz software landscape." />
                    </div>
                    <input
                        id="config-landscape-token"
                        type="text"
                        value={landscapeToken}
                        placeholder="mytokenvalue"
                        onChange={(e) => setLandscapeToken(e.target.value)}
                        style={inputStyle}
                    />
                </div>

                <div>
                    <div style={labelRowStyle}>
                        <label htmlFor="config-social-end-date">Social Fetch End Date</label>
                        <TooltipBadge text="Optional: Date to end fetching social data (e.g. 2026-05-10 or ISO timestamp)." />
                    </div>
                    <input
                        id="config-social-end-date"
                        type="text"
                        value={socialFetchEndDate}
                        placeholder="current date"
                        onChange={(e) => setSocialFetchEndDate(e.target.value)}
                        style={inputStyle}
                    />
                </div>

                <div>
                    <div style={labelRowStyle}>
                        <label htmlFor="config-social-time-frame">Social Fetch Time Frame</label>
                        <TooltipBadge text="How many days in the past social data will be fetched." />
                    </div>
                    <input
                        id="config-social-time-frame"
                        type="number"
                        value={socialFetchTimeFrame}
                        placeholder="365"
                        onChange={(e) => setSocialFetchTimeFrame(e.target.value)}
                        style={inputStyle}
                    />
                </div>

                <div>
                    <label style={checkboxRowStyle}>
                        <input
                            type="checkbox"
                            checked={includeDataStructures}
                            onChange={(e) => setIncludeDataStructures(e.target.checked)}
                        />
                        <span>Include Data Structures</span>
                        <TooltipBadge
                            text={
                                "Whether to include classes, functions, and parameters in exported file data. " +
                                "Metrics are always computed; when disabled, only file-level metadata and metrics are sent."
                            }
                        />
                    </label>
                </div>

                <div>
                    <label style={checkboxRowStyle}>
                        <input
                            type="checkbox"
                            checked={fetchSocialData}
                            onChange={(e) => setFetchSocialData(e.target.checked)}
                        />
                        <span>Fetch Social Data</span>
                        <TooltipBadge text="Whether to fetch social data." />
                    </label>
                </div>

                <div>
                    <label style={checkboxRowStyle}>
                        <input
                            type="checkbox"
                            checked={syncSocialWindow}
                            onChange={(e) => setSyncSocialWindow(e.target.checked)}
                        />
                        <span>Sync Social Window</span>
                        <TooltipBadge
                            text={
                                "When enabled, the social data fetch window is derived from the " +
                                "date range of the analyzed commits instead of the fixed end date " +
                                "and time frame above."
                            }
                        />
                    </label>
                </div>
            </CollapsibleSection>

            <button
                type="button"
                disabled={isAnalysisRunning}
                onClick={handleStartAnalysis}
                style={{
                    width: '100%',
                    marginTop: '6px',
                    padding: '8px',
                    background: isAnalysisRunning
                        ? 'var(--vscode-button-secondaryBackground, rgba(128, 128, 128, 0.25))'
                        : 'var(--vscode-button-background)',
                    color: isAnalysisRunning
                        ? 'var(--vscode-disabledForeground, var(--vscode-descriptionForeground))'
                        : 'var(--vscode-button-foreground)',
                    border: 'none',
                    borderRadius: '2px',
                    fontWeight: 600,
                    cursor: isAnalysisRunning ? 'not-allowed' : 'pointer',
                    opacity: isAnalysisRunning ? 0.7 : 1
                }}
            >
                {isAnalysisRunning ? 'Analysis Running...' : 'Start Analysis'}
            </button>
        </div>
    );
}