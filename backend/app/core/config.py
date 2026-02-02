"""
Application configuration.
Supports both environment variables and .env files.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    APP_NAME: str = "CTD Stability Document Generator"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://ctd:ctd@localhost:5432/ctd_stability"

    # Object storage
    STORAGE_BACKEND: str = "local"  # "local", "s3", "minio"
    STORAGE_LOCAL_PATH: str = "./storage"
    S3_BUCKET: str = ""
    S3_ENDPOINT: str = ""
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""

    # Redis (for Celery task queue)
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT Auth
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60

    # Document generation
    LIBREOFFICE_PATH: str = "libreoffice"  # for PDF conversion
    TEMPLATE_DIR: str = "./templates"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
