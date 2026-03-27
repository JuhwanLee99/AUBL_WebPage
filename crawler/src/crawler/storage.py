"""Persistence layer for crawler data — aligned to Spring Boot MariaDB schema (db.sql)."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Iterable

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    UniqueConstraint,
    create_engine,
    select,
    text,
)
from sqlalchemy.engine import Connection

from crawler.schedule_fetcher import FINAL_STATUSES, GameSummary

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Spring Boot schema tables (pre-existing in MariaDB — NOT created by crawler)
# ---------------------------------------------------------------------------
backend_metadata = MetaData()

season_table = Table(
    "SEASON",
    backend_metadata,
    Column("season_id", Integer, primary_key=True, autoincrement=True),
    Column("year", Integer, nullable=False, unique=True),
)

team_table = Table(
    "TEAM",
    backend_metadata,
    Column("team_id", Integer, primary_key=True, autoincrement=True),
    Column("team_name", String(100), nullable=False),
    Column("team_code", String(20), nullable=True),
    Column("manager_id", Integer, nullable=True),
)

player_table = Table(
    "PLAYER",
    backend_metadata,
    Column("player_id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, nullable=True),
    Column("player_name", String(100), nullable=False),
    Column("birth_date", Date, nullable=True),
    Column("position", String(20), nullable=True),
    Column("height", Integer, nullable=True),
    Column("weight", Integer, nullable=True),
    Column("school", String(200), nullable=True),
    Column("is_player", Boolean, nullable=True),
)

team_player_table = Table(
    "TEAM_PLAYER",
    backend_metadata,
    Column("tp_id", Integer, primary_key=True, autoincrement=True),
    Column("team_id", Integer, nullable=False),
    Column("player_id", Integer, nullable=False),
    Column("season_id", Integer, nullable=False),
    Column("jersey_number", Integer, nullable=True),
)

game_table = Table(
    "GAME",
    backend_metadata,
    Column("game_id", Integer, primary_key=True, autoincrement=True),
    Column("season_id", Integer, nullable=False),
    Column("game_date", Date, nullable=False),
    Column("game_number", Integer, nullable=True),
    Column("home_team", Integer, nullable=False),
    Column("away_team", Integer, nullable=False),
    Column("home_score", Integer, nullable=True),
    Column("away_score", Integer, nullable=True),
    Column("game_type", String(20), nullable=True),
    Column("csv_file_path", String(500), nullable=True),
)

batter_stats_table = Table(
    "BATTER_STATS",
    backend_metadata,
    Column("batter_stat_id", Integer, primary_key=True, autoincrement=True),
    Column("tp_id", Integer, nullable=False),
    Column("season_id", Integer, nullable=False),
    Column("season_type", String(20), nullable=True),
    Column("games_played", Integer, default=0),
    Column("plate_appearance", Integer, default=0),
    Column("at_bats", Integer, default=0),
    Column("hits", Integer, default=0),
    Column("doubles", Integer, default=0),
    Column("triples", Integer, default=0),
    Column("home_runs", Integer, default=0),
    Column("runs_batted_in", Integer, default=0),
    Column("stolen_bases", Integer, default=0),
    Column("walks", Integer, default=0),
    Column("strikeouts", Integer, default=0),
    Column("batting_average", Numeric(5, 3), nullable=True),
    Column("on_base_pct", Numeric(5, 3), nullable=True),
    Column("slugging_pct", Numeric(5, 3), nullable=True),
    Column("ops", Numeric(6, 3), nullable=True),
)

pitcher_stats_table = Table(
    "PITCHER_STATS",
    backend_metadata,
    Column("pitcher_stat_id", Integer, primary_key=True, autoincrement=True),
    Column("tp_id", Integer, nullable=False),
    Column("season_id", Integer, nullable=False),
    Column("season_type", String(20), nullable=True),
    Column("games_played", Integer, default=0),
    Column("games_started", Integer, default=0),
    Column("complete_games", Integer, default=0),
    Column("shutouts", Integer, default=0),
    Column("innings_pitched", Numeric(5, 1), default=0),
    Column("wins", Integer, default=0),
    Column("losses", Integer, default=0),
    Column("saves", Integer, default=0),
    Column("holds", Integer, default=0),
    Column("hits_allowed", Integer, default=0),
    Column("runs_allowed", Integer, default=0),
    Column("earned_runs", Integer, default=0),
    Column("home_runs_allow", Integer, default=0),
    Column("walks_allowed", Integer, default=0),
    Column("strikeouts", Integer, default=0),
    Column("hit_batters", Integer, default=0),
    Column("wild_pitches", Integer, default=0),
    Column("balks", Integer, default=0),
    Column("era", Numeric(5, 2), nullable=True),
    Column("whip", Numeric(5, 2), nullable=True),
    Column("k_per_9", Numeric(5, 2), nullable=True),
    Column("bb_per_9", Numeric(5, 2), nullable=True),
)

batter_game_log_table = Table(
    "BATTER_GAME_LOG",
    backend_metadata,
    Column("batter_gl_id", Integer, primary_key=True, autoincrement=True),
    Column("game_idx", Integer, nullable=False),
    Column("team_side", String(10), nullable=True),
    Column("team_idx", Integer, nullable=False),
    Column("player_idx", Integer, nullable=True),
    Column("batter_stat_id", Integer, nullable=False),
    Column("player_name", String(100), nullable=True),
    Column("player_position", String(10), nullable=True),
    Column("player_bats", Integer, nullable=True),
    Column("player_throws", Integer, nullable=True),
    Column("at_bats", Integer, nullable=True),
    Column("runs", Integer, nullable=True),
    Column("hits", Integer, nullable=True),
    Column("rbi", Integer, nullable=True),
    Column("walks", Integer, nullable=True),
    Column("strikeouts", Integer, nullable=True),
)

pitcher_game_log_table = Table(
    "PITCHER_GAME_LOG",
    backend_metadata,
    Column("pitcher_gl_id", Integer, primary_key=True, autoincrement=True),
    Column("game_idx", Integer, nullable=False),
    Column("team_side", String(10), nullable=True),
    Column("team_idx", Integer, nullable=False),
    Column("player_idx", Integer, nullable=True),
    Column("pitcher_stat_id", Integer, nullable=False),
    Column("player_name", String(100), nullable=True),
    Column("player_position", String(10), nullable=True),
    Column("player_bats", Integer, nullable=True),
    Column("player_throws", Integer, nullable=True),
    Column("innings_pitched", Numeric(5, 1), nullable=True),
    Column("hits_allowed", Integer, nullable=True),
    Column("runs_allowed", Integer, nullable=True),
    Column("earned_runs", Integer, nullable=True),
    Column("walks", Integer, nullable=True),
    Column("strikeouts", Integer, nullable=True),
)

# ---------------------------------------------------------------------------
# Crawler-internal tables (created by the crawler, not part of Spring Boot)
# ---------------------------------------------------------------------------
crawler_metadata = MetaData()

crawl_state_table = Table(
    "crawl_state",
    crawler_metadata,
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
    crawler_metadata,
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
    crawler_metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("year", Integer, nullable=True),
    Column("payload", JSON, nullable=True),
    Column("fetched_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)),
)

league_pitching_records_table = Table(
    "league_pitching_records",
    crawler_metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("year", Integer, nullable=True),
    Column("payload", JSON, nullable=True),
    Column("fetched_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)),
)

# Keep old table name references for backward compat with CsvStorage/JsonStorage imports
teams_table = team_table
players_table = player_table
matches_table = game_table
batting_stats_old_table = None  # removed
pitching_stats_old_table = None  # removed
roster_players_table = team_player_table

# ---------------------------------------------------------------------------
# Data classes (exported for CsvStorage / JsonStorage)
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Storage class — writes to Spring Boot MariaDB schema
# ---------------------------------------------------------------------------


class Storage:
    def __init__(self, database_url: str) -> None:
        self._engine = create_engine(database_url, pool_pre_ping=True, pool_recycle=3600)
        self._team_registry: dict[str, int] = {}

    def create_tables(self) -> None:
        """Create crawler-internal tables only; backend tables must already exist."""
        crawler_metadata.create_all(self._engine, checkfirst=True)

    def set_team_registry(self, registry: dict[str, int]) -> None:
        self._team_registry = registry

    # ── Roster ──────────────────────────────────────────────────────────

    def store_roster(self, entries: Iterable[RosterEntry], year: int | None) -> None:
        with self._engine.begin() as conn:
            season_id = self._resolve_season_id(conn, year) if year else None
            for entry in entries:
                team_id = self._upsert_team(conn, entry.team)
                for player in entry.players:
                    player_id = self._upsert_player(conn, player)
                    if team_id and player_id and season_id:
                        self._upsert_team_player(conn, team_id, player_id, season_id)

    # ── League Records (raw + structured) ──────────────────────────────

    def store_league_records(
        self,
        year: int | None,
        batting_payload: dict[str, Any],
        pitching_payload: dict[str, Any],
    ) -> None:
        now = datetime.now(timezone.utc)
        with self._engine.begin() as conn:
            # 1) Store raw payloads in crawler-internal tables
            self._delete_league_records(conn, year)
            conn.execute(
                league_batting_records_table.insert().values(
                    year=year, payload=batting_payload, fetched_at=now,
                )
            )
            conn.execute(
                league_pitching_records_table.insert().values(
                    year=year, payload=pitching_payload, fetched_at=now,
                )
            )
            # 2) Parse into BATTER_STATS / PITCHER_STATS
            if year is not None:
                season_id = self._resolve_season_id(conn, year)
                self._sync_batter_stats_from_records(conn, season_id, batting_payload)
                self._sync_pitcher_stats_from_records(conn, season_id, pitching_payload)

    def _sync_batter_stats_from_records(
        self, conn: Connection, season_id: int, payload: dict[str, Any],
    ) -> None:
        records = _extract_league_record_rows(payload)
        for rec in records:
            name = _strip_jersey_number(
                rec.get("mb_name") or rec.get("name") or rec.get("player_name") or rec.get("선수명") or ""
            )
            team_name = rec.get("club_name") or rec.get("team_name") or rec.get("팀명") or rec.get("team")
            if not name:
                continue
            tp_id = self._find_tp_id_by_name(conn, name, team_name, season_id)
            if tp_id is None:
                logger.debug("tp_id not found for batter %s / %s", name, team_name)
                continue
            # Upsert BATTER_STATS for this tp_id + season_id
            existing = conn.execute(
                select(batter_stats_table.c.batter_stat_id).where(
                    batter_stats_table.c.tp_id == tp_id,
                    batter_stats_table.c.season_id == season_id,
                )
            ).fetchone()
            values = {
                "games_played": _safe_int(rec, ["mygamecnt", "games", "경기", "G"]),
                "plate_appearance": _safe_int(rec, ["bats", "pa", "타석", "PA"]),
                "at_bats": _safe_int(rec, ["bat_cnt", "ab", "타수", "AB"]),
                "hits": _safe_int(rec, ["hit_cnt", "h", "안타", "H"]),
                "doubles": _safe_int(rec, ["twobase", "2b", "2B", "이루타"]),
                "triples": _safe_int(rec, ["threebase", "3b", "3B", "삼루타"]),
                "home_runs": _safe_int(rec, ["homerun", "hr", "홈런", "HR"]),
                "runs_batted_in": _safe_int(rec, ["bat_point", "rbi", "타점", "RBI"]),
                "stolen_bases": _safe_int(rec, ["steal", "sb", "도루", "SB"]),
                "walks": _safe_int(rec, ["fourball", "bb", "볼넷", "BB"]),
                "strikeouts": _safe_int(rec, ["strikeout", "so", "삼진", "SO", "K"]),
                "batting_average": _safe_decimal(rec, ["hit_rate", "avg", "타율", "AVG"]),
                "on_base_pct": _safe_decimal(rec, ["base_rate", "obp", "출루율", "OBP"]),
                "slugging_pct": _safe_decimal(rec, ["hitbase_rate", "slg", "장타율", "SLG"]),
                "ops": _safe_decimal(rec, ["ops", "OPS"]),
            }
            # Remove None values
            values = {k: v for k, v in values.items() if v is not None}
            if existing:
                if values:
                    conn.execute(
                        batter_stats_table.update()
                        .where(batter_stats_table.c.batter_stat_id == existing.batter_stat_id)
                        .values(**values)
                    )
            else:
                conn.execute(
                    batter_stats_table.insert().values(
                        tp_id=tp_id, season_id=season_id, **values,
                    )
                )

    def _sync_pitcher_stats_from_records(
        self, conn: Connection, season_id: int, payload: dict[str, Any],
    ) -> None:
        records = _extract_league_record_rows(payload)
        for rec in records:
            name = _strip_jersey_number(
                rec.get("mb_name") or rec.get("name") or rec.get("player_name") or rec.get("선수명") or ""
            )
            team_name = rec.get("club_name") or rec.get("team_name") or rec.get("팀명") or rec.get("team")
            if not name:
                continue
            tp_id = self._find_tp_id_by_name(conn, name, team_name, season_id)
            if tp_id is None:
                logger.debug("tp_id not found for pitcher %s / %s", name, team_name)
                continue
            existing = conn.execute(
                select(pitcher_stats_table.c.pitcher_stat_id).where(
                    pitcher_stats_table.c.tp_id == tp_id,
                    pitcher_stats_table.c.season_id == season_id,
                )
            ).fetchone()
            values = {
                "games_played": _safe_int(rec, ["mygamecnt", "games", "경기", "G"]),
                "games_started": _safe_int(rec, ["gs", "선발", "GS"]),
                "innings_pitched": _parse_innings_str(rec.get("inning")) or _safe_decimal(rec, ["ip", "이닝", "IP"]),
                "wins": _safe_int(rec, ["win", "w", "승", "W"]),
                "losses": _safe_int(rec, ["lose", "l", "패", "L"]),
                "saves": _safe_int(rec, ["save", "sv", "세", "SV"]),
                "holds": _safe_int(rec, ["hold", "hld", "홀", "HLD"]),
                "hits_allowed": _safe_int(rec, ["nohit", "h", "피안타", "H"]),
                "runs_allowed": _safe_int(rec, ["lost_point", "r", "실점", "R"]),
                "earned_runs": _safe_int(rec, ["self_point", "er", "자책", "ER"]),
                "home_runs_allow": _safe_int(rec, ["nohomerun", "hr", "피홈런", "HR"]),
                "walks_allowed": _safe_int(rec, ["fourball", "bb", "볼넷", "BB"]),
                "strikeouts": _safe_int(rec, ["strikeout", "so", "삼진", "SO", "K"]),
                "hit_batters": _safe_int(rec, ["deadball", "hbp", "사구", "HBP"]),
                "wild_pitches": _safe_int(rec, ["wildpitch", "wp", "폭투", "WP"]),
                "era": _safe_decimal(rec, ["def_rate", "era", "평균자책", "ERA"]),
                "whip": _safe_decimal(rec, ["whip", "WHIP"]),
                "k_per_9": _safe_decimal(rec, ["strikeout_rate", "k9", "K/9"]),
                "bb_per_9": _safe_decimal(rec, ["bb9", "BB/9"]),
            }
            values = {k: v for k, v in values.items() if v is not None}
            if existing:
                if values:
                    conn.execute(
                        pitcher_stats_table.update()
                        .where(pitcher_stats_table.c.pitcher_stat_id == existing.pitcher_stat_id)
                        .values(**values)
                    )
            else:
                conn.execute(
                    pitcher_stats_table.insert().values(
                        tp_id=tp_id, season_id=season_id, **values,
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

    # ── Boxscore ───────────────────────────────────────────────────────

    def get_existing_game_idx(self, year: int, group_code: str | None) -> set[int]:
        """Return Gameone game_idx values that are fully collected."""
        with self._engine.connect() as conn:
            season_id = self._find_season_id(conn, year)
            if season_id is None:
                return set()
            # game_number stores the Gameone game_idx
            query = select(
                game_table.c.game_id,
                game_table.c.game_number,
                game_table.c.home_score,
                game_table.c.away_score,
            ).where(
                game_table.c.season_id == season_id,
                game_table.c.game_number.isnot(None),
            )
            rows = conn.execute(query).fetchall()
            if not rows:
                return set()
            game_ids = [row.game_id for row in rows]
            batter_ids = {
                int(row[0])
                for row in conn.execute(
                    select(batter_game_log_table.c.game_idx).where(
                        batter_game_log_table.c.game_idx.in_(game_ids)
                    )
                ).fetchall()
            }
            pitcher_ids = {
                int(row[0])
                for row in conn.execute(
                    select(pitcher_game_log_table.c.game_idx).where(
                        pitcher_game_log_table.c.game_idx.in_(game_ids)
                    )
                ).fetchall()
            }
            complete: set[int] = set()
            for row in rows:
                has_batter = row.game_id in batter_ids
                has_pitcher = row.game_id in pitcher_ids
                is_forfeit_score = (
                    row.home_score is not None
                    and row.away_score is not None
                    and (
                        (int(row.home_score) == 7 and int(row.away_score) == 0)
                        or (int(row.home_score) == 0 and int(row.away_score) == 7)
                    )
                )
                if (has_batter and has_pitcher) or is_forfeit_score:
                    complete.add(int(row.game_number))
            return complete

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
                    {"event": "integrity_failed", "game_idx": game.game_idx, "errors": errors},
                    sort_keys=True,
                )
            )
            return
        with self._engine.begin() as conn:
            season_id = self._resolve_season_id(conn, year)
            home_team_id = self._find_team_id(conn, match_data.home_team)
            away_team_id = self._find_team_id(conn, match_data.away_team)
            if not home_team_id or not away_team_id:
                logger.warning("skipping game %s: team not found", game.game_idx)
                return
            game_id = self._upsert_game(
                conn, game, season_id, match_data, home_team_id, away_team_id,
            )
            self._store_batter_game_logs(
                conn, game_id, season_id, home_team_id, away_team_id, match_data,
            )
            self._store_pitcher_game_logs(
                conn, game_id, season_id, home_team_id, away_team_id, match_data,
            )

    def update_crawl_state(self, year: int, group_code: str | None, max_game_idx: int | None) -> None:
        now = datetime.now(timezone.utc)
        with self._engine.begin() as conn:
            query = select(crawl_state_table.c.id).where(crawl_state_table.c.year == year)
            if group_code is None:
                query = query.where(crawl_state_table.c.group_code.is_(None))
            else:
                query = query.where(crawl_state_table.c.group_code == group_code)
            row = conn.execute(query).fetchone()
            values = {
                "year": year,
                "group_code": group_code,
                "max_game_idx": max_game_idx,
                "last_synced_at": now,
                "updated_at": now,
            }
            if row:
                conn.execute(
                    crawl_state_table.update().where(crawl_state_table.c.id == row.id).values(values)
                )
            else:
                conn.execute(crawl_state_table.insert().values(values))

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
                    page_key=page_key, url=url, year=year,
                    params=params, payload=payload,
                    fetched_at=datetime.now(timezone.utc),
                )
            )

    # ── Internal: Season ───────────────────────────────────────────────

    def _resolve_season_id(self, conn: Connection, year: int) -> int:
        row = conn.execute(
            select(season_table.c.season_id).where(season_table.c.year == year)
        ).fetchone()
        if row:
            return int(row.season_id)
        result = conn.execute(season_table.insert().values(year=year))
        return int(result.inserted_primary_key[0])

    def _find_season_id(self, conn: Connection, year: int) -> int | None:
        row = conn.execute(
            select(season_table.c.season_id).where(season_table.c.year == year)
        ).fetchone()
        return int(row.season_id) if row else None

    # ── Internal: Team ─────────────────────────────────────────────────

    def _upsert_team(self, conn: Connection, team: TeamInfo | None) -> int | None:
        if team is None or (team.team_idx is None and not team.name):
            return None
        # Try to find by team_code (stores Gameone team_idx as string)
        if team.team_idx is not None:
            row = conn.execute(
                select(team_table.c.team_id).where(
                    team_table.c.team_code == str(team.team_idx)
                )
            ).fetchone()
            if row:
                return int(row.team_id)
        # Try to find by team_name
        if team.name:
            row = conn.execute(
                select(team_table.c.team_id).where(
                    team_table.c.team_name == team.name
                )
            ).fetchone()
            if row:
                # Update team_code if not set
                if team.team_idx is not None:
                    conn.execute(
                        team_table.update()
                        .where(team_table.c.team_id == row.team_id)
                        .values(team_code=str(team.team_idx))
                    )
                return int(row.team_id)
        # Insert new team
        result = conn.execute(
            team_table.insert().values(
                team_name=team.name or f"team_{team.team_idx}",
                team_code=str(team.team_idx) if team.team_idx is not None else team.code,
            )
        )
        return int(result.inserted_primary_key[0])

    def _find_team_id(self, conn: Connection, team: TeamInfo | None) -> int | None:
        if team is None:
            return None
        if team.team_idx is not None:
            row = conn.execute(
                select(team_table.c.team_id).where(
                    team_table.c.team_code == str(team.team_idx)
                )
            ).fetchone()
            if row:
                return int(row.team_id)
        if team.name:
            row = conn.execute(
                select(team_table.c.team_id).where(
                    team_table.c.team_name == team.name
                )
            ).fetchone()
            if row:
                return int(row.team_id)
        return None

    # ── Internal: Player ───────────────────────────────────────────────

    def _upsert_player(self, conn: Connection, player: PlayerInfo | None) -> int | None:
        if player is None or not player.name:
            return None
        clean_name = _strip_jersey_number(player.name)
        if not clean_name:
            return None
        # Find by name (players are matched by name since Gameone doesn't always provide IDs)
        row = conn.execute(
            select(player_table.c.player_id).where(
                player_table.c.player_name == clean_name
            )
        ).fetchone()
        if row:
            return int(row.player_id)
        result = conn.execute(
            player_table.insert().values(
                player_name=clean_name,
                position=player.position,
                is_player=True,
            )
        )
        return int(result.inserted_primary_key[0])

    def _find_player_id(
        self, conn: Connection, player: PlayerInfo | None, team_id: int | None,
    ) -> int | None:
        if player is None or not player.name:
            return None
        clean_name = _strip_jersey_number(player.name)
        if not clean_name:
            return None
        # Try to find by name + team via TEAM_PLAYER
        if team_id is not None:
            row = conn.execute(
                select(player_table.c.player_id)
                .select_from(
                    player_table.join(
                        team_player_table,
                        player_table.c.player_id == team_player_table.c.player_id,
                    )
                )
                .where(
                    player_table.c.player_name == clean_name,
                    team_player_table.c.team_id == team_id,
                )
            ).fetchone()
            if row:
                return int(row.player_id)
        # Fallback: by name only
        row = conn.execute(
            select(player_table.c.player_id).where(
                player_table.c.player_name == clean_name
            )
        ).fetchone()
        return int(row.player_id) if row else None

    # ── Internal: Team-Player (roster) ─────────────────────────────────

    def _upsert_team_player(
        self, conn: Connection, team_id: int, player_id: int, season_id: int,
    ) -> int:
        row = conn.execute(
            select(team_player_table.c.tp_id).where(
                team_player_table.c.team_id == team_id,
                team_player_table.c.player_id == player_id,
                team_player_table.c.season_id == season_id,
            )
        ).fetchone()
        if row:
            return int(row.tp_id)
        result = conn.execute(
            team_player_table.insert().values(
                team_id=team_id, player_id=player_id, season_id=season_id,
            )
        )
        return int(result.inserted_primary_key[0])

    def _find_tp_id_by_name(
        self, conn: Connection, player_name: str, team_name: str | None, season_id: int,
    ) -> int | None:
        """Find TEAM_PLAYER.tp_id by player name + team name + season."""
        query = (
            select(team_player_table.c.tp_id)
            .select_from(
                team_player_table
                .join(player_table, team_player_table.c.player_id == player_table.c.player_id)
                .join(team_table, team_player_table.c.team_id == team_table.c.team_id)
            )
            .where(
                player_table.c.player_name == player_name,
                team_player_table.c.season_id == season_id,
            )
        )
        if team_name:
            query = query.where(team_table.c.team_name == team_name)
        row = conn.execute(query).fetchone()
        return int(row.tp_id) if row else None

    # ── Internal: Game ─────────────────────────────────────────────────

    def _upsert_game(
        self,
        conn: Connection,
        game: GameSummary,
        season_id: int,
        match_data: MatchPayload,
        home_team_id: int,
        away_team_id: int,
    ) -> int:
        # game_number stores Gameone game_idx for dedup
        row = conn.execute(
            select(game_table.c.game_id).where(
                game_table.c.season_id == season_id,
                game_table.c.game_number == game.game_idx,
            )
        ).fetchone()
        values = {
            "season_id": season_id,
            "game_number": game.game_idx,
            "game_date": datetime.now(timezone.utc).date(),  # TODO: extract from payload
            "home_team": home_team_id,
            "away_team": away_team_id,
            "home_score": match_data.home_runs,
            "away_score": match_data.away_runs,
            "game_type": _normalize_game_type(game.phase),
        }
        if row:
            conn.execute(
                game_table.update().where(game_table.c.game_id == row.game_id).values(**values)
            )
            return int(row.game_id)
        result = conn.execute(game_table.insert().values(**values))
        return int(result.inserted_primary_key[0])

    # ── Internal: Batter Game Log ──────────────────────────────────────

    def _store_batter_game_logs(
        self,
        conn: Connection,
        game_id: int,
        season_id: int,
        home_team_id: int,
        away_team_id: int,
        match_data: MatchPayload,
    ) -> None:
        if match_data.batting_stats is None:
            return
        for entry in match_data.batting_stats:
            team_id = _team_id_for_side(entry.team_side, home_team_id, away_team_id)
            if not team_id:
                continue
            player_id = self._find_player_id(conn, entry.player, team_id)
            # Ensure TEAM_PLAYER + BATTER_STATS exist
            batter_stat_id = self._ensure_batter_stat(
                conn, team_id, player_id, season_id, entry.player,
            )
            if batter_stat_id is None:
                logger.warning(
                    "skipping batter log: cannot create stat for %s",
                    entry.player.name if entry.player else "unknown",
                )
                continue
            conn.execute(
                batter_game_log_table.insert().values(
                    game_idx=game_id,
                    team_side=entry.team_side,
                    team_idx=team_id,
                    player_idx=player_id,
                    batter_stat_id=batter_stat_id,
                    player_name=entry.player.name if entry.player else None,
                    player_position=entry.player.position if entry.player else None,
                    at_bats=entry.at_bats,
                    runs=entry.runs,
                    hits=entry.hits,
                    rbi=entry.rbi,
                    walks=entry.walks,
                    strikeouts=entry.strikeouts,
                )
            )

    def _store_pitcher_game_logs(
        self,
        conn: Connection,
        game_id: int,
        season_id: int,
        home_team_id: int,
        away_team_id: int,
        match_data: MatchPayload,
    ) -> None:
        if match_data.pitching_stats is None:
            return
        for entry in match_data.pitching_stats:
            team_id = _team_id_for_side(entry.team_side, home_team_id, away_team_id)
            if not team_id:
                continue
            player_id = self._find_player_id(conn, entry.player, team_id)
            pitcher_stat_id = self._ensure_pitcher_stat(
                conn, team_id, player_id, season_id, entry.player,
            )
            if pitcher_stat_id is None:
                logger.warning(
                    "skipping pitcher log: cannot create stat for %s",
                    entry.player.name if entry.player else "unknown",
                )
                continue
            conn.execute(
                pitcher_game_log_table.insert().values(
                    game_idx=game_id,
                    team_side=entry.team_side,
                    team_idx=team_id,
                    player_idx=player_id,
                    pitcher_stat_id=pitcher_stat_id,
                    player_name=entry.player.name if entry.player else None,
                    player_position=entry.player.position if entry.player else None,
                    innings_pitched=entry.innings_pitched,
                    hits_allowed=entry.hits_allowed,
                    runs_allowed=entry.runs_allowed,
                    earned_runs=entry.earned_runs,
                    walks=entry.walks,
                    strikeouts=entry.strikeouts,
                )
            )

    def _ensure_batter_stat(
        self,
        conn: Connection,
        team_id: int,
        player_id: int | None,
        season_id: int,
        player: PlayerInfo | None,
    ) -> int | None:
        """Ensure BATTER_STATS record exists, creating player/team_player if needed."""
        if player_id is None and player and player.name:
            player_id = self._upsert_player(conn, player)
        if player_id is None:
            return None
        tp_id = self._upsert_team_player(conn, team_id, player_id, season_id)
        row = conn.execute(
            select(batter_stats_table.c.batter_stat_id).where(
                batter_stats_table.c.tp_id == tp_id,
                batter_stats_table.c.season_id == season_id,
            )
        ).fetchone()
        if row:
            return int(row.batter_stat_id)
        result = conn.execute(
            batter_stats_table.insert().values(tp_id=tp_id, season_id=season_id)
        )
        return int(result.inserted_primary_key[0])

    def _ensure_pitcher_stat(
        self,
        conn: Connection,
        team_id: int,
        player_id: int | None,
        season_id: int,
        player: PlayerInfo | None,
    ) -> int | None:
        """Ensure PITCHER_STATS record exists, creating player/team_player if needed."""
        if player_id is None and player and player.name:
            player_id = self._upsert_player(conn, player)
        if player_id is None:
            return None
        tp_id = self._upsert_team_player(conn, team_id, player_id, season_id)
        row = conn.execute(
            select(pitcher_stats_table.c.pitcher_stat_id).where(
                pitcher_stats_table.c.tp_id == tp_id,
                pitcher_stats_table.c.season_id == season_id,
            )
        ).fetchone()
        if row:
            return int(row.pitcher_stat_id)
        result = conn.execute(
            pitcher_stats_table.insert().values(tp_id=tp_id, season_id=season_id)
        )
        return int(result.inserted_primary_key[0])


# ---------------------------------------------------------------------------
# Payload extraction helpers (unchanged — used by CsvStorage/JsonStorage too)
# ---------------------------------------------------------------------------


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
    compact = re.sub(r"\s+", "", name).lower()
    return re.sub(r"[^0-9a-z가-힣]", "", compact)


def _extract_player_info(payload: dict[str, Any] | None) -> PlayerInfo | None:
    if not payload:
        return None
    player_idx = _first_int(payload, ["player_idx", "playerIdx", "player_id", "playerId", "id"])
    name = _first_string(payload, ["name", "player_name", "playerName"])
    position = _first_string(payload, ["position", "pos"])
    bats = _first_string(payload, ["bats", "bat"])
    throws = _first_string(payload, ["throws", "throw"])
    return PlayerInfo(
        player_idx=player_idx, name=name, position=position, bats=bats, throws=throws,
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
    deduped = _dedupe_batting_entries(entries)
    return deduped or None


def _extract_team_batting_entries(
    team_payload: dict[str, Any] | None, team_side: str,
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
    deduped = _dedupe_pitching_entries(entries)
    return deduped or None


def _extract_team_pitching_entries(
    team_payload: dict[str, Any] | None, team_side: str,
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


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------


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


def _normalize_game_type(phase: str | None) -> str | None:
    if phase is None:
        return None
    normalized = phase.strip().lower()
    if normalized == "result":
        return "REGULAR"
    if normalized == "playoff":
        return "PLAYOFF"
    return phase.upper()


def _is_final_status(status: str) -> bool:
    return status.lower() in FINAL_STATUSES


def _dedupe_batting_entries(entries: list[BattingEntry]) -> list[BattingEntry]:
    deduped: list[BattingEntry] = []
    seen: set[tuple[Any, ...]] = set()
    for entry in entries:
        player_name = _strip_jersey_number(entry.player.name) if entry.player and entry.player.name else None
        key = (
            entry.team_side,
            player_name,
            entry.player.position if entry.player else None,
            entry.at_bats,
            entry.runs,
            entry.hits,
            entry.rbi,
            entry.walks,
            entry.strikeouts,
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(entry)
    return deduped


def _dedupe_pitching_entries(entries: list[PitchingEntry]) -> list[PitchingEntry]:
    deduped: list[PitchingEntry] = []
    seen: set[tuple[Any, ...]] = set()
    for entry in entries:
        player_name = _strip_jersey_number(entry.player.name) if entry.player and entry.player.name else None
        key = (
            entry.team_side,
            player_name,
            entry.player.position if entry.player else None,
            entry.innings_pitched,
            entry.hits_allowed,
            entry.runs_allowed,
            entry.earned_runs,
            entry.walks,
            entry.strikeouts,
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(entry)
    return deduped


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


def _extract_league_record_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract player record rows from league record payload."""
    data = payload.get("data")
    if data is None:
        return []
    if isinstance(data, dict):
        records = data.get("records")
        if isinstance(records, list):
            return [r for r in records if isinstance(r, dict)]
    if isinstance(data, list):
        return [r for r in data if isinstance(r, dict)]
    return []


def _strip_jersey_number(name: str) -> str:
    """Strip jersey number suffix from player names, e.g. '김민혁(52)' → '김민혁', '김동혁 (91)' → '김동혁'."""
    if not name:
        return ""
    return re.sub(r"\s*[\(\（]\s*(?:\d{1,3})?\s*[\)\）]\s*$", "", name).strip()


def _parse_innings_str(value: Any) -> Decimal | None:
    """Parse Gameone inning strings like '22 ⅔' into Decimal(22.67)."""
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    # Handle fraction suffixes: ⅓ = .33, ⅔ = .67
    fraction_map = {"⅓": Decimal("0.3"), "⅔": Decimal("0.7"), "1/3": Decimal("0.3"), "2/3": Decimal("0.7")}
    for frac_str, frac_val in fraction_map.items():
        if frac_str in s:
            whole = s.replace(frac_str, "").strip()
            try:
                return Decimal(whole) + frac_val if whole else frac_val
            except Exception:
                return None
    try:
        return Decimal(s)
    except Exception:
        return None


def _safe_int(rec: dict[str, Any], keys: list[str]) -> int | None:
    for key in keys:
        val = rec.get(key)
        if val is None:
            continue
        try:
            return int(val)
        except (TypeError, ValueError):
            continue
    return None


def _safe_decimal(rec: dict[str, Any], keys: list[str]) -> Decimal | None:
    for key in keys:
        val = rec.get(key)
        if val is None:
            continue
        try:
            return Decimal(str(val))
        except Exception:
            continue
    return None
