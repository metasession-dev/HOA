"""Typed exceptions raised by HoaClient."""
from __future__ import annotations

from typing import Any, Optional


class HoaAPIError(Exception):
    """Base exception for non-2xx responses.

    Attributes:
        status: HTTP status code.
        code: Server-supplied error code (e.g. ``"Unauthorized"``), or ``None``.
        body: Parsed JSON body, raw text, or ``None``.
        request_id: ``X-Request-Id`` / ``X-Correlation-Id`` header from the response.
    """

    def __init__(
        self,
        message: str,
        *,
        status: int,
        code: Optional[str] = None,
        body: Any = None,
        request_id: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.body = body
        self.request_id = request_id

    @property
    def is_rate_limit(self) -> bool:
        return self.status == 429

    @property
    def is_client_error(self) -> bool:
        return 400 <= self.status < 500

    @property
    def is_server_error(self) -> bool:
        return self.status >= 500


class HoaAuthError(HoaAPIError):
    """401 / 403 — caller's credentials are missing, expired, or insufficient."""


class HoaRateLimitError(HoaAPIError):
    """429 surfaced after the retry budget is exhausted.

    ``retry_after_seconds`` is the server's hint from ``Retry-After``, or 60.
    """

    def __init__(self, *args: Any, retry_after_seconds: int = 60, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.retry_after_seconds = retry_after_seconds
