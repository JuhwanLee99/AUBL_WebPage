#!/usr/bin/env python3
"""Find potentially split team identities from generated import SQL.

This script reconstructs TEAM rows from SQL, tracks team usage in TEAM_PLAYER/GAME,
and outputs similar-name team pairs for manual review.
"""

from __future__ import annotations

import argparse
import csv
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path


PAT_CODE_INSERT = re.compile(
    r"INSERT INTO TEAM \(team_name, team_code\) SELECT '((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)' "
    r"FROM DUAL WHERE NOT EXISTS \(SELECT 1 FROM TEAM WHERE team_code = '((?:[^'\\]|\\.)*)'\);$"
)
PAT_NAME_INSERT = re.compile(
    r"INSERT INTO TEAM \(team_name, team_code\) SELECT '((?:[^'\\]|\\.)*)', NULL "
    r"FROM DUAL WHERE NOT EXISTS \(SELECT 1 FROM TEAM WHERE team_name = '((?:[^'\\]|\\.)*)'\);$"
)
PAT_SET_CODE = re.compile(
    r"SET (@[A-Za-z0-9_]+) = \(SELECT team_id FROM TEAM WHERE team_code = '((?:[^'\\]|\\.)*)'\);$"
)
PAT_SET_NAME = re.compile(
    r"SET (@[A-Za-z0-9_]+) = \(SELECT team_id FROM TEAM WHERE team_name = '((?:[^'\\]|\\.)*)' LIMIT 1\);$"
)
PAT_TEAM_PLAYER = re.compile(
    r"INSERT INTO TEAM_PLAYER \(team_id, player_id, season_id\) SELECT (@[A-Za-z0-9_]+), p\.player_id, @season_id "
    r"FROM PLAYER p WHERE p\.player_name = '((?:[^'\\]|\\.)*)'"
)
PAT_GAME = re.compile(
    r"INSERT INTO GAME \(season_id, game_date, game_number, home_team, away_team, home_score, away_score, game_type\) "
    r"SELECT @season_id, CURDATE\(\), (\d+), (@[A-Za-z0-9_]+|NULL), (@[A-Za-z0-9_]+|NULL),"
)


@dataclass(frozen=True)
class TeamRow:
    team_id: int
    team_name: str
    team_code: str | None
    normalized_name: str
    tp_rows: int
    game_side_rows: int


def _unesc(value: str) -> str:
    return value.replace("\\'", "'").replace("\\\\", "\\")


def _normalize_team_name(name: str) -> str:
    text = re.sub(r"\s+", "", name).lower()
    text = re.sub(r"[^0-9a-z가-힣]", "", text)
    # Soft normalization for common aliases.
    text = text.replace("대학교", "대")
    text = text.replace("야구동아리", "")
    text = text.replace("야구부", "")
    text = text.replace("baseballclub", "")
    return text


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def _split_statements(sql_path: Path) -> list[str]:
    statements: list[str] = []
    buf = ""
    with sql_path.open("r", encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if not line or line.startswith("--"):
                continue
            buf = (buf + " " + line).strip()
            if line.endswith(";"):
                statements.append(buf)
                buf = ""
    return statements


def _simulate(sql_path: Path) -> tuple[dict[int, TeamRow], Counter[int], Counter[int]]:
    statements = _split_statements(sql_path)

    next_team_id = 1
    team_by_id_raw: dict[int, dict[str, str | int | None]] = {}
    team_id_by_code: dict[str, int] = {}
    team_ids_by_name: dict[str, list[int]] = defaultdict(list)
    var_to_team_id: dict[str, int | None] = {}

    tp_counter: Counter[int] = Counter()
    game_side_counter: Counter[int] = Counter()

    def insert_team(name: str, code: str | None) -> int:
        nonlocal next_team_id
        team_id = next_team_id
        next_team_id += 1
        team_by_id_raw[team_id] = {"team_name": name, "team_code": code}
        if code is not None:
            team_id_by_code[code] = team_id
        team_ids_by_name[name].append(team_id)
        return team_id

    for stmt in statements:
        match = PAT_CODE_INSERT.match(stmt)
        if match:
            team_name, team_code, _ = (_unesc(v) for v in match.groups())
            if team_code not in team_id_by_code:
                insert_team(team_name, team_code)
            continue

        match = PAT_NAME_INSERT.match(stmt)
        if match:
            team_name, _ = (_unesc(v) for v in match.groups())
            if not team_ids_by_name.get(team_name):
                insert_team(team_name, None)
            continue

        match = PAT_SET_CODE.match(stmt)
        if match:
            var_name, team_code = (_unesc(v) for v in match.groups())
            var_to_team_id[var_name] = team_id_by_code.get(team_code)
            continue

        match = PAT_SET_NAME.match(stmt)
        if match:
            var_name, team_name = (_unesc(v) for v in match.groups())
            ids = team_ids_by_name.get(team_name, [])
            var_to_team_id[var_name] = ids[0] if ids else None
            continue

        match = PAT_TEAM_PLAYER.search(stmt)
        if match:
            var_name = _unesc(match.group(1))
            team_id = var_to_team_id.get(var_name)
            if team_id is not None:
                tp_counter[team_id] += 1
            continue

        match = PAT_GAME.search(stmt)
        if match:
            home_var = match.group(2)
            away_var = match.group(3)
            for var_name in (home_var, away_var):
                if var_name == "NULL":
                    continue
                team_id = var_to_team_id.get(var_name)
                if team_id is not None:
                    game_side_counter[team_id] += 1
            continue

    team_rows: dict[int, TeamRow] = {}
    for team_id, row in team_by_id_raw.items():
        team_name = str(row["team_name"])
        team_code = row["team_code"]
        team_rows[team_id] = TeamRow(
            team_id=team_id,
            team_name=team_name,
            team_code=str(team_code) if isinstance(team_code, str) else None,
            normalized_name=_normalize_team_name(team_name),
            tp_rows=tp_counter[team_id],
            game_side_rows=game_side_counter[team_id],
        )

    return team_rows, tp_counter, game_side_counter


def _is_candidate(left: TeamRow, right: TeamRow, min_ratio: float) -> tuple[bool, float, str]:
    ratio_name = _similarity(left.team_name, right.team_name)
    ratio_norm = _similarity(left.normalized_name, right.normalized_name)
    ratio = max(ratio_name, ratio_norm)

    exact_norm = left.normalized_name == right.normalized_name and left.normalized_name != ""
    contains_norm = (
        left.normalized_name in right.normalized_name or right.normalized_name in left.normalized_name
    ) and left.normalized_name != "" and right.normalized_name != ""

    if exact_norm:
        return True, ratio, "exact_norm"
    if contains_norm and ratio >= min_ratio - 0.1:
        return True, ratio, "contains_norm"
    if ratio >= min_ratio:
        return True, ratio, "fuzzy"
    return False, ratio, ""


def _build_candidates(team_rows: dict[int, TeamRow], min_ratio: float, include_all: bool) -> list[dict[str, str]]:
    rows = sorted(team_rows.values(), key=lambda r: r.team_id)
    out: list[dict[str, str]] = []
    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            left = rows[i]
            right = rows[j]
            # Default focus: at least one side has NULL code (likely split alias).
            if not include_all and left.team_code is not None and right.team_code is not None:
                continue
            ok, ratio, relation = _is_candidate(left, right, min_ratio=min_ratio)
            if not ok:
                continue
            out.append(
                {
                    "relation": relation,
                    "similarity": f"{ratio:.4f}",
                    "left_team_id": str(left.team_id),
                    "left_team_name": left.team_name,
                    "left_team_code": left.team_code or "",
                    "left_tp_rows": str(left.tp_rows),
                    "left_game_side_rows": str(left.game_side_rows),
                    "right_team_id": str(right.team_id),
                    "right_team_name": right.team_name,
                    "right_team_code": right.team_code or "",
                    "right_tp_rows": str(right.tp_rows),
                    "right_game_side_rows": str(right.game_side_rows),
                }
            )
    out.sort(
        key=lambda r: (
            0 if r["relation"] == "exact_norm" else 1,
            -float(r["similarity"]),
            -(int(r["left_tp_rows"]) + int(r["right_tp_rows"])),
        )
    )
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Find likely split team identities from import SQL.")
    parser.add_argument("sql_file", help="Path to import SQL file (e.g., import_2015_2025.sql)")
    parser.add_argument(
        "--output-csv",
        default="team_split_candidates.csv",
        help="Output CSV path",
    )
    parser.add_argument(
        "--min-ratio",
        type=float,
        default=0.72,
        help="Minimum string similarity ratio for fuzzy candidates (default: 0.72)",
    )
    parser.add_argument(
        "--include-all",
        action="store_true",
        help="Include candidate pairs where both sides have non-null team_code",
    )
    args = parser.parse_args()

    sql_path = Path(args.sql_file)
    out_path = Path(args.output_csv)
    if not out_path.is_absolute():
        out_path = (Path.cwd() / out_path).resolve()

    team_rows, _, _ = _simulate(sql_path)
    candidates = _build_candidates(team_rows, min_ratio=args.min_ratio, include_all=args.include_all)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "relation",
        "similarity",
        "left_team_id",
        "left_team_name",
        "left_team_code",
        "left_tp_rows",
        "left_game_side_rows",
        "right_team_id",
        "right_team_name",
        "right_team_code",
        "right_tp_rows",
        "right_game_side_rows",
    ]
    with out_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in candidates:
            writer.writerow(row)

    null_code_count = sum(1 for row in team_rows.values() if row.team_code is None)
    print(f"team_rows={len(team_rows)} null_code_teams={null_code_count}")
    print(f"candidate_pairs={len(candidates)}")
    print(f"output_csv={out_path}")


if __name__ == "__main__":
    main()
