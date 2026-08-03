import hashlib
import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
)


MAX_MOCK_DATA_FILE_BYTES = 5 * 1024 * 1024
PACKAGE_ROOT = Path(__file__).resolve().parents[1]


class MockMainAgentDataError(RuntimeError):
    pass


class MockMainAgentData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    apiId: Literal["work-items"]
    sourceToolName: str = Field(
        default="mock_work_items",
        min_length=1,
        max_length=100,
    )
    data: dict[str, Any]
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("data")
    @classmethod
    def validate_work_items_data(
        cls,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        items = data.get("items")
        if not isinstance(items, list) or not items:
            raise ValueError(
                "data.items must be a non-empty array."
            )
        for item in items:
            if not isinstance(item, dict):
                raise ValueError(
                    "Every work item must be an object."
                )
            title = item.get("title")
            if not isinstance(title, str) or not title.strip():
                raise ValueError(
                    "Every work item requires a title."
                )
        return data


def resolve_mock_data_path(data_file: str | Path) -> Path:
    path = Path(data_file).expanduser()
    return path if path.is_absolute() else PACKAGE_ROOT / path


def load_mock_main_agent_data(
    data_file: str | Path,
) -> MockMainAgentData:
    path = resolve_mock_data_path(data_file)
    try:
        file_size = path.stat().st_size
    except OSError as exc:
        raise MockMainAgentDataError(
            f"Mock Main Agent data file is not readable: {path.name}"
        ) from exc
    if file_size > MAX_MOCK_DATA_FILE_BYTES:
        raise MockMainAgentDataError(
            "Mock Main Agent data file exceeds 5 MiB."
        )
    try:
        raw_payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise MockMainAgentDataError(
            f"Mock Main Agent data file is invalid: {path.name}"
        ) from exc
    try:
        return MockMainAgentData.model_validate(raw_payload)
    except ValidationError as exc:
        raise MockMainAgentDataError(
            f"Mock Main Agent data contract is invalid: {path.name}"
        ) from exc


def _source_row_count(payload: MockMainAgentData) -> int:
    items = payload.data.get("items")
    return len(items) if isinstance(items, list) else 0


def _source_data_hash(data: dict[str, Any]) -> str:
    canonical = json.dumps(
        data,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _trace_payload(
    turn_id: str,
    data: dict[str, Any],
    *,
    branch: str,
) -> dict[str, Any]:
    return {
        "turnId": turn_id,
        "physicalEmitter": "main-agent",
        "emittedAt": datetime.now(timezone.utc).isoformat(),
        "sourceMode": "mock",
        "branch": branch,
        **data,
    }


class MockMainAgentClient:
    source_mode = "mock"
    server_url = None

    def __init__(self, data_file: str | Path) -> None:
        self.data_file = data_file

    async def stream_chat(
        self,
        *,
        message: str,
        history: list[dict[str, Any]] | None = None,
        presentation_mode: str = "a2ui",
        authorization: str | None = None,
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        _ = history, authorization
        payload = load_mock_main_agent_data(self.data_file)
        row_count = _source_row_count(payload)
        normalized_data = {
            **payload.data,
            "total": row_count,
            "page": 1,
            "pageSize": row_count,
        }
        source_hash = _source_data_hash(normalized_data)
        result_id = f"mock-{source_hash[:16]}"
        metadata = {
            **payload.metadata,
            "mock": True,
            "sourceDataHash": source_hash,
            "sourceRowCount": row_count,
        }
        turn_id = f"mock-main-turn-{uuid4()}"

        yield "state", _trace_payload(
            turn_id,
            {
                "status": "intent",
                "label": payload.apiId,
                "apiId": payload.apiId,
                "source": "fixed-work-items-json",
            },
            branch="data",
        )
        yield "state", _trace_payload(
            turn_id,
            {
                "status": "business_tool_result",
                "label": payload.sourceToolName,
                "apiId": payload.apiId,
                "sourceToolName": payload.sourceToolName,
                "sourceToolResultId": result_id,
                "sourceDataHash": source_hash,
                "sourceRowCount": row_count,
            },
            branch="data",
        )
        yield "text", _trace_payload(
            turn_id,
            {
                "text": (
                    "워크 아이템 목 데이터를 불러왔습니다. "
                    f"총 {row_count}건입니다."
                )
            },
            branch="data",
        )

        if presentation_mode == "text":
            yield "done", _trace_payload(
                turn_id,
                {
                    "mode": "text",
                    "presentationMode": "text",
                    "apiId": payload.apiId,
                    "sourceToolName": payload.sourceToolName,
                    "sourceToolResultId": result_id,
                },
                branch="data",
            )
            return

        yield "data_result", _trace_payload(
            turn_id,
            {
                "kind": "main_agent.data_result",
                "query": message,
                "apiId": payload.apiId,
                "intentSource": "fixed-work-items-json",
                "sourceToolName": payload.sourceToolName,
                "sourceToolResultId": result_id,
                "data": normalized_data,
                "metadata": metadata,
            },
            branch="data",
        )
        yield "done", _trace_payload(
            turn_id,
            {
                "mode": "data_result",
                "apiId": payload.apiId,
                "sourceToolName": payload.sourceToolName,
                "sourceToolResultId": result_id,
            },
            branch="data",
        )
