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
SCHEDULE_PAGE_PATH=/league/schedule/all
SCHEDULE_RESULT_PAGE_PATH=/league/schedule/content/result
SCHEDULE_PLAYOFF_PAGE_PATH=/league/schedule/content/playoff
SCHEDULE_PAGE_LIMIT=200
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
일정은 `SCHEDULE_RESULT_PAGE_PATH`(정규시즌)와 `SCHEDULE_PLAYOFF_PAGE_PATH`(플레이오프)를
페이지 끝까지 순회해 `game_idx`를 수집합니다(`SCHEDULE_PAGE_LIMIT` 상한 적용).
수집 중 HTML에서 `group_code`, `part_code`, `page`를 자동 탐색해 조별/라운드별 분기까지 따라갑니다.
또한 기본적으로 리그 메인/일정/팀 랭킹/팀 공격·수비 랭킹/타자·투수 랭킹/선수 등록
페이지를 함께 수집합니다. JSON이 없는 리그 타자/투수 랭킹 페이지는 HTML 테이블을
직접 파싱해 레코드를 구성합니다.

HTTPS 핸드셰이크에서 `DH_KEY_TOO_SMALL` 오류가 발생하면 `CRAWLER_TLS_CIPHERS`로
보안 레벨을 낮춘 ciphersuite를 지정할 수 있습니다 (예: `DEFAULT:@SECLEVEL=1`).
값이 비어 있을 때 해당 오류가 발생하면 자동으로 `DEFAULT:@SECLEVEL=1`을 적용해
재시도합니다.

`config/.env`를 다른 위치에서 읽으려면 `CRAWLER_ENV_FILE`을 설정하세요:

```bash
CRAWLER_ENV_FILE=./crawler/config/.env
```

DB 모드 사용 시에는 MySQL 연결 문자열(`DATABASE_URL` 또는 `CRAWLER_DATABASE_URL`)이 필요합니다.
예시:

```bash
export DATABASE_URL=mysql+pymysql://root:aubl@localhost:3306/aubl
```

If you need a quick local database with Docker:

```bash
docker run --name aubl-mysql -e MYSQL_ROOT_PASSWORD=aubl -e MYSQL_DATABASE=aubl \
  -p 3306:3306 -d mysql:8
```

### Schema notes (MySQL)
- Added `roster_players` table with a `year` column for season-scoped rosters.
- `batting_stats` and `pitching_stats` now include a `year` column to filter by season without joining `matches`.
- Added `team_seasons` table to record which years each team roster was collected for.

## Usage

운영 데이터 처리 원칙:
- 실시간 경기 이벤트는 Firebase에서 처리하고, 경기 종료 후 크롤러 결과를 DB에 반영합니다.
- 박스스코어는 원본 수집값(점수/타격/투구)을 그대로 유지합니다.
- 기권/몰수 승패는 점수 강제변경 대신 `matches.jsonl`의 `reported_winner`로 관리합니다.

Run the crawler for a specific year range:

```bash
python -m crawler.cli --from-year 2024 --to-year 2024
```

Run the crawler without a database by writing JSONL output:

```bash
python -m crawler.cli --from-year 2024 --to-year 2024 --output-json ./out
```

수집 누락 검증(시즌별 경기/기록 커버리지)은 다음 스크립트로 확인할 수 있습니다:

```bash
python scripts/verify_collection.py --input-dir ./out
```
출력에는 `regular_matches`/`playoff_matches`도 포함되어 정규시즌·플레이오프 수집 건수를 바로 확인할 수 있습니다.

`./out`에는 다음 JSONL 파일들이 생성됩니다:

- `matches.jsonl`: 경기 기본 정보(스코어, 상태 등)
- `teams.jsonl`: 팀 마스터 데이터 (`year` 필드로 수집 연도 명시)
- `players.jsonl`: 선수 마스터 데이터
- `roster_players.jsonl`: 팀별 등록 선수 명단
- `batting_stats.jsonl`: 타격 스탯
- `pitching_stats.jsonl`: 투구 스탯
- `crawl_state.jsonl`: 크롤링 진행 상태
- `web_pages.jsonl`: 웹 스크래핑 페이지 원본/파싱 결과
- `league_batting_records.jsonl`: 리그 타자 기록(연도별)
- `league_pitching_records.jsonl`: 리그 투수 기록(연도별)

### Full-season workflow (2015~2025)

```bash
PYTHONPATH=src python -m crawler.cli \
  --from-year 2015 --to-year 2025 \
  --data-source web \
  --output-json /tmp/aubl_2015_2025_out
```

검증:

```bash
PYTHONPATH=src python scripts/verify_collection.py --input-dir /tmp/aubl_2015_2025_out
```

SQL 생성:

```bash
mkdir -p output/2015_2025
for y in $(seq 2015 2025); do
  PYTHONPATH=src python scripts/generate_sql_dump.py /tmp/aubl_2015_2025_out --year $y > output/2015_2025/import_${y}.sql
done

: > output/2015_2025/import_2015_2025.sql
for y in $(seq 2015 2025); do
  cat output/2015_2025/import_${y}.sql >> output/2015_2025/import_2015_2025.sql
  printf '\n\n' >> output/2015_2025/import_2015_2025.sql
done
```

산출물:
- `output/2015_2025/import_2015.sql` ~ `output/2015_2025/import_2025.sql`
- `output/2015_2025/import_2015_2025.sql`

`generate_sql_dump.py`는 `team_side(home/away)`를 우선 사용해 팀 매핑 품질을 보정합니다.

### Team-code normalization workflow (권장)

유사 팀명 분리 케이스를 검출하고, 가능한 경우 기존 코드로 통합합니다.
코드 후보가 없는 팀은 신규 코드(`90001`~`90007`)를 부여합니다.

후보 검출:

```bash
python scripts/find_team_split_candidates.py \
  output/2015_2025/import_2015_2025.sql \
  --output-csv output/2015_2025/team_split_candidates.csv
```

통합/신규코드 적용:

```bash
python scripts/apply_team_code_normalization.py \
  output/2015_2025/import_2015_2025.sql \
  output/2015_2025/import_2015_2025_team_normalized.sql \
  --mapping-csv output/2015_2025/team_code_normalization_map.csv
```

연도별 정규화 SQL 생성:

```bash
for y in $(seq 2015 2025); do
  python scripts/apply_team_code_normalization.py \
    output/2015_2025/import_${y}.sql \
    output/2015_2025/import_${y}_team_normalized.sql \
    --mapping-csv output/2015_2025/team_code_normalization_map.csv
done
```

정규화 결과물:
- `output/2015_2025/import_2015_2025_team_normalized.sql`
- `output/2015_2025/import_2015_team_normalized.sql` ~ `output/2015_2025/import_2025_team_normalized.sql`
- `output/2015_2025/team_code_normalization_map.csv`
- `output/2015_2025/team_split_candidates.csv`
- `output/2015_2025/team_split_review_sheet.csv`
- `output/2015_2025/team_split_decision_queue.csv`
- `output/2015_2025/team_normalization_yearly_report.csv`

적재 권장:
- 시즌 전체 적재 시 `import_2015_2025_team_normalized.sql` 사용
- 연도별 적재 시 `import_<YEAR>_team_normalized.sql` 사용

Run the crawler using HTML scraping mode:

```bash
python -m crawler.cli --from-year 2024 --to-year 2024 --data-source web
```

리그 타자/투수 기록은 동일 연도에 대해 중복 저장되지 않으며, DB 모드에서는
기존 연도 데이터를 덮어쓴 후 최신 데이터를 저장합니다.

Limit collection to specific group codes (repeatable):

```bash
python -m crawler.cli --from-year 2024 --to-year 2024 --group-code A --group-code B
```

## CSV quick checks (DB export)

The default storage is MySQL, but `--output-json`/`--output-csv` allow local
files. For a quick local check, export tables to CSV using the MySQL client:

```bash
mysql -uroot -paubl -h127.0.0.1 -e "SELECT * FROM matches" aubl > matches.csv
mysql -uroot -paubl -h127.0.0.1 -e "SELECT * FROM teams" aubl > teams.csv
mysql -uroot -paubl -h127.0.0.1 -e "SELECT * FROM players" aubl > players.csv
mysql -uroot -paubl -h127.0.0.1 -e "SELECT * FROM batting_stats" aubl > batting_stats.csv
mysql -uroot -paubl -h127.0.0.1 -e "SELECT * FROM pitching_stats" aubl > pitching_stats.csv
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
