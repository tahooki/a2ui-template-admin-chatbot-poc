from typing import Any, Literal

from pydantic import BaseModel, Field


PresentationMode = Literal["a2ui", "text"]


class ChatRequest(BaseModel):
    message: str | None = None
    input: str | None = None
    history: list[dict[str, Any]] = Field(default_factory=list)
    presentationMode: PresentationMode = "a2ui"

    def normalized_message(self) -> str:
        return (self.message or self.input or "").strip()

    @property
    def presentation_mode(self) -> PresentationMode:
        return self.presentationMode


class DisplaySelectionRequest(BaseModel):
    selectionId: str
    templateId: str

    @property
    def selection_id(self) -> str:
        return self.selectionId.strip()

    @property
    def template_id(self) -> str:
        return self.templateId.strip()
