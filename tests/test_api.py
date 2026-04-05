"""Backend API integration tests.

Tests the full stack: upload statements via the API, verify they are
parsed and stored correctly, test analytics, filtering, and CRUD
operations. Uses a temporary database — the production DB is untouched.
"""

from pathlib import Path

import pytest

from tests.synthetic_profile import (
    AXIS_STATEMENT,
    DOB_DAY,
    DOB_MONTH,
    DOB_YEAR,
    HDFC_STATEMENT,
    ICICI_STATEMENT,
    LAST4_AXIS,
    LAST4_HDFC,
    LAST4_ICICI,
    NAME,
)

FIXTURES = Path(__file__).parent / "fixtures"

STATEMENT_FILES = [
    (HDFC_STATEMENT, "hdfc", LAST4_HDFC, 35),
    (AXIS_STATEMENT, "axis", LAST4_AXIS, 12),
    (ICICI_STATEMENT, "icici", LAST4_ICICI, 4),
]

TOTAL_TRANSACTIONS = 48  # 34 (HDFC) + 10 (Axis, 2 dupes removed) + 4 (ICICI)


def _get_card_id(api_client, bank: str, last4: str) -> str:
    """Look up a card UUID from the settings endpoint."""
    resp = api_client.get("/api/settings")
    for c in resp.json().get("cards", []):
        if c["bank"] == bank and c["last4"] == last4:
            return c["id"]
    raise ValueError(f"Card {bank} ...{last4} not found")


# =====================================================================
# Setup: Complete the onboarding flow
# =====================================================================
class TestSetup:

    def test_setup_wizard(self, api_client):
        resp = api_client.post("/api/settings/setup", json={
            "name": NAME,
            "dob_day": DOB_DAY,
            "dob_month": DOB_MONTH,
            "dob_year": DOB_YEAR,
            "cards": [
                {"bank": "hdfc", "last4": LAST4_HDFC},
                {"bank": "axis", "last4": LAST4_AXIS},
                {"bank": "icici", "last4": LAST4_ICICI},
            ],
        })
        assert resp.status_code in (200, 400)

    def test_settings_readable(self, api_client):
        resp = api_client.get("/api/settings")
        assert resp.status_code == 200
        data = resp.json()
        assert data["setup_complete"] is True
        assert data["settings"]["name"] == NAME

    def test_cards_registered(self, api_client):
        resp = api_client.get("/api/settings")
        assert resp.status_code == 200
        cards = resp.json()["cards"]
        banks = {(c["bank"], c["last4"]) for c in cards}
        assert ("hdfc", LAST4_HDFC) in banks
        assert ("axis", LAST4_AXIS) in banks
        assert ("icici", LAST4_ICICI) in banks


# =====================================================================
# Statement Upload
# =====================================================================
class TestStatementUpload:

    @pytest.mark.parametrize("filename,bank,last4,expected_txns", STATEMENT_FILES)
    def test_upload_single(self, api_client, filename, bank, last4, expected_txns):
        filepath = FIXTURES / filename
        with open(filepath, "rb") as f:
            resp = api_client.post(
                "/api/statements/upload",
                files={"file": (filename, f, "application/pdf")},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success", f"Upload failed: {data}"
        assert data["count"] == expected_txns
        assert data["bank"] == bank

    def test_duplicate_upload_rejected(self, api_client):
        filepath = FIXTURES / HDFC_STATEMENT
        with open(filepath, "rb") as f:
            resp = api_client.post(
                "/api/statements/upload",
                files={"file": (HDFC_STATEMENT, f, "application/pdf")},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "duplicate"

    def test_bulk_upload(self, api_client):
        file_handles = []
        files = []
        try:
            for fname, _, _, _ in STATEMENT_FILES:
                fh = open(FIXTURES / fname, "rb")
                file_handles.append(fh)
                files.append(("files", (fname, fh, "application/pdf")))
            resp = api_client.post("/api/statements/upload-bulk", files=files)
        finally:
            for fh in file_handles:
                fh.close()
        assert resp.status_code == 200
        data = resp.json()
        assert data["duplicate"] == 3, "All 3 should be duplicates on re-upload"


# =====================================================================
# Statement Listing
# =====================================================================
class TestStatementListing:

    def test_list_statements(self, api_client):
        resp = api_client.get("/api/statements")
        assert resp.status_code == 200
        statements = resp.json()
        assert len(statements) == 3

    def test_statement_fields(self, api_client):
        resp = api_client.get("/api/statements")
        for s in resp.json():
            assert s["bank"] in ("hdfc", "axis", "icici")
            assert s["status"] == "success"
            assert s["transaction_count"] > 0
            assert s["period_start"] is not None
            assert s["period_end"] is not None
            assert "file_path" in s
            assert "file_name" in s
            assert "status_message" in s


# =====================================================================
# Transactions
# =====================================================================
class TestTransactions:

    def test_list_all(self, api_client):
        resp = api_client.get("/api/transactions")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == TOTAL_TRANSACTIONS

    def test_filter_by_card(self, api_client):
        card_id = _get_card_id(api_client, "hdfc", LAST4_HDFC)
        resp = api_client.get("/api/transactions", params={"card": card_id})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 34

    def test_filter_by_type(self, api_client):
        resp = api_client.get("/api/transactions", params={"direction": "incoming"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 2

    def test_filter_by_date(self, api_client):
        resp = api_client.get("/api/transactions", params={
            "from": "2026-02-01",
            "to": "2026-02-28",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] > 0

    def test_pagination(self, api_client):
        resp = api_client.get("/api/transactions", params={"limit": 5, "offset": 0})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["transactions"]) == 5
        assert data["total"] == TOTAL_TRANSACTIONS

    def test_search(self, api_client):
        resp = api_client.get("/api/transactions", params={"search": "amazon"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1


# =====================================================================
# Analytics
# =====================================================================
class TestAnalytics:

    def test_summary(self, api_client):
        resp = api_client.get("/api/analytics/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert "totalSpend" in data
        assert "creditLimit" in data
        assert "cardBreakdown" in data
        assert data["totalSpend"] > 0

    def test_card_breakdown(self, api_client):
        resp = api_client.get("/api/analytics/summary")
        data = resp.json()
        banks = {c["bank"] for c in data["cardBreakdown"]}
        assert "hdfc" in banks
        assert "axis" in banks
        assert "icici" in banks

    def test_category_breakdown(self, api_client):
        resp = api_client.get("/api/analytics/categories")
        assert resp.status_code == 200
        data = resp.json()
        assert "breakdown" in data
        assert len(data["breakdown"]) > 0
        for cat in data["breakdown"]:
            assert "category" in cat
            assert "amount" in cat

    def test_merchant_ranking(self, api_client):
        resp = api_client.get("/api/analytics/merchants")
        assert resp.status_code == 200

    def test_trends(self, api_client):
        resp = api_client.get("/api/analytics/trends")
        assert resp.status_code == 200
        data = resp.json()
        assert "trends" in data

    def test_statement_periods(self, api_client):
        resp = api_client.get("/api/analytics/statement-periods")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["periods"]) == 3


# =====================================================================
# Categories
# =====================================================================
class TestCategories:

    def test_list_categories(self, api_client):
        resp = api_client.get("/api/categories/all")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 10

    def test_create_custom_category(self, api_client):
        resp = api_client.post("/api/categories/custom", json={
            "name": "Test Category",
            "keywords": "testmerchant,testshop",
            "color": "#FF0000",
            "icon": "Star",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Test Category"
        self.__class__._custom_id = data["id"]

    def test_delete_custom_category(self, api_client):
        cid = getattr(self.__class__, "_custom_id", None)
        if cid:
            resp = api_client.delete(f"/api/categories/custom/{cid}")
            assert resp.status_code == 200


# =====================================================================
# Tags
# =====================================================================
class TestTags:

    def test_create_tag(self, api_client):
        resp = api_client.post("/api/tags", json={"name": "important"})
        assert resp.status_code == 200
        self.__class__._tag_id = resp.json()["id"]

    def test_list_tags(self, api_client):
        resp = api_client.get("/api/tags")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_assign_tag_to_transaction(self, api_client):
        txns_resp = api_client.get("/api/transactions", params={"limit": 1})
        tx_id = txns_resp.json()["transactions"][0]["id"]

        resp = api_client.put(
            f"/api/transactions/{tx_id}/tags",
            json={"tags": ["important"]},
        )
        assert resp.status_code == 200

        tags_resp = api_client.get(f"/api/transactions/{tx_id}/tags")
        assert tags_resp.status_code == 200
        assert "important" in tags_resp.json()["tags"]

    def test_delete_tag(self, api_client):
        tid = getattr(self.__class__, "_tag_id", None)
        if tid:
            resp = api_client.delete(f"/api/tags/{tid}")
            assert resp.status_code == 200


# =====================================================================
# Statement Management (Reparse / Delete)
# =====================================================================
class TestStatementManagement:

    def test_reparse_statement(self, api_client):
        stmts = api_client.get("/api/statements").json()
        sid = stmts[0]["id"]
        resp = api_client.post(f"/api/statements/{sid}/reparse")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"

    def test_delete_statement_cascades(self, api_client):
        """Deleting a statement should cascade-delete its transactions."""
        stmts = api_client.get("/api/statements").json()
        initial_count = len(stmts)
        sid = stmts[-1]["id"]
        all_txns = api_client.get("/api/transactions").json()["total"]

        resp = api_client.delete(f"/api/statements/{sid}")
        assert resp.status_code == 200

        stmts_after = api_client.get("/api/statements").json()
        assert len(stmts_after) == initial_count - 1

        all_txns_after = api_client.get("/api/transactions").json()["total"]
        assert all_txns_after < all_txns, "Deleting a statement should reduce transaction count"

    def test_re_upload_after_delete(self, api_client):
        """After deleting a statement, re-uploading should succeed."""
        filepath = FIXTURES / ICICI_STATEMENT
        with open(filepath, "rb") as f:
            resp = api_client.post(
                "/api/statements/upload",
                files={"file": (ICICI_STATEMENT, f, "application/pdf")},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] in ("success", "duplicate")
