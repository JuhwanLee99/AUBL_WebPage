# AUBL (Amateur University Baseball League) Web Project

대한민국 대학교 아마추어 야구 리그인 AUBL을 소개하고, 경기 데이터를 기반으로 승부를 예측하는 웹 플랫폼입니다.

## 📊 승부 예측 모델

본 프로젝트는 사회인 야구의 Low Data 특성을 고려하여 다음 모델들을 혼합하여 사용합니다.

Elo Rating System: 팀 기본 전력 평가

Bradley-Terry Model: 상대 전적 반영

Logistic Regression: 환경 변수(구장, 날씨 등) 반영

## 🛠 기술 스택

Build Tool: Vite

Framework: React

Language: JavaScript (ES6+)

Styling: CSS Modules / Global CSS

Routing: React Router v6

## 🚀 시작하기 (Getting Started)

이 프로젝트를 로컬 환경에서 실행하려면 다음 절차를 따르십시오.

1. 설치 (Installation)

프로젝트 루트 디렉토리에서 의존성 패키지를 설치합니다.

```bash
npm install
```

2. 실행 (Development)

개발 서버를 실행합니다.

```bash
npm run dev
```

브라우저에서 http://localhost:5173 (포트는 변경될 수 있음)으로 접속하여 확인합니다.

## 🧭 크롤러(Gameone) 세팅 및 실행

크롤러는 `crawler/` 디렉토리의 독립 패키지로 관리됩니다. 현재 구현은 **DB 저장소(PostgreSQL) 필수**이며, `DATABASE_URL`(또는 `CRAWLER_DATABASE_URL`)이 없으면 실행되지 않습니다.

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
SCHEDULE_PAGE_PATH=/schedule
BOXSCORE_PAGE_PATH=/game/boxscore
HTML_JSON_SCRIPT_ID=
LIG_IDX=972
GROUP_CODES= # 필요 시 쉼표로 구분된 group_code 입력
```

`CRAWLER_DATA_SOURCE`는 `api` 또는 `web`을 지정할 수 있습니다. `web` 모드에서는
`CRAWLER_WEB_BASE_URL`(없으면 `CRAWLER_BASE_URL` fallback)에서 HTML을 받아 JSON을 파싱합니다.

`config/.env`를 다른 위치에서 읽으려면 `CRAWLER_ENV_FILE`을 설정하세요:

```bash
CRAWLER_ENV_FILE=./crawler/config/.env
```

### 3) 로컬 DB 준비 및 연결 문자열 설정

PostgreSQL이 필요합니다. 로컬에 준비되어 있지 않다면 Docker로 임시 실행할 수 있습니다.

```bash
docker run --name aubl-postgres -e POSTGRES_PASSWORD=aubl -e POSTGRES_DB=aubl \
  -p 5432:5432 -d postgres:15
```

DB 연결 문자열을 환경변수로 설정합니다.

```bash
export DATABASE_URL=postgresql://postgres:aubl@localhost:5432/aubl
```

### 4) 크롤러 실행

```bash
python -m crawler.cli --from-year 2024 --to-year 2024
```

DB 없이 JSONL 파일로 저장하려면:

```bash
python -m crawler.cli --from-year 2024 --to-year 2024 --output-json ./out
```

HTML 페이지 스크래핑 모드로 실행하려면:

```bash
python -m crawler.cli --from-year 2024 --to-year 2024 --data-source web
```

필요하면 그룹 코드만 수집하도록 `--group-code` 옵션을 여러 번 사용할 수 있습니다.

```bash
python -m crawler.cli --from-year 2024 --to-year 2024 --group-code A --group-code B
```

### 5) CSV로 임시 확인하기 (DB에서 추출)

기본 저장소는 DB이지만 `--output-json` 또는 `--output-csv`로 로컬 파일 출력도 가능합니다. DB에서
빠르게 확인하려면 PostgreSQL에서 CSV로 내보낼 수 있습니다.

```bash
psql "$DATABASE_URL" -c "\\copy matches TO 'matches.csv' CSV HEADER"
psql "$DATABASE_URL" -c "\\copy teams TO 'teams.csv' CSV HEADER"
psql "$DATABASE_URL" -c "\\copy players TO 'players.csv' CSV HEADER"
psql "$DATABASE_URL" -c "\\copy batting_stats TO 'batting_stats.csv' CSV HEADER"
psql "$DATABASE_URL" -c "\\copy pitching_stats TO 'pitching_stats.csv' CSV HEADER"
```

## 📂 페이지 구성

/: 랜딩 페이지 (리그 뉴스, 공지)

/league: AUBL 리그 소개

/group: 조 별 팀 현황 및 데이터

/team: 개별 팀 소개 및 로스터

/progress: 리그 진행 상황 및 순위표

/prediction: Elo Rating 및 Bradley-Terry 모델 기반 승부 예측

```bash
aubl-web-platform/
├── public/
│   ├── assets/                # 정적 이미지 (팀 로고, 배너 등)
│   └── vite.svg
│
├── src/
│   ├── app/                   # 앱의 전역 설정
│   │   ├── App.tsx            # 메인 진입점
│   │   ├── router.tsx         # React Router v7 설정
│   │   └── layout.tsx         # 전역 레이아웃 (Header, Footer)
│   │
│   ├── features/              # 핵심 기능별 모듈 (비즈니스 로직의 중심)
│   │   ├── league/            # 리그 소개, 규정
│   │   ├── teams/             # 팀 프로필, 로스터, 검색
│   │   ├── matches/           # 경기 일정, 스코어보드
│   │   ├── rankings/          # Elo/BT 알고리즘 및 순위 관련
│   │   │   ├── components/    # 순위표 UI
│   │   │   ├── utils/         # Elo, Bradley–Terry 계산 엔진
│   │   │   └── types.ts       # 랭킹 타입 정의
│   │   └── prediction/        # 승부예측 시스템
│   │
│   ├── shared/                # 공용 리소스 모음
│   │   ├── ui/                # 재사용 UI 컴포넌트 (Button, Card 등)
│   │   ├── lib/               # 외부 라이브러리 설정 (axios, queryClient)
│   │   └── types/             # 전역 도메인 타입(AUBL 모델)
│   │
│   ├── main.tsx
│   └── index.css              # Tailwind CSS 지시어
│
├── tailwind.config.js         # Tailwind 설정
├── tsconfig.json
└── vite.config.ts
```

© 2024 AUBL Project Team.
