"""KAPWA Backend / Neon PostgreSQL client for TALA tools and memory."""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any
import httpx

from config import load_settings


@dataclass
class QueryResponse:
    data: Any
    error: Any = None
    count: int | None = None


class KapwaTableQuery:
    """Chainable query builder targeting KAPWA OS `/api/db` (Neon PostgreSQL)."""

    def __init__(self, base_url: str, internal_secret: str, table: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._secret = internal_secret
        self._table = table
        self._action = "select"
        self._select = "*"
        self._values: Any = None
        self._on_conflict: str | None = None
        self._filters: list[dict[str, Any]] = []
        self._orders: list[dict[str, Any]] = []
        self._limit: int | None = None
        self._single_mode: str | None = None
        self._returning = False

    def select(self, columns: str = "*") -> "KapwaTableQuery":
        if self._action == "select":
            self._select = columns
        else:
            self._select = columns
            self._returning = True
        return self

    def insert(self, values: Any) -> "KapwaTableQuery":
        self._action = "insert"
        self._values = values
        self._returning = True
        return self

    def update(self, values: Any) -> "KapwaTableQuery":
        self._action = "update"
        self._values = values
        self._returning = True
        return self

    def upsert(self, values: Any, on_conflict: str | None = None) -> "KapwaTableQuery":
        self._action = "upsert"
        self._values = values
        self._on_conflict = on_conflict
        self._returning = True
        return self

    def delete(self) -> "KapwaTableQuery":
        self._action = "delete"
        return self

    def eq(self, column: str, value: Any) -> "KapwaTableQuery":
        self._filters.append({"op": "eq", "column": column, "value": value})
        return self

    def neq(self, column: str, value: Any) -> "KapwaTableQuery":
        self._filters.append({"op": "neq", "column": column, "value": value})
        return self

    def gt(self, column: str, value: Any) -> "KapwaTableQuery":
        self._filters.append({"op": "gt", "column": column, "value": value})
        return self

    def gte(self, column: str, value: Any) -> "KapwaTableQuery":
        self._filters.append({"op": "gte", "column": column, "value": value})
        return self

    def lt(self, column: str, value: Any) -> "KapwaTableQuery":
        self._filters.append({"op": "lt", "column": column, "value": value})
        return self

    def lte(self, column: str, value: Any) -> "KapwaTableQuery":
        self._filters.append({"op": "lte", "column": column, "value": value})
        return self

    def ilike(self, column: str, value: str) -> "KapwaTableQuery":
        self._filters.append({"op": "ilike", "column": column, "value": value})
        return self

    def in_(self, column: str, values: list[Any]) -> "KapwaTableQuery":
        self._filters.append({"op": "in", "column": column, "value": values})
        return self

    def is_(self, column: str, value: Any) -> "KapwaTableQuery":
        self._filters.append({"op": "is", "column": column, "value": value})
        return self

    def or_(self, expr: str) -> "KapwaTableQuery":
        self._filters.append({"op": "or", "expr": expr})
        return self

    def order(self, column: str, desc: bool = False) -> "KapwaTableQuery":
        self._orders.append({"column": column, "ascending": not desc})
        return self

    def limit(self, count: int) -> "KapwaTableQuery":
        self._limit = count
        return self

    def single(self) -> "KapwaTableQuery":
        self._single_mode = "single"
        return self

    def maybe_single(self) -> "KapwaTableQuery":
        self._single_mode = "maybeSingle"
        return self

    def execute(self) -> QueryResponse:
        payload = {
            "table": self._table,
            "action": self._action,
            "select": self._select,
            "values": self._values,
            "onConflict": self._on_conflict,
            "filters": self._filters,
            "orders": self._orders,
            "limit": self._limit,
            "singleMode": self._single_mode,
            "returning": self._returning,
        }
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(
                f"{self._base_url}/api/db",
                json=payload,
                headers={"x-internal-secret": self._secret},
            )
            resp.raise_for_status()
            body = resp.json()
            return QueryResponse(
                data=body.get("data"),
                error=body.get("error"),
                count=body.get("count"),
            )


class KapwaDbClient:
    def __init__(self, base_url: str, internal_secret: str) -> None:
        self._base_url = base_url
        self._secret = internal_secret

    def table(self, name: str) -> KapwaTableQuery:
        return KapwaTableQuery(self._base_url, self._secret, name)


@lru_cache(maxsize=1)
def get_kapwa_db() -> KapwaDbClient:
    cfg = load_settings()
    return KapwaDbClient(cfg.kapwa_api_url, cfg.internal_fn_secret)
