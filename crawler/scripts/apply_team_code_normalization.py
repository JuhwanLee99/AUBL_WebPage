#!/usr/bin/env python3
"""Normalize TEAM inserts/setters in generated import SQL.

This script replaces team-name based TEAM/SET statements with team-code based
statements using a fixed normalization map.
"""

from __future__ import annotations

import argparse
import csv
import re
from dataclasses import dataclass
from pathlib import Path


PAT_NAME_INSERT = re.compile(
    r"^INSERT INTO TEAM \(team_name, team_code\) SELECT '((?:[^'\\]|\\.)*)', NULL "
    r"FROM DUAL WHERE NOT EXISTS \(SELECT 1 FROM TEAM WHERE team_name = '((?:[^'\\]|\\.)*)'\);$"
)
PAT_SET_NAME = re.compile(
    r"^SET (@[A-Za-z0-9_]+) = \(SELECT team_id FROM TEAM WHERE team_name = '((?:[^'\\]|\\.)*)' LIMIT 1\);$"
)


@dataclass(frozen=True)
class TeamRule:
    target_code: str
    target_name: str
    action: str
    note: str


TEAM_RULES: dict[str, TeamRule] = {
    # Merge to existing coded teams.
    "건국대서울 불소야구부": TeamRule("11866", "건국대(서울) 불소야구", "MERGE", "name variant"),
    "건국대(서울) 불소야구부": TeamRule("11866", "건국대(서울) 불소야구", "MERGE", "name variant"),
    "중앙대학교(서울) 랑데뷰": TeamRule("24016", "중앙대학교 랑데뷰", "MERGE", "name variant"),
    "한국산업기술대학교 WINNERS": TeamRule("6205", "한국공학대학교 WINNERS", "MERGE", "school rename variant"),
    "한성대학교 Power turtles": TeamRule("24010", "한성대학교 TURTLES", "MERGE", "name variant"),
    "한성대 TURTLES": TeamRule("24010", "한성대학교 TURTLES", "MERGE", "abbreviation variant"),
    "항공대 야구부": TeamRule("23593", "한국항공대 Astros", "MERGE", "alias variant"),
    "타키온즈": TeamRule("23969", "강남대학교 타키온즈", "MERGE", "alias variant"),
    # New codes where no reliable existing code exists.
    "건국대 글로컬 Panthers": TeamRule("90001", "건국대 글로컬 Panthers", "NEW_CODE", "no reliable coded candidate"),
    "서울과학기술대 HEROES": TeamRule("90002", "서울과학기술대 HEROES", "NEW_CODE", "no reliable coded candidate"),
    "KNSU 루나틱스": TeamRule("90003", "KNSU 루나틱스", "NEW_CODE", "canonical for KNSU variants"),
    "KNSU한국체대 야구동아리": TeamRule("90003", "KNSU 루나틱스", "MERGE", "merged into KNSU canonical"),
    "TEAM MAZOR": TeamRule("90004", "TEAM MAZOR", "NEW_CODE", "canonical for MAZOR variants"),
    "2024 AUBL 올스타전(ROOKIE-MAZOR)": TeamRule("90004", "TEAM MAZOR", "MERGE", "merged into MAZOR canonical"),
    "2024AUBL 올스타전 TEAM MAZOR": TeamRule("90004", "TEAM MAZOR", "MERGE", "merged into MAZOR canonical"),
    "TEAM WILSON": TeamRule("90005", "TEAM WILSON", "NEW_CODE", "canonical for WILSON variants"),
    "2024 AUBL 올스타전 TEAM WILSON": TeamRule("90005", "TEAM WILSON", "MERGE", "merged into WILSON canonical"),
    "2024 AUBL 올스타전(ROOKIE-WILSON)": TeamRule("90005", "TEAM WILSON", "MERGE", "merged into WILSON canonical"),
    "2025 AUBL 올스타 Team ENOUGH": TeamRule("90006", "2025 AUBL 올스타 Team ENOUGH", "NEW_CODE", "distinct all-star side"),
    "2025 AUBL 올스타전 Team AXEL": TeamRule("90007", "2025 AUBL 올스타전 Team AXEL", "NEW_CODE", "distinct all-star side"),
}


def _unesc(value: str) -> str:
    return value.replace("\\'", "'").replace("\\\\", "\\")


def _esc(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def _write_mapping_csv(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["source_team_name", "target_team_name", "target_team_code", "action", "note"])
        for source in sorted(TEAM_RULES):
            rule = TEAM_RULES[source]
            writer.writerow([source, rule.target_name, rule.target_code, rule.action, rule.note])


def normalize_sql(input_path: Path, output_path: Path) -> dict[str, int]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    insert_replaced = 0
    set_replaced = 0

    with input_path.open("r", encoding="utf-8") as src, output_path.open("w", encoding="utf-8") as out:
        for raw in src:
            line = raw.rstrip("\n")

            match = PAT_NAME_INSERT.match(line)
            if match:
                team_name = _unesc(match.group(1))
                rule = TEAM_RULES.get(team_name)
                if rule is not None:
                    out_line = (
                        "INSERT INTO TEAM (team_name, team_code) "
                        f"SELECT '{_esc(rule.target_name)}', '{_esc(rule.target_code)}' "
                        f"FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM TEAM WHERE team_code = '{_esc(rule.target_code)}');"
                    )
                    out.write(out_line + "\n")
                    insert_replaced += 1
                    continue

            match = PAT_SET_NAME.match(line)
            if match:
                var_name = match.group(1)
                team_name = _unesc(match.group(2))
                rule = TEAM_RULES.get(team_name)
                if rule is not None:
                    out_line = (
                        f"SET {var_name} = (SELECT team_id FROM TEAM WHERE team_code = '{_esc(rule.target_code)}');"
                    )
                    out.write(out_line + "\n")
                    set_replaced += 1
                    continue

            out.write(raw)

    return {
        "insert_replaced": insert_replaced,
        "set_replaced": set_replaced,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize team codes in import SQL.")
    parser.add_argument("input_sql", help="Input SQL file path")
    parser.add_argument("output_sql", help="Output SQL file path")
    parser.add_argument(
        "--mapping-csv",
        default="team_code_normalization_map.csv",
        help="Write applied mapping CSV to this path",
    )
    args = parser.parse_args()

    input_path = Path(args.input_sql).resolve()
    output_path = Path(args.output_sql).resolve()
    mapping_csv = Path(args.mapping_csv)
    if not mapping_csv.is_absolute():
        mapping_csv = (Path.cwd() / mapping_csv).resolve()

    stats = normalize_sql(input_path, output_path)
    _write_mapping_csv(mapping_csv)

    print(f"Input SQL:  {input_path}")
    print(f"Output SQL: {output_path}")
    print(f"Mapping:    {mapping_csv}")
    print(f"Replaced TEAM inserts: {stats['insert_replaced']}")
    print(f"Replaced TEAM SETs:    {stats['set_replaced']}")
    print(f"Rule count:            {len(TEAM_RULES)}")


if __name__ == "__main__":
    main()
