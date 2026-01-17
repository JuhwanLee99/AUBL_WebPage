"""Configuration for the crawler package."""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Iterable

from dotenv import load_dotenv


def _load_dotenv() -> None:
    env_path = os.getenv("CRAWLER_ENV_FILE", "")
    if env_path:
        load_dotenv(env_path)
    else:
        load_dotenv()


@dataclass(frozen=True)
class Settings:
    data_source: str
    base_url: str
    web_base_url: str
    schedule_endpoint: str
    boxscore_endpoint: str
    schedule_page_path: str
    boxscore_page_path: str
    html_json_script_id: str
    lig_idx: int
    group_codes: tuple[str, ...]
    requests_per_minute: int
    request_timeout_seconds: float
    request_sleep_seconds: float
    user_agent: str

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
        schedule_page_path=os.getenv("SCHEDULE_PAGE_PATH", "/schedule"),
        boxscore_page_path=os.getenv("BOXSCORE_PAGE_PATH", "/game/boxscore"),
        html_json_script_id=os.getenv("HTML_JSON_SCRIPT_ID", ""),
        lig_idx=int(os.getenv("LIG_IDX", "972")),
        group_codes=_parse_group_codes(os.getenv("GROUP_CODES")),
        requests_per_minute=int(os.getenv("REQUESTS_PER_MINUTE", "60")),
        request_timeout_seconds=float(os.getenv("REQUEST_TIMEOUT_SECONDS", "10")),
        request_sleep_seconds=float(os.getenv("REQUEST_SLEEP_SECONDS", "0")),
        user_agent=os.getenv("CRAWLER_USER_AGENT", "AUBL-Crawler/1.0"),
    )


def iter_group_codes(codes: Iterable[str]) -> Iterable[str | None]:
    yielded = False
    for code in codes:
        yielded = True
        yield code
    if not yielded:
        yield None
