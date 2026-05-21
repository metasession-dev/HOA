"""Typed dicts for the most common API resources.

The full surface (227+ paths) is reachable via ``client.request(...)`` which
returns parsed JSON dynamically. The TypedDicts below cover the resource
helpers and exist mainly so editors offer completions in type-aware setups.
"""
from __future__ import annotations

from typing import List, Optional, TypedDict


class Organization(TypedDict):
    id: str
    name: str
    slug: str
    currency: str
    country: str
    timezone: str
    language: str
    createdAt: str


class Estate(TypedDict, total=False):
    id: str
    name: str
    address: Optional[str]
    totalUnits: float
    organizationId: str
    createdAt: str


class Unit(TypedDict, total=False):
    id: str
    unitNumber: str
    block: Optional[str]
    floor: Optional[float]
    type: str
    tags: List[str]
    estateId: str


class Invoice(TypedDict, total=False):
    id: str
    invoiceNumber: str
    type: str
    amount: str
    currency: str
    status: str
    dueDate: str
    paidAt: Optional[str]
    sentAt: Optional[str]
    unitId: str
    createdAt: str


class Payment(TypedDict, total=False):
    id: str
    amount: str
    currency: str
    method: str
    status: str
    processedAt: Optional[str]
    processorReference: Optional[str]
    invoiceId: str


class Request(TypedDict, total=False):
    id: str
    subject: str
    body: str
    status: str
    priority: str
    unitId: Optional[str]
    categoryId: str
    dueAt: Optional[str]
    resolvedAt: Optional[str]
    createdAt: str


class Broadcast(TypedDict, total=False):
    id: str
    subject: str
    status: str
    channels: List[str]
    scheduledAt: Optional[str]
    sentAt: Optional[str]
    resolvedRecipients: float
    successCount: float
    failureCount: float
    optOutCount: float


class PageMeta(TypedDict):
    total: int
    page: int
    limit: int
    totalPages: int


class Paginated(TypedDict):
    data: list
    meta: PageMeta
