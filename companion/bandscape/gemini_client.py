import os
from typing import Any, Dict, List

try:
    import google.generativeai as genai  # type: ignore
except Exception:  # pragma: no cover
    genai = None  # gracefully handle missing package


class GeminiClient:
    def __init__(self, model: str = "gemini-1.5-pro") -> None:
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.model_name = model
        self._client = None
        if self.api_key and genai is not None:
            genai.configure(api_key=self.api_key)
            self._client = genai.GenerativeModel(self.model_name)

    @property
    def enabled(self) -> bool:
        return self._client is not None

    def extract_nodes_from_text(self, content: str, schema_hint: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Use Gemini to turn raw text into a list of node objects matching BandScape schema.
        If Gemini isn't configured, return an empty list; caller can fallback to heuristic.
        """
        if not self.enabled:
            return []

        system_prompt = (
            "You convert raw research text into JSON objects that match an existing schema. "
            "Schema fields (examples): " + ", ".join(sorted(schema_hint.keys())) + ". "
            "Return ONLY a JSON array of node objects. Fill only facts present in the text."
        )

        # Guardrail prompt
        user_content = (
            "Raw content to extract from:\n\n" + content + "\n\n" 
            "Remember: Return strictly JSON array, no markdown fences."
        )

        resp = self._client.generate_content([system_prompt, user_content])  # type: ignore[attr-defined]
        text = getattr(resp, "text", "") or ""
        # Attempt to parse a JSON array from the response
        import json
        try:
            data = json.loads(text)
            if isinstance(data, list):
                return [d for d in data if isinstance(d, dict)]
        except Exception:
            pass
        return []
