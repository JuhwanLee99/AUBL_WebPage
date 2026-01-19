"""Roster fetcher for team and registered player data."""
from __future__ import annotations

import html
import logging
import re
from urllib.parse import parse_qs, urlsplit, urlunsplit
from dataclasses import dataclass
from typing import Iterable

from crawler.settings import Settings
from crawler.storage import PlayerInfo, RosterEntry, TeamInfo
from crawler.web_client import WebClient

logger = logging.getLogger(__name__)

ROSTER_IFRAME_PATTERN = re.compile(
    r"<iframe[^>]+src=[\"'](?P<src>/league/state/content/regist[^\"']*)[\"']",
    re.IGNORECASE,
)
TEAM_LINK_PATTERN = re.compile(
    r"<a[^>]+href=[\"'](?P<href>/league/state/content/regist[^\"']*club_idx=(?P<club_idx>\d+)[^\"']*)[\"'][^>]*>(?P<label>.*?)</a>",
    re.IGNORECASE | re.DOTALL,
)
TEAM_NAME_PATTERN = re.compile(
    r"팀\s*&nbsp;*\s*명\s*:\s*.*?<a[^>]*>(?P<name>.*?)</a>",
    re.IGNORECASE | re.DOTALL,
)
PLAYER_ROW_PATTERN = re.compile(r"<tr[^>]*>(?P<row>.*?)</tr>", re.IGNORECASE | re.DOTALL)
PLAYER_NAME_PATTERN = re.compile(
    r"class=\"name\"[^>]*>.*?<a[^>]*>(?P<name>.*?)</a>",
    re.IGNORECASE | re.DOTALL,
)
PLAYER_POSITION_PATTERN = re.compile(r"<dd>(?P<position>.*?)</dd>", re.IGNORECASE | re.DOTALL)


def fetch_roster(client: WebClient, settings: Settings, year: int) -> list[RosterEntry]:
    index_html = client.request(
        "GET",
        settings.roster_page_path,
        params={"lig_idx": settings.lig_idx, "season": year},
    ).text
    content_path, content_params = _resolve_roster_content_path(index_html, settings, year)
    content_html = client.request("GET", content_path, params=content_params).text
    team_links = _extract_team_links(content_html)
    entries: list[RosterEntry] = []
    for link in team_links:
        roster_path, roster_params = _normalize_roster_link(link.href, settings, year)
        roster_html = client.request("GET", roster_path, params=roster_params).text
        team_name = _extract_team_name(roster_html) or link.name
        team = TeamInfo(team_idx=link.team_idx, name=team_name, code=None)
        players = _extract_players(roster_html)
        entries.append(RosterEntry(team=team, players=players))
    logger.info("roster_fetched teams=%s", len(entries))
    return entries


def build_team_registry(entries: Iterable[RosterEntry]) -> dict[str, int]:
    registry: dict[str, int] = {}
    for entry in entries:
        if entry.team.name and entry.team.team_idx is not None:
            registry[_normalize_team_name(entry.team.name)] = entry.team.team_idx
    return registry


@dataclass(frozen=True)
class _TeamLink:
    team_idx: int
    name: str
    href: str


def _resolve_roster_content_path(
    index_html: str,
    settings: Settings,
    year: int,
) -> tuple[str, dict[str, str]]:
    match = ROSTER_IFRAME_PATTERN.search(index_html)
    if match:
        raw_path = html.unescape(match.group("src"))
        return _normalize_roster_link(raw_path, settings, year)
    return "/league/state/content/regist", {"lig_idx": str(settings.lig_idx), "season": str(year)}


def _extract_team_links(html_text: str) -> list[_TeamLink]:
    seen: set[int] = set()
    links: list[_TeamLink] = []
    for match in TEAM_LINK_PATTERN.finditer(html_text):
        try:
            team_idx = int(match.group("club_idx"))
        except (TypeError, ValueError):
            continue
        if team_idx in seen:
            continue
        seen.add(team_idx)
        name = _clean_html_text(match.group("label"))
        href = html.unescape(match.group("href"))
        if not name or not href:
            continue
        links.append(_TeamLink(team_idx=team_idx, name=name, href=href))
    return links


def _extract_team_name(html_text: str) -> str | None:
    match = TEAM_NAME_PATTERN.search(html_text)
    if not match:
        return None
    return _clean_html_text(match.group("name")) or None


def _extract_players(html_text: str) -> list[PlayerInfo]:
    players: list[PlayerInfo] = []
    seen: set[tuple[str, str | None]] = set()
    for match in PLAYER_ROW_PATTERN.finditer(html_text):
        row = match.group("row")
        name = _extract_player_name(row)
        if not name:
            continue
        position = _extract_player_position(row)
        key = (name, position)
        if key in seen:
            continue
        seen.add(key)
        players.append(PlayerInfo(player_idx=None, name=name, position=position, bats=None, throws=None))
    return players


def _extract_player_name(row_html: str) -> str | None:
    match = PLAYER_NAME_PATTERN.search(row_html)
    if not match:
        return None
    return _clean_html_text(match.group("name")) or None


def _extract_player_position(row_html: str) -> str | None:
    match = PLAYER_POSITION_PATTERN.search(row_html)
    if not match:
        return None
    return _clean_html_text(match.group("position")) or None


def _normalize_team_name(name: str) -> str:
    return re.sub(r"\s+", "", name).lower()


def _clean_html_text(raw: str) -> str:
    cleaned = re.sub(r"<[^>]+>", "", raw)
    cleaned = html.unescape(cleaned)
    return cleaned.replace("\xa0", " ").strip()


def _normalize_roster_link(
    href: str,
    settings: Settings,
    year: int,
) -> tuple[str, dict[str, str]]:
    parts = urlsplit(href)
    query = parse_qs(parts.query)
    query["lig_idx"] = [str(settings.lig_idx)]
    query["season"] = [str(year)]
    params = {key: value[-1] for key, value in query.items()}
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", "")) or parts.path, params
