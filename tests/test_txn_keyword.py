import pytest
from datetime import date
from backend.models.models import Transaction, Statement, Card

def test_txn_keyword_e2e(api_client, db):
    # 1. Setup a card and statement manually so we can insert a transaction
    card = Card(id="test-card-id", bank="HDFC", last4="1234", name="Test Card")
    db.add(card)
    statement = Statement(
        id="test-statement-id",
        bank="HDFC",
        card_last4="1234",
        period_start=date(2023, 1, 1),
        period_end=date(2023, 1, 31),
        file_hash="hash123",
        file_path="/fake/path"
    )
    db.add(statement)
    db.flush()

    txn = Transaction(
        id="test-txn-id",
        statement_id="test-statement-id",
        date=date(2023, 1, 15),
        merchant="TestMerchant",
        amount=100.0,
        type="debit",
        category="shopping",
        source="CC"
    )
    db.add(txn)
    db.commit()

    # 2. Add keyword to the transaction
    resp = api_client.put("/api/transactions/test-txn-id/keyword", json={"keyword": "MYKEY123"})
    assert resp.status_code == 200
    assert resp.json()["txn_keyword"] == "MYKEY123"

    # 3. Search for the keyword
    resp = api_client.get("/api/transactions", params={"search": "MYKEY123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["transactions"][0]["txn_keyword"] == "MYKEY123"
    assert data["transactions"][0]["id"] == "test-txn-id"

    # 4. Remove the keyword
    resp = api_client.put("/api/transactions/test-txn-id/keyword", json={"keyword": ""})
    assert resp.status_code == 200
    assert resp.json()["txn_keyword"] is None

    # 5. Search again to ensure it's removed
    resp = api_client.get("/api/transactions", params={"search": "MYKEY123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
