# AUBL (Amateur University Baseball League) Web Project

대한민국 대학교 아마추어 야구 리그인 AUBL을 소개하고, 경기 데이터를 기반으로 승부를 예측하는 웹 플랫폼입니다.
더불어 **실시간 경기 기록(Scorekeeping) 및 중계용 오버레이 시스템**을 포함한 통합 야구 운영 기능을 제공합니다.

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

## 🧭 크롤러(Gameone) 세팅 및 실행

크롤러는 `crawler/` 디렉토리의 독립 패키지로 관리됩니다. 현재 구현은 **DB 저장소(MySQL) 필수**이며,
`DATABASE_URL`(또는 `CRAWLER_DATABASE_URL`)이 없으면 실행되지 않습니다.

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
BOXSCORE_PAGE_PATH=/game/boxscore
HTML_JSON_SCRIPT_ID=
LIG_IDX=972
GROUP_CODES= # 필요 시 쉼표로 구분된 group_code 입력
```

`CRAWLER_DATA_SOURCE`는 `api` 또는 `web`을 지정할 수 있습니다. `web` 모드에서는
`CRAWLER_WEB_BASE_URL`(없으면 `CRAWLER_BASE_URL` fallback)에서 HTML을 받아 JSON을 파싱합니다.
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

### 5) CSV로 임시 확인하기 (DB에서 추출)

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