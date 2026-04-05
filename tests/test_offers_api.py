"""Integration tests for Offers API endpoints."""

import pytest


class TestOffersCRUD:
    """Test basic CRUD operations on offers."""

    def test_list_offers_empty(self, api_client):
        """GET /api/offers returns empty list initially."""
        response = api_client.get("/api/offers")
        assert response.status_code == 200
        data = response.json()
        assert "offers" in data
        assert "total" in data
        assert data["offers"] == []
        assert data["total"] == 0

    def test_create_user_offer(self, api_client):
        """POST /api/offers creates a new user offer."""
        payload = {
            "title": "10% Cashback on Swiggy",
            "description": "Valid on all food orders",
            "bank": "hdfc",
            "category": "dining",
            "offer_type": "cashback",
        }
        response = api_client.post("/api/offers", json=payload)
        assert response.status_code == 200
        offer = response.json()
        assert offer["title"] == "10% Cashback on Swiggy"
        assert offer["description"] == "Valid on all food orders"
        assert offer["isUserCreated"] is True
        assert offer["bank"] == "hdfc"
        assert "id" in offer

    def test_list_offers_after_create(self, api_client):
        """GET /api/offers returns created offer."""
        # Create an offer
        api_client.post("/api/offers", json={
            "title": "Test Offer",
            "bank": "hdfc",
        })

        # List offers
        response = api_client.get("/api/offers")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert any(o["title"] == "Test Offer" for o in data["offers"])

    def test_get_single_offer(self, api_client):
        """GET /api/offers/{id} returns a single offer."""
        # Create an offer
        create_response = api_client.post("/api/offers", json={
            "title": "Single Offer Test",
            "bank": "axis",
        })
        offer_id = create_response.json()["id"]

        # Get it
        response = api_client.get(f"/api/offers/{offer_id}")
        assert response.status_code == 200
        offer = response.json()
        assert offer["id"] == offer_id
        assert offer["title"] == "Single Offer Test"

    def test_update_user_offer(self, api_client):
        """PUT /api/offers/{id} updates a user offer."""
        # Create
        create_response = api_client.post("/api/offers", json={
            "title": "Original Title",
            "bank": "icici",
        })
        offer_id = create_response.json()["id"]

        # Update
        response = api_client.put(f"/api/offers/{offer_id}", json={
            "title": "Updated Title",
        })
        assert response.status_code == 200
        updated = response.json()
        assert updated["title"] == "Updated Title"

        # Verify
        get_response = api_client.get(f"/api/offers/{offer_id}")
        assert get_response.json()["title"] == "Updated Title"

    def test_delete_user_offer(self, api_client):
        """DELETE /api/offers/{id} deletes a user offer."""
        # Create
        create_response = api_client.post("/api/offers", json={
            "title": "To Delete",
            "bank": "hdfc",
        })
        offer_id = create_response.json()["id"]

        # Delete
        response = api_client.delete(f"/api/offers/{offer_id}")
        assert response.status_code == 200

        # Verify
        list_response = api_client.get("/api/offers")
        assert not any(o["id"] == offer_id for o in list_response.json()["offers"])


class TestOffersFiltering:
    """Test filtering and search capabilities."""

    def test_filter_by_bank(self, api_client):
        """GET /api/offers?bank=hdfc filters by bank."""
        # Create offers for different banks
        api_client.post("/api/offers", json={
            "title": "HDFC Offer",
            "bank": "hdfc",
        })
        api_client.post("/api/offers", json={
            "title": "ICICI Offer",
            "bank": "icici",
        })

        # Filter by bank
        response = api_client.get("/api/offers?bank=hdfc")
        assert response.status_code == 200
        offers = response.json()["offers"]
        assert all(o["bank"] == "hdfc" for o in offers)
        assert any(o["title"] == "HDFC Offer" for o in offers)
        assert not any(o["title"] == "ICICI Offer" for o in offers)

    def test_filter_by_category(self, api_client):
        """GET /api/offers?category=dining filters by category."""
        api_client.post("/api/offers", json={
            "title": "Dining Offer",
            "category": "dining",
        })
        api_client.post("/api/offers", json={
            "title": "Shopping Offer",
            "category": "shopping",
        })

        response = api_client.get("/api/offers?category=dining")
        assert response.status_code == 200
        offers = response.json()["offers"]
        assert all(o["category"] == "dining" for o in offers)

    def test_filter_by_multiple_banks(self, api_client):
        """GET /api/offers?banks=hdfc,icici returns offers for any listed bank."""
        api_client.post("/api/offers", json={"title": "HDFC Only", "bank": "hdfc"})
        api_client.post("/api/offers", json={"title": "ICICI Only", "bank": "icici"})
        api_client.post("/api/offers", json={"title": "Axis Only", "bank": "axis"})

        response = api_client.get("/api/offers?banks=hdfc,icici")
        assert response.status_code == 200
        offers = response.json()["offers"]
        titles = {o["title"] for o in offers}
        assert "HDFC Only" in titles
        assert "ICICI Only" in titles
        assert "Axis Only" not in titles

    def test_filter_by_multiple_categories(self, api_client):
        """GET /api/offers?categories=dining,travel matches either category."""
        api_client.post("/api/offers", json={"title": "Dine", "category": "dining"})
        api_client.post("/api/offers", json={"title": "Fly", "category": "travel"})
        api_client.post("/api/offers", json={"title": "Shop", "category": "shopping"})

        response = api_client.get("/api/offers?categories=dining,travel")
        assert response.status_code == 200
        offers = response.json()["offers"]
        titles = {o["title"] for o in offers}
        assert "Dine" in titles
        assert "Fly" in titles
        assert "Shop" not in titles

    def test_filter_by_offer_type(self, api_client):
        """GET /api/offers?offer_type=cashback filters by type."""
        api_client.post("/api/offers", json={
            "title": "Cashback Offer",
            "offer_type": "cashback",
        })
        api_client.post("/api/offers", json={
            "title": "Points Offer",
            "offer_type": "points",
        })

        response = api_client.get("/api/offers?offer_type=cashback")
        assert response.status_code == 200
        offers = response.json()["offers"]
        assert all(o["offerType"] == "cashback" for o in offers)

    def test_search_offers(self, api_client):
        """GET /api/offers?search=swiggy finds matching offers."""
        api_client.post("/api/offers", json={
            "title": "10% Cashback on Swiggy",
            "description": "Valid on all orders",
        })
        api_client.post("/api/offers", json={
            "title": "Other Offer",
            "description": "Not related",
        })

        response = api_client.get("/api/offers?search=swiggy")
        assert response.status_code == 200
        offers = response.json()["offers"]
        assert any("Swiggy" in o["title"] for o in offers)

    def test_search_escapes_wildcards(self, api_client):
        """GET /api/offers?search=%_\\ escapes special characters."""
        api_client.post("/api/offers", json={
            "title": "Test Offer",
        })

        # Search with special characters should not cause SQL injection
        response = api_client.get("/api/offers?search=%_%5C")
        assert response.status_code == 200
        # Should return empty or safe result, not error
        data = response.json()
        assert "offers" in data

    def test_pagination(self, api_client):
        """GET /api/offers?limit=2&offset=0 paginates results."""
        # Create 5 offers
        for i in range(5):
            api_client.post("/api/offers", json={
                "title": f"Offer {i}",
            })

        # Get first 2
        response = api_client.get("/api/offers?limit=2&offset=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["offers"]) == 2
        assert data["total"] >= 5

        # Get next 2
        response = api_client.get("/api/offers?limit=2&offset=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data["offers"]) == 2

    def test_exclude_expired_by_default(self, api_client, db):
        """Expired offers excluded from default GET."""
        from datetime import datetime, timedelta
        from backend.models.models import CardOffer

        # Create an offer directly in DB as expired
        past_date = (datetime.now() - timedelta(days=1)).date()
        offer = CardOffer(
            title="Expired Offer",
            source="test",
            source_id="test-1",
            is_expired=True,
            valid_until=past_date,
        )
        db.add(offer)
        db.commit()

        response = api_client.get("/api/offers")
        assert response.status_code == 200
        offers = response.json()["offers"]
        assert not any(o["title"] == "Expired Offer" for o in offers)

    def test_include_expired_with_flag(self, api_client, db):
        """Expired offers shown with include_expired=true."""
        from datetime import datetime, timedelta
        from backend.models.models import CardOffer

        # Create an expired offer in DB
        past_date = (datetime.now() - timedelta(days=1)).date()
        offer = CardOffer(
            title="Expired Offer For Flag Test",
            source="test",
            source_id="test-2",
            is_expired=True,
            valid_until=past_date,
        )
        db.add(offer)
        db.commit()

        response = api_client.get("/api/offers?include_expired=true")
        assert response.status_code == 200
        offers = response.json()["offers"]
        assert any(o["title"] == "Expired Offer For Flag Test" for o in offers)

    def test_exclude_hidden_by_default(self, api_client):
        """Hidden offers excluded from default GET."""
        # Create and hide an offer
        create_response = api_client.post("/api/offers", json={
            "title": "To Hide",
        })
        offer_id = create_response.json()["id"]

        api_client.post(f"/api/offers/{offer_id}/hide")

        # Should not appear in default list
        response = api_client.get("/api/offers")
        offers = response.json()["offers"]
        assert not any(o["id"] == offer_id for o in offers)

    def test_include_hidden_with_flag(self, api_client):
        """Hidden offers shown with include_hidden=true."""
        # Create and hide
        create_response = api_client.post("/api/offers", json={
            "title": "To Hide For Flag Test",
        })
        offer_id = create_response.json()["id"]
        api_client.post(f"/api/offers/{offer_id}/hide")

        # Should appear with flag
        response = api_client.get("/api/offers?include_hidden=true")
        offers = response.json()["offers"]
        assert any(o["id"] == offer_id for o in offers)


class TestOffersHideUnhide:
    """Test hide/unhide functionality."""

    def test_hide_offer(self, api_client):
        """POST /api/offers/{id}/hide hides an offer."""
        create_response = api_client.post("/api/offers", json={
            "title": "To Hide",
        })
        offer_id = create_response.json()["id"]

        response = api_client.post(f"/api/offers/{offer_id}/hide")
        assert response.status_code == 200
        hidden = response.json()
        assert hidden["isHidden"] is True

    def test_unhide_offer(self, api_client):
        """POST /api/offers/{id}/unhide unhides an offer."""
        create_response = api_client.post("/api/offers", json={
            "title": "To Unhide",
        })
        offer_id = create_response.json()["id"]

        # Hide it
        api_client.post(f"/api/offers/{offer_id}/hide")

        # Unhide it
        response = api_client.post(f"/api/offers/{offer_id}/unhide")
        assert response.status_code == 200
        unhidden = response.json()
        assert unhidden["isHidden"] is False


class TestOffersSyncStatus:
    """Test sync status and triggering."""

    def test_sync_status_endpoint(self, api_client):
        """GET /api/offers/sync-status returns provider status."""
        response = api_client.get("/api/offers/sync-status")
        assert response.status_code == 200
        data = response.json()
        assert "providers" in data
        assert isinstance(data["providers"], list)
        # Each provider should have these fields or be empty initially
        if data["providers"]:
            for provider in data["providers"]:
                assert "provider" in provider

    def test_trigger_sync(self, api_client):
        """POST /api/offers/sync triggers a manual sync."""
        response = api_client.post("/api/offers/sync")
        assert response.status_code == 200
        # Sync should return immediately with status
        data = response.json()
        assert "status" in data or "message" in data
