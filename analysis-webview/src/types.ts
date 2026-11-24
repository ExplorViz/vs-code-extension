export interface ApplicationEntry {
    id: string;
    name: string;
    root: string;
}

export type ActiveTab = 'full' | 'lightweight';
export type SamplingPeriod = 'disabled' | 'Day' | 'Week' | 'Month' | 'Year';

export interface FullAnalysisConfig {
    repository: {
        repoPath: string;
        branch: string;
        startCommit: string;
        endCommit: string;
        commitCount: number | null;
        maxLoc: number | null;
        firstParentCommitsOnly: boolean;
        skipCommitsWithoutRelevantChanges: boolean;
    };
    filters: {
        inclusionSearchExpressions: string;
        exclusionSearchExpression: string;
        commitSamplingInterval: number | null;
        commitSamplingPeriod: SamplingPeriod;
    };
    analysisConfiguration: {
        applications: Array<{ name: string; root: string }>;
        landscapeToken: string;
        socialFetchEndDate: string;
        socialFetchTimeFrame: number | null;
        includeDataStructures: boolean;
        fetchSocialData: boolean;
        syncSocialWindow: boolean;
    };
}