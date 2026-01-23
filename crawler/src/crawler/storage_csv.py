"""CSV-backed persistence layer for crawler data."""
from __future__ import annotations

import csv
import json
import logging
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from crawler.schedule_fetcher import FINAL_STATUSES, GameSummary
from crawler.storage import (
    BattingEntry,
    MatchPayload,
    PitchingEntry,
    PlayerInfo,
    RosterEntry,
    TeamInfo,
    _apply_team_registry,
    _extract_match_payload,
    _team_id_for_side,
    validate_match_integrity,
)

logger = logging.getLogger(__name__)


class CsvStorage:
    def __init__(self, output_dir: str | Path) -> None:
        self._output_dir = Path(output_dir)
        self._paths = {
            "matches": self._output_dir / "matches.csv",
            "teams": self._output_dir / "teams.csv",
            "players": self._output_dir / "players.csv",
            "roster_players": self._output_dir / "roster_players.csv",
            "batting_stats": self._output_dir / "batting_stats.csv",
            "pitching_stats": self._output_dir / "pitching_stats.csv",
            "crawl_state": self._output_dir / "crawl_state.csv",
            "web_pages": self._output_dir / "web_pages.csv",
            "league_batting_records": self._output_dir / "league_batting_records.csv",
            "league_pitching_records": self._output_dir / "league_pitching_records.csv",
        }
        self._schemas = {
            "matches": [
                "game_idx",
                "year",
                "group_code",
                "status",
                "home_team_idx",
                "home_team_name",
                "home_team_code",
                "away_team_idx",
                "away_team_name",
                "away_team_code",
                "home_runs",
                "away_runs",
                "home_innings_total",
                "away_innings_total",
                "reported_winner",
                "payload",
                "updated_at",
            ],
            "teams": [
                "team_idx",
                "name",
                "code",
                "year",
            ],
            "players": [
                "player_idx",
                "team_idx",
                "name",
                "position",
                "bats",
                "throws",
            ],
            "roster_players": [
                "team_idx",
                "year",
                "player_idx",
                "name",
                "position",
                "bats",
                "throws",
            ],
            "batting_stats": [
                "year",
                "game_idx",
                "team_side",
                "team_idx",
                "player_idx",
                "player_name",
                "player_position",
                "player_bats",
                "player_throws",
                "at_bats",
                "runs",
                "hits",
                "rbi",
                "walks",
                "strikeouts",
                "payload",
            ],
            "pitching_stats": [
                "year",
                "game_idx",
                "team_side",
                "team_idx",
                "player_idx",
                "player_name",
                "player_position",
                "player_bats",
                "player_throws",
                "innings_pitched",
                "hits_allowed",
                "runs_allowed",
                "earned_runs",
                "walks",
                "strikeouts",
                "payload",
            ],
            "crawl_state": [
                "year",
                "group_code",
                "max_game_idx",
                "last_synced_at",
                "updated_at",
            ],
            "web_pages": [
                "page_key",
                "url",
                "year",
                "params",
                "payload",
                "fetched_at",
            ],
            "league_batting_records": [
                "year",
                "payload",
                "fetched_at",
            ],
            "league_pitching_records": [
                "year",
                "payload",
                "fetched_at",
            ],
        }
        self._team_registry: dict[str, int] = {}
        # Track teams per season to keep a historical list.
        self._seen_team_keys: set[tuple[int | str | None, int | None]] = set()
        self._seen_player_keys: set[tuple[int | None, str, str | None]] = set()
        self._league_record_years: dict[str, set[int | None]] = {}

    def create_tables(self) -> None:
        self._output_dir.mkdir(parents=True, exist_ok=True)
        for name, path in self._paths.items():
            if not path.exists():
                self._write_row(path, self._schemas[name], {})

    def set_team_registry(self, registry: dict[str, int]) -> None:
        self._team_registry = registry

    def store_roster(self, entries: Iterable[RosterEntry], year: int | None) -> None:
        for entry in entries:
            raw_team_key = entry.team.team_idx if entry.team.team_idx is not None else entry.team.name
            team_key = (raw_team_key, year)
            if team_key not in self._seen_team_keys:
                self._seen_team_keys.add(team_key)
                self._append_team(entry.team, year)
            for player in entry.players:
                if not player.name:
                    continue
                player_key = (entry.team.team_idx, player.name, player.position, year)
                if player_key in self._seen_player_keys:
                    continue
                self._seen_player_keys.add(player_key)
                row = {
                    "team_idx": entry.team.team_idx,
                    "year": year,
                    **asdict(player),
                }
                self._append("roster_players", row)

    def store_league_records(
        self,
        year: int | None,
        batting_payload: dict[str, Any],
        pitching_payload: dict[str, Any],
    ) -> None:
        has_batting = self._has_league_record_year("league_batting_records", year)
        has_pitching = self._has_league_record_year("league_pitching_records", year)
        if has_batting and has_pitching:
            return
        fetched_at = datetime.now(timezone.utc).isoformat()
        if not has_batting:
            self._append(
                "league_batting_records",
                {
                    "year": year,
                    "payload": json.dumps(batting_payload, ensure_ascii=False),
                    "fetched_at": fetched_at,
                },
            )
            self._league_record_years.setdefault("league_batting_records", set()).add(year)
        if not has_pitching:
            self._append(
                "league_pitching_records",
                {
                    "year": year,
                    "payload": json.dumps(pitching_payload, ensure_ascii=False),
                    "fetched_at": fetched_at,
                },
            )
            self._league_record_years.setdefault("league_pitching_records", set()).add(year)

    def get_existing_game_idx(self, year: int, group_code: str | None) -> set[int]:
        path = self._paths["matches"]
        if not path.exists():
            return set()
        match_statuses: dict[int, str | None] = {}
        with path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                if not row:
                    continue
                if row.get("year") != str(year):
                    continue
                row_group = row.get("group_code") or None
                if row_group != group_code:
                    continue
                game_idx = row.get("game_idx")
                if game_idx:
                    try:
                        match_statuses[int(game_idx)] = row.get("status")
                    except ValueError:
                        continue
        if not match_statuses:
            return set()
        stats_games = self._existing_stat_games()
        return {game_idx for game_idx in match_statuses if game_idx in stats_games}

    def _existing_stat_games(self) -> set[int]:
        stat_games: set[int] = set()
        for key in ("batting_stats", "pitching_stats"):
            path = self._paths[key]
            if not path.exists():
                continue
            with path.open("r", encoding="utf-8", newline="") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    if not row:
                        continue
                    game_idx = row.get("game_idx")
                    if game_idx:
                        try:
                            stat_games.add(int(game_idx))
                        except ValueError:
                            continue
        return stat_games

    def update_crawl_state(self, year: int, group_code: str | None, max_game_idx: int | None) -> None:
        now = datetime.now(timezone.utc)
        row = {
            "year": year,
            "group_code": group_code,
            "max_game_idx": max_game_idx,
            "last_synced_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        self._append("crawl_state", row)

    def store_boxscore(self, game: GameSummary, year: int, payload: dict[str, Any]) -> None:
        match_data = _extract_match_payload(payload, game)
        match_data = _apply_team_registry(match_data, self._team_registry)
        errors = validate_match_integrity(match_data)
        if errors:
            logger.error(
                json.dumps(
                    {
                        "event": "integrity_failed",
                        "game_idx": game.game_idx,
                        "errors": errors,
                    },
                    sort_keys=True,
                )
            )
            return

        self._append_match(game, year, payload, match_data)
        self._append_players(match_data)
        self._append_batting(game, year, match_data)
        self._append_pitching(game, year, match_data)

    def store_web_page(
        self,
        page_key: str,
        url: str,
        params: dict[str, Any],
        payload: dict[str, Any],
        year: int | None,
    ) -> None:
        self._append(
            "web_pages",
            {
                "page_key": page_key,
                "url": url,
                "year": year,
                "params": json.dumps(params, ensure_ascii=False),
                "payload": json.dumps(payload, ensure_ascii=False),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            },
        )

    def _append_match(
        self,
        game: GameSummary,
        year: int,
        payload: dict[str, Any],
        match_data: MatchPayload,
    ) -> None:
        row = {
            "game_idx": game.game_idx,
            "year": year,
            "group_code": game.group_code,
            "status": match_data.status or game.status,
            "home_team_idx": match_data.home_team.team_idx if match_data.home_team else None,
            "home_team_name": match_data.home_team.name if match_data.home_team else None,
            "home_team_code": match_data.home_team.code if match_data.home_team else None,
            "away_team_idx": match_data.away_team.team_idx if match_data.away_team else None,
            "away_team_name": match_data.away_team.name if match_data.away_team else None,
            "away_team_code": match_data.away_team.code if match_data.away_team else None,
            "home_runs": match_data.home_runs,
            "away_runs": match_data.away_runs,
            "home_innings_total": match_data.home_innings_total,
            "away_innings_total": match_data.away_innings_total,
            "reported_winner": match_data.reported_winner,
            "payload": json.dumps(payload, ensure_ascii=False),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self._append("matches", row)

    def _append_team(self, team: TeamInfo | None, year: int | None) -> None:
        if team is None:
            return
        self._append(
            "teams",
            {
                "team_idx": team.team_idx,
                "name": team.name,
                "code": team.code,
                "year": year,
            },
        )

    def _append_players(self, match_data: MatchPayload) -> None:
        for entry in (match_data.batting_stats or []) + (match_data.pitching_stats or []):
            self._append_player(
                entry.player,
                _team_id_for_side(
                    entry.team_side,
                    match_data.home_team.team_idx if match_data.home_team else None,
                    match_data.away_team.team_idx if match_data.away_team else None,
                ),
            )

    def _append_player(self, player: PlayerInfo | None, team_idx: int | None) -> None:
        if player is None:
            return
        row = asdict(player)
        row["team_idx"] = team_idx
        self._append("players", row)

    def _append_batting(self, game: GameSummary, year: int, match_data: MatchPayload) -> None:
        if not match_data.batting_stats:
            return
        for entry in match_data.batting_stats:
            team_idx = _team_id_for_side(
                entry.team_side,
                match_data.home_team.team_idx if match_data.home_team else None,
                match_data.away_team.team_idx if match_data.away_team else None,
            )
            self._append("batting_stats", self._batting_row(game, year, entry, team_idx))

    def _batting_row(self, game: GameSummary, year: int, entry: BattingEntry, team_idx: int | None) -> dict[str, Any]:
        player = entry.player
        return {
            "year": year,
            "game_idx": game.game_idx,
            "team_side": entry.team_side,
            "team_idx": team_idx,
            "player_idx": player.player_idx if player else None,
            "player_name": player.name if player else None,
            "player_position": player.position if player else None,
            "player_bats": player.bats if player else None,
            "player_throws": player.throws if player else None,
            "at_bats": entry.at_bats,
            "runs": entry.runs,
            "hits": entry.hits,
            "rbi": entry.rbi,
            "walks": entry.walks,
            "strikeouts": entry.strikeouts,
            "payload": json.dumps(entry.payload, ensure_ascii=False),
        }

    def _append_pitching(self, game: GameSummary, year: int, match_data: MatchPayload) -> None:
        if not match_data.pitching_stats:
            return
        for entry in match_data.pitching_stats:
            team_idx = _team_id_for_side(
                entry.team_side,
                match_data.home_team.team_idx if match_data.home_team else None,
                match_data.away_team.team_idx if match_data.away_team else None,
            )
            self._append("pitching_stats", self._pitching_row(game, year, entry, team_idx))

    def _pitching_row(
        self,
        game: GameSummary,
        year: int,
        entry: PitchingEntry,
        team_idx: int | None,
    ) -> dict[str, Any]:
        player = entry.player
        return {
            "year": year,
            "game_idx": game.game_idx,
            "team_side": entry.team_side,
            "team_idx": team_idx,
            "player_idx": player.player_idx if player else None,
            "player_name": player.name if player else None,
            "player_position": player.position if player else None,
            "player_bats": player.bats if player else None,
            "player_throws": player.throws if player else None,
            "innings_pitched": entry.innings_pitched,
            "hits_allowed": entry.hits_allowed,
            "runs_allowed": entry.runs_allowed,
            "earned_runs": entry.earned_runs,
            "walks": entry.walks,
            "strikeouts": entry.strikeouts,
            "payload": json.dumps(entry.payload, ensure_ascii=False),
        }

    def _append(self, name: str, row: dict[str, Any]) -> None:
        path = self._paths[name]
        self._write_row(path, self._schemas[name], row)

    def _has_league_record_year(self, key: str, year: int | None) -> bool:
        years = self._league_record_years.get(key)
        if years is None:
            years = self._load_league_record_years(key)
            self._league_record_years[key] = years
        return year in years

    def _load_league_record_years(self, key: str) -> set[int | None]:
        path = self._paths[key]
        years: set[int | None] = set()
        if not path.exists():
            return years
        with path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                if not row:
                    continue
                raw_year = row.get("year")
                if raw_year in (None, "", "None"):
                    years.add(None)
                    continue
                try:
                    years.add(int(raw_year))
                except ValueError:
                    continue
        return years

    def _write_row(self, path: Path, fieldnames: list[str], row: dict[str, Any]) -> None:
        write_header = not path.exists() or path.stat().st_size == 0
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            if write_header:
                writer.writeheader()
            if row:
                writer.writerow({key: row.get(key) for key in fieldnames})


def _is_final_status(status: str) -> bool:
    return status.lower() in FINAL_STATUSES
