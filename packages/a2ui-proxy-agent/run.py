"""Standalone bootstrap and server runner for the A2UI Proxy Agent."""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import sys


PACKAGE_ROOT = Path(__file__).resolve().parent
REQUIREMENTS_PATH = PACKAGE_ROOT / "requirements.txt"
VENV_PATH = PACKAGE_ROOT / ".venv"
REQUIREMENTS_MARKER = VENV_PATH / ".requirements.sha256"
TRUE_VALUES = {"1", "true", "yes", "on"}


def read_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def load_local_env() -> None:
    values = {
        **read_env_file(Path.cwd() / ".env.local"),
        **read_env_file(PACKAGE_ROOT / ".env.local"),
    }
    for key, value in values.items():
        os.environ.setdefault(key, value)


def env_flag(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    return default if raw_value is None else raw_value.strip().lower() in TRUE_VALUES


def port_value(raw_value: str) -> int:
    try:
        port = int(raw_value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("port must be an integer") from exc
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be between 1 and 65535")
    return port


def venv_python(venv_path: Path = VENV_PATH) -> Path:
    if os.name == "nt":
        return venv_path / "Scripts" / "python.exe"
    return venv_path / "bin" / "python"


def requirements_digest() -> str:
    return hashlib.sha256(REQUIREMENTS_PATH.read_bytes()).hexdigest()


def ensure_runtime(*, install_dependencies: bool = True) -> Path:
    python_path = venv_python()
    if not python_path.exists():
        print(f"[a2ui-proxy-agent] creating virtualenv: {VENV_PATH}", flush=True)
        subprocess.run([sys.executable, "-m", "venv", str(VENV_PATH)], check=True)

    if install_dependencies:
        expected_digest = requirements_digest()
        installed_digest = REQUIREMENTS_MARKER.read_text(encoding="utf-8").strip() if REQUIREMENTS_MARKER.exists() else ""
        if installed_digest != expected_digest:
            print("[a2ui-proxy-agent] installing Python requirements", flush=True)
            subprocess.run(
                [str(python_path), "-m", "pip", "install", "-r", str(REQUIREMENTS_PATH)],
                check=True,
            )
            REQUIREMENTS_MARKER.write_text(expected_digest, encoding="utf-8")
    return python_path


def uvicorn_command(
    python_path: Path,
    *,
    host: str,
    port: int,
    reload: bool,
) -> list[str]:
    command = [
        str(python_path),
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        host,
        "--port",
        str(port),
        "--app-dir",
        str(PACKAGE_ROOT),
    ]
    if reload:
        command.extend(["--reload", "--reload-dir", str(PACKAGE_ROOT)])
    return command


def parse_args() -> argparse.Namespace:
    default_port = os.getenv("A2UI_PROXY_PORT") or os.getenv("PORT") or "8200"
    parser = argparse.ArgumentParser(description="Prepare and run the standalone A2UI Proxy Agent")
    parser.add_argument("--host", default=os.getenv("A2UI_PROXY_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=port_value, default=port_value(default_port))
    parser.add_argument("--reload", action="store_true", default=env_flag("A2UI_PROXY_RELOAD"))
    parser.add_argument("--no-install", action="store_true", help="skip automatic requirements installation")
    parser.add_argument("--install-only", action="store_true", help="prepare the virtualenv and exit")
    return parser.parse_args()


def main() -> None:
    if sys.version_info < (3, 10):
        raise SystemExit("A2UI Proxy Agent requires Python 3.10 or newer.")

    load_local_env()
    args = parse_args()
    python_path = ensure_runtime(install_dependencies=not args.no_install)
    if args.install_only:
        print("[a2ui-proxy-agent] standalone runtime is ready", flush=True)
        return

    command = uvicorn_command(
        python_path,
        host=args.host,
        port=args.port,
        reload=args.reload,
    )
    environment = os.environ.copy()
    environment["PYTHONPATH"] = os.pathsep.join(
        [str(PACKAGE_ROOT), environment.get("PYTHONPATH", "")]
    ).rstrip(os.pathsep)
    os.chdir(PACKAGE_ROOT)
    os.execve(str(python_path), command, environment)


if __name__ == "__main__":
    main()
