export type SamplingPeriod = 'disabled' | 'Day' | 'Week' | 'Month' | 'Year';

export interface RepositoryConfigData {
    branch: string;
    startCommit: string;
    endCommit: string;
    commitCount: number | null;
    maxLoc: number | null;
    firstParentCommitsOnly: boolean;
    skipCommitsWithoutRelevantChanges: boolean;
}

export interface FilterConfigData {
    inclusionSearchExpressions: string;
    exclusionSearchExpression: string;
    commitSamplingInterval: number | null;
    commitSamplingPeriod: SamplingPeriod;
}

export interface ApplicationConfigData {
    name: string;
    root: string;
}

export interface AnalysisSettingsData {
    applications: ApplicationConfigData[];
    landscapeToken: string;
    socialFetchEndDate: string;
    socialFetchTimeFrame: number | null;
    includeDataStructures: boolean;
    fetchSocialData: boolean;
    syncSocialWindow: boolean;
}

export class FullAnalysisConfig {
    repository: RepositoryConfigData;
    filters: FilterConfigData;
    analysisConfiguration: AnalysisSettingsData;

    constructor(data: {
        repository: RepositoryConfigData;
        filters: FilterConfigData;
        analysisConfiguration: AnalysisSettingsData;
    }) {
        this.repository = data.repository;
        this.filters = data.filters;
        this.analysisConfiguration = data.analysisConfiguration;
    }

    static fromUnknown(raw: unknown): FullAnalysisConfig {
        const obj = (raw ?? {}) as Record<string, any>;
        const repo = obj.repository ?? {};
        const filters = obj.filters ?? {};
        const analysis = obj.analysisConfiguration ?? {};

        return new FullAnalysisConfig({
            repository: {
                branch: typeof repo.branch === 'string' && repo.branch.trim() ? repo.branch : 'use current branch',
                startCommit: typeof repo.startCommit === 'string' ? repo.startCommit : '',
                endCommit: typeof repo.endCommit === 'string' ? repo.endCommit : '',
                commitCount: typeof repo.commitCount === 'number' ? repo.commitCount : null,
                maxLoc: typeof repo.maxLoc === 'number' ? repo.maxLoc : null,
                firstParentCommitsOnly: Boolean(repo.firstParentCommitsOnly),
                skipCommitsWithoutRelevantChanges: Boolean(repo.skipCommitsWithoutRelevantChanges)
            },
            filters: {
                inclusionSearchExpressions:
                    typeof filters.inclusionSearchExpressions === 'string' ? filters.inclusionSearchExpressions : '',
                exclusionSearchExpression:
                    typeof filters.exclusionSearchExpression === 'string' ? filters.exclusionSearchExpression : '',
                commitSamplingInterval:
                    typeof filters.commitSamplingInterval === 'number' ? filters.commitSamplingInterval : null,
                commitSamplingPeriod: filters.commitSamplingPeriod ?? 'disabled'
            },
            analysisConfiguration: {
                applications: Array.isArray(analysis.applications)
                    ? analysis.applications.map((app: any) => ({
                        name: typeof app?.name === 'string' ? app.name : '',
                        root: typeof app?.root === 'string' ? app.root : ''
                    }))
                    : [],
                landscapeToken: typeof analysis.landscapeToken === 'string' ? analysis.landscapeToken : '',
                socialFetchEndDate:
                    typeof analysis.socialFetchEndDate === 'string' ? analysis.socialFetchEndDate : '',
                socialFetchTimeFrame:
                    typeof analysis.socialFetchTimeFrame === 'number' ? analysis.socialFetchTimeFrame : null,
                includeDataStructures:
                    analysis.includeDataStructures !== undefined ? Boolean(analysis.includeDataStructures) : true,
                fetchSocialData: Boolean(analysis.fetchSocialData),
                syncSocialWindow: Boolean(analysis.syncSocialWindow)
            }
        });
    }
}