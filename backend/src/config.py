from pydantic import BaseModel
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv


_ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(_ROOT_DIR / ".env")
load_dotenv()  # fallback to current working directory


def _normalize_env(value: Optional[str], default: str) -> str:
    if value is None:
        return default
    cleaned = value.strip().lower()
    return cleaned or default


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
    environment: str = _normalize_env(os.getenv("APP_ENV") or os.getenv("ENVIRONMENT"), "dev")

    @property
    def is_production(self) -> bool:
        return self.environment in {"prod", "production"}


settings = Settings()