from typing import Any

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str | None = None
    input: str | None = None
    history: list[dict[str, Any]] = Field(default_factory=list)

    def normalized_message(self) -> str:
        return (self.message or self.input or "").strip()


class DisplaySelectionRequest(BaseModel):
    selectionId: str
    templateId: str

    @property
    def selection_id(self) -> str:
        return self.selectionId.strip()

    @property
    def template_id(self) -> str:
        return self.templateId.strip()
