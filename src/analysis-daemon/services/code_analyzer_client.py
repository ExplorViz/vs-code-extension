import asyncio
import json
import os
from pathlib import Path

import httpx
from models.analysis_config import FullAnalysisRequest

from services.git_service import get_git_remote_url
from services.service_config import get_service_urls


def _get_trigger_url() -> str:
    base = get_service_urls().code_analyzer_url.rstrip("/")
    return f"{base}/api/analysis/extension/trigger"


def _get_status_url(landscape_token: str) -> str:
    base = get_service_urls().code_analyzer_url.rstrip("/")
    return f"{base}/api/analysis/status/{landscape_token}"


def build_multipart_form_data(
    config: FullAnalysisRequest,
    remote_url: str | None = None,
) -> dict[str, str]:
    repo = config.repository
    filters = config.filters
    analysis = config.analysisConfiguration

    form_data: dict[str, str] = {
        "repoPath": repo.repoPath or "",
        "landscapeToken": analysis.landscapeToken or "mytokenvalue",
        "branch": repo.branch or "",
        "includeInAnalysisExpressions": filters.inclusionSearchExpressions or "",
        "excludeFromAnalysisExpressions": filters.exclusionSearchExpression or "",
        "commitSamplingPeriod": filters.commitSamplingPeriod or "disabled",
        "includeDataStructures": str(analysis.includeDataStructures).lower(),
        "firstParentCommitsOnly": str(repo.firstParentCommitsOnly).lower(),
        "skipCommitsWithoutRelevantFileChanges": str(
            repo.skipCommitsWithoutRelevantChanges
        ).lower(),
        "fetchSocialData": str(analysis.fetchSocialData).lower(),
        "syncSocialWindow": str(analysis.syncSocialWindow).lower(),
    }

    if repo.startCommit:
        form_data["startCommit"] = repo.startCommit
    if repo.endCommit:
        form_data["endCommit"] = repo.endCommit
    if repo.commitCount is not None:
        form_data["commitAnalysisLimit"] = str(repo.commitCount)
    if repo.maxLoc is not None:
        form_data["maxLocForFullAnalysis"] = str(repo.maxLoc)
    if filters.commitSamplingInterval is not None:
        form_data["commitSamplingInterval"] = str(filters.commitSamplingInterval)
    if analysis.socialFetchTimeFrame is not None:
        form_data["socialDataTimeFrameDays"] = str(analysis.socialFetchTimeFrame)
    if analysis.socialFetchEndDate:
        form_data["fetchEndDate"] = analysis.socialFetchEndDate

    applications_json = ""
    if analysis.applications:
        applications_json = json.dumps(
            [{"name": app.name, "root": app.root} for app in analysis.applications]
        )

    if applications_json:
        form_data["applicationsJson"] = applications_json

    if remote_url:
        form_data["repoRemoteUrl"] = remote_url

    return form_data


async def send_bundle_to_code_analyzer(
    client: httpx.AsyncClient,
    config: FullAnalysisRequest,
    bundle_path: Path,
) -> None:
    remote_url = await get_git_remote_url(config.repository.repoPath)
    form_data = build_multipart_form_data(config, remote_url=remote_url)

    with bundle_path.open("rb") as bundle_file:
        files = [
            ("bundle", (bundle_path.name, bundle_file, "application/octet-stream")),
        ]

        response = await client.post(
            _get_trigger_url(),
            data=form_data,
            files=files,
        )

    if response.status_code >= 400:
        raise RuntimeError(
            f"Code Analyzer rejected request ({response.status_code}): {response.text}"
        )


async def poll_analysis_until_done(
    client: httpx.AsyncClient,
    landscape_token: str,
    poll_interval_seconds: float = 2.0,
    max_not_found_attempts: int = 10,
) -> str:
    status_url = _get_status_url(landscape_token)
    not_found_count = 0

    while True:
        response = await client.get(status_url)

        if response.status_code == 404:
            not_found_count += 1
            if not_found_count > max_not_found_attempts:
                raise RuntimeError(
                    f"Analysis status not found for token '{landscape_token}' after {max_not_found_attempts} polls."
                )
            await asyncio.sleep(poll_interval_seconds)
            continue

        if response.status_code >= 400:
            raise RuntimeError(
                f"Status poll failed ({response.status_code}): {response.text}"
            )

        if response.status_code == 200:
            state = response.text.strip().strip('"').lower()
            if state == "finished":
                return "completed"
            if state in {"failed", "cancelled"}:
                raise RuntimeError(f"Analysis {state}.")

        await asyncio.sleep(poll_interval_seconds)
