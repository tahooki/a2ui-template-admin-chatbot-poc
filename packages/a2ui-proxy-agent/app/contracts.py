from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


PresentationMode = Literal["a2ui", "text"]


class ChatHistoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: Literal["user", "assistant", "system"]
    content: str = Field(max_length=8_000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    message: str | None = Field(default=None, max_length=8_000)
    input: str | None = Field(default=None, max_length=8_000)
    history: list[ChatHistoryItem] = Field(default_factory=list, max_length=30)
    presentationMode: PresentationMode = "a2ui"

    def normalized_message(self) -> str:
        return (self.message or self.input or "").strip()

    @property
    def presentation_mode(self) -> PresentationMode:
        return self.presentationMode

    def normalized_history(self) -> list[dict[str, str]]:
        return [
            {
                "role": item.role,
                "content": item.content,
            }
            for item in self.history
        ]


class DisplaySelectionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    selectionId: str = Field(min_length=1, max_length=200)
    templateId: str = Field(min_length=1, max_length=100)

    @property
    def selection_id(self) -> str:
        return self.selectionId.strip()

    @property
    def template_id(self) -> str:
        return self.templateId.strip()
