"""Fetch and parse league related pages in web scraping mode."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from crawler.html_parser import parse_html_json
from crawler.settings import Settings
from crawler.web_client import WebClient

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class WebPageResult:
    page_key: str
    url: str
    year: int | None
    params: dict[str, Any]
    payload: dict[str, Any]


def _extract_payload(response_text: str, script_id: str) -> dict[str, Any]:
    try:
        data = parse_html_json(response_text, script_id)
        return {"data": data, "raw_html": None, "parse_error": None}
    except ValueError as exc:
        return {"data": None, "raw_html": response_text, "parse_error": str(exc)}


def fetch_web_pages(
    client: WebClient,
    settings: Settings,
    year: int | None = None,
) -> list[WebPageResult]:
    pages = [
        ("league_overview", settings.league_page_path),
        ("schedule_all", settings.schedule_all_page_path),
        ("team_rank", settings.team_rank_page_path),
        ("team_offense", settings.team_offense_page_path),
        ("team_defense", settings.team_defense_page_path),
        ("batter_rank", settings.batter_rank_page_path),
        ("pitcher_rank", settings.pitcher_rank_page_path),
        ("roster", settings.roster_page_path),
    ]
    results: list[WebPageResult] = []
    for page_key, path in pages:
        params: dict[str, Any] = {"lig_idx": settings.lig_idx}
        if year is not None and page_key == "schedule_all":
            params["year"] = year
        response = client.request("GET", path, params=params)
        payload = _extract_payload(response.text, settings.html_json_script_id)
        results.append(
            WebPageResult(
                page_key=page_key,
                url=str(client.base_url.join(path)),
                year=year,
                params=params,
                payload=payload,
            )
        )
        logger.info(
            json.dumps(
                {
                    "event": "web_page_fetched",
                    "page_key": page_key,
                    "status_code": response.status_code,
                },
                sort_keys=True,
            )
        )
    return results
