"""CLI entrypoint for running the crawler sync."""
from __future__ import annotations

import argparse
import json
import logging
import os
from dataclasses import replace
from datetime import datetime, timezone

from crawler.api_client import ApiClient
from crawler.boxscore_fetcher import fetch_boxscore
from crawler.schedule_fetcher import GameSummary, fetch_schedule_games
from crawler.settings import Settings, load_settings
from crawler.storage import Storage
from crawler.storage_csv import CsvStorage

logger = logging.getLogger(__name__)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Sync AUBL boxscores into storage.")
    parser.add_argument("--from-year", type=int, help="Start year to sync (inclusive).")
    parser.add_argument("--to-year", type=int, help="End year to sync (inclusive).")
    parser.add_argument(
        "--group-code",
        action="append",
        default=None,
        help="Override group codes to sync (can be specified multiple times).",
    )
    parser.add_argument(
        "--output-csv",
        help="Directory to write CSV output instead of using the database.",
    )
    return parser


def _resolve_years(args: argparse.Namespace) -> tuple[int, int]:
    now_year = datetime.now(timezone.utc).year
    start = args.from_year if args.from_year is not None else now_year
    end = args.to_year if args.to_year is not None else start
    if end < start:
        raise ValueError("to-year cannot be earlier than from-year")
    return start, end


def _resolve_group_codes(settings: Settings, args: argparse.Namespace) -> tuple[str, ...]:
    if args.group_code is None:
        return settings.group_codes
    return tuple(code.strip() for code in args.group_code if code.strip())


def _validate_no_duplicate_games(games: list[GameSummary]) -> None:
    seen: set[int] = set()
    duplicates: set[int] = set()
    for game in games:
        if game.game_idx in seen:
            duplicates.add(game.game_idx)
        seen.add(game.game_idx)
    if duplicates:
        raise ValueError(f"duplicate game_idx values detected: {sorted(duplicates)}")


def run_sync() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = _build_parser()
    args = parser.parse_args()

    settings = load_settings()
    group_codes = _resolve_group_codes(settings, args)
    sync_settings = replace(settings, group_codes=group_codes)

    start_year, end_year = _resolve_years(args)

    if args.output_csv:
        storage = CsvStorage(args.output_csv)
    else:
        database_url = os.getenv("DATABASE_URL") or os.getenv("CRAWLER_DATABASE_URL", "")
        if not database_url:
            raise ValueError("DATABASE_URL or CRAWLER_DATABASE_URL must be set")
        storage = Storage(database_url)
    storage.create_tables()
    client = ApiClient(sync_settings)

    try:
        for year in range(start_year, end_year + 1):
            schedule_games = fetch_schedule_games(client, sync_settings, year)
            _validate_no_duplicate_games(schedule_games)

            for group_code in group_codes or (None,):
                group_games = [game for game in schedule_games if game.group_code == group_code]
                existing = storage.get_existing_game_idx(year, group_code)
                to_fetch = [game for game in group_games if game.game_idx not in existing]

                logger.info(
                    json.dumps(
                        {
                            "event": "diff_completed",
                            "year": year,
                            "group_code": group_code,
                            "existing_games": len(existing),
                            "games_to_fetch": len(to_fetch),
                        },
                        sort_keys=True,
                    )
                )

                for game in to_fetch:
                    payload = fetch_boxscore(client, sync_settings, game.game_idx)
                    storage.store_boxscore(game, year, payload)

                max_game_idx = max((game.game_idx for game in group_games), default=None)
                storage.update_crawl_state(year, group_code, max_game_idx)
    finally:
        client.close()


def main() -> None:
    run_sync()


if __name__ == "__main__":
    main()
