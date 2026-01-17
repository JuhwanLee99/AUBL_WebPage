"""Helpers for extracting JSON payloads from HTML pages."""
from __future__ import annotations

import html
import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

SCRIPT_ID_TEMPLATE = r"<script[^>]*id=[\"']{script_id}[\"'][^>]*>(?P<json>.*?)</script>"
WINDOW_ASSIGNMENTS = (
    r"window\.__INITIAL_STATE__\s*=\s*(?P<json>\{.*?\})\s*;",
    r"window\.__NEXT_DATA__\s*=\s*(?P<json>\{.*?\})\s*;",
    r"window\.__PRELOADED_STATE__\s*=\s*(?P<json>\{.*?\})\s*;",
)
GENERIC_SCRIPT = r"<script[^>]*type=[\"']application/json[\"'][^>]*>(?P<json>.*?)</script>"


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

    raise ValueError("Unable to locate JSON payload in HTML response.")


def _loads_json(raw: str) -> Any:
    payload = html.unescape(raw).strip()
    return json.loads(payload)
