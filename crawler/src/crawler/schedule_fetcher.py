"""Schedule fetcher for collecting game indexes."""
from __future__ import annotations

import html
import json
import logging
import re
from collections import deque
from dataclasses import dataclass
from typing import Any, Iterable
from urllib.parse import parse_qs, urlsplit

from crawler.api_client import ApiClient
from crawler.html_parser import parse_html_json
from crawler.settings import Settings, iter_group_codes
from crawler.web_client import WebClient

logger = logging.getLogger(__name__)

FINAL_STATUSES = {
    "final",
    "finalized",
    "finished",
    "f",
    "complete",
    "completed",
    "경기종료",
    "종료",
    "완료",
}
SCHEDULE_CONTENT_PATH = "/league/schedule/content/all"
IFRAME_SRC_PATTERN = re.compile(
    r"<iframe[^>]+src=[\"'](?P<src>/league/schedule/content/all[^\"']*)[\"']",
    re.IGNORECASE,
)
GAME_IDX_PATTERN = re.compile(r"game_idx=(\d+)", re.IGNORECASE)
PAGE_PATTERN = re.compile(r"(?:\?|&)page=(\d+)", re.IGNORECASE)
CONTENT_URL_PATTERN = re.compile(
    r"(?:https?://[^\"'\s<>]+)?(?P<url>/league/schedule/content/(?:result|playoff)\?[^\"'\s<>]+)",
    re.IGNORECASE,
)
GROUP_CODE_TOKEN_PATTERN = re.compile(r"group_code\s*[:=]\s*[\"']?(?P<code>[a-zA-Z0-9_-]+)", re.IGNORECASE)
PART_CODE_TOKEN_PATTERN = re.compile(r"part_code\s*[:=]\s*[\"']?(?P<code>[a-zA-Z0-9_-]+)", re.IGNORECASE)


@dataclass(frozen=True)
class GameSummary:
    game_idx: int
    status: str
    group_code: str | None
    phase: str | None = None


@dataclass(frozen=True)
class _PageState:
    group_code: str
    part_code: str
    page: int


def _normalize_code(value: Any, default: str = "0") -> str:
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


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


def _normalize_status(status: str) -> str:
    return re.sub(r"\s+", "", status).strip().lower()


def _is_final_status(status: str) -> bool:
    normalized = _normalize_status(status)
    if normalized in FINAL_STATUSES:
        return True
    return "final" in normalized or "종료" in normalized or "완료" in normalized


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


def _extract_page_numbers(html_text: str, max_page: int) -> set[int]:
    pages: set[int] = set()
    for match in PAGE_PATTERN.finditer(html_text):
        page = int(match.group(1))
        if 1 <= page <= max_page:
            pages.add(page)
    return pages


def _extract_status_by_game(payload: Any) -> dict[int, str]:
    status_by_game: dict[int, str] = {}
    for item in _extract_games(payload):
        raw_game_idx = item.get("game_idx") or item.get("gameIdx")
        if raw_game_idx is None:
            continue
        try:
            game_idx = int(raw_game_idx)
        except (TypeError, ValueError):
            continue
        status = item.get("status") or item.get("game_status") or "final"
        status_by_game[game_idx] = str(status)
    return status_by_game


def _discover_states_from_html(
    html_text: str,
    content_path: str,
    current_state: _PageState,
    max_page: int,
    group_filter: set[str] | None,
) -> set[_PageState]:
    discovered: set[_PageState] = set()
    target_path = content_path.lower()

    for match in CONTENT_URL_PATTERN.finditer(html_text):
        raw_url = html.unescape(match.group("url"))
        parsed = urlsplit(raw_url)
        if parsed.path.lower() != target_path:
            continue
        query = parse_qs(parsed.query)
        group_code = _normalize_code(query.get("group_code", [current_state.group_code])[-1])
        if group_filter is not None and group_code not in group_filter:
            continue
        part_code = _normalize_code(query.get("part_code", [current_state.part_code])[-1])
        page = int(query.get("page", [current_state.page])[-1]) if str(query.get("page", [current_state.page])[-1]).isdigit() else current_state.page
        if 1 <= page <= max_page:
            discovered.add(_PageState(group_code=group_code, part_code=part_code, page=page))

    page_numbers = _extract_page_numbers(html_text, max_page)
    for page in page_numbers:
        discovered.add(
            _PageState(
                group_code=current_state.group_code,
                part_code=current_state.part_code,
                page=page,
            )
        )

    group_tokens = {
        _normalize_code(m.group("code"))
        for m in GROUP_CODE_TOKEN_PATTERN.finditer(html_text)
    }
    if group_filter is not None:
        group_tokens = {code for code in group_tokens if code in group_filter}
    part_tokens = {
        _normalize_code(m.group("code"))
        for m in PART_CODE_TOKEN_PATTERN.finditer(html_text)
    }

    for code in group_tokens:
        discovered.add(_PageState(group_code=code, part_code=current_state.part_code, page=1))
    for code in part_tokens:
        discovered.add(_PageState(group_code=current_state.group_code, part_code=code, page=1))

    return discovered


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
        "group_code": group_code or "0",
        "part_code": "0",
        "club_idx": "0",
        "outside": "",
    }
    return client.request("GET", path, params=params).text


def _fetch_games_from_paginated_content(
    client: WebClient,
    settings: Settings,
    year: int,
    content_path: str,
    source: str,
    seed_groups: tuple[str, ...],
) -> list[GameSummary]:
    max_page = settings.schedule_page_limit
    group_filter: set[str] | None = set(seed_groups) if seed_groups else None

    queue: deque[_PageState] = deque()
    if seed_groups:
        for group_code in seed_groups:
            queue.append(_PageState(group_code=_normalize_code(group_code), part_code="0", page=1))
    else:
        queue.append(_PageState(group_code="0", part_code="0", page=1))

    seen_states: set[_PageState] = set()
    seen_games: set[int] = set()
    games: list[GameSummary] = []

    while queue:
        state = queue.popleft()
        if state in seen_states:
            continue
        if state.page < 1 or state.page > max_page:
            continue
        seen_states.add(state)

        params = {
            "lig_idx": settings.lig_idx,
            "group_code": state.group_code,
            "part_code": state.part_code,
            "club_idx": "0",
            "season": year,
            "page": state.page,
        }
        response = client.request("GET", content_path, params=params)
        html_text = response.text

        status_by_game: dict[int, str] = {}
        try:
            payload = parse_html_json(html_text, settings.html_json_script_id)
            status_by_game = _extract_status_by_game(payload)
        except (ValueError, json.JSONDecodeError):
            status_by_game = {}

        game_ids = _extract_game_ids_from_html(html_text)
        if not game_ids and status_by_game:
            game_ids = list(status_by_game.keys())

        added = 0
        for game_idx in game_ids:
            if game_idx in seen_games:
                continue
            status = status_by_game.get(game_idx, "final")
            if not _is_final_status(status):
                continue
            seen_games.add(game_idx)
            games.append(
                GameSummary(
                    game_idx=game_idx,
                    status=status,
                    group_code=state.group_code,
                    phase=source,
                )
            )
            added += 1

        for discovered in _discover_states_from_html(
            html_text,
            content_path,
            state,
            max_page,
            group_filter,
        ):
            if discovered not in seen_states:
                queue.append(discovered)

        # If pagination controls are not exposed, walk forward while games exist.
        if game_ids and state.page < max_page:
            next_state = _PageState(
                group_code=state.group_code,
                part_code=state.part_code,
                page=state.page + 1,
            )
            if next_state not in seen_states:
                queue.append(next_state)

        logger.info(
            json.dumps(
                {
                    "event": "schedule_page_fetched",
                    "year": year,
                    "source": source,
                    "path": content_path,
                    "group_code": state.group_code,
                    "part_code": state.part_code,
                    "page": state.page,
                    "games_found": len(game_ids),
                    "games_added": added,
                    "queue_size": len(queue),
                },
                sort_keys=True,
            )
        )

    return games


def _dedupe_games(games: list[GameSummary]) -> list[GameSummary]:
    deduped: dict[int, GameSummary] = {}
    for game in games:
        existing = deduped.get(game.game_idx)
        if existing is None:
            deduped[game.game_idx] = game
            continue
        existing_final = _is_final_status(existing.status)
        incoming_final = _is_final_status(game.status)
        if incoming_final and not existing_final:
            deduped[game.game_idx] = game
    return list(deduped.values())


def fetch_schedule_games(
    client: ApiClient | WebClient,
    settings: Settings,
    year: int,
    data_source: str = "api",
) -> list[GameSummary]:
    games: list[GameSummary] = []

    if data_source == "web":
        seed_groups = tuple(_normalize_code(code) for code in settings.group_codes)
        paged_games = _dedupe_games(
            _fetch_games_from_paginated_content(
                client,
                settings,
                year,
                settings.schedule_result_page_path,
                "result",
                seed_groups,
            )
            + _fetch_games_from_paginated_content(
                client,
                settings,
                year,
                settings.schedule_playoff_page_path,
                "playoff",
                seed_groups,
            )
        )
        if paged_games:
            logger.info(
                json.dumps(
                    {
                        "event": "schedule_fetched",
                        "year": year,
                        "games_found": len(paged_games),
                        "source": "result_playoff_pages",
                    },
                    sort_keys=True,
                )
            )
            return paged_games

        # Legacy fallback if direct result/playoff parsing fails.
        for group_code in iter_group_codes(settings.group_codes):
            params = {"lig_idx": settings.lig_idx, "year": year}
            if group_code:
                params["group_code"] = group_code
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
                            phase=None,
                        )
                    )
                continue

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
                            phase=None,
                        )
                    )
        return _dedupe_games(games)

    # API mode
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
                games.append(
                    GameSummary(
                        game_idx=int(game_idx),
                        status=str(status),
                        group_code=group_code,
                        phase=None,
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
                    "source": "api",
                },
                sort_keys=True,
            )
        )
    return _dedupe_games(games)
