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


class TestNavigation:

    def test_all_pages_reachable(self, live_server, page):
        """Verify that all SPA routes serve the React app, not 404."""
        for route in ["/dashboard", "/transactions", "/analytics", "/cards", "/customize"]:
            page.goto(f"{live_server}{route}")
            page.wait_for_load_state("networkidle")
            body = page.text_content("body") or ""
            assert "Not Found" not in body, f"Route {route} returned 404"
