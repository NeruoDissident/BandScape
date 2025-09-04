import json
from typing import Any, Dict


def parse_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {
        "kind": "json",
        "text": json.dumps(data, ensure_ascii=False, indent=2),
        "data": data,
    }
