from fastapi import APIRouter

router = APIRouter()


@router.post("/trigger")
async def trigger_action():
    print("[Analysis Daemon] Button clicked! Received trigger from sidebar.")
    return {"status": "ok"}


@router.post("/analysis-status")
async def get_analysis_status():
    # TODO: Add real implementation!
    return {"status": "running", "mode": "lightweight"}
