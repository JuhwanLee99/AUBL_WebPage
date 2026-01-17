"""Boxscore fetcher for completed games."""
from __future__ import annotations

import html
import json
import logging
import re
from typing import Any, Iterable

from crawler.api_client import ApiClient
from crawler.html_parser import parse_html_json
from crawler.schedule_fetcher import GameSummary
from crawler.settings import Settings
from crawler.web_client import WebClient

logger = logging.getLogger(__name__)
BOX_SCORE_CONTENT_PATH = "/league/schedule/content/boxscore"
TEAM_BLOCK_PATTERN = re.compile(
    r"<dl class=\"team (?P<side>left|right)\">(?P<content>.*?)</dl>",
    re.DOTALL | re.IGNORECASE,
)
TEAM_NAME_PATTERN = re.compile(r"<dt>\s*<a[^>]*>(?P<name>.*?)</a>\s*</dt>", re.DOTALL)
TEAM_SCORE_PATTERN = re.compile(r"<dd class=\"score\">\s*(?P<score>\d+)\s*</dd>")
TEAM_IDX_PATTERN = re.compile(r"club_idx=(?P<club_idx>\d+)")
TEAM_RESULT_PATTERN = re.compile(
    r"<dd class=\"result\">\s*<span class=\"[^\"]*\">(?P<result>.*?)</span>",
    re.DOTALL,
)


def fetch_boxscore(
    client: ApiClient | WebClient,
    settings: Settings,
    game_idx: int,
    data_source: str = "api",
) -> dict[str, Any]:
    if data_source == "web":
        params = {
            "lig_idx": settings.lig_idx,
            "game_idx": game_idx,
            "group_code": 0,
            "outside": "",
        }
        response = client.request(
            "GET",
            _resolve_boxscore_path(settings.boxscore_page_path),
            params=params,
        )
        try:
            payload = parse_html_json(response.text, settings.html_json_script_id)
        except (ValueError, json.JSONDecodeError):
            payload = _parse_boxscore_html(response.text)
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


def _resolve_boxscore_path(path: str) -> str:
    if not path or path == "/game/boxscore":
        return BOX_SCORE_CONTENT_PATH
    return path


def _parse_boxscore_html(html_text: str) -> dict[str, Any]:
    teams: dict[str, dict[str, Any]] = {}
    results: dict[str, str] = {}
    for match in TEAM_BLOCK_PATTERN.finditer(html_text):
        side = match.group("side").lower()
        content = match.group("content")
        club_idx = _extract_int(TEAM_IDX_PATTERN, content)
        name = _extract_text(TEAM_NAME_PATTERN, content)
        score = _extract_int(TEAM_SCORE_PATTERN, content)
        result = _extract_text(TEAM_RESULT_PATTERN, content)
        team_payload: dict[str, Any] = {"team_idx": club_idx, "name": name, "r": score}
        teams[side] = team_payload
        if result:
            results[side] = result
    home_team = teams.get("right")
    away_team = teams.get("left")
    payload: dict[str, Any] = {
        "status": "final" if _has_scores(home_team, away_team) else "scheduled",
        "home": home_team,
        "away": away_team,
    }
    winner = _resolve_result_winner(results)
    if winner:
        payload["winner"] = winner
    return payload


def _extract_text(pattern: re.Pattern[str], text: str) -> str | None:
    match = pattern.search(text)
    if not match:
        return None
    raw = match.group(match.lastgroup or 0)
    cleaned = re.sub(r"<[^>]+>", "", raw)
    cleaned = html.unescape(cleaned).strip()
    return cleaned or None


def _extract_int(pattern: re.Pattern[str], text: str) -> int | None:
    match = pattern.search(text)
    if not match:
        return None
    try:
        return int(match.group(match.lastgroup or 0))
    except (TypeError, ValueError):
        return None


def _has_scores(home_team: dict[str, Any] | None, away_team: dict[str, Any] | None) -> bool:
    if not home_team or not away_team:
        return False
    return isinstance(home_team.get("r"), int) and isinstance(away_team.get("r"), int)


def _resolve_result_winner(results: dict[str, str]) -> str | None:
    for side, result in results.items():
        if "승" in result:
            return "home" if side == "right" else "away"
        if "패" in result:
            continue
    return None


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
