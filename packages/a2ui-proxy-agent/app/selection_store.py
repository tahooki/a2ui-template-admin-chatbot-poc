from dataclasses import dataclass
from time import monotonic
from typing import Any
from uuid import uuid4

from .config import settings


@dataclass(frozen=True)
class SelectionContext:
    selection_id: str
    query: str
    api_id: str
    data: Any
    metadata: dict[str, Any]
    allowed_template_ids: tuple[str, ...]
    prepared_surface: dict[str, Any] | None
    expires_at: float


class SelectionStore:
    def __init__(self, ttl_seconds: float | None = None) -> None:
        self.ttl_seconds = ttl_seconds or settings.selection_ttl_seconds
        self._items: dict[str, SelectionContext] = {}

    def put(
        self,
        *,
        query: str,
        api_id: str,
        data: Any,
        metadata: dict[str, Any],
        allowed_template_ids: list[str],
        prepared_surface: dict[str, Any] | None,
    ) -> SelectionContext:
        self._delete_expired()
        selection_id = f"selection-{uuid4()}"
        context = SelectionContext(
            selection_id=selection_id,
            query=query,
            api_id=api_id,
            data=data,
            metadata=metadata,
            allowed_template_ids=tuple(allowed_template_ids),
            prepared_surface=prepared_surface,
            expires_at=monotonic() + self.ttl_seconds,
        )
        self._items[selection_id] = context
        return context

    def get(self, selection_id: str) -> SelectionContext | None:
        self._delete_expired()
        return self._items.get(selection_id)

    def delete(self, selection_id: str) -> None:
        self._items.pop(selection_id, None)

    def _delete_expired(self) -> None:
        now = monotonic()
        expired = [key for key, value in self._items.items() if value.expires_at <= now]
        for key in expired:
            self._items.pop(key, None)


selection_store = SelectionStore()
