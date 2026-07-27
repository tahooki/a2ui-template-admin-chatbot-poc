import os
from dataclasses import dataclass
from pathlib import Path


TRUE_VALUES = {"1", "true", "yes", "on"}


def _read_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


_PACKAGE_ROOT = Path(__file__).resolve().parents[1]
_LOCAL_ENV = _read_env_file(_PACKAGE_ROOT / ".env.local")


def _env(name: str, default: str = "") -> str:
    return os.getenv(name) or _LOCAL_ENV.get(name, default)


def _float_env(name: str, default: float) -> float:
    try:
        return float(_env(name, str(default)))
    except ValueError:
        return default


def _int_env(name: str, default: int) -> int:
    try:
        return int(_env(name, str(default)))
    except ValueError:
        return default


def _bool_env(name: str, default: bool = False) -> bool:
    raw_value = _env(name)
    return default if not raw_value else raw_value.strip().lower() in TRUE_VALUES


def _csv_env(name: str, default: str) -> tuple[str, ...]:
    values = [
        value.strip()
        for value in _env(name, default).split(",")
        if value.strip()
    ]
    return tuple(values)


@dataclass(frozen=True)
class Settings:
    main_agent_url: str = _env("MAIN_AGENT_URL", "http://localhost:8000")
    main_agent_timeout_seconds: float = _float_env("MAIN_AGENT_TIMEOUT_SECONDS", 45)
    main_agent_bearer_token: str = _env("MAIN_AGENT_BEARER_TOKEN")
    forward_authorization: bool = _bool_env("A2UI_FORWARD_AUTHORIZATION")
    selection_ttl_seconds: float = _float_env("A2UI_SELECTION_TTL_SECONDS", 300)
    selection_max_entries: int = _int_env("A2UI_SELECTION_MAX_ENTRIES", 100)
    openai_api_key: str = _env("OPENAI_API_KEY")
    openai_model: str = _env("OPENAI_MODEL", "gpt-4.1-mini")
    openai_base_url: str = _env("OPENAI_BASE_URL", "https://api.openai.com/v1")
    ai_timeout_seconds: float = _float_env("A2UI_AI_TIMEOUT_SECONDS", 100)
    flow_log_max_chars: int = _int_env("A2UI_FLOW_LOG_MAX_CHARS", 50_000)
    flow_log_include_payloads: bool = _bool_env("A2UI_FLOW_LOG_INCLUDE_PAYLOADS")
    expose_error_details: bool = _bool_env("A2UI_EXPOSE_ERROR_DETAILS")
    allowed_origins: tuple[str, ...] = _csv_env(
        "A2UI_PROXY_ALLOWED_ORIGINS",
        (
            "http://localhost:3000,http://127.0.0.1:3000,"
            "http://localhost:3001,http://127.0.0.1:3001"
        ),
    )
    allow_credentials: bool = _bool_env("A2UI_PROXY_ALLOW_CREDENTIALS")


settings = Settings()
