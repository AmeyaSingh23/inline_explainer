"""
Central configuration — all environment variables loaded once here.
Every other module imports from this file, never from os.environ directly.
"""

import os
from dotenv import load_dotenv # type: ignore

load_dotenv()

# --- Supabase ---
SUPABASE_URL               = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY          = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY  = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# --- Gemini ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# --- App ---
APP_ENV      = os.getenv("APP_ENV", "development")
API_URL      = os.getenv("NEXT_PUBLIC_API_URL", "http://localhost:8000")

# --- Processing limits ---
REPO_SIZE_LIMIT_MB = int(os.getenv("REPO_SIZE_LIMIT_MB", "50"))
TEMP_REPO_DIR      = os.getenv("TEMP_REPO_DIR", "./temp_repos")

# --- Rate limiting ---
RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "5"))
RATE_LIMIT_PER_DAY    = int(os.getenv("RATE_LIMIT_PER_DAY", "50"))

def is_production() -> bool:
    return APP_ENV == "production"