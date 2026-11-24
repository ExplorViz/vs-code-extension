from fastapi import APIRouter
from services.service_config import ServiceUrlsPatch, update_service_urls

router = APIRouter(prefix="/api/config", tags=["config"])


@router.post("/service-urls")
async def post_service_urls(payload: ServiceUrlsPatch) -> dict[str, object]:
    updated = update_service_urls(payload)
    print(f"[Analysis Daemon] Updated service URLs: {updated.model_dump()}")
    return {
        "status": "ok",
        "urls": updated.to_camel_dict(),
    }
