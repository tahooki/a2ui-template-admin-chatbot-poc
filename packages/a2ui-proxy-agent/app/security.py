import re


SENSITIVE_KEY_RE = re.compile(
    r"(secret|token|password|authorization|cookie|phone|email|api[_-]?key)",
    re.IGNORECASE,
)


def is_sensitive_key(value: object) -> bool:
    return bool(SENSITIVE_KEY_RE.search(str(value)))
