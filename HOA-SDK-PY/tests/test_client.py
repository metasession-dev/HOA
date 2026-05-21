"""Unit tests for HoaClient. ``responses`` stubs the HTTP layer."""
from __future__ import annotations

import json

import pytest
import responses

from hoa_africa import HoaClient, HoaAPIError, HoaAuthError, HoaRateLimitError


@pytest.fixture
def client() -> HoaClient:
    return HoaClient(base_url="http://x", access_token="t", max_retries=0)


@responses.activate
def test_unwraps_envelope(client: HoaClient) -> None:
    responses.add(
        responses.GET,
        "http://x/api/organizations/current",
        json={"success": True, "data": {"id": "o", "name": "X", "slug": "x", "currency": "ZAR",
                                         "country": "ZA", "timezone": "UTC", "language": "en", "createdAt": "d"}},
        status=200,
    )
    org = client.organizations.current()
    assert org["name"] == "X"


@responses.activate
def test_paginated_keeps_meta(client: HoaClient) -> None:
    responses.add(
        responses.GET,
        "http://x/api/invoices",
        json={"success": True, "data": [], "meta": {"total": 0, "page": 1, "limit": 5, "totalPages": 0}},
        status=200,
    )
    out = client.invoices.list(page=1, limit=5)
    assert out["meta"]["limit"] == 5
    assert out["data"] == []


@responses.activate
def test_bearer_header() -> None:
    c = HoaClient(base_url="http://x", access_token="abc", max_retries=0)
    responses.add(responses.GET, "http://x/api/estates", json={"success": True, "data": []}, status=200)
    c.estates.list()
    assert responses.calls[0].request.headers.get("Authorization") == "Bearer abc"


@responses.activate
def test_api_key_header() -> None:
    c = HoaClient(base_url="http://x", api_key="hoa_live_xyz", max_retries=0)
    responses.add(responses.GET, "http://x/api/estates", json={"success": True, "data": []}, status=200)
    c.estates.list()
    assert responses.calls[0].request.headers.get("X-API-Key") == "hoa_live_xyz"


@responses.activate
def test_auth_error_on_401(client: HoaClient) -> None:
    responses.add(
        responses.GET,
        "http://x/api/organizations/current",
        json={"message": "no", "error": "Unauthorized"},
        status=401,
    )
    with pytest.raises(HoaAuthError) as exc:
        client.organizations.current()
    assert exc.value.status == 401


@responses.activate
def test_rate_limit_after_retries() -> None:
    c = HoaClient(base_url="http://x", access_token="t", max_retries=1)
    responses.add(
        responses.GET,
        "http://x/api/organizations/current",
        json={"message": "slow"},
        status=429,
        headers={"Retry-After": "0"},
    )
    responses.add(
        responses.GET,
        "http://x/api/organizations/current",
        json={"message": "slow"},
        status=429,
        headers={"Retry-After": "0"},
    )
    with pytest.raises(HoaRateLimitError):
        c.organizations.current()


@responses.activate
def test_retries_5xx_then_succeeds() -> None:
    c = HoaClient(base_url="http://x", access_token="t", max_retries=1)
    responses.add(responses.GET, "http://x/api/organizations/current", json={"message": "down"}, status=503)
    responses.add(
        responses.GET,
        "http://x/api/organizations/current",
        json={"success": True, "data": {"id": "o", "name": "Y", "slug": "y", "currency": "ZAR",
                                         "country": "ZA", "timezone": "UTC", "language": "en", "createdAt": "d"}},
        status=200,
    )
    org = c.organizations.current()
    assert org["name"] == "Y"
    assert len(responses.calls) == 2


@responses.activate
def test_idempotency_key_header(client: HoaClient) -> None:
    responses.add(
        responses.POST,
        "http://x/api/invoices",
        json={"success": True, "data": {"id": "i", "invoiceNumber": "INV-1"}},
        status=201,
    )
    client.invoices.create({"unitId": "u", "type": "levy", "amount": "100.00", "dueDate": "2026-01-01"}, idempotency_key="idem-1")
    assert responses.calls[0].request.headers.get("Idempotency-Key") == "idem-1"


@responses.activate
def test_query_string(client: HoaClient) -> None:
    responses.add(
        responses.GET,
        "http://x/api/invoices",
        json={"success": True, "data": [], "meta": {"total": 0, "page": 1, "limit": 5, "totalPages": 0}},
        status=200,
    )
    client.invoices.list(page=1, limit=5, status="pending")
    url = responses.calls[0].request.url
    assert "page=1" in url
    assert "limit=5" in url
    assert "status=pending" in url


def test_rejects_both_access_token_and_api_key() -> None:
    with pytest.raises(ValueError):
        HoaClient(access_token="a", api_key="b")


@responses.activate
def test_graphql_unwraps_data(client: HoaClient) -> None:
    responses.add(
        responses.POST,
        "http://x/graphql",
        json={"data": {"organization": {"name": "X"}}},
        status=200,
    )
    out = client.graphql.query("{ organization { name } }")
    assert out == {"organization": {"name": "X"}}
