"""Bank configurations: password formats, email patterns, merchant categories, sync settings."""

import os
import sys
from pathlib import Path
from typing import Dict, List
from pydantic_settings import BaseSettings, SettingsConfigDict

if getattr(sys, "frozen", False):
    _base_dir = Path(sys._MEIPASS)
else:
    _base_dir = Path(__file__).resolve().parent.parent

_env_name = os.environ.get("BURNRATE_ENV", "development")
_env_file_path = os.environ.get("BURNRATE_ENV_FILE", str(_base_dir / f".env.{_env_name}"))

class Settings(BaseSettings):
    burnrate_env: str = "development"
    burnrate_data_dir: str | None = None
    burnrate_static_dir: str = ""
    burnrate_port: int = 8000
    burnrate_homebrew: str | None = None
    
    offer_sync_enabled: bool = False
    milestone_sync_enabled: bool = False

    burnrate_llm_provider: str = "ollama"
    burnrate_llm_ollama_url: str = "http://localhost:11434"
    burnrate_llm_ollama_model: str = "llama3.1"
    burnrate_anthropic_api_key: str | None = None
    burnrate_openai_api_key: str | None = None
    burnrate_aws_access_key_id: str | None = None
    burnrate_aws_secret_access_key: str | None = None
    burnrate_aws_region: str = "us-east-1"
    
    google_oauth_client_id: str | None = None
    google_oauth_client_secret: str | None = None
    burnrate_oauth_redirect_allowed_hosts: str = ""
    gmail_oauth_redirect_uri: str = "http://127.0.0.1:8000/api/gmail/oauth/callback"
    gmail_oauth_success_redirect: str | None = None
    gmail_oauth_error_redirect: str | None = None
    burnrate_oauth_fernet_key: str | None = None
    
    formspree_url: str | None = None

    model_config = SettingsConfigDict(
        env_file=_env_file_path,
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

# Bank password format hints (for documentation)
# HDFC: UPPERCASE first 4 letters of name + DDMM (DOB) OR UPPERCASE first 4 + last 4 digits of card
# ICICI: lowercase first 4 letters of name + DDMM (DOB)
# Axis: UPPERCASE first 4 letters of name + DDMM (DOB)

# ---------------------------------------------------------------------------
# Offer & Milestone sync configuration
# ---------------------------------------------------------------------------
OFFER_SYNC_INTERVAL = 6 * 60 * 60  # 6 hours in seconds
OFFER_SYNC_ENABLED = settings.offer_sync_enabled
OFFER_REQUEST_TIMEOUT = 30  # seconds
OFFER_REQUEST_DELAY = 1.0  # seconds between requests to same domain
OFFER_MAX_RETRIES = 2

MILESTONE_SYNC_INTERVAL = 24 * 60 * 60  # 24 hours
MILESTONE_SYNC_ENABLED = settings.milestone_sync_enabled

OFFER_PROVIDERS: Dict[str, Dict] = {
    # Direct bank scrapers disabled: these sites are JS-rendered and return no offer data via plain HTTP
    "hdfc_bank": {"enabled": False, "url": "https://www.hdfcbank.com/personal/pay/cards/credit-cards/credit-cards-offers"},
    "icici_bank": {"enabled": False, "url": "https://www.icicibank.com/Personal-Banking/cards/credit-card/credit-card-offers"},
    "axis_bank": {"enabled": False, "url": "https://www.axisbank.com/retail/cards/credit-card/offers"},
    "sbicard": {"enabled": False, "url": "https://www.sbicard.com/en/personal/offers.page"},
    # Old HTML scraper for cardexpert replaced by REST API provider below
    "cardexpert": {"enabled": False, "url": "https://www.cardexpert.in/category/card-offers/"},
    # cardexpert.in WordPress REST API — structured JSON, covers all major Indian banks
    "cardexpert_api": {
        "enabled": True,
        "url": "https://www.cardexpert.in/wp-json/wp/v2/posts",
        "per_page": 20,
    },
}

# cardexpert.in WordPress category IDs per bank (verified via /wp-json/wp/v2/categories)
CARDEXPERT_BANK_CATEGORIES: Dict[str, List[int]] = {
    "hdfc":       [11, 473],   # HDFC Credit Cards, HDFC Bank
    "icici":      [47, 475],   # ICICI Credit Cards, ICICI Bank
    "axis":       [60, 472],   # Axis Credit Cards, Axis Bank
    "sbi":        [43],        # SBI Credit Cards
    "kotak":      [477],       # Kotak Mahindra Bank
    "indusind":   [126, 497],  # IndusInd Credit Cards, IndusInd Bank
    "idfc_first": [467],       # IDFC First Bank
    "au":         [482],       # AU Small Finance Bank
    "amex":       [16, 469],   # Amex Cards, American Express India
}
CARDEXPERT_OFFERS_CATEGORY: int = 134  # "Card Offers" — general offer posts (cross-bank)

OFFER_CATEGORY_MAP: Dict[str, List[str]] = {
    "shopping": ["shopping", "ecommerce", "online shopping", "retail"],
    "dining": ["dining", "food", "restaurant", "swiggy", "zomato"],
    "travel": ["travel", "flights", "hotels", "makemytrip", "goibibo"],
    "fuel": ["fuel", "petrol", "diesel"],
    "entertainment": ["entertainment", "movies", "ott", "streaming"],
    "groceries": ["groceries", "supermarket", "bigbasket", "blinkit"],
    "lifestyle": ["lifestyle", "fashion", "beauty", "health"],
    "emi": ["emi", "no cost emi", "easy emi"],
    "lounge": ["lounge", "airport", "airport lounge"],
}

QUARTER_DEFINITIONS = {
    1: (1, 3),   # Q1: Jan-Mar
    2: (4, 6),   # Q2: Apr-Jun
    3: (7, 9),   # Q3: Jul-Sep
    4: (10, 12), # Q4: Oct-Dec
}

# PaisaBazaar card slug mappings: CardTemplate.id → (bank_slug, card_slug)
PAISABAZAAR_CARD_SLUGS: Dict[str, tuple] = {
    "hdfc-millennia": ("hdfc-bank", "millennia"),
    "hdfc-regalia-gold": ("hdfc-bank", "hdfc-regalia-gold"),
    "hdfc-regalia": ("hdfc-bank", "hdfc-regalia"),
    "hdfc-diners-black": ("hdfc-bank", "hdfc-diners-club-black"),
    "hdfc-infinia": ("hdfc-bank", "hdfc-bank-infinia"),
    "hdfc-moneyback-plus": ("hdfc-bank", "moneyback-plus"),
    "icici-sapphiro": ("icici-bank", "icici-bank-sapphiro-visa"),
    "icici-amazon-pay": ("icici-bank", "amazon-pay-icici"),
    "icici-coral": ("icici-bank", "icici-bank-coral"),
    "axis-magnus": ("axis-bank", "axis-bank-magnus"),
    "axis-flipkart": ("axis-bank", "flipkart-axis-bank"),
    "axis-atlas": ("axis-bank", "axis-bank-atlas"),
    "sbi-elite": ("sbi", "sbi-elite"),
    "sbi-simply-click": ("sbi", "sbi-simply-click"),
    "sbi-prime": ("sbi", "sbi-prime"),
}

# Merchant category keyword mappings (~50 Indian merchants across 8+ categories)
MERCHANT_CATEGORIES: Dict[str, List[str]] = {
    "food": [
        "swiggy", "zomato", "mcdonald", "starbucks", "restaurant", "cafe",
        "dominos", "kfc", "subway", "pizza hut", "burger king", "haldiram",
        "barbeque nation",
    ],
    "shopping": [
        "amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa", "tatacliq",
        "croma", "reliance digital", "infiniti retail", "aptronix", "indivinity",
    ],
    "travel": [
        "uber", "ola", "makemytrip", "irctc", "cleartrip", "goibibo",
        "airline", "railway", "indigo", "air india", "vistara",
        "yatra", "agoda", "ibibo", "lounge",
    ],
    "bills": [
        "jio", "airtel", "vi", "bsnl", "electricity", "gas", "insurance",
        "broadband", "tata power", "adani", "bharti",
        "life insurance", "lic",
    ],
    "entertainment": [
        "netflix", "spotify", "hotstar", "prime video", "inox", "pvr",
        "youtube", "apple", "google play", "bundl",
    ],
    "fuel": [
        "hp", "bharat petroleum", "iocl", "shell", "indian oil", "bpcl",
        "hindustan petroleum",
    ],
    "health": [
        "apollo", "pharmeasy", "1mg", "hospital", "medplus", "netmeds",
        "practo", "lenskart",
    ],
    "groceries": [
        "bigbasket", "blinkit", "zepto", "dmart", "jiomart",
        "swiggy instamart", "instamart", "nature basket", "more",
    ],
    "cc_payment": [
        "cc payment", "cc pymt", "bppy cc payment",
        "bbps payment", "neft payment", "imps payment",
        "repayment", "repayments", "bbps", "bill payment received",
        "CREDIT CARD PAYMENTNet Banking",
    ],
}

# ---------------------------------------------------------------------------
# LLM Insights configuration
# ---------------------------------------------------------------------------
LLM_PROVIDER = settings.burnrate_llm_provider
LLM_OLLAMA_BASE_URL = settings.burnrate_llm_ollama_url
LLM_OLLAMA_MODEL = settings.burnrate_llm_ollama_model
LLM_MAX_TOOL_ITERATIONS = 5
LLM_CHAT_TIMEOUT = 150
LLM_MAX_MESSAGE_LENGTH = 4000
LLM_MAX_TRANSACTION_RESULTS = 500

# Anthropic/Claude
LLM_ANTHROPIC_API_KEY = settings.burnrate_anthropic_api_key
LLM_ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-20250514"
LLM_ANTHROPIC_TIMEOUT = 120

# OpenAI
LLM_OPENAI_API_KEY = settings.burnrate_openai_api_key
LLM_OPENAI_DEFAULT_MODEL = "gpt-4-turbo-preview"
LLM_OPENAI_TIMEOUT = 120

# AWS Bedrock
AWS_ACCESS_KEY_ID = settings.burnrate_aws_access_key_id
AWS_SECRET_ACCESS_KEY = settings.burnrate_aws_secret_access_key
AWS_REGION = settings.burnrate_aws_region
LLM_BEDROCK_DEFAULT_MODEL = "anthropic.claude-3-5-sonnet-20241022-v2:0"
LLM_BEDROCK_TIMEOUT = 120
