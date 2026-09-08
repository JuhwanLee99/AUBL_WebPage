"""Pure, conservative eligibility and public projection for record authority changes."""
import hashlib
import json
import unicodedata


def _name(value):
    return " ".join(unicodedata.normalize("NFKC", str(value or "")).split())


def _pick(row, fields):
    if not isinstance(row, dict):
        raise ValueError("Malformed official record")
    return {key: row.get(key) for key in fields.split()}


def _count(value):
    return type(value) is int and value >= 0


def public_official_record(match, raw, expected_revision):
    """An AVAILABLE published final, never a schedule-only sync, authorizes cutover."""
    if (match.get("sourceProvider") != "UNIQUE_PLAY" or match.get("sourceActive") is False
            or match.get("recordMode") == "practice" or match.get("status") != "completed"):
        raise ValueError("Only a mapped, completed UniquePlay game can become official")
    if not isinstance(raw, dict) or not expected_revision:
        raise ValueError("Published revision required")
    if (raw.get("provider") != "UNIQUE_PLAY" or raw.get("status") != "AVAILABLE"
            or raw.get("sourceGameId") != match.get("sourceGameId")
            or type(raw.get("seasonId")) is not int or raw["seasonId"] <= 0
            or raw.get("seasonId") != match.get("seasonId")
            or raw.get("syncRevision") != expected_revision
            or raw.get("quality") not in ("CLEAN", "RESOLVED")):
        raise ValueError("Source identity, revision or official review is not confirmed")
    game = raw.get("game") or {}
    detail = raw.get("detail") or {}
    if (game.get("status") not in ("COMPLETED", "FINAL", "ENDED")
            or detail.get("status") != "AVAILABLE"
            or detail.get("sourceGameId") != raw["sourceGameId"]):
        raise ValueError("Final box score required")
    names = [_name(game.get(side + "TeamName")) for side in ("home", "away")]
    if not all(names) or len(set(names)) != 2:
        raise ValueError("Team identity is ambiguous")
    for side in ("home", "away"):
        if _name(match.get(side + "TeamName")) != _name(game.get(side + "TeamName")):
            raise ValueError("Team mapping needs administrator review")
        if not _count(game.get(side + "Score")):
            raise ValueError("Final scores required")
    teams = detail.get("teams")
    if not isinstance(teams, list) or len(teams) != 2 or sorted(_name(t.get("teamName")) for t in teams) != sorted(names):
        raise ValueError("Two uniquely mapped box-score teams required")
    projected_teams = []
    for team in teams:
        side = "home" if _name(team["teamName"]) == names[0] else "away"
        totals = _pick(team.get("totals"), "runs hits errors walks")
        if any(not _count(totals[key]) for key in ("runs", "hits", "errors")) or totals["runs"] != game[side + "Score"]:
            raise ValueError("Official team totals are incomplete or inconsistent")
        innings = [_pick(row, "inning runs notPlayed") for row in team.get("innings", [])]
        if not innings or len(innings) > 30:
            raise ValueError("Inning record required")
        seen = set()
        for inning in innings:
            number = inning["inning"]
            if not _count(number) or not 1 <= number <= 30 or number in seen:
                raise ValueError("Invalid or duplicated inning")
            seen.add(number)
            if inning["notPlayed"] is True:
                if inning["runs"] not in (None, 0):
                    raise ValueError("Unplayed inning cannot score")
            elif not _count(inning["runs"]):
                raise ValueError("Unknown inning runs")
        if sum(row["runs"] or 0 for row in innings) != totals["runs"]:
            raise ValueError("Line score and total disagree")
        batters, pitchers = [], []
        for row in team.get("batters", []):
            batter = _pick(row, "rowKey playerName jerseyNumber battingOrder position")
            batter["stats"] = _pick(row.get("stats"), "atBats hits rbi stolenBases runs battingAverage seasonBattingAverage")
            batter["plateAppearances"] = [_pick(pa, "inning result") for pa in row.get("plateAppearances", [])]
            batters.append(batter)
        for row in team.get("pitchers", []):
            pitcher = _pick(row, "rowKey playerName jerseyNumber decision")
            pitcher["stats"] = _pick(row.get("stats"), "outs inningsPitched hitsAllowed runsAllowed earnedRuns walksAndHitByPitch strikeouts era")
            pitchers.append(pitcher)
        projected_teams.append({"teamName": team["teamName"], "totals": totals, "innings": innings, "batters": batters, "pitchers": pitchers})
    # Explicit public contract: never copy worker evidence, cookies or arbitrary backend fields.
    result = _pick(raw, "sourceGameId backendGameId seasonId provider syncRevision capturedAt publishedAt status quality resolutionSource resolvedAt")
    result["issues"] = [_pick(issue, "id code message sourceGameId teamName field rowKey observed expected") for issue in raw.get("issues", [])]
    result["game"] = _pick(game, "status playedAt groupCode venue homeTeamName awayTeamName homeScore awayScore")
    result["detail"] = {**_pick(detail, "schemaVersion sourceGameId providerGameId status"), "teams": projected_teams}
    serialized = json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    if len(serialized) > 700000:
        raise ValueError("Official record exceeds snapshot limit")
    return result, hashlib.sha256(serialized).hexdigest()
