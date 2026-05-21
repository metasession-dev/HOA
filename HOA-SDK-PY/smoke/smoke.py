"""Live-API smoke for the Python SDK.

Usage:
    HOA_API_BASE_URL=http://localhost:3003 HOA_API_TOKEN=<jwt> python smoke/smoke.py
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hoa_africa import HoaClient, HoaAPIError  # noqa: E402


def main() -> None:
    client = HoaClient(base_url=os.environ.get("HOA_API_BASE_URL", "http://localhost:3003"))

    email = os.environ.get("SMOKE_EMAIL")
    password = os.environ.get("SMOKE_PASSWORD")
    if email and password:
        login = client.auth.login(email=email, password=password)
        print("login ok ->", login["user"]["email"])
    elif os.environ.get("HOA_API_TOKEN"):
        client.set_access_token(os.environ["HOA_API_TOKEN"])
        print("using HOA_API_TOKEN from env")
    else:
        raise SystemExit("Set SMOKE_EMAIL+SMOKE_PASSWORD or HOA_API_TOKEN")

    org = client.organizations.current()
    print("org ->", org["name"], org["slug"], org["currency"])

    estates = client.estates.list()
    print("estates ->", estates["meta"])

    if estates["data"]:
        units = client.units.list(estate_id=estates["data"][0]["id"])
        print("units ->", len(units), "in estate", estates["data"][0]["name"])
    else:
        print("units -> skipped (no estate)")

    invoices = client.invoices.list(page=1, limit=5)
    print("invoices page ->", invoices["meta"])

    reqs = client.requests_.list(page=1, limit=5)
    print("requests page ->", reqs["meta"])

    broadcasts = client.broadcasts.list()
    print("broadcasts ->", len(broadcasts))

    gql = client.graphql.query("{ organization { name slug } }")
    print("gql org ->", gql["organization"]["name"])

    try:
        bad = HoaClient(base_url=client.base_url, access_token="invalid", max_retries=0)
        bad.organizations.current()
        raise SystemExit("expected auth failure")
    except HoaAPIError as e:
        if e.status in (401, 403):
            print("auth-error path ok ->", e.status, str(e))
        else:
            raise


if __name__ == "__main__":
    main()
