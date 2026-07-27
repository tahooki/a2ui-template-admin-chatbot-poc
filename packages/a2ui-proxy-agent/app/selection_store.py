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
    planning: dict[str, Any]
    expires_at: float


class SelectionBusyError(ValueError):
    pass


class SelectionStore:
    def __init__(
        self,
        ttl_seconds: float | None = None,
        max_entries: int | None = None,
    ) -> None:
        self.ttl_seconds = settings.selection_ttl_seconds if ttl_seconds is None else ttl_seconds
        self.max_entries = (
            settings.selection_max_entries
            if max_entries is None
            else max_entries
        )
        if self.max_entries < 1:
            raise ValueError("max_entries must be at least 1")
        self._items: dict[str, SelectionContext] = {}
        self._in_flight: set[str] = set()

    def put(
        self,
        *,
        query: str,
        api_id: str,
        data: Any,
        metadata: dict[str, Any],
        allowed_template_ids: list[str],
        planning: dict[str, Any] | None = None,
    ) -> SelectionContext:
        self._delete_expired()
        self._evict_if_full()
        selection_id = f"selection-{uuid4()}"
        context = SelectionContext(
            selection_id=selection_id,
            query=query,
            api_id=api_id,
            data=data,
            metadata=metadata,
            allowed_template_ids=tuple(allowed_template_ids),
            planning=planning or {},
            expires_at=monotonic() + self.ttl_seconds,
        )
        self._items[selection_id] = context
        return context

    def get(self, selection_id: str) -> SelectionContext | None:
        self._delete_expired()
        return self._items.get(selection_id)

    def claim(self, selection_id: str) -> SelectionContext | None:
        self._delete_expired()
        context = self._items.get(selection_id)
        if context is None:
            return None
        if selection_id in self._in_flight:
            raise SelectionBusyError(
                "선택한 화면을 이미 생성하고 있습니다."
            )
        self._in_flight.add(selection_id)
        return context

    def release(self, selection_id: str) -> None:
        self._in_flight.discard(selection_id)

    def delete(self, selection_id: str) -> None:
        self._in_flight.discard(selection_id)
        self._items.pop(selection_id, None)

    def _evict_if_full(self) -> None:
        if len(self._items) < self.max_entries:
            return
        evictable = [
            context
            for key, context in self._items.items()
            if key not in self._in_flight
        ]
        if not evictable:
            raise RuntimeError(
                "선택 저장소가 처리 중인 요청으로 가득 찼습니다."
            )
        oldest = min(
            evictable,
            key=lambda context: context.expires_at,
        )
        self.delete(oldest.selection_id)

    def _delete_expired(self) -> None:
        now = monotonic()
        expired = [key for key, value in self._items.items() if value.expires_at <= now]
        for key in expired:
            self.delete(key)


selection_store = SelectionStore()
