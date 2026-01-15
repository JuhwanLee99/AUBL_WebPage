"""Boxscore fetcher for completed games."""
from __future__ import annotations

import json
import logging
from typing import Any, Iterable

from crawler.api_client import ApiClient
from crawler.schedule_fetcher import GameSummary
from crawler.settings import Settings

logger = logging.getLogger(__name__)


def fetch_boxscore(
    client: ApiClient,
    settings: Settings,
    game_idx: int,
) -> dict[str, Any]:
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
    client: ApiClient,
    settings: Settings,
    games: Iterable[GameSummary],
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for game in games:
        results.append(fetch_boxscore(client, settings, game.game_idx))
    return results
