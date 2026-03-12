"""App configuration from environment variables."""

import os
from functools import lru_cache
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

load_dotenv()


class Settings(BaseSettings):
    """Application settings."""

    # OpenAI
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")

    # Supabase
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    # Tavily 
    tavily_api_key: str = os.getenv("TAVILY_API_KEY", "")

    # Optional: Clerk JWT verification (if you want to verify frontend tokens)
    clerk_publishable_key: str = os.getenv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "")
    clerk_secret_key: str = os.getenv("CLERK_SECRET_KEY", "")

    @property
    def openai_configured(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def tavily_configured(self) -> bool:
        return bool(self.tavily_api_key)

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

@lru_cache
def get_settings() -> "Settings":
    return Settings()
