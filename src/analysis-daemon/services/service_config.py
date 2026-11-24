import os

from pydantic import BaseModel


def _normalize_url(url: str | None, fallback: str) -> str:
    if not url:
        return fallback
    cleaned = url.strip().rstrip("/")
    return cleaned or fallback


class ServiceUrlsPatch(BaseModel):
    codeAnalyzerUrl: str | None = None
    offlineFrontendUrl: str | None = None
    onlineFrontendUrl: str | None = None


class ServiceUrls(BaseModel):
    code_analyzer_url: str = "http://127.0.0.1:8078"
    offline_frontend_url: str = "http://127.0.0.1:4200"
    online_frontend_url: str = ""

    @classmethod
    def from_env(cls) -> "ServiceUrls":
        defaults = cls()
        return cls(
            code_analyzer_url=_normalize_url(
                os.getenv("EXPLORVIZ_CODE_ANALYZER_URL"),
                defaults.code_analyzer_url,
            ),
            offline_frontend_url=_normalize_url(
                os.getenv("EXPLORVIZ_OFFLINE_FRONTEND_URL"),
                defaults.offline_frontend_url,
            ),
            online_frontend_url=_normalize_url(
                os.getenv("EXPLORVIZ_ONLINE_FRONTEND_URL"),
                defaults.online_frontend_url,
            ),
        )

    def merged_with(self, patch: ServiceUrlsPatch) -> "ServiceUrls":
        return ServiceUrls(
            code_analyzer_url=(
                _normalize_url(patch.codeAnalyzerUrl, self.code_analyzer_url)
                if patch.codeAnalyzerUrl is not None
                else self.code_analyzer_url
            ),
            offline_frontend_url=(
                _normalize_url(patch.offlineFrontendUrl, self.offline_frontend_url)
                if patch.offlineFrontendUrl is not None
                else self.offline_frontend_url
            ),
            online_frontend_url=(
                _normalize_url(patch.onlineFrontendUrl, self.online_frontend_url)
                if patch.onlineFrontendUrl is not None
                else self.online_frontend_url
            ),
        )

    def to_camel_dict(self) -> dict[str, str]:
        return {
            "codeAnalyzerUrl": self.code_analyzer_url,
            "offlineFrontendUrl": self.offline_frontend_url,
            "onlineFrontendUrl": self.online_frontend_url,
        }


_current_service_urls = ServiceUrls.from_env()


def get_service_urls() -> ServiceUrls:
    return _current_service_urls


def update_service_urls(patch: ServiceUrlsPatch) -> ServiceUrls:
    global _current_service_urls
    _current_service_urls = _current_service_urls.merged_with(patch)
    return _current_service_urls
