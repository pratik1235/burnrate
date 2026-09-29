# Specification: Feedback / Bugs / Feature Request Feature

## Overview
This feature replaces the current behavior of opening a GitHub issue link when clicking the "Feedback/Bugs/Feature Request" card on the Customize screen. Instead, it presents an in-app modal to collect feedback directly from users, regardless of whether they have a GitHub account.

## Problem Statement
Currently, users need a GitHub account to submit feedback, which creates friction and lowers the likelihood of non-developers reporting issues or suggesting features.

## Proposed Solution

### 1. Remote API & Storage Options
Since Burnrate is a local-only app, shipping credentials (like a GitHub PAT) would expose them to the end user. Therefore, we use a public-facing API designed for unauthenticated form submissions.

*   **Selected Option: Formspree**
    *   **How it works**: The backend sends a POST request to a public Formspree endpoint (e.g., `https://formspree.io/f/YOUR_FORM_ID`).
    *   **Pros**: Clean JSON API, designed specifically for this use case. Includes built-in spam protection and forwards feedback directly to email. Free tier is suitable for expected traffic (<50 submissions/month).

### 2. Frontend Implementation
*   **Location**: Customize screen (`Feedback/Bugs/Feature Request` card).
*   **Component**: Create a new `FeedbackModal` component.
*   **UI Elements (strictly using `@cred/neopop-web`)**:
    *   **Container**: `ElevatedCard` for the modal popup.
    *   **Header**: `Typography` displaying "Feedback/Bugs/Feature Request".
    *   **Input**: `InputField` configured as a text area (~8 lines space).
    *   **Label**: `Typography` showing character limit (max 500 characters).
    *   **Actions**: `Row` containing two `Button` components: 'Cancel' and 'OK' (aligned right).
*   **Behavior**:
    *   'Cancel' closes the modal and clears the text.
    *   'OK' disables the buttons, shows a loading state, and calls the backend API.
    *   Enforce max 500 characters.
    *   Implement `AbortController` for the API call to handle component unmounting gracefully.

### 3. Backend Implementation
*   **Endpoint**: `POST /api/v1/feedback`
*   **Request Schema (Pydantic)**:
    ```python
    class FeedbackRequest(BaseModel):
        text: str = Field(..., max_length=500)
    ```
*   **Handler**:
    *   Validate the payload.
    *   Read the Formspree URL from the environment (e.g., `os.getenv("FORMSPREE_URL")`).
    *   Make an asynchronous HTTP POST request (using `httpx`) to the Formspree API.
    *   Return a generic success message to the frontend (do not expose upstream error details).

### 4. Security & Privacy
*   **Local-First Compliance**: This feature is explicitly documented as an external network call. It only sends the user's explicitly typed feedback text. No local financial data, database contents, or telemetry will be attached to the request.
*   **Secrets**: The Formspree URL will not be hardcoded. It will be loaded via environment variables (`FORMSPREE_URL`).

### 5. Testing
*   **Backend**: Add an integration test in `tests/` that mocks the `httpx.AsyncClient.post` call to ensure the endpoint validates input and returns a 200 OK without making actual network requests.
*   **Frontend**: (If applicable) Add unit tests for the modal rendering and character count validation.
