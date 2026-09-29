from unittest.mock import patch, AsyncMock
import pytest

def test_feedback_api_success(api_client, monkeypatch):
    monkeypatch.setenv("FORMSPREE_URL", "https://formspree.io/f/test")
    
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value.status_code = 200
        
        response = api_client.post("/api/feedback", json={"text": "This is a test feedback."})
        
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        mock_post.assert_called_once()
        assert mock_post.call_args[0][0] == "https://formspree.io/f/test"
        assert mock_post.call_args[1]["json"] == {"feedback": "This is a test feedback."}

def test_feedback_api_missing_url(api_client, monkeypatch):
    monkeypatch.delenv("FORMSPREE_URL", raising=False)
    
    response = api_client.post("/api/feedback", json={"text": "This is a test feedback."})
    assert response.status_code == 500
    assert "Feedback service is not configured" in response.json()["detail"]

def test_feedback_api_too_long(api_client):
    long_text = "a" * 501
    response = api_client.post("/api/feedback", json={"text": long_text})
    assert response.status_code == 422
