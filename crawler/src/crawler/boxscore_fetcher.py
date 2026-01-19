"""Boxscore fetcher for completed games."""
from __future__ import annotations

import html
import json
import logging
import re
from typing import Any, Iterable, Sequence

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
TEAM_LINK_PATTERN = re.compile(
    r"<dt>\s*<a[^>]*href=[\"'][^\"']*club_idx=(?P<club_idx>\d+)[^\"']*[\"'][^>]*>(?P<name>.*?)</a>\s*</dt>",
    re.DOTALL | re.IGNORECASE,
)
TEAM_NAME_PATTERN = re.compile(r"<dt>\s*<a[^>]*>(?P<name>.*?)</a>\s*</dt>", re.DOTALL)
TEAM_SCORE_PATTERN = re.compile(r"<dd class=\"score\">\s*(?P<score>\d+)\s*</dd>")
TEAM_IDX_PATTERN = re.compile(r"club_idx=(?P<club_idx>\d+)")
TEAM_RESULT_PATTERN = re.compile(
    r"<dd class=\"result\">\s*<span class=\"[^\"]*\">(?P<result>.*?)</span>",
    re.DOTALL,
)
TEAM_NAME_HEADER_PATTERN = re.compile(r"<h3[^>]*>(?P<content>.*?)</h3>", re.DOTALL | re.IGNORECASE)
RECORD_TABLE_PATTERN = re.compile(
    r"<table class=\"record_table[^\"]*\"[^>]*summary=\"(?P<summary>[^\"]+)\"[^>]*>(?P<table>.*?)</table>",
    re.DOTALL | re.IGNORECASE,
)
TABLE_BODY_PATTERN = re.compile(r"<tbody>(?P<body>.*?)</tbody>", re.DOTALL | re.IGNORECASE)
TABLE_ROW_PATTERN = re.compile(r"<tr[^>]*>(?P<row>.*?)</tr>", re.DOTALL | re.IGNORECASE)
CELL_PATTERN = re.compile(r"<t[hd][^>]*>(?P<cell>.*?)</t[hd]>", re.DOTALL | re.IGNORECASE)
PLAYER_NAME_PATTERN = re.compile(r"<strong>(?P<name>.*?)</strong>", re.DOTALL | re.IGNORECASE)
PLAYER_POSITION_PATTERN = re.compile(
    r"<span[^>]*class=\"position\"[^>]*>(?P<position>.*?)</span>",
    re.DOTALL | re.IGNORECASE,
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
            payload = _merge_boxscore_payload(payload, response.text)
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
        club_idx, name = _extract_team_link_info(content)
        if club_idx is None:
            club_idx = _extract_int(TEAM_IDX_PATTERN, content)
        if not name:
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
    batting_entries, pitching_entries = _parse_record_tables(html_text, home_team, away_team, teams)
    if batting_entries:
        payload["batting_stats"] = batting_entries
    if pitching_entries:
        payload["pitching_stats"] = pitching_entries
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


def _extract_team_link_info(text: str) -> tuple[int | None, str | None]:
    match = TEAM_LINK_PATTERN.search(text)
    if not match:
        return None, None
    name = _clean_html_text(match.group("name")) or None
    try:
        club_idx = int(match.group("club_idx"))
    except (TypeError, ValueError):
        club_idx = None
    return club_idx, name


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


def _merge_boxscore_payload(payload: Any, html_text: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return _parse_boxscore_html(html_text)
    if not _has_team_payload(payload):
        return _parse_boxscore_html(html_text)
    parsed = _parse_boxscore_html(html_text)
    for key in ("batting_stats", "pitching_stats"):
        if key not in payload and key in parsed:
            payload[key] = parsed[key]
    for team_key in ("home", "away"):
        if team_key not in payload or not isinstance(payload.get(team_key), dict):
            if team_key in parsed:
                payload[team_key] = parsed[team_key]
            continue
        if team_key not in parsed or not isinstance(parsed.get(team_key), dict):
            continue
        _merge_team_identity(payload[team_key], parsed[team_key])
        for stats_key in ("batting", "pitching", "batting_stats", "pitching_stats"):
            if stats_key not in payload[team_key] and stats_key in parsed[team_key]:
                payload[team_key][stats_key] = parsed[team_key][stats_key]
    return payload


def _merge_team_identity(target: dict[str, Any], source: dict[str, Any]) -> None:
    source_idx = source.get("team_idx")
    source_name = source.get("name")
    target_name = target.get("name")
    name_matches = False
    if source_name:
        target_name_normalized = _normalize_team_name(str(target_name)) if target_name else ""
        source_name_normalized = _normalize_team_name(str(source_name))
        name_matches = not target_name or target_name_normalized == source_name_normalized
        if name_matches:
            target["name"] = source_name
    if isinstance(source_idx, int) and (name_matches or not target_name):
        target["team_idx"] = source_idx


def _has_team_payload(payload: dict[str, Any]) -> bool:
    for key in ("home", "away", "home_team", "away_team", "homeTeam", "awayTeam"):
        if isinstance(payload.get(key), dict):
            return True
    return False


def _parse_record_tables(
    html_text: str,
    home_team: dict[str, Any] | None,
    away_team: dict[str, Any] | None,
    teams: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    batting_entries: list[dict[str, Any]] = []
    pitching_entries: list[dict[str, Any]] = []
    headers = list(TEAM_NAME_HEADER_PATTERN.finditer(html_text))
    for match in RECORD_TABLE_PATTERN.finditer(html_text):
        summary = match.group("summary")
        table_html = match.group("table")
        header = _nearest_header(headers, match.start())
        team_name = _extract_team_name(header.group("content")) if header else None
        team_side = _resolve_team_side(team_name, home_team, away_team)
        rows = _extract_table_rows(table_html)
        if "타자" in summary:
            items = _parse_batting_rows(rows)
            _attach_entries(items, team_side, batting_entries, teams, "batting")
        elif "투수" in summary:
            items = _parse_pitching_rows(rows)
            _attach_entries(items, team_side, pitching_entries, teams, "pitching")
    return batting_entries, pitching_entries


def _nearest_header(headers: Sequence[re.Match[str]], table_pos: int) -> re.Match[str] | None:
    for header in reversed(headers):
        if header.start() < table_pos:
            return header
    return None


def _extract_team_name(raw: str) -> str | None:
    cleaned = _clean_html_text(raw)
    return cleaned or None


def _resolve_team_side(
    team_name: str | None,
    home_team: dict[str, Any] | None,
    away_team: dict[str, Any] | None,
) -> str | None:
    if not team_name:
        return None
    normalized = _normalize_team_name(team_name)
    for side, team in (("home", home_team), ("away", away_team)):
        if not team or not team.get("name"):
            continue
        team_normalized = _normalize_team_name(str(team["name"]))
        if normalized in team_normalized or team_normalized in normalized:
            return side
    return None


def _normalize_team_name(name: str) -> str:
    return re.sub(r"\s+", "", name).lower()


def _extract_table_rows(table_html: str) -> list[str]:
    match = TABLE_BODY_PATTERN.search(table_html)
    if not match:
        return []
    body = match.group("body")
    return [row.group("row") for row in TABLE_ROW_PATTERN.finditer(body)]


def _parse_batting_rows(rows: list[str]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for row in rows:
        cells = _extract_cells(row)
        if not cells:
            continue
        header_html = cells[0]
        name = _extract_player_name(header_html)
        if not name:
            continue
        position = _extract_player_position(header_html)
        stats = [_clean_html_text(cell) for cell in cells[1:]]
        at_bats, hits, rbi, runs = _batting_stat_line(stats)
        entries.append(
            {
                "name": name,
                "position": position,
                "at_bats": at_bats,
                "hits": hits,
                "rbi": rbi,
                "runs": runs,
                "walks": None,
                "strikeouts": None,
            }
        )
    return entries


def _batting_stat_line(stats: list[str]) -> tuple[int | None, int | None, int | None, int | None]:
    if len(stats) < 7:
        return None, None, None, None
    tail = stats[-7:]
    return (
        _parse_int(tail[0]),
        _parse_int(tail[1]),
        _parse_int(tail[2]),
        _parse_int(tail[3]),
    )


def _parse_pitching_rows(rows: list[str]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for row in rows:
        cells = _extract_cells(row)
        if not cells:
            continue
        header_html = cells[0]
        name = _extract_player_name(header_html)
        if not name:
            continue
        stats = [_clean_html_text(cell) for cell in cells[1:]]
        entries.append(_pitching_entry(name, stats))
    return entries


def _pitching_entry(name: str, stats: list[str]) -> dict[str, Any]:
    innings = _parse_innings(_safe_index(stats, 1))
    hits_allowed = _parse_int(_safe_index(stats, 4))
    runs_allowed = _parse_int(_safe_index(stats, 13))
    earned_runs = _parse_int(_safe_index(stats, 14))
    walks = _parse_int(_safe_index(stats, 8))
    strikeouts = _parse_int(_safe_index(stats, 10))
    return {
        "name": name,
        "innings_pitched": innings,
        "hits_allowed": hits_allowed,
        "runs_allowed": runs_allowed,
        "earned_runs": earned_runs,
        "walks": walks,
        "strikeouts": strikeouts,
    }


def _safe_index(items: list[str], index: int) -> str:
    return items[index] if index < len(items) else ""


def _extract_cells(row_html: str) -> list[str]:
    return [match.group("cell") for match in CELL_PATTERN.finditer(row_html)]


def _extract_player_name(cell_html: str) -> str | None:
    match = PLAYER_NAME_PATTERN.search(cell_html)
    if match:
        return _clean_html_text(match.group("name")) or None
    cleaned = _clean_html_text(cell_html)
    return cleaned or None


def _extract_player_position(cell_html: str) -> str | None:
    match = PLAYER_POSITION_PATTERN.search(cell_html)
    if not match:
        return None
    return _clean_html_text(match.group("position")) or None


def _parse_int(value: str) -> int | None:
    cleaned = value.strip()
    if not cleaned or cleaned == "-":
        return None
    cleaned = cleaned.replace(",", "")
    try:
        return int(cleaned)
    except ValueError:
        return None


def _parse_innings(value: str) -> float | None:
    cleaned = value.strip()
    if not cleaned or cleaned == "-":
        return None
    cleaned = cleaned.replace(",", "")
    match = re.match(r"(?P<int>\d+)?\s*(?P<frac>[⅓⅔])?$", cleaned)
    if match:
        total = float(match.group("int") or 0)
        frac = match.group("frac")
        if frac == "⅓":
            total += 1.0 / 3.0
        elif frac == "⅔":
            total += 2.0 / 3.0
        return total
    try:
        return float(cleaned)
    except ValueError:
        return None


def _attach_entries(
    items: list[dict[str, Any]],
    team_side: str | None,
    all_entries: list[dict[str, Any]],
    teams: dict[str, dict[str, Any]],
    key: str,
) -> None:
    if not items:
        return
    if team_side == "home":
        payload = teams.get("right")
    elif team_side == "away":
        payload = teams.get("left")
    else:
        payload = None
    if payload is not None:
        payload.setdefault(key, []).extend(items)
    else:
        for item in items:
            item["team_side"] = team_side
            all_entries.append(item)


def _clean_html_text(raw: str) -> str:
    cleaned = re.sub(r"<[^>]+>", "", raw)
    cleaned = html.unescape(cleaned)
    return cleaned.replace("\xa0", " ").strip()


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
