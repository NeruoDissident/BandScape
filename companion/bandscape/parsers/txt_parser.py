from typing import Any, Dict


def parse_txt(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return {"kind": "text", "text": f.read()}
