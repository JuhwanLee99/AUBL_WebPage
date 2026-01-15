"""Schedule fetcher for collecting game indexes."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Iterable

from crawler.api_client import ApiClient
from crawler.settings import Settings, iter_group_codes

logger = logging.getLogger(__name__)

FINAL_STATUSES = {"final", "finalized", "finished", "f"}


@dataclass(frozen=True)
class GameSummary:
    game_idx: int
    status: str


def _extract_games(payload: Any) -> Iterable[dict[str, Any]]:
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                yield item
        return
    if isinstance(payload, dict):
        for key in ("games", "list", "data", "result"):
            value = payload.get(key)
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        yield item
                return
        for value in payload.values():
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        yield item
                return


def _is_final_status(status: str) -> bool:
    return status.lower() in FINAL_STATUSES


def fetch_schedule_games(client: ApiClient, settings: Settings, year: int) -> list[GameSummary]:
    games: list[GameSummary] = []
    for group_code in iter_group_codes(settings.group_codes):
        params = {"lig_idx": settings.lig_idx, "year": year}
        if group_code:
            params["group_code"] = group_code
        response = client.request("GET", settings.schedule_endpoint, params=params)
        payload = response.json()
        group_games = 0
        for item in _extract_games(payload):
            game_idx = item.get("game_idx") or item.get("gameIdx")
            status = item.get("status") or item.get("game_status") or ""
            if not game_idx or not status:
                continue
            if _is_final_status(str(status)):
                games.append(GameSummary(game_idx=int(game_idx), status=str(status)))
                group_games += 1
        logger.info(
            json.dumps(
                {
                    "event": "schedule_fetched",
                    "year": year,
                    "group_code": group_code,
                    "games_found": group_games,
                },
                sort_keys=True,
            )
        )
    return games
