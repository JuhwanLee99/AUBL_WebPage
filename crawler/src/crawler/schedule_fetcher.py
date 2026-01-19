"""Schedule fetcher for collecting game indexes."""
from __future__ import annotations

import html
import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Iterable

from crawler.api_client import ApiClient
from crawler.html_parser import parse_html_json
from crawler.settings import Settings, iter_group_codes
from crawler.web_client import WebClient

logger = logging.getLogger(__name__)

FINAL_STATUSES = {"final", "finalized", "finished", "f"}
SCHEDULE_CONTENT_PATH = "/league/schedule/content/all"
IFRAME_SRC_PATTERN = re.compile(
    r"<iframe[^>]+src=[\"'](?P<src>/league/schedule/content/all[^\"']*)[\"']",
    re.IGNORECASE,
)
GAME_IDX_PATTERN = re.compile(r"game_idx=(\d+)", re.IGNORECASE)


@dataclass(frozen=True)
class GameSummary:
    game_idx: int
    status: str
    group_code: str | None


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

def _extract_game_ids_from_html(html_text: str) -> list[int]:
    seen: set[int] = set()
    game_ids: list[int] = []
    for match in GAME_IDX_PATTERN.finditer(html_text):
        game_idx = int(match.group(1))
        if game_idx in seen:
            continue
        seen.add(game_idx)
        game_ids.append(game_idx)
    return game_ids


def _fetch_schedule_content_html(
    client: WebClient,
    settings: Settings,
    year: int,
    group_code: str | None,
    schedule_page_html: str,
) -> str:
    iframe_src = IFRAME_SRC_PATTERN.search(schedule_page_html)
    path = iframe_src.group("src") if iframe_src else SCHEDULE_CONTENT_PATH
    params = {
        "lig_idx": settings.lig_idx,
        "year": year,
        "season": year,
        "month": "all",
        "group_code": group_code or 0,
        "part_code": 0,
        "club_idx": 0,
        "outside": "",
    }
    return client.request("GET", path, params=params).text


def fetch_schedule_games(
    client: ApiClient | WebClient,
    settings: Settings,
    year: int,
    data_source: str = "api",
) -> list[GameSummary]:
    games: list[GameSummary] = []
    for group_code in iter_group_codes(settings.group_codes):
        params = {"lig_idx": settings.lig_idx, "year": year}
        if group_code:
            params["group_code"] = group_code
        if data_source == "web":
            response = client.request("GET", settings.schedule_page_path, params=params)
            try:
                payload = parse_html_json(response.text, settings.html_json_script_id)
            except (ValueError, json.JSONDecodeError):
                schedule_html = _fetch_schedule_content_html(
                    client,
                    settings,
                    year,
                    group_code,
                    response.text,
                )
                game_ids = _extract_game_ids_from_html(schedule_html)
                for game_idx in game_ids:
                    games.append(
                        GameSummary(
                            game_idx=game_idx,
                            status="final",
                            group_code=group_code,
                        )
                    )
                logger.info(
                    json.dumps(
                        {
                            "event": "schedule_fetched",
                            "year": year,
                            "group_code": group_code,
                            "games_found": len(game_ids),
                            "source": "schedule_html",
                        },
                        sort_keys=True,
                    )
                )
                continue
        else:
            response = client.request("GET", settings.schedule_endpoint, params=params)
            payload = response.json()
        group_games = 0
        for item in _extract_games(payload):
            game_idx = item.get("game_idx") or item.get("gameIdx")
            status = item.get("status") or item.get("game_status") or ""
            if not game_idx or not status:
                continue
            if _is_final_status(str(status)):
                games.append(
                    GameSummary(
                        game_idx=int(game_idx),
                        status=str(status),
                        group_code=group_code,
                    )
                )
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
