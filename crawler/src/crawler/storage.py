"""Persistence layer for crawler data."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Any, Iterable

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    UniqueConstraint,
    create_engine,
    select,
)
from sqlalchemy.engine import Connection

from crawler.schedule_fetcher import FINAL_STATUSES, GameSummary

logger = logging.getLogger(__name__)

metadata = MetaData()

teams_table = Table(
    "teams",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("team_idx", Integer, nullable=True),
    Column("name", String(255), nullable=True),
    Column("code", String(50), nullable=True),
    Column("created_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)),
    UniqueConstraint("team_idx", name="teams_team_idx_unique"),
)

team_seasons_table = Table(
    "team_seasons",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("team_id", Integer, ForeignKey("teams.id"), nullable=False),
    Column("year", Integer, nullable=True),
    Column("created_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)),
    UniqueConstraint("team_id", "year", name="team_seasons_team_year_unique"),
)

players_table = Table(
    "players",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("player_idx", Integer, nullable=True),
    Column("team_id", Integer, ForeignKey("teams.id"), nullable=True),
    Column("name", String(255), nullable=True),
    Column("position", String(50), nullable=True),
    Column("bats", String(10), nullable=True),
    Column("throws", String(10), nullable=True),
    Column("created_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)),
    UniqueConstraint("player_idx", name="players_player_idx_unique"),
)

matches_table = Table(
    "matches",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("game_idx", Integer, nullable=False),
    Column("year", Integer, nullable=False),
    Column("group_code", String(50), nullable=True),
    Column("status", String(50), nullable=True),
    Column("home_team_id", Integer, ForeignKey("teams.id"), nullable=True),
    Column("away_team_id", Integer, ForeignKey("teams.id"), nullable=True),
    Column("home_runs", Integer, nullable=True),
    Column("away_runs", Integer, nullable=True),
    Column("home_innings_total", Integer, nullable=True),
    Column("away_innings_total", Integer, nullable=True),
    Column("winning_team_id", Integer, ForeignKey("teams.id"), nullable=True),
    Column("losing_team_id", Integer, ForeignKey("teams.id"), nullable=True),
    Column("payload", JSON, nullable=True),
    Column("updated_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)),
    UniqueConstraint("game_idx", name="matches_game_idx_unique"),
)

roster_players_table = Table(
    "roster_players",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("team_id", Integer, ForeignKey("teams.id"), nullable=True),
    Column("player_id", Integer, ForeignKey("players.id"), nullable=True),
    Column("year", Integer, nullable=True),
    Column("created_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)),
    UniqueConstraint("team_id", "player_id", "year", name="roster_team_player_year_unique"),
)

batting_stats_table = Table(
    "batting_stats",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("year", Integer, nullable=False),
    Column("game_id", Integer, ForeignKey("matches.id"), nullable=False),
    Column("team_id", Integer, ForeignKey("teams.id"), nullable=True),
    Column("player_id", Integer, ForeignKey("players.id"), nullable=True),
    Column("at_bats", Integer, nullable=True),
    Column("runs", Integer, nullable=True),
    Column("hits", Integer, nullable=True),
    Column("rbi", Integer, nullable=True),
    Column("walks", Integer, nullable=True),
    Column("strikeouts", Integer, nullable=True),
    Column("payload", JSON, nullable=True),
)

pitching_stats_table = Table(
    "pitching_stats",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("year", Integer, nullable=False),
    Column("game_id", Integer, ForeignKey("matches.id"), nullable=False),
    Column("team_id", Integer, ForeignKey("teams.id"), nullable=True),
    Column("player_id", Integer, ForeignKey("players.id"), nullable=True),
    Column("innings_pitched", Float, nullable=True),
    Column("hits_allowed", Integer, nullable=True),
    Column("runs_allowed", Integer, nullable=True),
    Column("earned_runs", Integer, nullable=True),
    Column("walks", Integer, nullable=True),
    Column("strikeouts", Integer, nullable=True),
    Column("payload", JSON, nullable=True),
)

crawl_state_table = Table(
    "crawl_state",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("year", Integer, nullable=False),
    Column("group_code", String(50), nullable=True),
    Column("max_game_idx", Integer, nullable=True),
    Column("last_synced_at", DateTime(timezone=True), nullable=True),
    Column("updated_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)),
    UniqueConstraint("year", "group_code", name="crawl_state_year_group_unique"),
)

web_pages_table = Table(
    "web_pages",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("page_key", String(100), nullable=False),
    Column("url", String(500), nullable=False),
    Column("year", Integer, nullable=True),
    Column("params", JSON, nullable=True),
    Column("payload", JSON, nullable=True),
    Column("fetched_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)),
)

league_batting_records_table = Table(
    "league_batting_records",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("year", Integer, nullable=True),
    Column("payload", JSON, nullable=True),
    Column("fetched_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)),
)

league_pitching_records_table = Table(
    "league_pitching_records",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("year", Integer, nullable=True),
    Column("payload", JSON, nullable=True),
    Column("fetched_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)),
)


@dataclass(frozen=True)
class TeamInfo:
    team_idx: int | None
    name: str | None
    code: str | None


@dataclass(frozen=True)
class PlayerInfo:
    player_idx: int | None
    name: str | None
    position: str | None
    bats: str | None
    throws: str | None


class Storage:
    def __init__(self, database_url: str) -> None:
        # pool_pre_ping avoids stale connections (common with MySQL wait_timeout)
        self._engine = create_engine(database_url, pool_pre_ping=True, pool_recycle=3600)
        self._team_registry: dict[str, int] = {}

    def create_tables(self) -> None:
        metadata.create_all(self._engine)

    def set_team_registry(self, registry: dict[str, int]) -> None:
        self._team_registry = registry

    def store_roster(self, entries: Iterable[RosterEntry], year: int | None) -> None:
        with self._engine.begin() as conn:
            for entry in entries:
                team_id = self._upsert_team(conn, entry.team)
                self._upsert_team_season(conn, team_id, year)
                for player in entry.players:
                    player_id = self._upsert_player(conn, player, team_id)
                    self._upsert_roster_player(conn, team_id, player_id, year)

    def store_league_records(
        self,
        year: int | None,
        batting_payload: dict[str, Any],
        pitching_payload: dict[str, Any],
    ) -> None:
        now = datetime.now(timezone.utc)
        with self._engine.begin() as conn:
            self._delete_league_records(conn, year)
            conn.execute(
                league_batting_records_table.insert().values(
                    year=year,
                    payload=batting_payload,
                    fetched_at=now,
                )
            )
            conn.execute(
                league_pitching_records_table.insert().values(
                    year=year,
                    payload=pitching_payload,
                    fetched_at=now,
                )
            )

    def _delete_league_records(self, conn: Connection, year: int | None) -> None:
        if year is None:
            conn.execute(league_batting_records_table.delete().where(
                league_batting_records_table.c.year.is_(None)
            ))
            conn.execute(league_pitching_records_table.delete().where(
                league_pitching_records_table.c.year.is_(None)
            ))
            return
        conn.execute(league_batting_records_table.delete().where(
            league_batting_records_table.c.year == year
        ))
        conn.execute(league_pitching_records_table.delete().where(
            league_pitching_records_table.c.year == year
        ))

    def get_existing_game_idx(self, year: int, group_code: str | None) -> set[int]:
        with self._engine.connect() as conn:
            query = select(
                matches_table.c.id,
                matches_table.c.game_idx,
                matches_table.c.status,
            ).where(matches_table.c.year == year)
            if group_code is None:
                query = query.where(matches_table.c.group_code.is_(None))
            else:
                query = query.where(matches_table.c.group_code == group_code)
            rows = conn.execute(query).fetchall()
            if not rows:
                return set()
            match_ids = [row.id for row in rows]
            batting_ids = {
                int(row[0])
                for row in conn.execute(
                    select(batting_stats_table.c.game_id).where(
                        batting_stats_table.c.game_id.in_(match_ids)
                    )
                ).fetchall()
            }
            pitching_ids = {
                int(row[0])
                for row in conn.execute(
                    select(pitching_stats_table.c.game_id).where(
                        pitching_stats_table.c.game_id.in_(match_ids)
                    )
                ).fetchall()
            }
            stats_ids = batting_ids | pitching_ids
            return {int(row.game_idx) for row in rows if row.id in stats_ids}

    def update_crawl_state(self, year: int, group_code: str | None, max_game_idx: int | None) -> None:
        now = datetime.now(timezone.utc)
        with self._engine.begin() as conn:
            query = select(crawl_state_table.c.id).where(crawl_state_table.c.year == year)
            if group_code is None:
                query = query.where(crawl_state_table.c.group_code.is_(None))
            else:
                query = query.where(crawl_state_table.c.group_code == group_code)
            row = conn.execute(query).fetchone()
            payload = {
                "year": year,
                "group_code": group_code,
                "max_game_idx": max_game_idx,
                "last_synced_at": now,
                "updated_at": now,
            }
            if row:
                conn.execute(
                    crawl_state_table.update()
                    .where(crawl_state_table.c.id == row.id)
                    .values(payload)
                )
            else:
                conn.execute(crawl_state_table.insert().values(payload))

    def store_boxscore(
        self,
        game: GameSummary,
        year: int,
        payload: dict[str, Any],
    ) -> None:
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
        with self._engine.begin() as conn:
            home_team_id = self._find_team_id(conn, match_data.home_team)
            away_team_id = self._find_team_id(conn, match_data.away_team)
            match_id = self._upsert_match(
                conn,
                game,
                year,
                payload,
                match_data,
                home_team_id,
                away_team_id,
            )
            self._store_batting_stats(conn, match_id, year, home_team_id, away_team_id, match_data)
            self._store_pitching_stats(conn, match_id, year, home_team_id, away_team_id, match_data)

    def store_web_page(
        self,
        page_key: str,
        url: str,
        params: dict[str, Any],
        payload: dict[str, Any],
        year: int | None,
    ) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                web_pages_table.insert().values(
                    page_key=page_key,
                    url=url,
                    year=year,
                    params=params,
                    payload=payload,
                    fetched_at=datetime.now(timezone.utc),
                )
            )

    def _upsert_team(self, conn, team: TeamInfo | None) -> int | None:
        if team is None:
            return None
        if team.team_idx is None and not team.name:
            return None
        query = select(teams_table.c.id).where(teams_table.c.team_idx == team.team_idx)
        if team.team_idx is None:
            query = select(teams_table.c.id).where(
                (teams_table.c.name == team.name) & (teams_table.c.code == team.code)
            )
        row = conn.execute(query).fetchone()
        if row:
            return int(row.id)
        result = conn.execute(
            teams_table.insert().values(
                team_idx=team.team_idx,
                name=team.name,
                code=team.code,
            )
        )
        return int(result.inserted_primary_key[0])

    def _upsert_team_season(self, conn, team_id: int | None, year: int | None) -> None:
        if team_id is None:
            return
        query = select(team_seasons_table.c.id).where(team_seasons_table.c.team_id == team_id)
        if year is None:
            query = query.where(team_seasons_table.c.year.is_(None))
        else:
            query = query.where(team_seasons_table.c.year == year)
        row = conn.execute(query).fetchone()
        if row:
            return
        conn.execute(
            team_seasons_table.insert().values(
                team_id=team_id,
                year=year,
                created_at=datetime.now(timezone.utc),
            )
        )

    def _find_team_id(self, conn, team: TeamInfo | None) -> int | None:
        if team is None or team.team_idx is None:
            return None
        row = conn.execute(
            select(teams_table.c.id).where(teams_table.c.team_idx == team.team_idx)
        ).fetchone()
        return int(row.id) if row else None

    def _upsert_player(
        self,
        conn,
        player: PlayerInfo | None,
        team_id: int | None,
    ) -> int | None:
        if player is None:
            return None
        if player.player_idx is None and not player.name:
            return None
        query = select(players_table.c.id).where(players_table.c.player_idx == player.player_idx)
        if player.player_idx is None:
            query = select(players_table.c.id).where(
                (players_table.c.name == player.name) & (players_table.c.team_id == team_id)
            )
        row = conn.execute(query).fetchone()
        if row:
            return int(row.id)
        result = conn.execute(
            players_table.insert().values(
                player_idx=player.player_idx,
                team_id=team_id,
                name=player.name,
                position=player.position,
                bats=player.bats,
                throws=player.throws,
            )
        )
        return int(result.inserted_primary_key[0])

    def _find_player_id(
        self,
        conn,
        player: PlayerInfo | None,
        team_id: int | None,
    ) -> int | None:
        if player is None or not player.name or team_id is None:
            return None
        row = conn.execute(
            select(players_table.c.id).where(
                (players_table.c.name == player.name) & (players_table.c.team_id == team_id)
            )
        ).fetchone()
        return int(row.id) if row else None

    def _upsert_roster_player(
        self,
        conn,
        team_id: int | None,
        player_id: int | None,
        year: int | None,
    ) -> None:
        if team_id is None or player_id is None:
            return
        query = select(roster_players_table.c.id).where(
            roster_players_table.c.team_id == team_id,
            roster_players_table.c.player_id == player_id,
            roster_players_table.c.year == year,
        )
        row = conn.execute(query).fetchone()
        if row:
            return
        conn.execute(
            roster_players_table.insert().values(
                team_id=team_id,
                player_id=player_id,
                year=year,
                created_at=datetime.now(timezone.utc),
            )
        )

    def _upsert_match(
        self,
        conn,
        game: GameSummary,
        year: int,
        payload: dict[str, Any],
        match_data: MatchPayload,
        home_team_id: int | None,
        away_team_id: int | None,
    ) -> int:
        now = datetime.now(timezone.utc)
        winner_id, loser_id = _resolve_winner(match_data, home_team_id, away_team_id)
        payload_data = {
            "game_idx": game.game_idx,
            "year": year,
            "group_code": game.group_code,
            "status": match_data.status or game.status,
            "home_team_id": home_team_id,
            "away_team_id": away_team_id,
            "home_runs": match_data.home_runs,
            "away_runs": match_data.away_runs,
            "home_innings_total": match_data.home_innings_total,
            "away_innings_total": match_data.away_innings_total,
            "winning_team_id": winner_id,
            "losing_team_id": loser_id,
            "payload": payload,
            "updated_at": now,
        }
        row = conn.execute(
            select(matches_table.c.id).where(matches_table.c.game_idx == game.game_idx)
        ).fetchone()
        if row:
            conn.execute(
                matches_table.update().where(matches_table.c.id == row.id).values(payload_data)
            )
            return int(row.id)
        result = conn.execute(matches_table.insert().values(payload_data))
        return int(result.inserted_primary_key[0])

    def _store_batting_stats(
        self,
        conn,
        match_id: int,
        year: int,
        home_team_id: int | None,
        away_team_id: int | None,
        match_data: MatchPayload,
    ) -> None:
        if match_data.batting_stats is None:
            return
        for entry in match_data.batting_stats:
            team_id = _team_id_for_side(entry.team_side, home_team_id, away_team_id)
            player_id = self._find_player_id(conn, entry.player, team_id)
            conn.execute(
                batting_stats_table.insert().values(
                    year=year,
                    game_id=match_id,
                    team_id=team_id,
                    player_id=player_id,
                    at_bats=entry.at_bats,
                    runs=entry.runs,
                    hits=entry.hits,
                    rbi=entry.rbi,
                    walks=entry.walks,
                    strikeouts=entry.strikeouts,
                    payload=entry.payload,
                )
            )

    def _store_pitching_stats(
        self,
        conn,
        match_id: int,
        year: int,
        home_team_id: int | None,
        away_team_id: int | None,
        match_data: MatchPayload,
    ) -> None:
        if match_data.pitching_stats is None:
            return
        for entry in match_data.pitching_stats:
            team_id = _team_id_for_side(entry.team_side, home_team_id, away_team_id)
            player_id = self._find_player_id(conn, entry.player, team_id)
            conn.execute(
                pitching_stats_table.insert().values(
                    year=year,
                    game_id=match_id,
                    team_id=team_id,
                    player_id=player_id,
                    innings_pitched=entry.innings_pitched,
                    hits_allowed=entry.hits_allowed,
                    runs_allowed=entry.runs_allowed,
                    earned_runs=entry.earned_runs,
                    walks=entry.walks,
                    strikeouts=entry.strikeouts,
                    payload=entry.payload,
                )
            )


@dataclass(frozen=True)
class MatchPayload:
    status: str | None
    home_team: TeamInfo | None
    away_team: TeamInfo | None
    home_runs: int | None
    away_runs: int | None
    home_innings_total: int | None
    away_innings_total: int | None
    reported_winner: int | str | None
    batting_stats: list[BattingEntry] | None
    pitching_stats: list[PitchingEntry] | None


@dataclass(frozen=True)
class RosterEntry:
    team: TeamInfo
    players: list[PlayerInfo]


@dataclass(frozen=True)
class BattingEntry:
    team_side: str | None
    player: PlayerInfo | None
    at_bats: int | None
    runs: int | None
    hits: int | None
    rbi: int | None
    walks: int | None
    strikeouts: int | None
    payload: dict[str, Any]


@dataclass(frozen=True)
class PitchingEntry:
    team_side: str | None
    player: PlayerInfo | None
    innings_pitched: float | None
    hits_allowed: int | None
    runs_allowed: int | None
    earned_runs: int | None
    walks: int | None
    strikeouts: int | None
    payload: dict[str, Any]


def _extract_match_payload(payload: dict[str, Any], game: GameSummary) -> MatchPayload:
    home_payload = _find_team_payload(payload, ["home", "home_team", "homeTeam", "team_home"])
    away_payload = _find_team_payload(payload, ["away", "away_team", "awayTeam", "team_away"])
    status = _first_string(payload, ["status", "game_status", "gameStatus"]) or game.status
    home_runs = _first_int(home_payload, ["r", "runs", "score", "R"]) if home_payload else None
    away_runs = _first_int(away_payload, ["r", "runs", "score", "R"]) if away_payload else None
    home_innings = _sum_innings(_extract_innings(home_payload)) if home_payload else None
    away_innings = _sum_innings(_extract_innings(away_payload)) if away_payload else None
    reported_winner = _extract_reported_winner(payload)
    return MatchPayload(
        status=status,
        home_team=_extract_team_info(home_payload),
        away_team=_extract_team_info(away_payload),
        home_runs=home_runs,
        away_runs=away_runs,
        home_innings_total=home_innings,
        away_innings_total=away_innings,
        reported_winner=reported_winner,
        batting_stats=_extract_batting_stats(payload, home_payload, away_payload),
        pitching_stats=_extract_pitching_stats(payload, home_payload, away_payload),
    )


def _extract_team_info(payload: dict[str, Any] | None) -> TeamInfo | None:
    if not payload:
        return None
    team_idx = _first_int(payload, ["team_idx", "teamIdx", "team_id", "teamId", "idx", "id"])
    name = _first_string(payload, ["name", "team_name", "teamName", "club"])
    code = _first_string(payload, ["code", "team_code", "teamCode", "abbr", "short"])
    return TeamInfo(team_idx=team_idx, name=name, code=code)


def _apply_team_registry(match_data: MatchPayload, registry: dict[str, int]) -> MatchPayload:
    if not registry:
        return match_data
    home_team = _resolve_team_registry(match_data.home_team, registry)
    away_team = _resolve_team_registry(match_data.away_team, registry)
    if home_team is match_data.home_team and away_team is match_data.away_team:
        return match_data
    return replace(match_data, home_team=home_team, away_team=away_team)


def _resolve_team_registry(team: TeamInfo | None, registry: dict[str, int]) -> TeamInfo | None:
    if team is None or not team.name:
        return team
    normalized = _normalize_team_name(team.name)
    team_idx = registry.get(normalized)
    if team_idx is None or team.team_idx == team_idx:
        return team
    return TeamInfo(team_idx=team_idx, name=team.name, code=team.code)


def _normalize_team_name(name: str) -> str:
    return re.sub(r"\s+", "", name).lower()


def _extract_player_info(payload: dict[str, Any] | None) -> PlayerInfo | None:
    if not payload:
        return None
    player_idx = _first_int(payload, ["player_idx", "playerIdx", "player_id", "playerId", "id"])
    name = _first_string(payload, ["name", "player_name", "playerName"])
    position = _first_string(payload, ["position", "pos"])
    bats = _first_string(payload, ["bats", "bat"])
    throws = _first_string(payload, ["throws", "throw"])
    return PlayerInfo(
        player_idx=player_idx,
        name=name,
        position=position,
        bats=bats,
        throws=throws,
    )


def _extract_batting_stats(
    payload: dict[str, Any],
    home_payload: dict[str, Any] | None,
    away_payload: dict[str, Any] | None,
) -> list[BattingEntry] | None:
    entries: list[BattingEntry] = []
    entries.extend(_extract_team_batting_entries(home_payload, "home"))
    entries.extend(_extract_team_batting_entries(away_payload, "away"))
    entries.extend(_extract_generic_batting_entries(payload))
    return entries or None


def _extract_team_batting_entries(
    team_payload: dict[str, Any] | None,
    team_side: str,
) -> list[BattingEntry]:
    if not team_payload:
        return []
    items = _first_list(team_payload, ["batters", "batting", "batting_stats"])
    if not items:
        return []
    return [_build_batting_entry(item, team_side) for item in items if isinstance(item, dict)]


def _extract_generic_batting_entries(payload: dict[str, Any]) -> list[BattingEntry]:
    items = _first_list(payload, ["batters", "batting", "batting_stats"])
    if not items:
        return []
    entries: list[BattingEntry] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        team_side = _first_string(item, ["team_side", "side", "home_away"])
        entries.append(_build_batting_entry(item, team_side))
    return entries


def _build_batting_entry(item: dict[str, Any], team_side: str | None) -> BattingEntry:
    return BattingEntry(
        team_side=team_side,
        player=_extract_player_info(item),
        at_bats=_first_int(item, ["ab", "at_bats", "atBats"]),
        runs=_first_int(item, ["r", "runs"]),
        hits=_first_int(item, ["h", "hits"]),
        rbi=_first_int(item, ["rbi"]),
        walks=_first_int(item, ["bb", "walks"]),
        strikeouts=_first_int(item, ["so", "strikeouts"]),
        payload=item,
    )


def _extract_pitching_stats(
    payload: dict[str, Any],
    home_payload: dict[str, Any] | None,
    away_payload: dict[str, Any] | None,
) -> list[PitchingEntry] | None:
    entries: list[PitchingEntry] = []
    entries.extend(_extract_team_pitching_entries(home_payload, "home"))
    entries.extend(_extract_team_pitching_entries(away_payload, "away"))
    entries.extend(_extract_generic_pitching_entries(payload))
    return entries or None


def _extract_team_pitching_entries(
    team_payload: dict[str, Any] | None,
    team_side: str,
) -> list[PitchingEntry]:
    if not team_payload:
        return []
    items = _first_list(team_payload, ["pitchers", "pitching", "pitching_stats"])
    if not items:
        return []
    return [_build_pitching_entry(item, team_side) for item in items if isinstance(item, dict)]


def _extract_generic_pitching_entries(payload: dict[str, Any]) -> list[PitchingEntry]:
    items = _first_list(payload, ["pitchers", "pitching", "pitching_stats"])
    if not items:
        return []
    entries: list[PitchingEntry] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        team_side = _first_string(item, ["team_side", "side", "home_away"])
        entries.append(_build_pitching_entry(item, team_side))
    return entries


def _build_pitching_entry(item: dict[str, Any], team_side: str | None) -> PitchingEntry:
    return PitchingEntry(
        team_side=team_side,
        player=_extract_player_info(item),
        innings_pitched=_first_float(item, ["ip", "innings_pitched", "inningsPitched"]),
        hits_allowed=_first_int(item, ["h", "hits_allowed", "hitsAllowed"]),
        runs_allowed=_first_int(item, ["r", "runs_allowed", "runsAllowed"]),
        earned_runs=_first_int(item, ["er", "earned_runs", "earnedRuns"]),
        walks=_first_int(item, ["bb", "walks"]),
        strikeouts=_first_int(item, ["so", "strikeouts"]),
        payload=item,
    )


def _find_team_payload(payload: dict[str, Any], keys: Iterable[str]) -> dict[str, Any] | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, dict):
            return value
    return None


def _first_string(payload: dict[str, Any], keys: Iterable[str]) -> str | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _first_int(payload: dict[str, Any], keys: Iterable[str]) -> int | None:
    for key in keys:
        value = payload.get(key)
        if value is None:
            continue
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    return None


def _first_float(payload: dict[str, Any], keys: Iterable[str]) -> float | None:
    for key in keys:
        value = payload.get(key)
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return None


def _first_list(payload: dict[str, Any], keys: Iterable[str]) -> list[Any] | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, list):
            return value
    return None


def _extract_innings(team_payload: dict[str, Any]) -> list[int]:
    innings = _first_list(team_payload, ["innings", "inning", "inning_scores", "scores_by_inning"])
    if innings:
        return [_coerce_inning(value) for value in innings if _coerce_inning(value) is not None]
    for key in ("innings", "inning"):
        value = team_payload.get(key)
        if isinstance(value, dict):
            nested = _first_list(value, ["list", "inning", "innings", "scores"])
            if nested:
                return [
                    _coerce_inning(entry) for entry in nested if _coerce_inning(entry) is not None
                ]
    return []


def _coerce_inning(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _sum_innings(innings: list[int]) -> int | None:
    if not innings:
        return None
    return int(sum(innings))


def _extract_reported_winner(payload: dict[str, Any]) -> int | str | None:
    for key in ("winner", "winning_team", "win_team", "winningTeam", "winTeam"):
        value = payload.get(key)
        if value is None:
            continue
        if isinstance(value, dict):
            winner_idx = _first_int(value, ["team_idx", "teamIdx", "team_id", "teamId", "id"])
            if winner_idx is not None:
                return winner_idx
            return _first_string(value, ["name", "team_name", "teamName"])
        if isinstance(value, (int, str)):
            return value
    return None


def _resolve_winner(
    match_data: MatchPayload,
    home_team_id: int | None,
    away_team_id: int | None,
) -> tuple[int | None, int | None]:
    if match_data.home_runs is None or match_data.away_runs is None:
        return (None, None)
    if match_data.home_runs == match_data.away_runs:
        return (None, None)
    winner = home_team_id if match_data.home_runs > match_data.away_runs else away_team_id
    loser = away_team_id if match_data.home_runs > match_data.away_runs else home_team_id
    return (winner, loser)


def _team_id_for_side(
    side: str | None,
    home_team_id: int | None,
    away_team_id: int | None,
) -> int | None:
    if side == "home":
        return home_team_id
    if side == "away":
        return away_team_id
    return None


def _is_final_status(status: str) -> bool:
    return status.lower() in FINAL_STATUSES


def validate_match_integrity(match_data: MatchPayload) -> list[str]:
    errors: list[str] = []
    if (
        match_data.home_innings_total is not None
        and match_data.home_runs is not None
        and match_data.home_innings_total != match_data.home_runs
    ):
        errors.append("home_inning_total_mismatch")
    if (
        match_data.away_innings_total is not None
        and match_data.away_runs is not None
        and match_data.away_innings_total != match_data.away_runs
    ):
        errors.append("away_inning_total_mismatch")
    if match_data.reported_winner is not None:
        derived = None
        if match_data.home_runs is not None and match_data.away_runs is not None:
            if match_data.home_runs > match_data.away_runs:
                derived = "home"
            elif match_data.away_runs > match_data.home_runs:
                derived = "away"
        if derived is None:
            errors.append("winner_reported_but_game_tied")
        else:
            if isinstance(match_data.reported_winner, str):
                normalized = match_data.reported_winner.lower()
                if "home" in normalized and derived != "home":
                    errors.append("winner_mismatch")
                if "away" in normalized and derived != "away":
                    errors.append("winner_mismatch")
            if isinstance(match_data.reported_winner, int):
                home_idx = match_data.home_team.team_idx if match_data.home_team else None
                away_idx = match_data.away_team.team_idx if match_data.away_team else None
                if derived == "home" and home_idx is not None and match_data.reported_winner != home_idx:
                    errors.append("winner_mismatch")
                if derived == "away" and away_idx is not None and match_data.reported_winner != away_idx:
                    errors.append("winner_mismatch")
    return errors
