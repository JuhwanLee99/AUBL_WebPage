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
CRAWLER_DATA_SOURCE=api
CRAWLER_BASE_URL=https://<gameone-base-url>
CRAWLER_WEB_BASE_URL=
SCHEDULE_LIST_ENDPOINT=/schedule/list
BOXSCORE_ENDPOINT=/game/boxscore
SCHEDULE_PAGE_PATH=/schedule
BOXSCORE_PAGE_PATH=/game/boxscore
LEAGUE_PAGE_PATH=/league/
SCHEDULE_ALL_PAGE_PATH=/league/schedule/all
TEAM_RANK_PAGE_PATH=/league/record/rank
TEAM_OFFENSE_PAGE_PATH=/league/record/offense
TEAM_DEFENSE_PAGE_PATH=/league/record/defense
BATTER_RANK_PAGE_PATH=/league/record/batter
PITCHER_RANK_PAGE_PATH=/league/record/pitcher
ROSTER_PAGE_PATH=/league/state/regist
HTML_JSON_SCRIPT_ID=
LIG_IDX=972
GROUP_CODES= # 필요 시 쉼표로 구분된 group_code 입력
REQUESTS_PER_MINUTE=60
REQUEST_TIMEOUT_SECONDS=10
REQUEST_SLEEP_SECONDS=0
CRAWLER_USER_AGENT=AUBL-Crawler/1.0
CRAWLER_TLS_CIPHERS=
```

`CRAWLER_DATA_SOURCE`는 `api`(기본값) 또는 `web`을 사용할 수 있습니다. `web` 모드에서는
`CRAWLER_WEB_BASE_URL`(없으면 `CRAWLER_BASE_URL` fallback)을 사용해 HTML 페이지를
가져오고, `HTML_JSON_SCRIPT_ID`가 있다면 해당 `<script>` 태그의 JSON을 파싱합니다.
또한 기본적으로 리그 메인/일정/팀 랭킹/팀 공격·수비 랭킹/타자·투수 랭킹/선수 등록
페이지를 함께 수집합니다.

HTTPS 핸드셰이크에서 `DH_KEY_TOO_SMALL` 오류가 발생하면 `CRAWLER_TLS_CIPHERS`로
보안 레벨을 낮춘 ciphersuite를 지정할 수 있습니다 (예: `DEFAULT@SECLEVEL=1`).

`config/.env`를 다른 위치에서 읽으려면 `CRAWLER_ENV_FILE`을 설정하세요:

```bash
CRAWLER_ENV_FILE=./crawler/config/.env
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

Run the crawler without a database by writing JSONL output:

```bash
python -m crawler.cli --from-year 2024 --to-year 2024 --output-json ./out
```

Run the crawler using HTML scraping mode:

```bash
python -m crawler.cli --from-year 2024 --to-year 2024 --data-source web
```

Limit collection to specific group codes (repeatable):

```bash
python -m crawler.cli --from-year 2024 --to-year 2024 --group-code A --group-code B
```

## CSV quick checks (DB export)

The default storage is PostgreSQL, but `--output-json`/`--output-csv` allow local
files. For a quick local check, export tables to CSV using `psql`:

```bash
psql "$DATABASE_URL" -c "\\copy matches TO 'matches.csv' CSV HEADER"
psql "$DATABASE_URL" -c "\\copy teams TO 'teams.csv' CSV HEADER"
psql "$DATABASE_URL" -c "\\copy players TO 'players.csv' CSV HEADER"
psql "$DATABASE_URL" -c "\\copy batting_stats TO 'batting_stats.csv' CSV HEADER"
psql "$DATABASE_URL" -c "\\copy pitching_stats TO 'pitching_stats.csv' CSV HEADER"
```

## DB 없이 동작 확인하기 (API 응답 JSON 저장)

CLI는 `--output-json`/`--output-csv`로 DB 없이 실행할 수 있습니다. API 응답
구조를 빠르게 확인하려면 아래처럼 파이썬 스크립트로 스케줄/박스스코어를
가져와 JSON 파일로 저장할 수도 있습니다.

```bash
python - <<'PY'
from crawler.api_client import ApiClient
from crawler.boxscore_fetcher import fetch_boxscore
from crawler.schedule_fetcher import fetch_schedule_games
from crawler.settings import load_settings

settings = load_settings()
client = ApiClient(settings)
try:
    games = fetch_schedule_games(client, settings, 2024)
    print(f"fetched schedule games: {len(games)}")
    if games:
        sample = games[0]
        payload = fetch_boxscore(client, settings, sample.game_idx)
        with open("boxscore_sample.json", "w", encoding="utf-8") as f:
            f.write(__import__("json").dumps(payload, ensure_ascii=False, indent=2))
        print(f"saved sample boxscore: game_idx={sample.game_idx}")
finally:
    client.close()
PY
```

생성된 `boxscore_sample.json` 파일로 결과 구조를 확인할 수 있습니다.

Import the package from `crawler/src` once you add crawler modules:

```python
from crawler import settings
```

You can extend `crawler/src/crawler` with additional modules as needed.

### CSV 출력 모드

DB 대신 CSV 파일로 저장하려면 `--output-csv` 옵션을 사용하세요:

```bash
python -m crawler.cli --from-year 2024 --to-year 2024 --output-csv ./out
```
