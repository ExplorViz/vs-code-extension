import asyncio
import json
import sys
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel
from routers.socket import connection_manager

router = APIRouter()

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


async def run_full_analysis(config: FullAnalysisRequest):
    status = "completed"
    try:
        print("[Analysis Daemon] Starting full analysis on for landscape.")

        # TODO: Actual call to Code Analyzer
        await asyncio.sleep(3)

        print("[Analysis Daemon] Full analysis job finished.")
    except asyncio.CancelledError:
        status = "cancelled"
        print("[Analysis Daemon] Full analysis job cancelled.")
        raise
    except Exception as exc:
        status = "failed"
        print(f"[Analysis Daemon] Full analysis job failed: {exc}", file=sys.stderr)
    finally:
        await connection_manager.broadcast(
            json.dumps({"event": "analysis_finished", "status": status})
        )


@router.post("/start-full-analysis")
async def start_analysis(config: FullAnalysisRequest):
    asyncio.create_task(run_full_analysis(config))
    return {"status": "accepted"}


@router.post("/trigger")
async def trigger_action():
    print("[Analysis Daemon] Button clicked! Received trigger from sidebar.")
    return {"status": "ok"}


@router.post("/analysis-status")
async def get_analysis_status():
    # TODO: Add real implementation!
    return {"status": "running", "mode": "lightweight"}
