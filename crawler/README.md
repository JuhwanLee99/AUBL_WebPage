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

The crawler expects PostgreSQL connection info and rate limit settings defined in `.env`.

## Usage

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
