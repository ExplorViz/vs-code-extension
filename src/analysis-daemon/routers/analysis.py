import asyncio
import json
import os
import sys
import tempfile
import traceback
from pathlib import Path

import httpx
from fastapi import APIRouter, BackgroundTasks
from models.analysis_config import FullAnalysisRequest
from services.code_analyzer_client import (
    poll_analysis_until_done,
    send_bundle_to_code_analyzer,
)
from services.git_service import create_git_bundle

from routers.socket import connection_manager

router = APIRouter()


# TODO: move to some config file later
POLL_INTERVAL_SECONDS = float(os.getenv("EXPLORVIZ_STATUS_POLL_INTERVAL", "1.0"))


async def run_full_analysis(config: FullAnalysisRequest):
    tmp_dir = Path(tempfile.mkdtemp(prefix="explorviz-bundle-"))
    bundle_path = tmp_dir / f"{config.analysisConfiguration.landscapeToken}.bundle"
    status = "failed"
    error_message: str | None = None
    landscape_token = (
        config.analysisConfiguration.landscapeToken or ""
    ).strip() or "mytokenvalue"

    try:
        print("[Analysis Daemon] Starting full analysis on for landscape.")

        await create_git_bundle(
            repo_path=config.repository.repoPath,
            branch=config.repository.branch,
            bundle_path=bundle_path,
        )

        async with httpx.AsyncClient(
            timeout=httpx.Timeout(300.0, connect=10.0),
            trust_env=False,
        ) as client:
            await send_bundle_to_code_analyzer(
                client=client,
                config=config,
                bundle_path=bundle_path,
            )
            print(
                "[Analysis Daemon] Dispatched analysis job to Code Analyzer. Waiting for completion callback."
            )
            status = await poll_analysis_until_done(
                client=client,
                landscape_token=landscape_token,
                poll_interval_seconds=POLL_INTERVAL_SECONDS,
            )

        print(f"[Analysis Daemon] Full analysis job finished with status={status}.")
    except asyncio.CancelledError:
        status = "cancelled"
        print("[Analysis Daemon] Full analysis job cancelled.")
        raise
    except Exception as exc:
        status = "failed"
        error_message = str(exc) or repr(exc)
        print(
            f"[Analysis Daemon] Full analysis job failed ({type(exc).__name__}): {exc!r} | cause={exc.__cause__!r}",
            file=sys.stderr,
        )
        traceback.print_exc(file=sys.stderr)
    finally:
        if bundle_path.exists():
            bundle_path.unlink(missing_ok=True)
        if tmp_dir.exists:
            tmp_dir.rmdir()

    event_payload = {
        "event": "analysis_finished",
        "status": status,
        "landscapeToken": landscape_token,
    }
    if error_message:
        event_payload["error"] = error_message

    await connection_manager.broadcast(json.dumps(event_payload))


@router.post("/start-full-analysis")
async def start_full_analysis(
    config: FullAnalysisRequest,
    background_tasks: BackgroundTasks,
):
    background_tasks.add_task(run_full_analysis, config)
    return {"status": "accepted"}
