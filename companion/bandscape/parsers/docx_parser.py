from typing import Any, Dict

try:
    from docx import Document  # type: ignore
except Exception:  # pragma: no cover
    Document = None


def parse_docx(path: str) -> Dict[str, Any]:
    if Document is None:
        return {"kind": "error", "error": "python-docx not installed"}
    doc = Document(path)
    text = "\n".join(p.text for p in doc.paragraphs)
    return {"kind": "docx", "text": text}
