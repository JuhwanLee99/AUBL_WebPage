"""Fetcher for league-wide batter and pitcher records."""
from __future__ import annotations

import html
import json
import logging
import re
from typing import Any
from urllib.parse import parse_qs, urlsplit

from crawler.html_parser import parse_html_json
from crawler.settings import Settings
from crawler.web_client import WebClient

logger = logging.getLogger(__name__)


def fetch_league_records(
    client: WebClient,
    settings: Settings,
    year: int | None,
    group_codes: tuple[str, ...] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    base_params: dict[str, Any] = {"lig_idx": settings.lig_idx}
    if year is not None:
        base_params["season"] = year
        base_params["year"] = year

    target_groups = _resolve_target_groups(group_codes)
    batting_payloads: list[dict[str, Any]] = []
    pitching_payloads: list[dict[str, Any]] = []

    for group_code in target_groups:
        params = dict(base_params)
        if group_code is not None:
            params["group_code"] = group_code
        batting_payloads.append(
            _fetch_record_page(client, settings.batter_rank_page_path, params)
        )
        pitching_payloads.append(
            _fetch_record_page(client, settings.pitcher_rank_page_path, params)
        )

    batting = _merge_record_payloads(batting_payloads)
    pitching = _merge_record_payloads(pitching_payloads)
    return batting, pitching


def _fetch_record_page(
    client: WebClient,
    path: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    response = client.request("GET", path, params=params)
    html_text = response.text
    content_path = _find_record_content_path(html_text) or path
    content_path, content_params = _split_path_and_params(content_path)
    # Caller params should win so we can override iframe defaults like group_code.
    content_params = {**content_params, **params}
    content_response = client.request("GET", content_path, params=content_params)
    content_html = content_response.text

    query_plan = _build_record_query_plan(content_params, content_html)
    payloads: list[dict[str, Any]] = []

    # Reuse first response when query params are identical.
    first_query_key = _params_key(content_params)
    for query in query_plan:
        if _params_key(query) == first_query_key:
            html_text = content_html
            status_code = content_response.status_code
        else:
            response = client.request("GET", content_path, params=query)
            html_text = response.text
            status_code = response.status_code
        payload = _parse_record_content(html_text)
        payloads.append(_with_record_context(payload, query))
        logger.info(
            "league_record_content_fetched path=%s status=%s group_code=%s part_code=%s",
            content_path,
            status_code,
            query.get("group_code"),
            query.get("part_code"),
        )

    merged = _merge_record_payloads(payloads)
    logger.info("league_record_fetched path=%s queries=%s", path, len(query_plan))
    return merged


def _params_key(params: dict[str, Any]) -> tuple[tuple[str, str], ...]:
    return tuple(sorted((str(k), str(v)) for k, v in params.items()))


def _build_record_query_plan(base_params: dict[str, Any], content_html: str) -> list[dict[str, Any]]:
    group_options = _extract_select_options(content_html, "group_code")
    part_options = [
        value
        for value in _extract_select_options(content_html, "part_code")
        if value not in {"", "-1"}
    ]
    selected_group = _extract_selected_option_value(content_html, "group_code")
    selected_part = _extract_selected_option_value(content_html, "part_code")

    default_group = str(base_params.get("group_code")) if base_params.get("group_code") is not None else None
    default_part = str(base_params.get("part_code")) if base_params.get("part_code") is not None else None

    if not selected_group:
        selected_group = default_group
    if not selected_part:
        selected_part = default_part
    if not default_group:
        default_group = selected_group
    if not default_part and selected_part:
        default_part = selected_part

    if not group_options:
        group_options = [selected_group] if selected_group else []

    plan: list[dict[str, Any]] = []
    seen: set[tuple[tuple[str, str], ...]] = set()

    def _append_query(group_code: str | None, part_code: str | None) -> None:
        query = dict(base_params)
        if group_code is not None:
            query["group_code"] = group_code
        if part_code is not None:
            query["part_code"] = part_code
        key = _params_key(query)
        if key in seen:
            return
        seen.add(key)
        plan.append(query)

    # Keep caller/default query first for compatibility.
    _append_query(default_group, default_part)

    for group_code in group_options:
        if selected_group and group_code == selected_group and part_options:
            for part_code in part_options:
                _append_query(group_code, part_code)
            continue

        fallback_part = selected_part if selected_part not in {"", "-1"} else "-1"
        _append_query(group_code, fallback_part)

    if not plan:
        plan.append(dict(base_params))
    return plan


def _extract_select_options(html_text: str, select_name: str) -> list[str]:
    select_pattern = re.compile(
        rf"<select[^>]+(?:name|id)=[\"']{re.escape(select_name)}[\"'][^>]*>(?P<body>.*?)</select>",
        re.IGNORECASE | re.DOTALL,
    )
    select_match = select_pattern.search(html_text)
    if not select_match:
        return []
    options: list[str] = []
    for match in re.finditer(
        r"<option[^>]*value=[\"'](?P<value>[^\"']*)[\"'][^>]*>",
        select_match.group("body"),
        re.IGNORECASE | re.DOTALL,
    ):
        value = html.unescape(match.group("value")).strip()
        if value:
            options.append(value)
    return options


def _extract_selected_option_value(html_text: str, select_name: str) -> str | None:
    select_pattern = re.compile(
        rf"<select[^>]+(?:name|id)=[\"']{re.escape(select_name)}[\"'][^>]*>(?P<body>.*?)</select>",
        re.IGNORECASE | re.DOTALL,
    )
    select_match = select_pattern.search(html_text)
    if not select_match:
        return None
    selected_match = re.search(
        r"<option[^>]*value=[\"'](?P<value>[^\"']*)[\"'][^>]*selected[^>]*>",
        select_match.group("body"),
        re.IGNORECASE | re.DOTALL,
    )
    if not selected_match:
        return None
    value = html.unescape(selected_match.group("value")).strip()
    return value if value else None


def _parse_record_content(content_html: str) -> dict[str, Any]:
    try:
        data = parse_html_json(content_html, "")
        return {"data": data, "raw_html": None, "parse_error": None}
    except ValueError as exc:
        table_payload = _parse_ranking_tables(content_html)
        if table_payload["records"]:
            return {"data": table_payload, "raw_html": None, "parse_error": None}
        return {"data": None, "raw_html": content_html, "parse_error": str(exc)}


def _with_record_context(payload: dict[str, Any], query: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data")
    group_code = query.get("group_code")
    part_code = query.get("part_code")
    if isinstance(data, dict):
        records = data.get("records")
        if isinstance(records, list):
            for record in records:
                if not isinstance(record, dict):
                    continue
                record.setdefault("group_code", group_code)
                record.setdefault("part_code", part_code)
                record.setdefault("league_code", group_code)
    elif isinstance(data, list):
        for record in data:
            if not isinstance(record, dict):
                continue
            record.setdefault("group_code", group_code)
            record.setdefault("part_code", part_code)
            record.setdefault("league_code", group_code)
    return payload


def _find_record_content_path(html_text: str) -> str | None:
    match = re.search(r"<iframe[^>]+src=[\"'](?P<src>/league/record/content/[^\"']+)[\"']",
                      html_text, re.IGNORECASE)
    if not match:
        return None
    return html.unescape(match.group("src"))


def _split_path_and_params(path: str) -> tuple[str, dict[str, Any]]:
    parsed = urlsplit(path)
    query = parse_qs(parsed.query)
    merged: dict[str, Any] = {}
    for key, values in query.items():
        if values:
            merged[key] = values[-1]
    return parsed.path or path, merged


def _resolve_target_groups(group_codes: tuple[str, ...] | None) -> tuple[str | None, ...]:
    if not group_codes:
        return (None,)
    deduped: list[str] = []
    seen: set[str] = set()
    for code in group_codes:
        normalized = str(code).strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return tuple(deduped) if deduped else (None,)


def _merge_record_payloads(payloads: list[dict[str, Any]]) -> dict[str, Any]:
    records: list[dict[str, Any]] = []
    tables: list[dict[str, Any]] = []
    seen_record_keys: set[tuple[Any, ...]] = set()
    first_raw_html: str | None = None
    parse_errors: list[str] = []

    for payload in payloads:
        if first_raw_html is None and isinstance(payload.get("raw_html"), str):
            first_raw_html = payload.get("raw_html")
        if payload.get("parse_error"):
            parse_errors.append(str(payload["parse_error"]))

        data = payload.get("data")
        if isinstance(data, dict):
            raw_records = data.get("records")
            if isinstance(raw_records, list):
                for rec in raw_records:
                    if not isinstance(rec, dict):
                        continue
                    rec_key = _record_identity(rec)
                    if rec_key in seen_record_keys:
                        continue
                    seen_record_keys.add(rec_key)
                    records.append(rec)
            raw_tables = data.get("tables")
            if isinstance(raw_tables, list):
                for table in raw_tables:
                    if isinstance(table, dict):
                        tables.append(table)
        elif isinstance(data, list):
            for rec in data:
                if not isinstance(rec, dict):
                    continue
                rec_key = _record_identity(rec)
                if rec_key in seen_record_keys:
                    continue
                seen_record_keys.add(rec_key)
                records.append(rec)

    merged_data: dict[str, Any] = {"records": records}
    if tables:
        merged_data["tables"] = tables

    return {
        "data": merged_data,
        "raw_html": None if records else first_raw_html,
        "parse_error": None if records else ("; ".join(parse_errors) if parse_errors else None),
    }


def _record_identity(record: dict[str, Any]) -> tuple[Any, ...]:
    name = (
        record.get("mb_name")
        or record.get("name")
        or record.get("player_name")
        or record.get("선수명")
        or ""
    )
    team = (
        record.get("club_name")
        or record.get("team_name")
        or record.get("team")
        or record.get("팀명")
        or ""
    )
    section = record.get("section") or ""
    group_code = record.get("group_code") or ""
    part_code = record.get("part_code") or ""
    if name and team:
        return (
            "name_team_section_group_part",
            str(name),
            str(team),
            str(section),
            str(group_code),
            str(part_code),
        )
    if name:
        return ("name_section_rank", str(name), str(section), str(record.get("rank") or ""))
    # Fallback for rows without stable identifiers.
    return (
        "row",
        tuple(
            (key, json.dumps(value, ensure_ascii=False, sort_keys=True, default=str))
            for key, value in sorted(record.items(), key=lambda item: item[0])
        ),
    )


def _parse_ranking_tables(html_text: str) -> dict[str, Any]:
    tables = _extract_ranking_tables(html_text)
    if not tables:
        return {"records": [], "tables": []}
    titles = _extract_section_titles(html_text)
    parsed_tables: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []
    for index, table_html in enumerate(tables):
        headers = _parse_table_headers(table_html)
        rows = _parse_table_rows(table_html, headers)
        title = titles[index] if index < len(titles) else None
        parsed_tables.append({"title": title, "headers": headers, "rows": rows})
        for row in rows:
            if title:
                row = {**row, "section": title}
            records.append(row)
    return {"records": records, "tables": parsed_tables}


def _extract_ranking_tables(html_text: str) -> list[str]:
    return [
        match.group(0)
        for match in re.finditer(
            r"<table class=[\"']ranking_table[^\"']*[\"'][^>]*>.*?</table>",
            html_text,
            re.IGNORECASE | re.DOTALL,
        )
    ]


def _extract_section_titles(html_text: str) -> list[str]:
    titles: list[str] = []
    for match in re.finditer(r"<h4[^>]*>(?P<title>.*?)</h4>", html_text, re.IGNORECASE | re.DOTALL):
        title = _strip_tags(match.group("title"))
        if title:
            titles.append(title)
    return titles


def _parse_table_headers(table_html: str) -> list[str]:
    header_match = re.search(r"<thead>.*?<tr>(?P<row>.*?)</tr>.*?</thead>",
                             table_html, re.IGNORECASE | re.DOTALL)
    if not header_match:
        return []
    headers: list[str] = []
    for index, match in enumerate(
        re.finditer(r"<th(?P<attrs>[^>]*)>(?P<content>.*?)</th>",
                    header_match.group("row"),
                    re.IGNORECASE | re.DOTALL)
    ):
        attrs = match.group("attrs") or ""
        sort_match = re.search(r"sort=[\"'](?P<sort>[^\"']+)[\"']", attrs, re.IGNORECASE)
        header_text = _strip_tags(match.group("content"))
        if sort_match:
            headers.append(sort_match.group("sort").strip())
        elif header_text == "랭킹" or (index == 0 and header_text):
            headers.append("rank")
        else:
            headers.append(header_text or f"column_{index + 1}")
    return headers


def _parse_table_rows(table_html: str, headers: list[str]) -> list[dict[str, Any]]:
    body_match = re.search(r"<tbody>(?P<body>.*?)</tbody>", table_html, re.IGNORECASE | re.DOTALL)
    if not body_match:
        return []
    rows: list[dict[str, Any]] = []
    for row_match in re.finditer(r"<tr[^>]*>(?P<row>.*?)</tr>",
                                 body_match.group("body"),
                                 re.IGNORECASE | re.DOTALL):
        cells = [
            _strip_tags(cell_match.group("content"))
            for cell_match in re.finditer(
                r"<(?:th|td)[^>]*>(?P<content>.*?)</(?:th|td)>",
                row_match.group("row"),
                re.IGNORECASE | re.DOTALL,
            )
        ]
        if not cells:
            continue
        row: dict[str, Any] = {}
        for index, value in enumerate(cells):
            key = headers[index] if index < len(headers) else f"column_{index + 1}"
            row[key] = _parse_cell_value(value)
        rows.append(row)
    return rows


def _strip_tags(raw: str) -> str:
    text = re.sub(r"<[^>]+>", "", raw)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _parse_cell_value(value: str) -> Any:
    if value == "" or value == "-":
        return None
    numeric = value.replace(",", "")
    try:
        return int(numeric)
    except ValueError:
        pass
    try:
        return float(numeric)
    except ValueError:
        return value
