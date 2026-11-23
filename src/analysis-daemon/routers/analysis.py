import traceback
import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Literal
from urllib.parse import quote

import httpx
from fastapi import APIRouter
from pydantic import BaseModel
from routers.socket import connection_manager

router = APIRouter()

SamplingPeriod = Literal["disabled", "Day", "Week", "Month", "Year"]

# TODO: move to some config file later
CODE_ANALYZER_BASE_URL = os.getenv(
    "EXPLORVIZ_CODE_ANALYZER_URL",
    "http://127.0.0.1:8078",
).rstrip("/")
CODE_ANALYZER_TRIGGER_URL = f"{CODE_ANALYZER_BASE_URL}/api/analysis/extension/trigger"

# TODO: move to some config file later
POLL_INTERVAL_SECONDS = float(os.getenv("EXPLORVIZ_STATUS_POLL_INTERVAL", "1.0"))
POLL_TIMEOUT_SECONDS = float(os.getenv("EXPLORVIZ_STATUS_POLL_TIMEOUT", "1800.0"))

TERMINAL_COMPLETED_STATUSES = {"completed", "complete", "done", "succeeded", "success"}
TERMINAL_FAILED_STATUSES = {"failed", "fail", "error"}
TERMINAL_CANCELLED_STATUSES = {"cancelled", "canceled"}


class RepositoryConfig(BaseModel):
    repoPath: str = (
        ""  # TODO: Maybe unnecessary, since will send bundle to Code Analyzer anyways
    )
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
    bundle_path: Path | None = None
    landscape_token = (
        config.analysisConfiguration.landscapeToken or ""
    ).strip() or "mytokenvalue"

    try:
        print("[Analysis Daemon] Starting full analysis on for landscape.")
        print(f"[Analysis Daemon] Branch is {config.repository.branch}")

        with tempfile.NamedTemporaryFile(suffix=".bundle", delete=False) as tmp:
            bundle_path = Path(tmp.name)

        await _create_git_bundle(
            repo_path=config.repository.repoPath,
            branch=config.repository.branch,
            bundle_path=bundle_path,
        )

        async with httpx.AsyncClient(
            timeout=httpx.Timeout(300.0, connect=10.0)
        ) as client:
            await _send_bundle_to_code_analyzer(
                client=client,
                config=config,
                bundle_path=bundle_path,
            )
            print(
                "[Analysis Daemon] Dispatched analysis job to Code Analyzer. Waiting for completion callback."
            )
            status = await _poll_analysis_until_done(
                client=client,
                landscape_token=landscape_token,
            )

        print(f"[Analysis Daemon] Full analysis job finished with status={status}.")
    except asyncio.CancelledError:
        status = "cancelled"
        print("[Analysis Daemon] Full analysis job cancelled.")
        raise
    except Exception as exc:
        status = "failed"
        print(
            f"[Analysis Daemon] Full analysis job failed ({type(exc).__name__}): {exc!r}",
            file=sys.stderr,
        )
        traceback.print_exc(file=sys.stderr)
    finally:
        if bundle_path is not None:
            try:
                bundle_path.unlink(missing_ok=True)
            except OSError:
                pass

        await connection_manager.broadcast(
            json.dumps(
                {
                    "event": "analysis_finished",
                    "status": status,
                }
            )
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


async def _create_git_bundle(
    repo_path: str, branch: str | None, bundle_path: Path
) -> None:
    if not repo_path:
        raise ValueError("repoPath is required to create a git bundle")

    repo_dir = Path(repo_path)
    if not repo_dir.is_dir():
        raise FileNotFoundError(f"Repository directoy does not exists: {repo_path}")

    args = ["bundle", "create", str(bundle_path)]
    if branch and branch != "use current branch":
        args.append(branch)
    else:
        raise ValueError("branch is required to create a git bundle")

    proc = await asyncio.create_subprocess_exec(
        "git",
        *args,
        cwd=str(repo_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err_msg = (
            stderr.decode("utf-8", errors="replace").strip()
            or stdout.decode("utf-8", errors="replace").strip()
        )
        raise RuntimeError(
            f"git bundle create failed (exit {proc.returncode}): {err_msg}"
        )


def _build_multipart_form_data(
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


async def _send_bundle_to_code_analyzer(
    client: httpx.AsyncClient,
    config: FullAnalysisRequest,
    bundle_path: Path,
) -> None:
    remote_url = await _get_git_remote_url(config.repository.repoPath)
    form_data = _build_multipart_form_data(config, remote_url=remote_url)

    with bundle_path.open("rb") as bundle_file:
        files = [
            ("bundle", (bundle_path.name, bundle_file, "application/octet-stream")),
        ]

        print(
            "[Analysis Daemon] Sending multipart to",
            CODE_ANALYZER_TRIGGER_URL,
            "keys=",
            list(form_data.keys()),
            "files=",
            [(name, meta[0], meta[2]) for name, meta in files],
        )

        response = await client.post(
            CODE_ANALYZER_TRIGGER_URL,
            data=form_data,
            files=files,
        )

    if response.status_code >= 400:
        raise RuntimeError(
            f"Code Analyzer rejected request ({response.status_code}): {response.text}"
        )


def _normalize_terminal_status(raw_status: str) -> str | None:
    normalized = raw_status.strip().strip('"').lower()
    if normalized in TERMINAL_COMPLETED_STATUSES:
        return "completed"
    if normalized in TERMINAL_CANCELLED_STATUSES:
        return "cancelled"
    if normalized in TERMINAL_FAILED_STATUSES:
        return "failed"
    return None


async def _poll_analysis_until_done(
    client: httpx.AsyncClient,
    landscape_token: str,
) -> str:
    encoded_token = quote(landscape_token, safe="")
    status_url = f"{CODE_ANALYZER_BASE_URL}/api/analysis/status/{encoded_token}"

    loop = asyncio._get_running_loop()
    deadline = loop.time() + POLL_TIMEOUT_SECONDS
    seen_active_status = False
    early_404_attempts = 0

    while True:
        if loop.time() >= deadline:
            raise TimeoutError(
                f"Timed out waiting for analysis status for landscapeToken={landscape_token}"
            )

        response = await client.get(status_url)

        if response.status_code == 200:
            seen_active_status = True
            raw_text = response.text
            terminal = _normalize_terminal_status(raw_text)
            if terminal is not None:
                return terminal
        elif (
            response.status_code == 404
            and not seen_active_status
            and early_404_attempts < 10
        ):
            # wait for job to be registered
            early_404_attempts += 1
        else:
            raise RuntimeError(
                f"Failed polling status ({response.status_code}) for token={landscape_token}"
            )

        await asyncio.sleep(POLL_INTERVAL_SECONDS)


async def _get_git_remote_url(repo_path: str) -> str | None:
    if not repo_path:
        return None

    repo_dir = Path(repo_path)
    if not repo_dir.is_dir():
        return None

    proc = await asyncio.create_subprocess_exec(
        "git",
        "remote",
        "get-url",
        "origin",
        cwd=str(repo_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    if proc.returncode == 0:
        url = stdout.decode("utf-8", errors="replace").strip()
        if url:
            return url

    # fallback: check if any remote exists
    remotes_proc = await asyncio.create_subprocess_exec(
        "git",
        "remote",
        cwd=str(repo_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    remotes_out, _ = await remotes_proc.communicate()
    if remotes_proc.returncode == 0:
        for remote_name in remotes_out.decode("utf-8", errors="replace").splitlines():
            remote_name = remote_name.strip()
            if not remote_name:
                continue
            url_proc = await asyncio.create_subprocess_exec(
                "git",
                "remote",
                "get-url",
                remote_name,
                cwd=str(repo_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            url_out, _ = await url_proc.communicate()
            if url_proc.returncode == 0:
                url = url_out.decode("utf-8", errors="replace").strip()
                if url:
                    return url

    return None
