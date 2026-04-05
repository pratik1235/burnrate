"""Offer fetcher — scrapes bank and aggregator websites for credit card offers.

Runs in a background thread at app startup and periodically thereafter.
Each provider is isolated: failures in one don't affect others.
"""

import hashlib
import logging
import time
from abc import ABC, abstractmethod
from datetime import date, datetime
from typing import List, Optional

import httpx
from sqlalchemy.orm import Session

from backend.config import (
    OFFER_PROVIDERS,
    OFFER_REQUEST_DELAY,
    OFFER_REQUEST_TIMEOUT,
    OFFER_SYNC_ENABLED,
)
from backend.models.models import Card, CardOffer, CardOfferCard, SyncMetadata

logger = logging.getLogger(__name__)

USER_AGENT = "Burnrate/0.3 (local credit card analytics; github.com/pratik1235/burnrate)"


class RawOffer:
    """Intermediate offer representation before DB persistence."""

    def __init__(
        self,
        title: str,
        source_id: str,
        description: Optional[str] = None,
        merchant: Optional[str] = None,
        discount_text: Optional[str] = None,
        offer_type: Optional[str] = None,
        bank: Optional[str] = None,
        card_template_id: Optional[str] = None,
        network: Optional[str] = None,
        min_transaction: Optional[float] = None,
        max_discount: Optional[float] = None,
        valid_from: Optional[date] = None,
        valid_until: Optional[date] = None,
        category: Optional[str] = None,
        source_url: Optional[str] = None,
    ):
        self.title = title
        self.source_id = source_id
        self.description = description
        self.merchant = merchant
        self.discount_text = discount_text
        self.offer_type = offer_type
        self.bank = bank
        self.card_template_id = card_template_id
        self.network = network
        self.min_transaction = min_transaction
        self.max_discount = max_discount
        self.valid_from = valid_from
        self.valid_until = valid_until
        self.category = category
        self.source_url = source_url


class BaseOfferProvider(ABC):
    """Base class for offer data providers."""

    @abstractmethod
    def provider_id(self) -> str:
        ...

    @abstractmethod
    def fetch_offers(self, client: httpx.Client) -> List[RawOffer]:
        ...


class HDFCOfferProvider(BaseOfferProvider):
    """Scrapes HDFC Bank credit card offers page."""

    def provider_id(self) -> str:
        return "hdfc_bank"

    def fetch_offers(self, client: httpx.Client) -> List[RawOffer]:
        url = OFFER_PROVIDERS["hdfc_bank"]["url"]
        try:
            resp = client.get(url, timeout=OFFER_REQUEST_TIMEOUT)
            resp.raise_for_status()
        except Exception:
            logger.warning("HDFC offer fetch failed", exc_info=True)
            return []

        from bs4 import BeautifulSoup

        soup = BeautifulSoup(resp.text, "lxml")
        offers = []

        for card in soup.select(".offer-card, .offer-item, article"):
            title_el = card.select_one("h3, h4, .offer-title, .title")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            if not title or len(title) < 5:
                continue

            desc_el = card.select_one("p, .offer-desc, .description")
            desc = desc_el.get_text(strip=True) if desc_el else None

            link_el = card.select_one("a[href]")
            link = link_el["href"] if link_el else None
            if link and not link.startswith("http"):
                link = f"https://www.hdfcbank.com{link}"

            source_id = hashlib.md5(f"hdfc:{title}".encode()).hexdigest()

            offers.append(RawOffer(
                title=title[:512],
                source_id=source_id,
                description=desc[:2000] if desc else None,
                bank="hdfc",
                source_url=link,
                offer_type="discount",
                category=_guess_category(title, desc),
            ))

        return offers


class SBICardOfferProvider(BaseOfferProvider):
    """Scrapes SBI Card offers page."""

    def provider_id(self) -> str:
        return "sbicard"

    def fetch_offers(self, client: httpx.Client) -> List[RawOffer]:
        url = OFFER_PROVIDERS["sbicard"]["url"]
        try:
            resp = client.get(url, timeout=OFFER_REQUEST_TIMEOUT)
            resp.raise_for_status()
        except Exception:
            logger.warning("SBICard offer fetch failed", exc_info=True)
            return []

        from bs4 import BeautifulSoup

        soup = BeautifulSoup(resp.text, "lxml")
        offers = []

        for card in soup.select(".offer-card, .offer-item, .card-offer, article"):
            title_el = card.select_one("h3, h4, .offer-title, .title")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            if not title or len(title) < 5:
                continue

            desc_el = card.select_one("p, .offer-desc")
            desc = desc_el.get_text(strip=True) if desc_el else None

            source_id = hashlib.md5(f"sbi:{title}".encode()).hexdigest()
            offers.append(RawOffer(
                title=title[:512],
                source_id=source_id,
                description=desc[:2000] if desc else None,
                bank="sbi",
                source_url=url,
                offer_type="discount",
                category=_guess_category(title, desc),
            ))

        return offers


class ICICIOfferProvider(BaseOfferProvider):
    """Scrapes ICICI Bank credit card offers."""

    def provider_id(self) -> str:
        return "icici_bank"

    def fetch_offers(self, client: httpx.Client) -> List[RawOffer]:
        url = OFFER_PROVIDERS["icici_bank"]["url"]
        try:
            resp = client.get(url, timeout=OFFER_REQUEST_TIMEOUT)
            resp.raise_for_status()
        except Exception:
            logger.warning("ICICI offer fetch failed", exc_info=True)
            return []

        from bs4 import BeautifulSoup

        soup = BeautifulSoup(resp.text, "lxml")
        offers = []

        for card in soup.select(".offer-card, .offer-item, article, .card"):
            title_el = card.select_one("h3, h4, .offer-title, .title")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            if not title or len(title) < 5:
                continue

            desc_el = card.select_one("p, .offer-desc")
            desc = desc_el.get_text(strip=True) if desc_el else None

            source_id = hashlib.md5(f"icici:{title}".encode()).hexdigest()
            offers.append(RawOffer(
                title=title[:512],
                source_id=source_id,
                description=desc[:2000] if desc else None,
                bank="icici",
                source_url=url,
                offer_type="discount",
                category=_guess_category(title, desc),
            ))

        return offers


class AxisOfferProvider(BaseOfferProvider):
    """Scrapes Axis Bank credit card offers."""

    def provider_id(self) -> str:
        return "axis_bank"

    def fetch_offers(self, client: httpx.Client) -> List[RawOffer]:
        url = OFFER_PROVIDERS["axis_bank"]["url"]
        try:
            resp = client.get(url, timeout=OFFER_REQUEST_TIMEOUT)
            resp.raise_for_status()
        except Exception:
            logger.warning("Axis offer fetch failed", exc_info=True)
            return []

        from bs4 import BeautifulSoup

        soup = BeautifulSoup(resp.text, "lxml")
        offers = []

        for card in soup.select(".offer-card, .offer-item, article"):
            title_el = card.select_one("h3, h4, .offer-title, .title")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            if not title or len(title) < 5:
                continue

            desc_el = card.select_one("p, .offer-desc")
            desc = desc_el.get_text(strip=True) if desc_el else None

            source_id = hashlib.md5(f"axis:{title}".encode()).hexdigest()
            offers.append(RawOffer(
                title=title[:512],
                source_id=source_id,
                description=desc[:2000] if desc else None,
                bank="axis",
                source_url=url,
                offer_type="discount",
                category=_guess_category(title, desc),
            ))

        return offers


class CardExpertProvider(BaseOfferProvider):
    """Scrapes CardExpert WordPress site for credit card offers."""

    def provider_id(self) -> str:
        return "cardexpert"

    def fetch_offers(self, client: httpx.Client) -> List[RawOffer]:
        url = OFFER_PROVIDERS["cardexpert"]["url"]
        try:
            resp = client.get(url, timeout=OFFER_REQUEST_TIMEOUT)
            resp.raise_for_status()
        except Exception:
            logger.warning("CardExpert offer fetch failed", exc_info=True)
            return []

        from bs4 import BeautifulSoup

        soup = BeautifulSoup(resp.text, "lxml")
        offers = []

        for article in soup.select("article, .post, .entry"):
            title_el = article.select_one("h2 a, h3 a, .entry-title a")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            if not title or len(title) < 5:
                continue

            link = title_el.get("href", "")
            desc_el = article.select_one(".entry-content p, .excerpt, .entry-summary")
            desc = desc_el.get_text(strip=True) if desc_el else None

            source_id = hashlib.md5(f"ce:{title}".encode()).hexdigest()

            # Try to detect bank from title
            bank = _detect_bank_from_text(title)

            offers.append(RawOffer(
                title=title[:512],
                source_id=source_id,
                description=desc[:2000] if desc else None,
                bank=bank,
                source_url=link or url,
                offer_type="discount",
                category=_guess_category(title, desc),
            ))

        return offers


def _detect_bank_from_text(text: str) -> Optional[str]:
    """Try to detect bank from text content."""
    text_lower = text.lower()
    for bank in ["hdfc", "icici", "axis", "sbi", "amex", "idfc", "indusind", "kotak", "federal"]:
        if bank in text_lower:
            return bank
    return None


def _guess_category(title: str, desc: Optional[str] = None) -> Optional[str]:
    """Best-effort category guess from title/description text."""
    text = f"{title} {desc or ''}".lower()
    mappings = {
        "dining": ["food", "restaurant", "dining", "swiggy", "zomato", "domino"],
        "shopping": ["amazon", "flipkart", "shopping", "myntra", "retail"],
        "travel": ["travel", "flight", "hotel", "makemytrip", "booking"],
        "fuel": ["fuel", "petrol"],
        "entertainment": ["movie", "entertainment", "netflix"],
        "groceries": ["grocery", "bigbasket", "blinkit", "zepto"],
        "emi": ["emi", "no cost emi"],
        "lounge": ["lounge", "airport"],
    }
    for cat, keywords in mappings.items():
        if any(kw in text for kw in keywords):
            return cat
    return None


# All available providers
ALL_PROVIDERS: List[BaseOfferProvider] = [
    HDFCOfferProvider(),
    SBICardOfferProvider(),
    ICICIOfferProvider(),
    AxisOfferProvider(),
    CardExpertProvider(),
]


def sync_offers(db: Session) -> dict:
    """Run a full offer sync cycle across all enabled providers.

    Returns a summary dict with counts per provider.
    """
    if not OFFER_SYNC_ENABLED:
        return {"status": "disabled"}

    client = httpx.Client(
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
        timeout=OFFER_REQUEST_TIMEOUT,
    )

    results = {}
    try:
        for provider in ALL_PROVIDERS:
            pid = provider.provider_id()
            pconfig = OFFER_PROVIDERS.get(pid, {})
            if not pconfig.get("enabled", True):
                results[pid] = {"status": "disabled", "count": 0}
                continue

            meta = db.query(SyncMetadata).filter(SyncMetadata.provider == pid).first()
            if not meta:
                meta = SyncMetadata(provider=pid)
                db.add(meta)
                db.flush()

            try:
                raw_offers = provider.fetch_offers(client)
                count = _upsert_offers(db, pid, raw_offers)
                meta.last_sync_at = datetime.utcnow()
                meta.last_status = "success"
                meta.offers_fetched = count
                meta.error_message = None
                results[pid] = {"status": "success", "count": count}
            except Exception as exc:
                logger.warning("Provider %s failed: %s", pid, exc)
                meta.last_sync_at = datetime.utcnow()
                meta.last_status = "failed"
                meta.error_message = str(exc)[:500]
                results[pid] = {"status": "failed", "count": 0, "error": str(exc)[:200]}

            db.commit()
            time.sleep(OFFER_REQUEST_DELAY)

        # Mark expired offers
        today = date.today()
        db.query(CardOffer).filter(
            CardOffer.valid_until != None,
            CardOffer.valid_until < today,
            CardOffer.is_expired == 0,
        ).update({"is_expired": 1})
        db.commit()

        # Match offers to user cards
        match_offers_to_cards(db)

    finally:
        client.close()

    return results


def _upsert_offers(db: Session, provider_id: str, raw_offers: List[RawOffer]) -> int:
    """Insert or update offers from a provider. Returns count of upserted offers."""
    count = 0
    for raw in raw_offers:
        existing = db.query(CardOffer).filter(
            CardOffer.source == provider_id,
            CardOffer.source_id == raw.source_id,
        ).first()

        if existing:
            # Update existing
            existing.title = raw.title
            existing.description = raw.description
            existing.merchant = raw.merchant
            existing.discount_text = raw.discount_text
            existing.offer_type = raw.offer_type
            existing.bank = raw.bank
            existing.card_template_id = raw.card_template_id
            existing.network = raw.network
            existing.min_transaction = raw.min_transaction
            existing.max_discount = raw.max_discount
            existing.valid_from = raw.valid_from
            existing.valid_until = raw.valid_until
            existing.category = raw.category
            existing.source_url = raw.source_url
            existing.fetched_at = datetime.utcnow()
        else:
            db.add(CardOffer(
                source=provider_id,
                source_id=raw.source_id,
                source_url=raw.source_url,
                title=raw.title,
                description=raw.description,
                merchant=raw.merchant,
                discount_text=raw.discount_text,
                offer_type=raw.offer_type,
                bank=raw.bank,
                card_template_id=raw.card_template_id,
                network=raw.network,
                min_transaction=raw.min_transaction,
                max_discount=raw.max_discount,
                valid_from=raw.valid_from,
                valid_until=raw.valid_until,
                category=raw.category,
                fetched_at=datetime.utcnow(),
            ))
        count += 1

    db.flush()
    return count


def match_offers_to_cards(db: Session) -> None:
    """Populate card_offer_cards junction based on bank/template matching."""
    cards = db.query(Card).all()
    if not cards:
        return

    offers = db.query(CardOffer).filter(CardOffer.is_expired == 0).all()

    for offer in offers:
        for card in cards:
            # Match by bank
            if offer.bank and offer.bank != card.bank:
                continue
            # Match by template
            if offer.card_template_id and card.template_id and offer.card_template_id != card.template_id:
                continue

            # Check if junction already exists
            exists = db.query(CardOfferCard).filter(
                CardOfferCard.offer_id == offer.id,
                CardOfferCard.card_id == card.id,
            ).first()
            if not exists:
                db.add(CardOfferCard(offer_id=offer.id, card_id=card.id))

    db.commit()
