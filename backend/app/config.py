from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_CORS_ORIGINS = ["http://localhost:3000"]
DEFAULT_GRID_DIR = Path(__file__).resolve().parents[1] / "data" / "grids"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    extra_cors_origins: str = ""
    nasa_power_base_url: str = "https://power.larc.nasa.gov/api"
    nasa_power_timeout_seconds: float = 30.0
    grid_data_dir: Path = DEFAULT_GRID_DIR

    @property
    def cors_origins(self) -> list[str]:
        extra = [o.strip() for o in self.extra_cors_origins.split(",") if o.strip()]
        return DEFAULT_CORS_ORIGINS + extra


@lru_cache
def get_settings() -> Settings:
    return Settings()
