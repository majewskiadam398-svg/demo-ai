from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = "sqlite:///./chessmind.db"
    jwt_secret: str = "development-only-change-me"
    access_token_minutes: int = 60
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
