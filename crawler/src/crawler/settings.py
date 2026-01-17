"""Configuration for the crawler package."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from dotenv import load_dotenv

logger = logging.getLogger(__name__)


def _load_dotenv() -> None:
    env_path = os.getenv("CRAWLER_ENV_FILE", "")
    if env_path:
        resolved = _resolve_env_path(env_path)
        if resolved:
            load_dotenv(resolved)
        else:
            logger.warning("CRAWLER_ENV_FILE not found: %s", env_path)
            load_dotenv()
        return
    resolved = _resolve_env_path("config/.env")
    if resolved:
        load_dotenv(resolved)
        return
    load_dotenv()


def _resolve_env_path(env_path: str) -> str | None:
    candidate = Path(env_path).expanduser()
    if candidate.exists():
        return str(candidate)
    for parent in Path(__file__).resolve().parents:
        for option in (parent / env_path, parent / "config/.env", parent / "crawler/config/.env"):
            if option.exists():
                return str(option)
    return None


@dataclass(frozen=True)
class Settings:
    data_source: str
    base_url: str
    web_base_url: str
    schedule_endpoint: str
    boxscore_endpoint: str
    schedule_page_path: str
    boxscore_page_path: str
    league_page_path: str
    schedule_all_page_path: str
    team_rank_page_path: str
    team_offense_page_path: str
    team_defense_page_path: str
    batter_rank_page_path: str
    pitcher_rank_page_path: str
    roster_page_path: str
    html_json_script_id: str
    lig_idx: int
    group_codes: tuple[str, ...]
    requests_per_minute: int
    request_timeout_seconds: float
    request_sleep_seconds: float
    user_agent: str
    tls_ciphers: str

    @property
    def min_interval_seconds(self) -> float:
        if self.requests_per_minute <= 0:
            return 0.0
        return 60.0 / self.requests_per_minute


def _parse_group_codes(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return ()
    return tuple(code.strip() for code in raw.split(",") if code.strip())


def load_settings() -> Settings:
    _load_dotenv()
    return Settings(
        data_source=os.getenv("CRAWLER_DATA_SOURCE", "api").lower(),
        base_url=os.getenv("CRAWLER_BASE_URL", "").rstrip("/"),
        web_base_url=os.getenv("CRAWLER_WEB_BASE_URL", "").rstrip("/"),
        schedule_endpoint=os.getenv("SCHEDULE_LIST_ENDPOINT", "/schedule/list"),
        boxscore_endpoint=os.getenv("BOXSCORE_ENDPOINT", "/game/boxscore"),
        schedule_page_path=os.getenv("SCHEDULE_PAGE_PATH", "/league/schedule/all"),
        boxscore_page_path=os.getenv("BOXSCORE_PAGE_PATH", "/league/schedule/content/boxscore"),
        league_page_path=os.getenv("LEAGUE_PAGE_PATH", "/league/"),
        schedule_all_page_path=os.getenv("SCHEDULE_ALL_PAGE_PATH", "/league/schedule/all"),
        team_rank_page_path=os.getenv("TEAM_RANK_PAGE_PATH", "/league/record/rank"),
        team_offense_page_path=os.getenv("TEAM_OFFENSE_PAGE_PATH", "/league/record/offense"),
        team_defense_page_path=os.getenv("TEAM_DEFENSE_PAGE_PATH", "/league/record/defense"),
        batter_rank_page_path=os.getenv("BATTER_RANK_PAGE_PATH", "/league/record/batter"),
        pitcher_rank_page_path=os.getenv("PITCHER_RANK_PAGE_PATH", "/league/record/pitcher"),
        roster_page_path=os.getenv("ROSTER_PAGE_PATH", "/league/state/regist"),
        html_json_script_id=os.getenv("HTML_JSON_SCRIPT_ID", ""),
        lig_idx=int(os.getenv("LIG_IDX", "972")),
        group_codes=_parse_group_codes(os.getenv("GROUP_CODES")),
        requests_per_minute=int(os.getenv("REQUESTS_PER_MINUTE", "60")),
        request_timeout_seconds=float(os.getenv("REQUEST_TIMEOUT_SECONDS", "10")),
        request_sleep_seconds=float(os.getenv("REQUEST_SLEEP_SECONDS", "0")),
        user_agent=os.getenv("CRAWLER_USER_AGENT", "AUBL-Crawler/1.0"),
        tls_ciphers=os.getenv("CRAWLER_TLS_CIPHERS", ""),
    )


def iter_group_codes(codes: Iterable[str]) -> Iterable[str | None]:
    yielded = False
    for code in codes:
        yielded = True
        yield code
    if not yielded:
        yield None
