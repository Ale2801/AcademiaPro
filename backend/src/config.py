from pydantic import BaseModel
import os


class Settings(BaseModel):
    app_name: str = "AcademiaPro"
    secret_key: str = os.getenv("SECRET_KEY", "dev-secret-key-change")
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    algorithm: str = os.getenv("ALGORITHM", "HS256")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./data.db")
    debug: bool = os.getenv("DEBUG", "true").lower() == "true"


settings = Settings()