"""HoaClient — thin, enterprise-grade Python client for the HOA.africa API.

Auth: pass exactly one of ``access_token`` (JWT) or ``api_key`` (X-API-Key).

Retries: 429 + 5xx are retried up to ``max_retries`` times (default 2) with
exponential backoff. 429 honours ``Retry-After`` and ``X-RateLimit-Reset``.

Errors: every non-2xx response raises ``HoaAuthError`` (401/403),
``HoaRateLimitError`` (429 after retries exhausted), or ``HoaAPIError``.

Idempotency: pass ``idempotency_key=...`` to write methods. The server stores
the response for 24h — replays return the original payload.
"""
from __future__ import annotations

import os
import random
import time
from typing import Any, Dict, List, Optional, Union

import requests

from .errors import HoaAPIError, HoaAuthError, HoaRateLimitError

DEFAULT_BASE_URL = "https://api.hoa.africa"
DEFAULT_TIMEOUT_S = 30.0
DEFAULT_MAX_RETRIES = 2
USER_AGENT = "hoa-africa-py/0.1.0"

QueryValue = Union[str, int, float, bool, None]


class HoaClient:
    def __init__(
        self,
        *,
        base_url: Optional[str] = None,
        access_token: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT_S,
        max_retries: int = DEFAULT_MAX_RETRIES,
        session: Optional[requests.Session] = None,
        user_agent: str = USER_AGENT,
    ) -> None:
        if access_token and api_key:
            raise ValueError("HoaClient: pass access_token OR api_key, not both")
        self._base_url = (base_url or os.environ.get("HOA_API_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self._access_token = access_token or os.environ.get("HOA_API_TOKEN")
        self._api_key = api_key or os.environ.get("HOA_API_KEY")
        self._timeout = timeout
        self._max_retries = max_retries
        self._session = session or requests.Session()
        self._user_agent = user_agent

        self.auth = AuthResource(self)
        self.organizations = OrganizationsResource(self)
        self.estates = EstatesResource(self)
        self.units = UnitsResource(self)
        self.invoices = InvoicesResource(self)
        self.payments = PaymentsResource(self)
        self.requests_ = RequestsResource(self)  # ``requests`` shadows the package
        self.broadcasts = BroadcastsResource(self)
        self.graphql = GraphqlResource(self)

    # ---------- auth setters ----------
    def set_access_token(self, token: Optional[str]) -> None:
        self._access_token = token

    def set_api_key(self, key: Optional[str]) -> None:
        self._api_key = key

    @property
    def base_url(self) -> str:
        return self._base_url

    # ---------- core request ----------
    def request(
        self,
        method: str,
        path: str,
        *,
        query: Optional[Dict[str, QueryValue]] = None,
        json: Any = None,
        data: Any = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: Optional[float] = None,
        idempotency_key: Optional[str] = None,
    ) -> Any:
        url = self._build_url(path)
        params = self._normalise_query(query)
        merged_headers: Dict[str, str] = {
            "Accept": "application/json",
            "User-Agent": self._user_agent,
        }
        if self._access_token:
            merged_headers["Authorization"] = f"Bearer {self._access_token}"
        if self._api_key:
            merged_headers["X-API-Key"] = self._api_key
        if idempotency_key:
            merged_headers["Idempotency-Key"] = idempotency_key
        if headers:
            merged_headers.update(headers)

        attempt = 0
        last_exc: Optional[BaseException] = None
        while attempt <= self._max_retries:
            try:
                res = self._session.request(
                    method=method.upper(),
                    url=url,
                    params=params,
                    json=json,
                    data=data,
                    headers=merged_headers,
                    timeout=timeout if timeout is not None else self._timeout,
                )
            except requests.RequestException as exc:
                last_exc = exc
                if attempt < self._max_retries:
                    time.sleep(_backoff(attempt))
                    attempt += 1
                    continue
                raise

            if res.status_code == 204 or not res.content:
                if 200 <= res.status_code < 300:
                    return None
                raise self._error_from(res)

            parsed: Any
            ctype = res.headers.get("content-type", "")
            if "application/json" in ctype:
                try:
                    parsed = res.json()
                except ValueError:
                    parsed = res.text
            else:
                parsed = res.text

            if 200 <= res.status_code < 300:
                # Most endpoints return {success, data} or {success, data, meta}.
                # Keep `meta` alongside `data` when present (paginated lists).
                if (
                    isinstance(parsed, dict)
                    and "success" in parsed
                    and "data" in parsed
                ):
                    if "meta" in parsed:
                        return {"data": parsed["data"], "meta": parsed["meta"]}
                    return parsed["data"]
                return parsed

            if (res.status_code == 429 or res.status_code >= 500) and attempt < self._max_retries:
                time.sleep(_backoff(attempt, res))
                attempt += 1
                continue

            raise self._error_from(res, parsed)

        if last_exc:
            raise last_exc
        raise RuntimeError("HoaClient: retry budget exhausted")

    # ---------- helpers ----------
    def _build_url(self, path: str) -> str:
        if path.startswith("http://") or path.startswith("https://"):
            return path
        if not path.startswith("/"):
            path = "/" + path
        return self._base_url + path

    @staticmethod
    def _normalise_query(query: Optional[Dict[str, QueryValue]]) -> Optional[Dict[str, str]]:
        if not query:
            return None
        out: Dict[str, str] = {}
        for k, v in query.items():
            if v is None:
                continue
            out[k] = "true" if v is True else "false" if v is False else str(v)
        return out

    @staticmethod
    def _error_from(res: requests.Response, parsed: Any = None) -> HoaAPIError:
        body = parsed
        if body is None:
            try:
                body = res.json()
            except ValueError:
                body = res.text or None
        message = f"HTTP {res.status_code} {res.reason}"
        code: Optional[str] = None
        if isinstance(body, dict):
            m = body.get("message")
            if isinstance(m, list):
                message = "; ".join(str(x) for x in m)
            elif isinstance(m, str):
                message = m
            err = body.get("error")
            if isinstance(err, str):
                code = err
        request_id = res.headers.get("X-Request-Id") or res.headers.get("X-Correlation-Id")
        if res.status_code in (401, 403):
            return HoaAuthError(message, status=res.status_code, code=code, body=body, request_id=request_id)
        if res.status_code == 429:
            try:
                retry_after = int(res.headers.get("Retry-After", "60"))
            except ValueError:
                retry_after = 60
            return HoaRateLimitError(
                message,
                status=res.status_code,
                code=code,
                body=body,
                request_id=request_id,
                retry_after_seconds=retry_after,
            )
        return HoaAPIError(message, status=res.status_code, code=code, body=body, request_id=request_id)


def _backoff(attempt: int, res: Optional[requests.Response] = None) -> float:
    if res is not None:
        ra = res.headers.get("Retry-After")
        if ra:
            try:
                return min(float(ra), 30.0)
            except ValueError:
                pass
        reset = res.headers.get("X-RateLimit-Reset")
        if reset:
            try:
                delta = float(reset) - time.time()
                if delta > 0:
                    return min(delta, 30.0)
            except ValueError:
                pass
    base = 0.2 * (2 ** attempt)
    return min(base + random.uniform(0, 0.1), 10.0)


# ---------- resource helpers ----------


class _Resource:
    def __init__(self, client: HoaClient) -> None:
        self._client = client


class AuthResource(_Resource):
    def login(self, *, email: str, password: str) -> Dict[str, Any]:
        out = self._client.request("POST", "/api/auth/login", json={"email": email, "password": password})
        if isinstance(out, dict) and out.get("accessToken"):
            self._client.set_access_token(out["accessToken"])
        return out

    def profile(self) -> Dict[str, Any]:
        return self._client.request("GET", "/api/auth/profile")


class OrganizationsResource(_Resource):
    def current(self) -> Dict[str, Any]:
        return self._client.request("GET", "/api/organizations/current")


class EstatesResource(_Resource):
    def list(self, *, page: Optional[int] = None, limit: Optional[int] = None) -> Dict[str, Any]:
        return self._client.request("GET", "/api/estates", query={"page": page, "limit": limit})

    def get(self, id: str) -> Dict[str, Any]:
        return self._client.request("GET", f"/api/estates/{id}")


class UnitsResource(_Resource):
    def list(self, *, estate_id: str) -> List[Dict[str, Any]]:
        return self._client.request("GET", f"/api/estates/{estate_id}/units")

    def get(self, id: str) -> Dict[str, Any]:
        return self._client.request("GET", f"/api/units/{id}")


class InvoicesResource(_Resource):
    def list(
        self,
        *,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        status: Optional[str] = None,
        type: Optional[str] = None,
        unit_id: Optional[str] = None,
        from_: Optional[str] = None,
        to: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self._client.request(
            "GET",
            "/api/invoices",
            query={
                "page": page,
                "limit": limit,
                "status": status,
                "type": type,
                "unitId": unit_id,
                "from": from_,
                "to": to,
            },
        )

    def get(self, id: str) -> Dict[str, Any]:
        return self._client.request("GET", f"/api/invoices/{id}")

    def create(self, payload: Dict[str, Any], *, idempotency_key: Optional[str] = None) -> Dict[str, Any]:
        return self._client.request("POST", "/api/invoices", json=payload, idempotency_key=idempotency_key)


class PaymentsResource(_Resource):
    def list(self, *, page: Optional[int] = None, limit: Optional[int] = None, status: Optional[str] = None) -> Dict[str, Any]:
        return self._client.request(
            "GET", "/api/payments", query={"page": page, "limit": limit, "status": status}
        )

    def get(self, id: str) -> Dict[str, Any]:
        return self._client.request("GET", f"/api/payments/{id}")

    def create(self, payload: Dict[str, Any], *, idempotency_key: Optional[str] = None) -> Dict[str, Any]:
        return self._client.request("POST", "/api/payments", json=payload, idempotency_key=idempotency_key)


class RequestsResource(_Resource):
    def list(
        self,
        *,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        unit_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self._client.request(
            "GET",
            "/api/requests",
            query={"page": page, "limit": limit, "status": status, "priority": priority, "unitId": unit_id},
        )

    def get(self, id: str) -> Dict[str, Any]:
        return self._client.request("GET", f"/api/requests/{id}")

    def create(self, payload: Dict[str, Any], *, idempotency_key: Optional[str] = None) -> Dict[str, Any]:
        return self._client.request("POST", "/api/requests", json=payload, idempotency_key=idempotency_key)


class BroadcastsResource(_Resource):
    def list(self, *, status: Optional[str] = None) -> List[Dict[str, Any]]:
        return self._client.request("GET", "/api/communications/broadcasts/v2", query={"status": status})

    def get(self, id: str) -> Dict[str, Any]:
        return self._client.request("GET", f"/api/communications/broadcasts/v2/{id}")


class GraphqlResource(_Resource):
    def query(self, query: str, variables: Optional[Dict[str, Any]] = None) -> Any:
        out = self._client.request("POST", "/graphql", json={"query": query, "variables": variables or {}})
        if isinstance(out, dict) and out.get("errors") and not out.get("data"):
            messages = "; ".join(e.get("message", "") for e in out["errors"])
            raise HoaAPIError(messages, status=400, body=out["errors"])
        if isinstance(out, dict) and "data" in out:
            return out["data"]
        return out
