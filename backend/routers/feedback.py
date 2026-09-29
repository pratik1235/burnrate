import logging
import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/feedback",
    tags=["feedback"],
)

class FeedbackRequest(BaseModel):
    text: str = Field(..., max_length=500)

@router.post("")
async def submit_feedback(payload: FeedbackRequest):
    formspree_url = os.getenv("FORMSPREE_URL")
    if not formspree_url:
        logger.warning("FORMSPREE_URL environment variable is not set. Feedback cannot be submitted.")
        raise HTTPException(status_code=500, detail="Feedback service is not configured.")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                formspree_url,
                json={"feedback": payload.text},
                headers={"Accept": "application/json"},
                timeout=10.0
            )
            response.raise_for_status()
    except Exception as e:
        logger.exception("Failed to submit feedback to remote service")
        raise HTTPException(status_code=500, detail="Failed to submit feedback. Please try again later.")

    return {"status": "ok"}
