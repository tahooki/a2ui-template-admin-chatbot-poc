from dataclasses import dataclass


@dataclass(frozen=True)
class StaticTemplate:
    template_id: str
    label: str
    view_type: str
    max_items: int


STATIC_TEMPLATE_VERSION = 1

STATIC_TEMPLATES = (
    StaticTemplate(
        template_id="matrix.table",
        label="데이터 테이블",
        view_type="matrix.table",
        max_items=8,
    ),
    StaticTemplate(
        template_id="collection.cardGrid",
        label="카드",
        view_type="collection.cardGrid",
        max_items=6,
    ),
    StaticTemplate(
        template_id="collection.list",
        label="목록",
        view_type="collection.list",
        max_items=8,
    ),
)

STATIC_TEMPLATE_BY_ID = {template.template_id: template for template in STATIC_TEMPLATES}
STATIC_TEMPLATE_IDS = tuple(STATIC_TEMPLATE_BY_ID)
