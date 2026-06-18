import os
from dataclasses import dataclass
from pathlib import Path


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
_REPO_ROOT = Path(__file__).resolve().parents[3]
_LOCAL_ENV = {
    **_read_env_file(_REPO_ROOT / ".env.local"),
    **_read_env_file(_PACKAGE_ROOT / ".env.local"),
}


def _env(name: str, default: str = "") -> str:
    return os.getenv(name) or _LOCAL_ENV.get(name, default)


def _float_env(name: str, default: float) -> float:
    try:
        return float(_env(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    a2a_url: str = _env("A2UI_A2A_URL", "http://localhost:3000/api/a2a")
    a2a_token: str = _env("A2UI_A2A_TOKEN")
    next_api_base_url: str = _env("A2UI_NEXT_API_BASE_URL", "http://localhost:3000")
    request_timeout_seconds: float = _float_env("A2UI_AGENT_TIMEOUT_SECONDS", 6)
    openai_api_key: str = _env("OPENAI_API_KEY")
    openai_model: str = _env("OPENAI_MODEL", "gpt-4.1-mini")
    openai_base_url: str = _env("OPENAI_BASE_URL", "https://api.openai.com/v1")


settings = Settings()
