# Crawler

This folder contains the standalone crawler package, separated from the web frontend.

## Setup

1. Ensure Python 3.10+ is installed.
2. Install dependencies:

```bash
cd crawler
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Configuration

Copy the example environment file and fill in values:

```bash
cp config/.env.example config/.env
```

Fill in the Gameone API settings and rate limits in `config/.env`:

```bash
CRAWLER_BASE_URL=https://<gameone-base-url>
SCHEDULE_LIST_ENDPOINT=/schedule/list
BOXSCORE_ENDPOINT=/game/boxscore
LIG_IDX=972
GROUP_CODES= # 필요 시 쉼표로 구분된 group_code 입력
REQUESTS_PER_MINUTE=60
REQUEST_TIMEOUT_SECONDS=10
REQUEST_SLEEP_SECONDS=0
CRAWLER_USER_AGENT=AUBL-Crawler/1.0
```

The crawler also requires a PostgreSQL connection string via `DATABASE_URL` (or
`CRAWLER_DATABASE_URL`). For example:

```bash
export DATABASE_URL=postgresql://postgres:aubl@localhost:5432/aubl
```

If you need a quick local database with Docker:

```bash
docker run --name aubl-postgres -e POSTGRES_PASSWORD=aubl -e POSTGRES_DB=aubl \
  -p 5432:5432 -d postgres:15
```

## Usage

Run the crawler for a specific year range:

```bash
python -m crawler.cli --from-year 2024 --to-year 2024
```

Limit collection to specific group codes (repeatable):

```bash
python -m crawler.cli --from-year 2024 --to-year 2024 --group-code A --group-code B
```

## CSV quick checks (DB export)

The crawler currently stores to PostgreSQL only. For a quick local check, export
tables to CSV using `psql`:

```bash
psql "$DATABASE_URL" -c "\\copy matches TO 'matches.csv' CSV HEADER"
psql "$DATABASE_URL" -c "\\copy teams TO 'teams.csv' CSV HEADER"
psql "$DATABASE_URL" -c "\\copy players TO 'players.csv' CSV HEADER"
psql "$DATABASE_URL" -c "\\copy batting_stats TO 'batting_stats.csv' CSV HEADER"
psql "$DATABASE_URL" -c "\\copy pitching_stats TO 'pitching_stats.csv' CSV HEADER"
```

Import the package from `crawler/src` once you add crawler modules:

```python
from crawler import settings
```

You can extend `crawler/src/crawler` with additional modules as needed.
