"""Multi-currency API: split totals when filters span multiple ISO codes."""

import hashlib
import uuid
from datetime import date

import pytest

from backend.models.models import Card, Statement, Transaction


def _hash64(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


@pytest.fixture()
def mixed_currency_rows(db_session_factory, setup_cards):
    db = db_session_factory()
    card = db.query(Card).filter(Card.bank == "hdfc", Card.last4 == "8087").first()
    sid_inr = str(uuid.uuid4())
    sid_usd = str(uuid.uuid4())
    db.add(
        Statement(
            id=sid_inr,
            bank="hdfc",
            card_last4="8087",
            period_start=date(2030, 1, 1),
            period_end=date(2030, 1, 31),
            file_hash=_hash64("currency-test-inr-stmt"),
            transaction_count=1,
            total_spend=100.0,
            source="CC",
            status="success",
            currency="INR",
        )
    )
    db.add(
        Statement(
            id=sid_usd,
            bank="hdfc",
            card_last4="8087",
            period_start=date(2030, 2, 1),
            period_end=date(2030, 2, 28),
            file_hash=_hash64("currency-test-usd-stmt"),
            transaction_count=1,
            total_spend=50.0,
            source="CC",
            status="success",
            currency="USD",
        )
    )
    db.flush()
    db.add(
        Transaction(
            statement_id=sid_inr,
            date=date(2030, 1, 10),
            merchant="Currency Test INR",
            amount=100.0,
            type="debit",
            category="food",
            bank="hdfc",
            card_last4="8087",
            card_id=card.id if card else None,
            source="CC",
            currency="INR",
        )
    )
    db.add(
        Transaction(
            statement_id=sid_usd,
            date=date(2030, 2, 10),
            merchant="Currency Test USD",
            amount=50.0,
            type="debit",
            category="food",
            bank="hdfc",
            card_last4="8087",
            card_id=card.id if card else None,
            source="CC",
            currency="USD",
        )
    )
    db.commit()
    db.close()
    yield {"sid_inr": sid_inr, "sid_usd": sid_usd}
    db = db_session_factory()
    db.query(Transaction).filter(Transaction.merchant.startswith("Currency Test ")).delete(
        synchronize_session=False
    )
    db.query(Statement).filter(Statement.id.in_([sid_inr, sid_usd])).delete(synchronize_session=False)
    db.commit()
    db.close()


def test_analytics_summary_split_when_mixed(api_client, mixed_currency_rows):
    r = api_client.get("/api/analytics/summary")
    assert r.status_code == 200
    data = r.json()
    assert data.get("mixedCurrency") is True
    assert data.get("totalSpend") is None
    by_cur = {x["currency"]: x["amount"] for x in data.get("totalSpendByCurrency", [])}
    assert "INR" in by_cur and "USD" in by_cur
    assert by_cur["USD"] == pytest.approx(50.0)
    assert isinstance(by_cur["INR"], (int, float))


def test_transactions_totals_split_when_mixed(api_client, mixed_currency_rows):
    r = api_client.get("/api/transactions", params={"limit": 500})
    assert r.status_code == 200
    data = r.json()
    assert data.get("mixedCurrency") is True
    assert data.get("totalAmount") is None
    by_cur = {x["currency"]: x["amount"] for x in data.get("totalsByCurrency", [])}
    assert "INR" in by_cur and "USD" in by_cur
    merchants = {t["merchant"] for t in data.get("transactions", [])}
    assert "Currency Test INR" in merchants
    assert "Currency Test USD" in merchants
