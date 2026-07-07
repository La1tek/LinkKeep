import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/linkkeep.db")
APP_ENV = os.getenv("APP_ENV", "development").lower()
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    if APP_ENV in {"prod", "production"}:
        raise RuntimeError("JWT_SECRET must be set in production")
    JWT_SECRET = "linkkeep-dev-secret-change-me"
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24 * 30  # 30 days
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:9091,http://localhost:5173").split(",")
    if origin.strip()
]
CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX", r"^chrome-extension://.*$")
ALLOW_REGISTRATION = os.getenv("ALLOW_REGISTRATION", "true").lower() in {"1", "true", "yes", "on"}
RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
RATE_LIMIT_AUTH_PER_MINUTE = int(os.getenv("RATE_LIMIT_AUTH_PER_MINUTE", "120"))
RATE_LIMIT_METADATA_PER_MINUTE = int(os.getenv("RATE_LIMIT_METADATA_PER_MINUTE", "120"))
RATE_LIMIT_HEAVY_PER_5_MINUTES = int(os.getenv("RATE_LIMIT_HEAVY_PER_5_MINUTES", "30"))
