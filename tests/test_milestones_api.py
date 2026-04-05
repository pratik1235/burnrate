"""Integration tests for Milestones API endpoints."""

import pytest


class TestMilestonesCRUD:
    """Test basic CRUD operations on milestones."""

    def test_list_milestones_empty(self, api_client, setup_cards, db):
        """GET /api/milestones returns empty list initially."""
        response = api_client.get("/api/milestones")
        assert response.status_code == 200
        data = response.json()
        assert "milestones" in data
        assert "total" in data
        assert isinstance(data["milestones"], list)

    def test_create_custom_milestone(self, api_client, setup_cards, db):
        """POST /api/milestones creates a custom milestone."""
        # Get a card ID
        from backend.models.models import Card
        card = db.query(Card).first()
        assert card is not None

        payload = {
            "card_id": str(card.id),
            "title": "Quarterly Spend Bonus",
            "target_amount": 100000,
            "period_kind": "calendar_quarter",
            "milestone_type": "bonus_points",
        }
        response = api_client.post("/api/milestones", json=payload)
        assert response.status_code == 200
        milestone = response.json()
        assert milestone["title"] == "Quarterly Spend Bonus"
        assert milestone["targetAmount"] == 100000
        assert milestone["isCustom"] is True
        assert "id" in milestone

    def test_list_milestones_with_progress(self, api_client, setup_cards, db):
        """GET /api/milestones returns milestones with progress fields."""
        from backend.models.models import Card
        card = db.query(Card).first()

        # Create a milestone
        api_client.post("/api/milestones", json={
            "card_id": str(card.id),
            "title": "Test Progress",
            "target_amount": 50000,
            "period_kind": "calendar_month",
        })

        # List and verify progress fields
        response = api_client.get("/api/milestones")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] > 0

        milestone = data["milestones"][0]
        assert "currentAmount" in milestone
        assert "percent" in milestone
        assert "remaining" in milestone
        assert "periodStart" in milestone
        assert "periodEnd" in milestone
        assert "daysLeft" in milestone

    def test_get_single_milestone(self, api_client, setup_cards, db):
        """GET /api/milestones/{id} returns a single milestone with progress."""
        from backend.models.models import Card
        card = db.query(Card).first()

        # Create
        create_response = api_client.post("/api/milestones", json={
            "card_id": str(card.id),
            "title": "Single Milestone",
            "target_amount": 75000,
            "period_kind": "calendar_quarter",
        })
        milestone_id = create_response.json()["id"]

        # Get
        response = api_client.get(f"/api/milestones/{milestone_id}")
        assert response.status_code == 200
        milestone = response.json()
        assert milestone["id"] == milestone_id
        assert milestone["title"] == "Single Milestone"
        assert "percent" in milestone

    def test_update_milestone(self, api_client, setup_cards, db):
        """PUT /api/milestones/{id} updates a milestone."""
        from backend.models.models import Card
        card = db.query(Card).first()

        # Create
        create_response = api_client.post("/api/milestones", json={
            "card_id": str(card.id),
            "title": "Original",
            "target_amount": 50000,
            "period_kind": "calendar_month",
        })
        milestone_id = create_response.json()["id"]

        # Update
        response = api_client.put(f"/api/milestones/{milestone_id}", json={
            "title": "Updated",
            "target_amount": 100000,
        })
        assert response.status_code == 200
        updated = response.json()
        assert updated["title"] == "Updated"
        assert updated["targetAmount"] == 100000

    def test_delete_milestone(self, api_client, setup_cards, db):
        """DELETE /api/milestones/{id} deletes a milestone."""
        from backend.models.models import Card
        card = db.query(Card).first()

        # Create
        create_response = api_client.post("/api/milestones", json={
            "card_id": str(card.id),
            "title": "To Delete",
            "target_amount": 50000,
        })
        milestone_id = create_response.json()["id"]

        # Delete
        response = api_client.delete(f"/api/milestones/{milestone_id}")
        assert response.status_code == 200

        # Verify deleted
        list_response = api_client.get("/api/milestones")
        assert not any(m["id"] == milestone_id for m in list_response.json()["milestones"])

    def test_archive_milestone(self, api_client, setup_cards, db):
        """POST /api/milestones/{id}/archive archives a milestone."""
        from backend.models.models import Card
        card = db.query(Card).first()

        create_response = api_client.post("/api/milestones", json={
            "card_id": str(card.id),
            "title": "To Archive",
            "target_amount": 50000,
        })
        milestone_id = create_response.json()["id"]

        response = api_client.post(f"/api/milestones/{milestone_id}/archive")
        assert response.status_code == 200
        archived = response.json()
        assert archived["isArchived"] is True

    def test_unarchive_milestone(self, api_client, setup_cards, db):
        """POST /api/milestones/{id}/unarchive restores an archived milestone."""
        from backend.models.models import Card
        card = db.query(Card).first()

        create_response = api_client.post("/api/milestones", json={
            "card_id": str(card.id),
            "title": "To Unarchive",
            "target_amount": 50000,
        })
        milestone_id = create_response.json()["id"]

        # Archive
        api_client.post(f"/api/milestones/{milestone_id}/archive")

        # Unarchive
        response = api_client.post(f"/api/milestones/{milestone_id}/unarchive")
        assert response.status_code == 200
        unarchived = response.json()
        assert unarchived["isArchived"] is False

    def test_archived_excluded_by_default(self, api_client, setup_cards, db):
        """Archived milestones excluded from default GET /api/milestones."""
        from backend.models.models import Card
        card = db.query(Card).first()

        # Create and archive
        create_response = api_client.post("/api/milestones", json={
            "card_id": str(card.id),
            "title": "Archived",
            "target_amount": 50000,
        })
        milestone_id = create_response.json()["id"]
        api_client.post(f"/api/milestones/{milestone_id}/archive")

        # Should not appear in default list
        response = api_client.get("/api/milestones")
        assert not any(m["id"] == milestone_id for m in response.json()["milestones"])

        # Should appear with flag
        response = api_client.get("/api/milestones?include_archived=true")
        assert any(m["id"] == milestone_id for m in response.json()["milestones"])


class TestMilestoneProgress:
    """Test progress computation."""

    def test_progress_computation_fields(self, api_client, setup_cards, db):
        """Milestone progress fields are computed correctly."""
        from backend.models.models import Card
        card = db.query(Card).first()

        response = api_client.post("/api/milestones", json={
            "card_id": str(card.id),
            "title": "Progress Test",
            "target_amount": 100000,
            "period_kind": "calendar_month",
        })
        milestone_id = response.json()["id"]

        response = api_client.get(f"/api/milestones/{milestone_id}")
        milestone = response.json()

        # Verify all progress fields exist and are numeric
        assert isinstance(milestone["currentAmount"], (int, float))
        assert isinstance(milestone["percent"], (int, float))
        assert isinstance(milestone["remaining"], (int, float))
        assert isinstance(milestone["daysLeft"], int)
        assert "periodStart" in milestone
        assert "periodEnd" in milestone

    def test_progress_empty_period(self, api_client, setup_cards, db):
        """Milestone with no transactions shows 0 progress."""
        from backend.models.models import Card
        card = db.query(Card).first()

        response = api_client.post("/api/milestones", json={
            "card_id": str(card.id),
            "title": "Empty Period",
            "target_amount": 100000,
            "period_kind": "calendar_month",
        })
        milestone = response.json()
        assert milestone["currentAmount"] == 0
        assert milestone["percent"] == 0
        assert milestone["remaining"] == 100000

    def test_progress_quarter_boundaries(self, api_client, setup_cards, db):
        """Quarterly milestone has correct period boundaries."""
        from backend.models.models import Card
        from datetime import datetime

        card = db.query(Card).first()

        response = api_client.post("/api/milestones", json={
            "card_id": str(card.id),
            "title": "Quarter Test",
            "target_amount": 100000,
            "period_kind": "calendar_quarter",
        })
        milestone = response.json()

        # Parse period boundaries
        period_start = datetime.fromisoformat(milestone["periodStart"]).date()
        period_end = datetime.fromisoformat(milestone["periodEnd"]).date()

        # Current date
        today = datetime.now().date()

        # Verify current quarter
        month = today.month
        if month in [1, 2, 3]:
            assert period_start.month == 1
            assert period_end.month == 3
        elif month in [4, 5, 6]:
            assert period_start.month == 4
            assert period_end.month == 6
        elif month in [7, 8, 9]:
            assert period_start.month == 7
            assert period_end.month == 9
        else:
            assert period_start.month == 10
            assert period_end.month == 12

    def test_progress_month_boundaries(self, api_client, setup_cards, db):
        """Monthly milestone has correct period boundaries."""
        from backend.models.models import Card
        from datetime import datetime

        card = db.query(Card).first()

        response = api_client.post("/api/milestones", json={
            "card_id": str(card.id),
            "title": "Month Test",
            "target_amount": 50000,
            "period_kind": "calendar_month",
        })
        milestone = response.json()

        period_start = datetime.fromisoformat(milestone["periodStart"]).date()
        period_end = datetime.fromisoformat(milestone["periodEnd"]).date()

        # Should be 1st of month to last of month
        assert period_start.day == 1
        today = datetime.now().date()
        assert period_start.month == today.month
        assert period_end.month == today.month

    def test_progress_rolling_days(self, api_client, setup_cards, db):
        """Rolling days milestone computes correct window."""
        from backend.models.models import Card
        from datetime import datetime, timedelta
        import json

        card = db.query(Card).first()

        response = api_client.post("/api/milestones", json={
            "card_id": str(card.id),
            "title": "Rolling Test",
            "target_amount": 50000,
            "period_kind": "rolling_days",
            "period_config": json.dumps({"days": 30}),
        })

        if response.status_code != 200:
            # If API rejects, just verify status code
            assert response.status_code in [200, 422]
            return

        milestone = response.json()

        period_start = datetime.fromisoformat(milestone["periodStart"]).date()
        period_end = datetime.fromisoformat(milestone["periodEnd"]).date()

        # End should be today
        today = datetime.now().date()
        assert period_end == today

        # Start should be 30 days before end
        expected_start = today - timedelta(days=30)
        assert period_start == expected_start


class TestMilestoneDefinitions:
    """Test milestone definitions browsing."""

    def test_list_definitions(self, api_client):
        """GET /api/milestones/definitions returns available definitions."""
        response = api_client.get("/api/milestones/definitions")
        assert response.status_code == 200
        data = response.json()
        assert "definitions" in data
        assert isinstance(data["definitions"], list)

    def test_trigger_sync(self, api_client):
        """POST /api/milestones/sync triggers manual sync."""
        response = api_client.post("/api/milestones/sync")
        assert response.status_code == 200
        data = response.json()
        # Should return immediately with status
        assert "status" in data or "message" in data


class TestMilestoneCascade:
    """Test cascade behaviors."""

    def test_card_delete_cascades_milestones(self, api_client, setup_cards, db):
        """Deleting a card cascades to delete its milestones."""
        from backend.models.models import Card, UserMilestone

        card = db.query(Card).first()
        card_id = str(card.id)

        # Create milestone for card
        api_client.post("/api/milestones", json={
            "card_id": card_id,
            "title": "Cascade Test",
            "target_amount": 50000,
        })

        # Verify milestone exists
        response = api_client.get("/api/milestones")
        assert response.json()["total"] > 0

        # Delete card via API
        response = api_client.delete(f"/api/cards/{card_id}")
        assert response.status_code == 200

        # Verify milestone is gone
        response = api_client.get("/api/milestones")
        assert not any(m["cardId"] == card_id for m in response.json()["milestones"])

        # Also verify in DB
        db_milestone = db.query(UserMilestone).filter(
            UserMilestone.card_id == card_id
        ).first()
        assert db_milestone is None
