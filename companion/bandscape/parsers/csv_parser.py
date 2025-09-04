import csv
import io
from typing import Any, Dict, List


def parse_csv(path: str) -> Dict[str, Any]:
    rows: List[dict] = []
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(dict(r))
    # Pretty print for preview
    buf = io.StringIO()
    if rows:
        headers = list(rows[0].keys())
        buf.write(", ".join(headers) + "\n")
        for r in rows[:50]:  # cap preview
            buf.write(", ".join(str(r.get(h, "")) for h in headers) + "\n")
    return {"kind": "csv", "rows": rows, "text": buf.getvalue()}
