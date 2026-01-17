"""Fetcher for league-wide batter and pitcher records."""
from __future__ import annotations

import html
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
) -> tuple[dict[str, Any], dict[str, Any]]:
    params: dict[str, Any] = {"lig_idx": settings.lig_idx}
    if year is not None:
        params["season"] = year
        params["year"] = year
    batting = _fetch_record_page(client, settings.batter_rank_page_path, params)
    pitching = _fetch_record_page(client, settings.pitcher_rank_page_path, params)
    return batting, pitching


def _fetch_record_page(
    client: WebClient,
    path: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    response = client.request("GET", path, params=params)
    html_text = response.text
    content_path = _find_record_content_path(html_text) or path
    content_path, content_params = _split_path_and_params(content_path, params)
    content_response = client.request("GET", content_path, params=content_params)
    content_html = content_response.text
    try:
        data = parse_html_json(content_html, "")
        payload = {"data": data, "raw_html": None, "parse_error": None}
    except ValueError as exc:
        table_payload = _parse_ranking_tables(content_html)
        if table_payload["records"]:
            payload = {"data": table_payload, "raw_html": None, "parse_error": None}
        else:
            payload = {"data": None, "raw_html": content_html, "parse_error": str(exc)}
    logger.info("league_record_fetched path=%s status=%s", path, content_response.status_code)
    return payload


def _find_record_content_path(html_text: str) -> str | None:
    match = re.search(r"<iframe[^>]+src=[\"'](?P<src>/league/record/content/[^\"']+)[\"']",
                      html_text, re.IGNORECASE)
    if not match:
        return None
    return html.unescape(match.group("src"))


def _split_path_and_params(path: str, params: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    parsed = urlsplit(path)
    query = parse_qs(parsed.query)
    merged = {**params}
    for key, values in query.items():
        if values:
            merged[key] = values[-1]
    return parsed.path or path, merged


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
