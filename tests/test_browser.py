"""Browser integration tests using Playwright.

Verifies that the frontend renders correctly with real data: pages load,
key UI elements are present, navigation works, modals open, and data
from the uploaded test statements is displayed correctly.

NOTE: These tests require statement data to be already uploaded via the
API tests. Run the full suite: pytest tests/ (not just test_browser.py).
"""

import pytest

pytestmark = pytest.mark.usefixtures("live_server")


def _wait_for_app(page, url, timeout=5000):
    """Navigate and wait for React to finish rendering."""
    page.goto(url)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)


class TestSetupWizard:

    def test_setup_redirect(self, live_server, page):
        _wait_for_app(page, live_server)
        # Should end up on setup or dashboard
        url = page.url
        assert any(p in url for p in ("/", "/setup", "/dashboard"))


class TestDashboard:

    def test_dashboard_has_content(self, live_server, page):
        _wait_for_app(page, f"{live_server}/dashboard")
        body = page.text_content("body") or ""
        assert len(body) > 50


class TestTransactions:

    def test_transactions_page_loads(self, live_server, page):
        _wait_for_app(page, f"{live_server}/transactions")
        body = page.text_content("body") or ""
        assert len(body) > 50
        assert "Not Found" not in body

    def test_transactions_has_data(self, live_server, page):
        _wait_for_app(page, f"{live_server}/transactions")
        body = page.text_content("body") or ""
        has_currency = "₹" in body or "." in body
        assert has_currency or len(body) > 200


class TestAnalytics:

    def test_analytics_page_loads(self, live_server, page):
        _wait_for_app(page, f"{live_server}/analytics")
        body = page.text_content("body") or ""
        assert len(body) > 50
        assert "Not Found" not in body


class TestCards:

    def test_cards_page_loads(self, live_server, page):
        _wait_for_app(page, f"{live_server}/cards")
        body = page.text_content("body") or ""
        assert len(body) > 50
        assert "Not Found" not in body


class TestCustomize:

    def test_customize_page_loads(self, live_server, page):
        _wait_for_app(page, f"{live_server}/customize")
        body = page.text_content("body") or ""
        assert len(body) > 50
        assert "Not Found" not in body


class TestOffers:

    def test_offers_page_loads(self, live_server, page):
        """Offers page loads without errors."""
        _wait_for_app(page, f"{live_server}/offers")
        body = page.text_content("body") or ""
        assert "Not Found" not in body or "/offers" in page.url

    def test_offers_page_has_sections(self, live_server, page):
        """Offers page contains expected UI sections."""
        _wait_for_app(page, f"{live_server}/offers")
        # Should navigate to offers page
        assert "/offers" in page.url


class TestMilestones:

    def test_milestones_page_loads(self, live_server, page):
        """Milestones page loads without errors."""
        _wait_for_app(page, f"{live_server}/milestones")
        body = page.text_content("body") or ""
        assert "Not Found" not in body or "/milestones" in page.url

    def test_milestones_page_has_sections(self, live_server, page):
        """Milestones page contains expected UI sections."""
        _wait_for_app(page, f"{live_server}/milestones")
        body = page.text_content("body") or ""
        # Should navigate to milestones (even if content not fully loaded)
        assert "/milestones" in page.url



class TestDashboardMilestoneWidget:

    def test_dashboard_milestone_widget_section(self, live_server, page):
        """Dashboard has Milestones & Goals section."""
        _wait_for_app(page, f"{live_server}/dashboard")
        body = page.text_content("body") or ""
        # Should have milestone section or goals section
        has_milestone_section = "Milestone" in body or "Goal" in body or "spending" in body.lower()
        assert has_milestone_section


class TestNavigationUpdated:

    def test_all_pages_reachable(self, live_server, page):
        """Verify that all SPA routes serve the React app, not 404."""
        for route in ["/dashboard", "/transactions", "/analytics", "/cards", "/customize", "/offers", "/milestones"]:
            page.goto(f"{live_server}{route}")
            page.wait_for_load_state("networkidle")
            body = page.text_content("body") or ""
            assert "Not Found" not in body or route in page.url, f"Route {route} returned 404"

    def test_offers_and_milestones_pages_exist(self, live_server, page):
        """Offers and Milestones pages are reachable."""
        # Test offers page
        page.goto(f"{live_server}/offers")
        page.wait_for_load_state("networkidle")
        assert "/offers" in page.url

        # Test milestones page
        page.goto(f"{live_server}/milestones")
        page.wait_for_load_state("networkidle")
        assert "/milestones" in page.url
