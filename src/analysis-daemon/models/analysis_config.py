from typing import Literal

from pydantic import BaseModel, Field

SamplingPeriod = Literal["disabled", "Day", "Week", "Month", "Year"]


class RepositoryConfig(BaseModel):
    repoPath: str = ""
    branch: str = "use current branch"
    startCommit: str = ""
    endCommit: str = ""
    commitCount: int | None = 1
    maxLoc: int | None = None
    firstParentCommitsOnly: bool = True
    skipCommitsWithoutRelevantChanges: bool = False


class FilterConfig(BaseModel):
    inclusionSearchExpressions: str = ""
    exclusionSearchExpression: str = ""
    commitSamplingInterval: int | None = None
    commitSamplingPeriod: SamplingPeriod = "disabled"


class ApplicationItem(BaseModel):
    name: str
    root: str


class AnalysisSettingsConfig(BaseModel):
    applications: list[ApplicationItem] = []
    landscapeToken: str = ""
    socialFetchEndDate: str = ""
    socialFetchTimeFrame: int | None = None
    includeDataStructures: bool = True
    fetchSocialData: bool = False
    syncSocialWindow: bool = False


class FullAnalysisRequest(BaseModel):
    repository: RepositoryConfig
    filters: FilterConfig
    analysisConfiguration: AnalysisSettingsConfig
