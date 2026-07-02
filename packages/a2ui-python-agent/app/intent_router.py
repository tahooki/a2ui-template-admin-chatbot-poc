import re
import unicodedata
from dataclasses import dataclass

from .equipment_tools import EquipmentApiId


@dataclass(frozen=True)
class RegexIntentResult:
    api_id: EquipmentApiId | None
    confidence: float
    reason: str


_EXPLICIT_API_ALIASES: tuple[tuple[EquipmentApiId, tuple[str, ...]], ...] = (
    ("equipment-status-wide-columns", ("equipment-status-wide-columns", "컬럼 많은 장비 상태 api", "wide columns api", "wide-column api")),
    ("equipment-status-large-rows", ("equipment-status-large-rows", "데이터 많은 장비 상태 api", "large rows api", "large-row api")),
    ("equipment-catalog", ("equipment-catalog", "장비 카탈로그 api", "장비 목록 api")),
    ("equipment-status", ("equipment-status api", "장비 상태 api")),
    ("work-items", ("work-items", "work items", "작업 항목 api", "워크 아이템 api")),
    ("resources", ("resources api", "resource api", "리소스 api")),
    ("status-checks", ("status-checks", "status checks", "상태 체크 api")),
    ("summary", ("summary api", "요약 api", "지표 api")),
    ("hierarchy", ("hierarchy api", "계층 api", "트리 api")),
)

_RULES: tuple[tuple[EquipmentApiId, str, tuple[str, ...]], ...] = (
    (
        "equipment-status-wide-columns",
        "wide_column_status_keywords",
        (
            r"장비.*(컬럼|열|필드).*(많|wide)",
            r"(컬럼|열|필드).*(많|wide).*장비.*상태",
            r"(wide|many)[ -]?columns?",
            r"(컬럼|열|필드)\s*(많|테스트)",
        ),
    ),
    (
        "equipment-status-large-rows",
        "large_row_status_keywords",
        (
            r"장비.*(데이터|row|rows?|행|건수).*(많|대량|large|천|1000)",
            r"(데이터|row|rows?|행|건수).*(많|대량|large|천|1000).*장비.*상태",
            r"(large|many|high)[ -]?(rows?|row-count)",
            r"(데이터|row|rows?|행|건수)\s*(많|대량|천|1000)",
            r"대용량.*장비",
        ),
    ),
    (
        "hierarchy",
        "hierarchy_keywords",
        (
            r"계층|트리|tree|hierarchy|parent|children|부모|자식",
            r"(구조|조직도).*(보여|렌더|표시)",
        ),
    ),
    (
        "summary",
        "summary_keywords",
        (
            r"kpi|metric|metrics|summary|요약|지표|통계|숫자|수치|집계|현황판",
        ),
    ),
    (
        "status-checks",
        "status_check_keywords",
        (
            r"status[ -]?checks?|health[ -]?checks?",
            r"상태\s*체크|헬스\s*체크|불리언|boolean|flag|플래그|matrix|매트릭스",
        ),
    ),
    (
        "work-items",
        "work_item_keywords",
        (
            r"work[ -]?items?|task|tasks|todo|queue|timeline",
            r"작업\s*항목|워크\s*아이템|할\s*일|진행률|우선순위|담당자|기한|마감",
        ),
    ),
    (
        "resources",
        "resource_keywords",
        (
            r"resources?|resource card|media|dataset|document",
            r"리소스|자료|문서|데이터셋|미디어",
        ),
    ),
    (
        "equipment-status",
        "equipment_status_keywords",
        (
            r"장비.*(상태|온라인|오프라인|가동|운전|알람|경보|점검|예약|운영)",
            r"(상태|온라인|오프라인|가동|운전|알람|경보|점검|예약).*(장비)",
            r"(equipment|device).*(status|state|online|running|alarm|inspection|reservation)",
        ),
    ),
    (
        "equipment-catalog",
        "equipment_catalog_keywords",
        (
            r"장비.*(목록|리스트|카탈로그|카드|이미지|사진|이름|설명)",
            r"(목록|리스트|카탈로그|카드|이미지|사진).*(장비)",
            r"(equipment|device).*(list|catalog|card|image|photo|name|description)",
        ),
    ),
)


def _normalize_message(message: str) -> str:
    normalized = unicodedata.normalize("NFKC", message).casefold()
    return re.sub(r"\s+", " ", normalized).strip()


def _matches_any(text: str, patterns: tuple[str, ...]) -> bool:
    return any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)


def choose_api_by_regex(message: str) -> RegexIntentResult:
    text = _normalize_message(message)
    if not text:
        return RegexIntentResult(api_id=None, confidence=0.0, reason="empty_message")

    for api_id, aliases in _EXPLICIT_API_ALIASES:
        if any(alias.casefold() in text for alias in aliases):
            return RegexIntentResult(api_id=api_id, confidence=1.0, reason="explicit_api_name")

    for api_id, reason, patterns in _RULES:
        if _matches_any(text, patterns):
            return RegexIntentResult(api_id=api_id, confidence=0.82, reason=reason)

    if _matches_any(text, (r"장비.*(보여|조회|알려|검색)", r"(equipment|device).*(show|lookup|search)")):
        return RegexIntentResult(api_id="equipment-catalog", confidence=0.68, reason="generic_equipment_request")

    return RegexIntentResult(api_id=None, confidence=0.3, reason="no_regex_match")
