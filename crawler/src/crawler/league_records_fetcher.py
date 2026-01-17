"""Fetcher for league-wide batter and pitcher records."""
from __future__ import annotations

import logging
from typing import Any

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
    try:
        data = parse_html_json(response.text, "")
        payload = {"data": data, "raw_html": None, "parse_error": None}
    except ValueError as exc:
        payload = {"data": None, "raw_html": response.text, "parse_error": str(exc)}
    logger.info("league_record_fetched path=%s status=%s", path, response.status_code)
    return payload
