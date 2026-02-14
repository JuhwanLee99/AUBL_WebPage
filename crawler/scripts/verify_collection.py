"""Validate season coverage from crawler JSONL output."""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any


def _load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(row, dict):
                rows.append(row)
    return rows


def _is_forfeit_score(home_runs: Any, away_runs: Any) -> bool:
    if not isinstance(home_runs, int) or not isinstance(away_runs, int):
        return False
    return (home_runs == 7 and away_runs == 0) or (home_runs == 0 and away_runs == 7)


def _match_key(year: Any, game_idx: Any) -> tuple[int, int] | None:
    if not isinstance(year, int) or not isinstance(game_idx, int):
        return None
    return (year, game_idx)


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify crawler coverage by season.")
    parser.add_argument(
        "--input-dir",
        default="out",
        help="Directory containing matches.jsonl/batting_stats.jsonl/pitching_stats.jsonl",
    )
    args = parser.parse_args()

    base = Path(args.input_dir)
    matches = _load_jsonl(base / "matches.jsonl")
    batting = _load_jsonl(base / "batting_stats.jsonl")
    pitching = _load_jsonl(base / "pitching_stats.jsonl")

    batting_games: set[tuple[int, int]] = set()
    pitching_games: set[tuple[int, int]] = set()
    for row in batting:
        key = _match_key(row.get("year"), row.get("game_idx"))
        if key is not None:
            batting_games.add(key)
    for row in pitching:
        key = _match_key(row.get("year"), row.get("game_idx"))
        if key is not None:
            pitching_games.add(key)

    seasons: dict[int, dict[str, Any]] = defaultdict(
        lambda: {
            "season": None,
            "regular_matches": 0,
            "playoff_matches": 0,
            "unknown_phase_matches": 0,
            "matches": 0,
            "strict_complete": 0,
            "strict_incomplete": 0,
            "forfeit_aware_complete": 0,
            "forfeit_aware_incomplete": 0,
            "incomplete_game_ids": [],
        }
    )

    for row in matches:
        key = _match_key(row.get("year"), row.get("game_idx"))
        if key is None:
            continue
        season, game_idx = key
        stat = seasons[season]
        stat["season"] = season
        stat["matches"] += 1
        phase = (row.get("phase") or "").strip().lower() if isinstance(row.get("phase"), str) else ""
        if phase == "result":
            stat["regular_matches"] += 1
        elif phase == "playoff":
            stat["playoff_matches"] += 1
        else:
            stat["unknown_phase_matches"] += 1

        has_batting = key in batting_games
        has_pitching = key in pitching_games
        strict_complete = has_batting and has_pitching
        forfeit_aware_complete = strict_complete or _is_forfeit_score(
            row.get("home_runs"),
            row.get("away_runs"),
        )

        if strict_complete:
            stat["strict_complete"] += 1
        else:
            stat["strict_incomplete"] += 1
        if forfeit_aware_complete:
            stat["forfeit_aware_complete"] += 1
        else:
            stat["forfeit_aware_incomplete"] += 1
            stat["incomplete_game_ids"].append(game_idx)

    rows = [seasons[season] for season in sorted(seasons)]
    print(json.dumps(rows, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
