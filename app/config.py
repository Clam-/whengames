from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    APP_NAME: str = "When Games?"
    ADMIN_EMAIL: str
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    SESSION_SECRET_KEY: str
    DB: str = "sqlite+aiosqlite:///db.db"
    model_config = SettingsConfigDict(env_file=".env")

@lru_cache
def get_settings():
    return Settings()