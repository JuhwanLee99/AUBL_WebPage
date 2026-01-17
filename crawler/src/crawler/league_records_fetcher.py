"""Fetcher for league-wide batter and pitcher records."""
from __future__ import annotations

import html
import logging
import re
from typing import Any
from urllib.parse import parse_qs, urlsplit

from crawler.html_parser import parse_html_json
from crawler.settings import Settings
from crawler.web_client import WebClient

logger = logging.getLogger(__name__)


def fetch_league_records(
    client: WebClient,
    settings: Settings,
    year: int | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    params: dict[str, Any] = {"lig_idx": settings.lig_idx}
    if year is not None:
        params["season"] = year
        params["year"] = year
    batting = _fetch_record_page(client, settings.batter_rank_page_path, params)
    pitching = _fetch_record_page(client, settings.pitcher_rank_page_path, params)
    return batting, pitching


def _fetch_record_page(
    client: WebClient,
    path: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    response = client.request("GET", path, params=params)
    html_text = response.text
    content_path = _find_record_content_path(html_text) or path
    content_path, content_params = _split_path_and_params(content_path, params)
    content_response = client.request("GET", content_path, params=content_params)
    try:
        data = parse_html_json(content_response.text, "")
        payload = {"data": data, "raw_html": None, "parse_error": None}
    except ValueError as exc:
        payload = {"data": None, "raw_html": content_response.text, "parse_error": str(exc)}
    logger.info("league_record_fetched path=%s status=%s", path, content_response.status_code)
    return payload


def _find_record_content_path(html_text: str) -> str | None:
    match = re.search(r"<iframe[^>]+src=[\"'](?P<src>/league/record/content/[^\"']+)[\"']",
                      html_text, re.IGNORECASE)
    if not match:
        return None
    return html.unescape(match.group("src"))


def _split_path_and_params(path: str, params: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    parsed = urlsplit(path)
    query = parse_qs(parsed.query)
    merged = {**params}
    for key, values in query.items():
        if values:
            merged[key] = values[-1]
    return parsed.path or path, merged
