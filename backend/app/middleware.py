import logging
import time
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import (
    APP_ENV,
    RATE_LIMIT_AUTH_PER_MINUTE,
    RATE_LIMIT_ENABLED,
    RATE_LIMIT_HEAVY_PER_5_MINUTES,
    RATE_LIMIT_METADATA_PER_MINUTE,
)

logger = logging.getLogger("linkkeep.requests")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        start = time.perf_counter()

        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        response.headers["X-Request-ID"] = request_id

        logger.info(
            "%s %s %s %.2fms request_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            request_id,
        )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
        if APP_ENV in {"prod", "production"}:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response


@dataclass(frozen=True)
class RateLimitRule:
    name: str
    limit: int
    window_seconds: int


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if not RATE_LIMIT_ENABLED:
            return await call_next(request)

        rule = self._match_rule(request.method, request.url.path)
        if rule is None:
            return await call_next(request)

        now = time.monotonic()
        client_id = self._client_id(request)
        key = f"{rule.name}:{client_id}"
        hits = self._hits[key]

        while hits and now - hits[0] >= rule.window_seconds:
            hits.popleft()

        if len(hits) >= rule.limit:
            retry_after = max(1, int(rule.window_seconds - (now - hits[0])))
            return Response(
                content='{"detail":"Too many requests"}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(retry_after)},
            )

        hits.append(now)
        return await call_next(request)

    def _client_id(self, request: Request) -> str:
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _match_rule(self, method: str, path: str) -> RateLimitRule | None:
        if method != "POST":
            return None
        if path in {"/api/auth/login", "/api/auth/register"}:
            return RateLimitRule("auth", RATE_LIMIT_AUTH_PER_MINUTE, 60)
        if path == "/api/metadata":
            return RateLimitRule("metadata", RATE_LIMIT_METADATA_PER_MINUTE, 60)
        if path == "/api/links/check-health" or (path.startswith("/api/links/") and path.endswith("/fetch-content")):
            return RateLimitRule("heavy", RATE_LIMIT_HEAVY_PER_5_MINUTES, 300)
        return None
