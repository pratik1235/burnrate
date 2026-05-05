"""Milestone fetcher — scrapes bank/aggregator sites for card milestone definitions.

Runs in a background thread, less frequently than offers (every 24h).
Also auto-seeds UserMilestone records for user's registered cards.
"""

import hashlib
import json
import logging
import time
from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Optional

import httpx
from sqlalchemy.orm import Session

from backend.config import (
    MILESTONE_SYNC_ENABLED,
    OFFER_REQUEST_DELAY,
    OFFER_REQUEST_TIMEOUT,
    PAISABAZAAR_CARD_SLUGS,
)
from backend.models.models import Card, MilestoneDefinition, SyncMetadata, UserMilestone
from backend.services.offer_fetcher import USER_AGENT

logger = logging.getLogger(__name__)


class RawMilestone:
    """Intermediate milestone representation."""

    def __init__(
        self,
        title: str,
        milestone_type: str,
        target_amount: float,
        period_kind: str,
        card_template_id: Optional[str] = None,
        bank: Optional[str] = None,
        description: Optional[str] = None,
        period_config: Optional[str] = None,
        reward_description: Optional[str] = None,
        reward_value: Optional[float] = None,
        category_filter: Optional[str] = None,
        exclude_categories: Optional[str] = None,
        source_url: Optional[str] = None,
    ):
        self.title = title
        self.milestone_type = milestone_type
        self.target_amount = target_amount
        self.period_kind = period_kind
        self.card_template_id = card_template_id
        self.bank = bank
        self.description = description
        self.period_config = period_config
        self.reward_description = reward_description
        self.reward_value = reward_value
        self.category_filter = category_filter
        self.exclude_categories = exclude_categories
        self.source_url = source_url


class BaseMilestoneProvider(ABC):

    @abstractmethod
    def provider_id(self) -> str:
        ...

    @abstractmethod
    def fetch_milestones(self, client: httpx.Client, card_template_ids: List[str]) -> List[RawMilestone]:
        ...


class PaisaBazaarMilestoneProvider(BaseMilestoneProvider):
    """Parses PaisaBazaar card review pages for milestone data."""

    URL_TEMPLATE = "https://www.paisabazaar.com/{bank_slug}/{card_slug}-credit-card/"

    def provider_id(self) -> str:
        return "paisabazaar"

    def fetch_milestones(self, client: httpx.Client, card_template_ids: List[str]) -> List[RawMilestone]:
        milestones = []

        for tmpl_id in card_template_ids:
            slugs = PAISABAZAAR_CARD_SLUGS.get(tmpl_id)
            if not slugs:
                continue

            bank_slug, card_slug = slugs
            url = self.URL_TEMPLATE.format(bank_slug=bank_slug, card_slug=card_slug)

            try:
                resp = client.get(url, timeout=OFFER_REQUEST_TIMEOUT)
                resp.raise_for_status()
            except Exception:
                logger.warning("PaisaBazaar fetch failed for %s", tmpl_id, exc_info=True)
                time.sleep(OFFER_REQUEST_DELAY)
                continue

            from bs4 import BeautifulSoup

            soup = BeautifulSoup(resp.text, "lxml")
            milestones.extend(self._parse_page(soup, tmpl_id, url))
            time.sleep(OFFER_REQUEST_DELAY)

        return milestones

    def _parse_page(self, soup, card_template_id: str, url: str) -> List[RawMilestone]:
        """Extract milestone info from a PaisaBazaar card page."""
        milestones = []
        text = soup.get_text(" ", strip=True).lower()
        bank = card_template_id.split("-")[0] if "-" in card_template_id else None

        # Look for fee waiver patterns
        import re

        # Pattern: "annual fee waiver on spending ₹X" or "fee waived on ₹X spend"
        fee_patterns = [
            r'(?:annual\s+)?fee\s+(?:waiv|revers)\w*\s+(?:on|if|when)\s+(?:spend(?:ing)?|annual\s+spend(?:s)?)\s+(?:of\s+)?(?:rs\.?|₹)\s*([\d,]+(?:\.\d+)?)',
            r'spend\s+(?:rs\.?|₹)\s*([\d,]+(?:\.\d+)?)\s+(?:to|for)\s+(?:waiv|get)\w*\s+(?:annual\s+)?fee',
        ]
        for pat in fee_patterns:
            match = re.search(pat, text)
            if match:
                amount_str = match.group(1).replace(",", "")
                try:
                    amount = float(amount_str)
                    if amount >= 10000:
                        milestones.append(RawMilestone(
                            title="Annual Fee Waiver",
                            milestone_type="fee_waiver",
                            target_amount=amount,
                            period_kind="calendar_year",
                            card_template_id=card_template_id,
                            bank=bank,
                            reward_description=f"Annual fee waived on spending ₹{amount_str}",
                            source_url=url,
                            exclude_categories=json.dumps(["cc_payment"]),
                        ))
                except ValueError:
                    pass
                break

        # Pattern: quarterly spend bonus
        quarter_patterns = [
            r'spend\s+(?:rs\.?|₹)\s*([\d,]+(?:\.\d+)?)\s+(?:in\s+a\s+)?quarter\w*\s+(?:to\s+)?(?:get|earn|for)\s+([\w\s,₹]+?)(?:\.|$)',
            r'(?:rs\.?|₹)\s*([\d,]+(?:\.\d+)?)\s+(?:quarterly|per\s+quarter)\s+spend\w*\s+(?:to\s+)?(?:get|earn|for)\s+([\w\s,₹]+?)(?:\.|$)',
        ]
        for pat in quarter_patterns:
            match = re.search(pat, text)
            if match:
                amount_str = match.group(1).replace(",", "")
                reward = match.group(2).strip()
                try:
                    amount = float(amount_str)
                    if amount >= 10000:
                        milestones.append(RawMilestone(
                            title="Quarterly Spend Bonus",
                            milestone_type="bonus_points",
                            target_amount=amount,
                            period_kind="calendar_quarter",
                            card_template_id=card_template_id,
                            bank=bank,
                            reward_description=reward[:512],
                            source_url=url,
                            exclude_categories=json.dumps(["cc_payment"]),
                        ))
                except ValueError:
                    pass
                break

        # Pattern: lounge access on spend
        lounge_patterns = [
            r'(?:lounge|airport)\s+access\s+(?:on|after|by)\s+spend(?:ing)?\s+(?:rs\.?|₹)\s*([\d,]+(?:\.\d+)?)\s+(?:in\s+(?:a\s+)?)?(?:quarter|quarterly)',
            r'spend\s+(?:rs\.?|₹)\s*([\d,]+(?:\.\d+)?)\s+(?:in\s+(?:a\s+)?)?(?:quarter|quarterly)\s+(?:to|for)\s+(?:get\s+)?(?:complimentary\s+)?lounge',
        ]
        for pat in lounge_patterns:
            match = re.search(pat, text)
            if match:
                amount_str = match.group(1).replace(",", "")
                try:
                    amount = float(amount_str)
                    if amount >= 10000:
                        milestones.append(RawMilestone(
                            title="Lounge Access (Spend-Gated)",
                            milestone_type="lounge_access",
                            target_amount=amount,
                            period_kind="calendar_quarter",
                            card_template_id=card_template_id,
                            bank=bank,
                            reward_description="Complimentary domestic airport lounge access",
                            source_url=url,
                            exclude_categories=json.dumps(["cc_payment"]),
                        ))
                except ValueError:
                    pass
                break

        return milestones


# Bundled well-known milestones (fallback when scraping yields nothing)
BUILTIN_MILESTONES: List[RawMilestone] = [
    RawMilestone(
        title="Quarterly Spend Bonus",
        milestone_type="bonus_points",
        target_amount=100000,
        period_kind="calendar_quarter",
        card_template_id="hdfc-millennia",
        bank="hdfc",
        reward_description="1 lounge access OR ₹1,000 voucher",
        exclude_categories=json.dumps(["cc_payment"]),
    ),
    RawMilestone(
        title="Quarterly Spend Bonus",
        milestone_type="voucher",
        target_amount=30000,
        period_kind="calendar_quarter",
        card_template_id="hdfc-moneyback-plus",
        bank="hdfc",
        reward_description="₹500 gift voucher",
        exclude_categories=json.dumps(["cc_payment"]),
    ),
    RawMilestone(
        title="Quarterly Spend Bonus",
        milestone_type="bonus_points",
        target_amount=400000,
        period_kind="calendar_quarter",
        card_template_id="hdfc-diners-black",
        bank="hdfc",
        reward_description="10,000 bonus reward points",
        exclude_categories=json.dumps(["cc_payment"]),
    ),
    RawMilestone(
        title="Annual Fee Waiver",
        milestone_type="fee_waiver",
        target_amount=800000,
        period_kind="calendar_year",
        card_template_id="hdfc-diners-black",
        bank="hdfc",
        reward_description="Annual fee waived",
        exclude_categories=json.dumps(["cc_payment"]),
    ),
    RawMilestone(
        title="Lounge Access (Spend-Gated)",
        milestone_type="lounge_access",
        target_amount=75000,
        period_kind="calendar_quarter",
        card_template_id=None,
        bank="icici",
        reward_description="Complimentary domestic airport lounge access next quarter",
        exclude_categories=json.dumps(["cc_payment"]),
    ),
    RawMilestone(
        title="Monthly Milestone Bonus",
        milestone_type="bonus_points",
        target_amount=30000,
        period_kind="calendar_month",
        card_template_id=None,
        bank="axis",
        reward_description="1,500 EDGE Reward Points",
        exclude_categories=json.dumps(["cc_payment"]),
    ),
    RawMilestone(
        title="Annual Fee Waiver",
        milestone_type="fee_waiver",
        target_amount=200000,
        period_kind="calendar_year",
        card_template_id=None,
        bank="axis",
        reward_description="Annual fee waived on ₹2L annual spend",
        exclude_categories=json.dumps(["cc_payment"]),
    ),
    RawMilestone(
        title="Lounge Access (Spend-Gated)",
        milestone_type="lounge_access",
        target_amount=50000,
        period_kind="calendar_quarter",
        card_template_id=None,
        bank="axis",
        reward_description="2 domestic airport lounge visits next quarter",
        exclude_categories=json.dumps(["cc_payment"]),
    ),
]


ALL_MILESTONE_PROVIDERS: List[BaseMilestoneProvider] = [
    PaisaBazaarMilestoneProvider(),
]


def sync_milestone_definitions(db: Session) -> dict:
    """Run a milestone definition sync cycle."""
    if not MILESTONE_SYNC_ENABLED:
        return {"status": "disabled"}

    # Get user's card template_ids for targeted scraping
    cards = db.query(Card).all()
    template_ids = [c.template_id for c in cards if c.template_id]

    client = httpx.Client(
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
        timeout=OFFER_REQUEST_TIMEOUT,
    )

    results = {}
    all_milestones: List[RawMilestone] = []

    try:
        for provider in ALL_MILESTONE_PROVIDERS:
            pid = provider.provider_id()

            meta = db.query(SyncMetadata).filter(SyncMetadata.provider == f"milestone_{pid}").first()
            if not meta:
                meta = SyncMetadata(provider=f"milestone_{pid}")
                db.add(meta)
                db.flush()
                # Commit before network I/O: an open transaction after flush holds a
                # SQLite write lock and blocks other threads (e.g. offer sync) on sync_metadata.
                db.commit()

            try:
                fetched = provider.fetch_milestones(client, template_ids)
                all_milestones.extend(fetched)
                meta.last_sync_at = datetime.utcnow()
                meta.last_status = "success"
                meta.offers_fetched = len(fetched)
                meta.error_message = None
                results[pid] = {"status": "success", "count": len(fetched)}
            except Exception as exc:
                logger.warning("Milestone provider %s failed: %s", pid, exc)
                meta.last_sync_at = datetime.utcnow()
                meta.last_status = "failed"
                meta.error_message = str(exc)[:500]
                results[pid] = {"status": "failed", "count": 0}

            db.commit()
    finally:
        client.close()

    # Always include builtins
    all_milestones.extend(BUILTIN_MILESTONES)

    # Upsert definitions
    count = _upsert_milestone_definitions(db, all_milestones)
    results["total_definitions"] = count

    # Auto-seed user milestones
    seeded = auto_seed_user_milestones(db)
    results["auto_seeded"] = seeded

    return results


def _upsert_milestone_definitions(db: Session, milestones: List[RawMilestone]) -> int:
    """Insert or update milestone definitions."""
    count = 0
    for raw in milestones:
        source = "builtin" if raw.source_url is None else "scraped"
        dedup_key = hashlib.md5(
            f"{raw.card_template_id or raw.bank}:{raw.milestone_type}:{raw.period_kind}:{raw.target_amount}".encode()
        ).hexdigest()

        existing = db.query(MilestoneDefinition).filter(
            MilestoneDefinition.source == source,
            MilestoneDefinition.card_template_id == raw.card_template_id,
            MilestoneDefinition.milestone_type == raw.milestone_type,
            MilestoneDefinition.period_kind == raw.period_kind,
        ).first()

        if existing:
            existing.title = raw.title
            existing.description = raw.description
            existing.target_amount = raw.target_amount
            existing.reward_description = raw.reward_description
            existing.reward_value = raw.reward_value
            existing.source_url = raw.source_url
            existing.fetched_at = datetime.utcnow()
        else:
            db.add(MilestoneDefinition(
                source=source,
                source_url=raw.source_url,
                card_template_id=raw.card_template_id,
                bank=raw.bank,
                title=raw.title,
                description=raw.description,
                milestone_type=raw.milestone_type,
                target_amount=raw.target_amount,
                period_kind=raw.period_kind,
                period_config=raw.period_config,
                reward_description=raw.reward_description,
                reward_value=raw.reward_value,
                category_filter=raw.category_filter,
                exclude_categories=raw.exclude_categories,
                fetched_at=datetime.utcnow(),
            ))
        count += 1

    db.commit()
    return count


def auto_seed_user_milestones(db: Session) -> int:
    """Create UserMilestone for each card matching a MilestoneDefinition."""
    cards = db.query(Card).all()
    definitions = db.query(MilestoneDefinition).filter(MilestoneDefinition.is_active == 1).all()
    seeded = 0

    for card in cards:
        for defn in definitions:
            # Match by template_id or by bank
            if defn.card_template_id and card.template_id:
                if defn.card_template_id != card.template_id:
                    continue
            elif defn.bank:
                if defn.bank != card.bank:
                    continue
            else:
                continue

            # Check if already seeded
            exists = db.query(UserMilestone).filter(
                UserMilestone.card_id == card.id,
                UserMilestone.definition_id == defn.id,
            ).first()
            if exists:
                continue

            db.add(UserMilestone(
                card_id=card.id,
                definition_id=defn.id,
                title=defn.title,
                target_amount=defn.target_amount,
                period_kind=defn.period_kind,
                period_config=defn.period_config,
                milestone_type=defn.milestone_type,
                reward_description=defn.reward_description,
                category_filter=defn.category_filter,
                exclude_categories=defn.exclude_categories,
                is_auto_created=1,
            ))
            seeded += 1

    db.commit()
    return seeded
