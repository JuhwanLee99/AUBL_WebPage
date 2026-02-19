# AUBL (Amateur University Baseball League) Web Project

대한민국 대학교 아마추어 야구 리그인 AUBL을 소개하고, 경기 데이터를 기반으로 승부를 예측하는 웹 플랫폼입니다.
더불어 **실시간 경기 기록(Scorekeeping) 및 중계용 오버레이 시스템**을 포함한 통합 야구 운영 기능을 제공합니다.

## 📚 사용 설명서

* 웹 버전: [`docs/web-user-manual.md`](docs/web-user-manual.md)
* 앱 버전: [`docs/app-user-manual.md`](docs/app-user-manual.md)

## 📊 승부 예측 모델

본 프로젝트는 사회인 야구의 Low Data 특성을 고려하여 다음 모델들을 혼합하여 사용합니다.

* **Elo Rating System:** 팀 기본 전력 평가
* **Bradley-Terry Model:** 상대 전적 반영
* **Logistic Regression:** 환경 변수(구장, 날씨 등) 반영

## ✨ 주요 기능 (Key Features)

기존 리그 정보 제공 외에 다음 기능들이 추가되었습니다.

1. **📝 전자 기록지 (Digital Scorekeeper)**

   * 실시간 볼카운트, 타격, 주루, 수비 실책 등 야구 경기 상황 입력 시스템
   * 입력 데이터 기반 실시간 스탯 자동 집계 및 CSV 기록지 추출
   * 다중 접속 충돌 방지를 위한 기록원 락(Lock) 시스템

2. **📺 방송용 라이브 오버레이 (Live Overlay)**

   * 경기 기록 데이터가 즉시 반영되는 중계 화면 송출용 페이지
   * 유튜브 라이브 영상과 스코어보드 결합 지원 및 모바일 수동 가로 모드 최적화

3. **🛡️ 관리 및 파이어베이스 연동**

   * Firebase Authentication을 통한 관리자/기록원 권한 관리
   * 리그 일정 및 경기 데이터 관리자 페이지

## 🧑‍✈️ 감독 권한 (Coach Role)

감독 권한은 팀 페이지를 직접 관리하기 위한 역할입니다. 관리자는 관리자 페이지에서 특정 계정에 감독 권한을 부여할 수 있습니다.

감독 권한 기능
* 팀 정보(소개/엠블럼/연혁) 편집
* 팀 공지 작성/삭제
* 팀원 명단 추가/삭제 및 기본 정보(등번호/포지션/투타) 수정

권한 부여 절차
1. 감독으로 지정할 계정이 먼저 로그인/회원가입을 완료해야 합니다. (users 컬렉션에 프로필이 생성됨)
2. `/admin/roles`에서 팀을 선택하고 감독 이메일을 입력한 뒤 권한을 부여합니다.
3. 감독 계정으로 로그인하면 해당 팀 페이지에서 관리 기능이 활성화됩니다.

관련 Firestore 컬렉션
* `users/{uid}`: 이메일 ↔ UID 매핑 및 프로필
* `roles/{uid}`: 감독 권한 매핑 (teamId, role)
* `teams/{teamId}`: 팀 정보(소개/엠블럼/연혁)
* `teams/{teamId}/members/{uid}`: 팀원 명단 및 상세 정보
* `teams/{teamId}/notices/{noticeId}`: 팀 공지

## 🛠 기술 스택

변경된 개발 환경을 반영한 기술 스택입니다.

* **Build Tool:** Vite
* **Framework:** React (v18)
* **Language:** TypeScript (v5)
* **Styling:** Tailwind CSS
* **Routing:** React Router v6
* **Infrastructure:** Firebase (Hosting, Firestore, Auth, Storage)

## 🚀 시작하기 (Getting Started)

이 프로젝트를 로컬 환경에서 실행하려면 다음 절차를 따르십시오.

### 1. 설치 (Installation)

프로젝트 루트 디렉토리에서 의존성 패키지를 설치합니다.

```bash
npm install
```

### 2. 환경 변수 설정 (Environment Setup)

프로젝트 루트에 `.env` 파일을 생성하고 Firebase 설정 및 API 키를 입력해야 합니다. (`.env.example` 참고)

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
...
```

### 3. 실행 (Development)

개발 서버를 실행합니다.

```bash
npm run dev
```

브라우저에서 `http://localhost:5173` (포트는 변경될 수 있음)으로 접속하여 확인합니다.

---

## 📱 Flutter 모바일 앱

`flutter_app/` 폴더에 Flutter 기반 크로스플랫폼 모바일 앱이 포함되어 있습니다.
네이티브 UI와 WebView를 결합한 하이브리드 아키텍처로, 핵심 화면은 Flutter 네이티브로 구현하고
기록원·관리자 패널 등 복잡한 웹 기능은 WebView로 연동합니다.

### 주요 기능

| 카테고리 | 기능 |
|----------|------|
| **홈 대시보드** | 실시간 경기 캐러셀, 오늘/내일 일정, 최근 결과, 소속팀 공지 |
| **팀 허브** | 41개 대학 팀 디렉토리, 그룹(A-H) 필터, 팀 상세·로스터·공지 |
| **일정 & 경기** | 전체/라이브/결과/조별/연습경기 탭, 실시간 BSO·주자 표시 |
| **기록실** | 시즌별 타자·투수 스탯 테이블 (AVG, ERA, WAR 등) |
| **순위** | Elo 기반 파워랭킹, 승률·전적 비교 |
| **커뮤니티** | 전체 공지(긴급/경기/징계/일반), 댓글 |
| **알림** | FCM 푸시 알림, 경기·공지·팀별 구독 설정 |
| **인증** | 네이티브 Google/Apple(iOS) 로그인 + WebView 토큰 브리지 동기화 |
| **관리자** | 기록원(Scorekeeper), 스코어보드, 일정 관리, 어드민 패널 (WebView) |

### 기술 스택

* **Flutter 3.4+** / Dart
* **Firebase** (Auth, Firestore, Cloud Messaging)
* **WebView** (`webview_flutter`) — 기록원·관리자 패널 연동
* **Material Design 3** 다크 테마

### 빠른 시작

```bash
cd flutter_app
flutter pub get
flutter run --dart-define-from-file=env/dev.json
```

자세한 아키텍처, 디렉토리 구조, 설정 방법은 [`flutter_app/README.md`](flutter_app/README.md)를 참고하세요.

출시 준비 문서:
* [`docs/release/mobile-release-checklist.md`](docs/release/mobile-release-checklist.md)
* [`docs/release/mobile-store-metadata.md`](docs/release/mobile-store-metadata.md)
* [`docs/release/mobile-data-disclosure-mapping.md`](docs/release/mobile-data-disclosure-mapping.md)

---

## 🧭 크롤러(Gameone) 세팅 및 실행

크롤러는 `crawler/` 디렉토리의 독립 패키지로 관리됩니다.

운영 원칙:
* 실시간 경기 데이터는 Firebase를 사용합니다.
* 경기 종료 후 시즌 집계/백필은 크롤러 결과(JSONL/SQL)를 백엔드 DB에 적재합니다.
* 박스스코어는 원본 수집값(점수/타격/투구)을 유지하고, 기권/몰수 결과는 `reported_winner`로 별도 표현합니다.

### 1) 파이썬 가상환경 및 의존성 설치

```bash
cd crawler
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

### 2) 환경변수 준비

```bash
cp config/.env.example config/.env
```

`config/.env` 파일에 Gameone API 설정을 채워 주세요.

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
HTML_JSON_SCRIPT_ID=
LIG_IDX=972
GROUP_CODES= # 필요 시 쉼표로 구분된 group_code 입력
```

`CRAWLER_DATA_SOURCE`는 `api` 또는 `web`을 지정할 수 있습니다. `web` 모드에서는
`CRAWLER_WEB_BASE_URL`(없으면 `CRAWLER_BASE_URL` fallback)에서 HTML을 받아 JSON을 파싱합니다.
일정은 `SCHEDULE_RESULT_PAGE_PATH`(정규시즌)와 `SCHEDULE_PLAYOFF_PAGE_PATH`(플레이오프)를
페이지네이션 끝까지 자동 순회해 `game_idx`를 수집합니다.
이때 `group_code`, `part_code`, `page`를 HTML에서 자동 탐색해 조별/라운드별 경기까지 수집합니다.
JSON이 없는 리그 타자/투수 랭킹 페이지는 HTML 테이블을 직접 파싱해 레코드를 구성합니다.

`config/.env`를 다른 위치에서 읽으려면 `CRAWLER_ENV_FILE`을 설정하세요:

```bash
CRAWLER_ENV_FILE=./crawler/config/.env
```

### 3) 로컬 DB 준비 및 연결 문자열 설정

MySQL 8이 필요합니다. 로컬에 준비되어 있지 않다면 Docker로 임시 실행할 수 있습니다.

```bash
docker run --name aubl-mysql -e MYSQL_ROOT_PASSWORD=aubl -e MYSQL_DATABASE=aubl \
  -p 3306:3306 -d mysql:8
```

DB 연결 문자열을 환경변수로 설정합니다.

```bash
export DATABASE_URL=mysql+pymysql://root:aubl@localhost:3306/aubl
```

### 4) 크롤러 실행

```bash
python -m crawler.cli --from-year 2024 --to-year 2024
```

DB 없이 JSONL 파일로 저장하려면:

```bash
python -m crawler.cli --from-year 2024 --to-year 2024 --output-json ./out
```

`./out`에는 다음 JSONL 파일들이 생성됩니다:

* `matches.jsonl`: 경기 기본 정보(스코어, 상태 등)
* `teams.jsonl`: 팀 마스터 데이터
* `players.jsonl`: 선수 마스터 데이터
* `roster_players.jsonl`: 팀별 등록 선수 명단
* `batting_stats.jsonl`: 타격 스탯
* `pitching_stats.jsonl`: 투구 스탯
* `crawl_state.jsonl`: 크롤링 진행 상태
* `web_pages.jsonl`: 웹 스크래핑 페이지 원본/파싱 결과
* `league_batting_records.jsonl`: 리그 타자 기록(연도별)
* `league_pitching_records.jsonl`: 리그 투수 기록(연도별)

HTML 페이지 스크래핑 모드로 실행하려면:

```bash
python -m crawler.cli --from-year 2024 --to-year 2024 --data-source web
```

리그 타자/투수 기록은 동일 연도에 대해 중복 저장되지 않으며, DB 모드에서는
기존 연도 데이터를 덮어쓴 후 최신 데이터를 저장합니다.

필요하면 그룹 코드만 수집하도록 `--group-code` 옵션을 여러 번 사용할 수 있습니다.

```bash
python -m crawler.cli --from-year 2024 --to-year 2024 --group-code A --group-code B
```

### 5) 2015~2025 전체 수집 + 검증 + SQL 생성

전체 시즌을 JSONL로 수집:

```bash
cd crawler
PYTHONPATH=src python -m crawler.cli \
  --from-year 2015 --to-year 2025 \
  --data-source web \
  --output-json /tmp/aubl_2015_2025_out
```

수집 커버리지 검증:

```bash
PYTHONPATH=src python scripts/verify_collection.py --input-dir /tmp/aubl_2015_2025_out
```

시즌별 SQL 및 통합 SQL 생성:

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

생성 파일:
* `crawler/output/2015_2025/import_2015.sql` ~ `crawler/output/2015_2025/import_2025.sql`
* `crawler/output/2015_2025/import_2015_2025.sql`
* `crawler/output/2015_2025/validation_report_2015_2025.json` (선택 생성 리포트)

팀명 유사/분리 케이스 검출 및 코드 정규화:

```bash
cd crawler
python scripts/find_team_split_candidates.py \
  output/2015_2025/import_2015_2025.sql \
  --output-csv output/2015_2025/team_split_candidates.csv

python scripts/apply_team_code_normalization.py \
  output/2015_2025/import_2015_2025.sql \
  output/2015_2025/import_2015_2025_team_normalized.sql \
  --mapping-csv output/2015_2025/team_code_normalization_map.csv
```

연도별 정규화 SQL 생성:

```bash
cd crawler
for y in $(seq 2015 2025); do
  python scripts/apply_team_code_normalization.py \
    output/2015_2025/import_${y}.sql \
    output/2015_2025/import_${y}_team_normalized.sql \
    --mapping-csv output/2015_2025/team_code_normalization_map.csv
done
```

정규화 산출물:
* `crawler/output/2015_2025/import_2015_2025_team_normalized.sql` (권장 적재본)
* `crawler/output/2015_2025/import_2015_team_normalized.sql` ~ `crawler/output/2015_2025/import_2025_team_normalized.sql`
* `crawler/output/2015_2025/team_code_normalization_map.csv`
* `crawler/output/2015_2025/team_normalization_yearly_report.csv`

정규화 규칙 요약:
* 유사 팀명은 가능한 기존 `team_code`로 통합합니다.
* 코드 후보가 없는 팀은 신규 코드(`90001`~`90007`)를 부여합니다.
* 정규화 결과 SQL 기준으로 `TEAM.team_code = NULL` 팀이 남지 않도록 관리합니다.

참고:
* `GAME.home_score/away_score`에는 원본 박스스코어 점수가 들어갑니다.
* 기권/몰수 승패 해석은 `matches.jsonl`의 `reported_winner`를 기준으로 처리합니다.
* `generate_sql_dump.py`는 `team_side(home/away)`를 우선 사용해 팀 매핑 오류를 줄이도록 보강되었습니다.

### 6) CSV로 임시 확인하기 (DB에서 추출)

기본 저장소는 DB이지만 `--output-json` 또는 `--output-csv`로 로컬 파일 출력도 가능합니다. DB에서
빠르게 확인하려면 MySQL에서 CSV로 내보낼 수 있습니다(권한이 필요할 수 있음).

```bash
mysql -uroot -paubl -h127.0.0.1 -e "SELECT * FROM matches" aubl > matches.csv
mysql -uroot -paubl -h127.0.0.1 -e "SELECT * FROM teams" aubl > teams.csv
mysql -uroot -paubl -h127.0.0.1 -e "SELECT * FROM players" aubl > players.csv
mysql -uroot -paubl -h127.0.0.1 -e "SELECT * FROM batting_stats" aubl > batting_stats.csv
mysql -uroot -paubl -h127.0.0.1 -e "SELECT * FROM pitching_stats" aubl > pitching_stats.csv
```

### MySQL 스키마 노트

* `roster_players` 테이블이 추가되었고 `year` 컬럼을 포함해 팀/선수를 연도별로 조회할 수 있습니다.
* `batting_stats`, `pitching_stats` 역시 `year` 컬럼을 포함해 시즌 단위 필터링이 쉬워졌습니다.
* MySQL 연결 문자열 예시: `mysql+pymysql://user:password@host:3306/aubl` (SQLAlchemy 사용)

---

## 📂 페이지 구성

주요 라우트 구조는 다음과 같습니다.

```bash
aubl-web-platform/
├── public/
├── src/
│   ├── app/                   # 앱 전역 설정 (Router, Layout)
│   ├── features/              # 기능 모듈 (League, Teams, Matches, Rankings 등)
│   ├── scoreboard/            # 스코어보드 및 라이브 오버레이 기능
│   ├── scorekeeper/           # 전자 기록지 및 기록원 페이지
│   ├── shared/                # 공용 UI, Firebase 클라이언트, 상태 관리(Store)
│   ├── main.tsx
│   └── index.css              # Tailwind CSS
└── ...
```

* `/`: 랜딩 페이지 (리그 뉴스, 공지)
* `/league`: AUBL 리그 소개
* `/group`: 조 별 팀 현황 및 데이터
* `/team`: 개별 팀 소개 및 로스터
* `/progress`: 리그 진행 상황 및 순위표
* `/prediction`: Elo Rating 기반 승부 예측
* `/scoreboard`: 실시간 중계용 스코어보드
* `/scorekeeper`: 경기 기록 입력 시스템 (권한 필요)

© 2026 AUBL Project Team.
