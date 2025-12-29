from pydantic import BaseModel, Field
import os
from pathlib import Path
from typing import Optional, Literal

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


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


class FileStorageSettings(BaseModel):
    driver: Literal["local", "docker_volume", "s3"] = "local"
    local_path: str = "./uploads"
    docker_volume_path: str = "/data/uploads"
    s3_bucket: Optional[str] = None
    s3_region: Optional[str] = None
    s3_endpoint: Optional[str] = None
    s3_access_key_id: Optional[str] = None
    s3_secret_access_key: Optional[str] = None
    s3_use_ssl: bool = True


def _load_file_storage_settings() -> FileStorageSettings:
    driver = _normalize_env(os.getenv("FILE_STORAGE_DRIVER"), "local")
    if driver not in {"local", "docker_volume", "s3"}:
        driver = "local"
    return FileStorageSettings(
        driver=driver, 
        local_path=os.getenv("FILE_STORAGE_LOCAL_PATH", "./uploads"),
        docker_volume_path=os.getenv("FILE_STORAGE_DOCKER_PATH", "/data/uploads"),
        s3_bucket=os.getenv("FILE_STORAGE_S3_BUCKET"),
        s3_region=os.getenv("FILE_STORAGE_S3_REGION"),
        s3_endpoint=os.getenv("FILE_STORAGE_S3_ENDPOINT"),
        s3_access_key_id=os.getenv("FILE_STORAGE_S3_ACCESS_KEY_ID"),
        s3_secret_access_key=os.getenv("FILE_STORAGE_S3_SECRET_ACCESS_KEY"),
        s3_use_ssl=_env_bool("FILE_STORAGE_S3_USE_SSL", True),
    )


class Settings(BaseModel):
    app_name: str = "AcademiaPro"
    secret_key: str = os.getenv("SECRET_KEY", "dev-secret-key-change")
    access_token_expire_minutes: Optional[int] = _resolve_access_token_expiry()
    algorithm: str = os.getenv("ALGORITHM", "HS256")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./data.db")
    debug: bool = os.getenv("DEBUG", "true").lower() == "true"
    environment: str = _normalize_env(os.getenv("APP_ENV") or os.getenv("ENVIRONMENT"), "dev")
    file_storage: FileStorageSettings = Field(default_factory=_load_file_storage_settings)

    @property
    def is_production(self) -> bool:
        return self.environment in {"prod", "production"}


settings = Settings()