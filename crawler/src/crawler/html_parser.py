"""Helpers for extracting JSON payloads from HTML pages."""
from __future__ import annotations

import html
import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

SCRIPT_ID_TEMPLATE = r"<script[^>]*id=[\"']{script_id}[\"'][^>]*>(?P<json>.*?)</script>"
JSON_OBJECT_OR_ARRAY = r"(?:\{.*?\}|\[.*?\])"
WINDOW_ASSIGNMENTS = (
    rf"window\.__INITIAL_STATE__\s*=\s*(?P<json>{JSON_OBJECT_OR_ARRAY})\s*;",
    rf"window\.__NEXT_DATA__\s*=\s*(?P<json>{JSON_OBJECT_OR_ARRAY})\s*;",
    rf"window\.__PRELOADED_STATE__\s*=\s*(?P<json>{JSON_OBJECT_OR_ARRAY})\s*;",
    rf"window\.__NUXT__\s*=\s*(?P<json>{JSON_OBJECT_OR_ARRAY})\s*;",
)
GENERIC_SCRIPT = r"<script[^>]*type=[\"']application/json[\"'][^>]*>(?P<json>.*?)</script>"
JSON_PARSE = r"JSON\.parse\(\s*(?P<quote>[\"'])(?P<json>.*?)(?P=quote)\s*\)"
DATA_JSON_ATTRIBUTE = r"data-json=[\"'](?P<json>.*?)[\"']"
SCRIPT_ASSIGNMENT = rf"(?:var|let|const)\s+[A-Za-z0-9_$]+\s*=\s*(?P<json>{JSON_OBJECT_OR_ARRAY})\s*;"


def parse_html_json(html_text: str, script_id: str = "") -> Any:
    if script_id:
        pattern = SCRIPT_ID_TEMPLATE.format(script_id=re.escape(script_id))
        match = re.search(pattern, html_text, re.DOTALL | re.IGNORECASE)
        if match:
            return _loads_json(match.group("json"))
        logger.warning("html_json_script_id_not_found id=%s", script_id)

    for pattern in WINDOW_ASSIGNMENTS:
        match = re.search(pattern, html_text, re.DOTALL | re.IGNORECASE)
        if match:
            return _loads_json(match.group("json"))

    match = re.search(GENERIC_SCRIPT, html_text, re.DOTALL | re.IGNORECASE)
    if match:
        return _loads_json(match.group("json"))

    for match in re.finditer(JSON_PARSE, html_text, re.DOTALL | re.IGNORECASE):
        parsed = _loads_json_parse(match.group("json"), match.group("quote"))
        if parsed is not None:
            return parsed

    for match in re.finditer(DATA_JSON_ATTRIBUTE, html_text, re.DOTALL | re.IGNORECASE):
        parsed = _loads_json(match.group("json"), strict=False)
        if parsed is not None:
            return parsed

    for match in re.finditer(SCRIPT_ASSIGNMENT, html_text, re.DOTALL | re.IGNORECASE):
        parsed = _loads_json(match.group("json"), strict=False)
        if parsed is not None:
            return parsed

    raise ValueError("Unable to locate JSON payload in HTML response.")


def _loads_json(raw: str, *, strict: bool = True) -> Any | None:
    payload = html.unescape(raw).strip()
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        if strict:
            raise
    return None


def _loads_json_parse(raw: str, quote: str) -> Any | None:
    encoded = f"{quote}{raw}{quote}"
    try:
        decoded = json.loads(encoded) if quote == '"' else _loads_single_quoted_string(encoded)
    except (json.JSONDecodeError, ValueError):
        return None
    return _loads_json(decoded, strict=False)


def _loads_single_quoted_string(raw: str) -> str:
    if not (raw.startswith("'") and raw.endswith("'")):
        raise ValueError("Expected single-quoted string.")
    body = raw[1:-1]
    body = body.replace("\\'", "'").replace('\\"', '"')
    return bytes(body, "utf-8").decode("unicode_escape")
