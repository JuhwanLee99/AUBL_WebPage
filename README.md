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
