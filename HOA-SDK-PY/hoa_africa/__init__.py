"""Official Python SDK for HOA.africa.

Quick start:

    from hoa_africa import HoaClient
    client = HoaClient(api_key="hoa_live_...")
    org = client.organizations.current()
    invoices = client.invoices.list(limit=20, status="pending")

Auth: pass one of ``access_token`` (JWT) or ``api_key`` (X-API-Key).
Both can also come from ``HOA_API_TOKEN`` / ``HOA_API_KEY`` env vars.
"""

from .client import HoaClient
from .errors import HoaAPIError, HoaAuthError, HoaRateLimitError
from .types import (
    Organization,
    Estate,
    Unit,
    Invoice,
    Payment,
    Request,
    Broadcast,
    PageMeta,
    Paginated,
)

__all__ = [
    "HoaClient",
    "HoaAPIError",
    "HoaAuthError",
    "HoaRateLimitError",
    "Organization",
    "Estate",
    "Unit",
    "Invoice",
    "Payment",
    "Request",
    "Broadcast",
    "PageMeta",
    "Paginated",
]

__version__ = "0.1.0"
