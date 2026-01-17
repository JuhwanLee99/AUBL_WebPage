"""Boxscore fetcher for completed games."""
from __future__ import annotations

import json
import logging
from typing import Any, Iterable

from crawler.api_client import ApiClient
from crawler.html_parser import parse_html_json
from crawler.schedule_fetcher import GameSummary
from crawler.settings import Settings
from crawler.web_client import WebClient

logger = logging.getLogger(__name__)


def fetch_boxscore(
    client: ApiClient | WebClient,
    settings: Settings,
    game_idx: int,
    data_source: str = "api",
) -> dict[str, Any]:
    if data_source == "web":
        response = client.request(
            "GET",
            settings.boxscore_page_path,
            params={"game_idx": game_idx},
        )
        payload = parse_html_json(response.text, settings.html_json_script_id)
    else:
        response = client.request(
            "GET",
            settings.boxscore_endpoint,
            params={"game_idx": game_idx},
        )
        payload = response.json()
    logger.info(
        json.dumps(
            {
                "event": "boxscore_fetched",
                "game_idx": game_idx,
                "status_code": response.status_code,
            },
            sort_keys=True,
        )
    )
    return payload


def fetch_boxscores(
    client: ApiClient | WebClient,
    settings: Settings,
    games: Iterable[GameSummary],
    data_source: str = "api",
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for game in games:
        results.append(fetch_boxscore(client, settings, game.game_idx, data_source))
    return results
