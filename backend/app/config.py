import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/linkkeep.db")
JWT_SECRET = os.getenv("JWT_SECRET", "linkkeep-secret-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24 * 30  # 30 days
