"""HTTP client helpers for web page scraping endpoints."""
from __future__ import annotations

import json
import logging
import ssl
import time
from dataclasses import dataclass
from typing import Any

import httpx
from tenacity import RetryCallState, retry, retry_if_exception, stop_after_attempt, wait_exponential

from crawler.settings import Settings

logger = logging.getLogger(__name__)
_DEFAULT_TLS_CIPHERS = "DEFAULT:@SECLEVEL=1"


@dataclass
class RequestOutcome:
    method: str
    url: str
    status_code: int | None
    duration_ms: int
    params: dict[str, Any] | None
    error: str | None


class WebClient:
    def __init__(self, settings: Settings) -> None:
        base_url = settings.web_base_url or settings.base_url
        self._settings = settings
        self._base_url = base_url or None
        self._tls_ciphers_override: str | None = None
        self._client = self._build_client()
        self._last_request_at: float | None = None

    @property
    def base_url(self) -> httpx.URL:
        return self._client.base_url

    def close(self) -> None:
        self._client.close()

    def _build_client(self) -> httpx.Client:
        tls_ciphers = (self._tls_ciphers_override or self._settings.tls_ciphers).strip()
        ssl_context = None
        if tls_ciphers:
            ssl_context = ssl.create_default_context()
            ssl_context.set_ciphers(tls_ciphers)
        return httpx.Client(
            base_url=self._base_url,
            timeout=self._settings.request_timeout_seconds,
            headers={"User-Agent": self._settings.user_agent},
            verify=ssl_context,
        )

    def _downgrade_tls_if_needed(self, exc: Exception) -> None:
        if self._tls_ciphers_override or self._settings.tls_ciphers.strip():
            return
        if "dh key too small" not in str(exc).lower():
            return
        logger.warning(
            "TLS handshake failed with DH_KEY_TOO_SMALL; retrying with weaker ciphers "
            "(%s). Configure CRAWLER_TLS_CIPHERS to override.",
            _DEFAULT_TLS_CIPHERS,
        )
        self._tls_ciphers_override = _DEFAULT_TLS_CIPHERS
        self._client.close()
        self._client = self._build_client()

    def _sleep_if_needed(self) -> None:
        min_interval = self._settings.min_interval_seconds
        sleep_seconds = self._settings.request_sleep_seconds
        if self._last_request_at is None:
            if sleep_seconds > 0:
                time.sleep(sleep_seconds)
            return
        elapsed = time.monotonic() - self._last_request_at
        wait_for = max(min_interval - elapsed, 0)
        total_sleep = wait_for + max(sleep_seconds, 0)
        if total_sleep > 0:
            time.sleep(total_sleep)

    def _log_outcome(self, outcome: RequestOutcome) -> None:
        payload = {
            "event": "request_completed",
            "method": outcome.method,
            "url": outcome.url,
            "status_code": outcome.status_code,
            "duration_ms": outcome.duration_ms,
            "params": outcome.params,
            "error": outcome.error,
        }
        logger.info(json.dumps(payload, sort_keys=True))

    @retry(
        retry=retry_if_exception(lambda exc: WebClient._is_retryable(exc)),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        stop=stop_after_attempt(5),
        reraise=True,
        before_sleep=lambda retry_state: WebClient._retry_before_sleep(retry_state),
    )
    def request(self, method: str, url: str, params: dict[str, Any] | None = None) -> httpx.Response:
        self._sleep_if_needed()
        start = time.monotonic()
        status_code = None
        error = None
        try:
            response = self._client.request(method, url, params=params)
            status_code = response.status_code
            response.raise_for_status()
            return response
        except Exception as exc:  # noqa: BLE001
            error = str(exc)
            self._downgrade_tls_if_needed(exc)
            raise
        finally:
            duration_ms = int((time.monotonic() - start) * 1000)
            self._last_request_at = time.monotonic()
            self._log_outcome(
                RequestOutcome(
                    method=method,
                    url=str(self._client.base_url.join(url)) if self._client.base_url else url,
                    status_code=status_code,
                    duration_ms=duration_ms,
                    params=params,
                    error=error,
                )
            )

    @staticmethod
    def _is_retryable(exc: Exception) -> bool:
        if isinstance(exc, httpx.HTTPStatusError):
            status = exc.response.status_code
            return status >= 500 or status == 429
        return isinstance(exc, httpx.RequestError)

    @staticmethod
    def _retry_before_sleep(retry_state: RetryCallState) -> None:
        exc = retry_state.outcome.exception() if retry_state.outcome else None
        payload = {
            "event": "request_retry",
            "attempt": retry_state.attempt_number,
            "error": str(exc) if exc else None,
        }
        logger.warning(json.dumps(payload, sort_keys=True))
