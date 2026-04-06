"""PUT /api/settings card list sync: removed cards are cascade-deleted.

Runs as the last `test_*.py` module (alphabetical) so the shared session DB is
not mutated before other integration tests.
"""

import pytest

from tests.synthetic_profile import LAST4_AXIS, LAST4_HDFC, LAST4_ICICI, NAME


def _get_card_id(api_client, bank: str, last4: str) -> str:
    resp = api_client.get("/api/settings")
    for c in resp.json().get("cards", []):
        if c["bank"] == bank and c["last4"] == last4:
            return c["id"]
    raise ValueError(f"Card {bank} ...{last4} not found")


class TestSettingsCardRemoval:
    def test_put_settings_removes_cards_absent_from_payload(self, api_client):
        icici_id = _get_card_id(api_client, "icici", LAST4_ICICI)
        before = api_client.get("/api/transactions", params={"card": icici_id}).json()
        icici_total = before["total"]
        assert icici_total > 0

        all_before = api_client.get("/api/transactions").json()["total"]

        resp = api_client.put(
            "/api/settings",
            json={
                "name": NAME,
                "cards": [
                    {"bank": "hdfc", "last4": LAST4_HDFC},
                    {"bank": "axis", "last4": LAST4_AXIS},
                ],
            },
        )
        assert resp.status_code == 200

        settings = api_client.get("/api/settings").json()
        keys = {(c["bank"], c["last4"]) for c in settings["cards"]}
        assert ("icici", LAST4_ICICI) not in keys
        assert len(settings["cards"]) == 2

        after_all = api_client.get("/api/transactions").json()["total"]
        assert after_all == all_before - icici_total
