"""Typed view of a download request received from the extension."""
from dataclasses import dataclass, field, replace
from typing import Any, Dict, Optional

DEFAULT_ACCOUNT = "M"
DEFAULT_MEDIA_TYPE = "auto"
DEFAULT_PLATFORM = "auto"


@dataclass(frozen=True)
class MediaRequest:
    url: Optional[str]
    platform: str
    account: str
    media_type: str
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_message(cls, message: Dict[str, Any], metadata: Dict[str, Any]) -> "MediaRequest":
        return cls(
            url=message.get("url"),
            platform=message.get("platform") or DEFAULT_PLATFORM,
            account=message.get("account") or DEFAULT_ACCOUNT,
            media_type=message.get("mediaType") or DEFAULT_MEDIA_TYPE,  # wire field name set by the extension
            metadata=metadata,
        )

    def with_fallback_url(self, url: str) -> "MediaRequest":
        """Same request re-targeted at a page URL, resolved by the platform's generic downloader."""
        return replace(self, url=url, media_type=DEFAULT_MEDIA_TYPE)

    def meta(self, key: str, default: Any = None) -> Any:
        return self.metadata.get(key, default)
