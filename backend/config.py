"""Bank configurations: password formats, email patterns, merchant categories, sync settings."""

import os
from typing import Dict, List

# Bank password format hints (for documentation)
# HDFC: UPPERCASE first 4 letters of name + DDMM (DOB) OR UPPERCASE first 4 + last 4 digits of card
# ICICI: lowercase first 4 letters of name + DDMM (DOB)
# Axis: UPPERCASE first 4 letters of name + DDMM (DOB)

# ---------------------------------------------------------------------------
# Offer & Milestone sync configuration
# ---------------------------------------------------------------------------
OFFER_SYNC_INTERVAL = 6 * 60 * 60  # 6 hours in seconds
OFFER_SYNC_ENABLED = os.getenv("OFFER_SYNC_ENABLED", "true").lower() == "true"
OFFER_REQUEST_TIMEOUT = 30  # seconds
OFFER_REQUEST_DELAY = 1.0  # seconds between requests to same domain
OFFER_MAX_RETRIES = 2

MILESTONE_SYNC_INTERVAL = 24 * 60 * 60  # 24 hours
MILESTONE_SYNC_ENABLED = os.getenv("MILESTONE_SYNC_ENABLED", "true").lower() == "true"

OFFER_PROVIDERS: Dict[str, Dict] = {
    "hdfc_bank": {"enabled": True, "url": "https://www.hdfcbank.com/personal/pay/cards/credit-cards/credit-cards-offers"},
    "icici_bank": {"enabled": True, "url": "https://www.icicibank.com/Personal-Banking/cards/credit-card/credit-card-offers"},
    "axis_bank": {"enabled": True, "url": "https://www.axisbank.com/retail/cards/credit-card/offers"},
    "sbicard": {"enabled": True, "url": "https://www.sbicard.com/en/personal/offers.page"},
    "cardexpert": {"enabled": True, "url": "https://www.cardexpert.in/category/card-offers/"},
}

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
    ],
}
