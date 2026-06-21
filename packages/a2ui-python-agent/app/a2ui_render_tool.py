from dataclasses import dataclass, field
from collections.abc import AsyncIterator
from typing import Any

from .business_tools import BusinessToolResult
from .render_boundary import RenderBoundaryResult, render_business_tool_result, render_business_tool_result_stream


@dataclass(frozen=True)
class A2UIRenderToolInput:
    query: str
    business_tool_result: BusinessToolResult
    context: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class A2UIRenderToolResult:
    tool_name: str
    boundary: RenderBoundaryResult
    metadata: dict[str, Any]

    @property
    def type(self) -> str:
        return self.boundary.a2ui.type

    @property
    def text(self) -> str | None:
        return self.boundary.a2ui.text

    @property
    def surface(self) -> dict[str, Any] | None:
        return self.boundary.a2ui.surface

    @property
    def reason(self) -> str | None:
        return self.boundary.a2ui.reason

    @property
    def strategy(self) -> str | None:
        return self.boundary.a2ui.strategy

    @property
    def score(self) -> float | None:
        return self.boundary.a2ui.score

    @property
    def candidates(self) -> list[dict[str, Any]] | None:
        return self.boundary.a2ui.candidates

    @property
    def mapping(self) -> dict[str, Any] | None:
        return self.boundary.a2ui.mapping

    @property
    def fallback_text(self) -> str:
        return self.boundary.fallback_text


async def run_a2ui_render_tool(tool_input: A2UIRenderToolInput) -> A2UIRenderToolResult:
    boundary = await render_business_tool_result(
        query=tool_input.query,
        business_tool_result=tool_input.business_tool_result,
        extra_metadata=tool_input.context,
    )
    return A2UIRenderToolResult(
        tool_name="a2ui_render",
        boundary=boundary,
        metadata={
            **boundary.metadata,
            "renderToolName": "a2ui_render",
            "renderToolCallPolicy": "deterministic_after_business_tool_result",
        },
    )


async def stream_a2ui_render_tool(tool_input: A2UIRenderToolInput) -> AsyncIterator[dict[str, Any]]:
    async for event in render_business_tool_result_stream(
        query=tool_input.query,
        business_tool_result=tool_input.business_tool_result,
        extra_metadata=tool_input.context,
    ):
        if event.get("type") == "progress":
            yield event
            continue
        result = event.get("result")
        if isinstance(result, RenderBoundaryResult):
            yield {
                "type": "result",
                "result": A2UIRenderToolResult(
                    tool_name="a2ui_render",
                    boundary=result,
                    metadata={
                        **result.metadata,
                        "renderToolName": "a2ui_render",
                        "renderToolCallPolicy": "deterministic_after_business_tool_result",
                    },
                ),
            }
