import os
import json
from typing import Any, Dict
from .txt_parser import parse_txt
from .json_parser import parse_json
from .csv_parser import parse_csv
from .docx_parser import parse_docx


def parse_any(path: str) -> Dict[str, Any]:
    ext = os.path.splitext(path)[1].lower()
    if ext in (".txt", ".md"):
        return parse_txt(path)
    if ext in (".json",):
        return parse_json(path)
    if ext in (".csv",):
        return parse_csv(path)
    if ext in (".docx",):
        return parse_docx(path)
    # Fallback: try read as text
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return {"kind": "text", "text": f.read()}
    except Exception as e:
        return {"kind": "unknown", "error": str(e)}
