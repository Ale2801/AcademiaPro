from pydantic import BaseModel
import os
from typing import Optional


def _resolve_access_token_expiry() -> Optional[int]:
    raw = os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES")
    if raw is None or not raw.strip():
        return None
    try:
        minutes = int(raw)
    except ValueError:
        return None
    return minutes if minutes > 0 else None


class Settings(BaseModel):
    app_name: str = "AcademiaPro"
    secret_key: str = os.getenv("SECRET_KEY", "dev-secret-key-change")
    access_token_expire_minutes: Optional[int] = _resolve_access_token_expiry()
    algorithm: str = os.getenv("ALGORITHM", "HS256")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./data.db")
    debug: bool = os.getenv("DEBUG", "true").lower() == "true"


settings = Settings()