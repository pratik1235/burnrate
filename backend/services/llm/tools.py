"""Tool definitions for LLM function calling."""

from backend.services.llm.provider_base import ToolDefinition

COMMON_FILTER_PROPERTIES = {
    "from_date": {"type": "string", "description": "Start date in YYYY-MM-DD format"},
    "to_date": {"type": "string", "description": "End date in YYYY-MM-DD format"},
    "cards": {"type": "string", "description": "Comma-separated card UUIDs to filter by"},
    "categories": {"type": "string", "description": "Comma-separated category slugs to filter by"},
    "direction": {"type": "string", "enum": ["incoming", "outgoing"], "description": "Filter by transaction direction"},
    "tags": {"type": "string", "description": "Comma-separated tag names to filter by"},
    "source": {"type": "string", "enum": ["CC", "BANK"], "description": "Filter by source type"},
    "amount_min": {"type": "number", "description": "Minimum transaction amount"},
    "amount_max": {"type": "number", "description": "Maximum transaction amount"},
    "bank_accounts": {"type": "string", "description": "Comma-separated bank:last4 pairs"},
}

TOOL_DEFINITIONS = [
    ToolDefinition(
        name="query_transactions",
        description="Search and filter transactions. Returns up to 50 matching transactions with merchant, amount, date, category, and type.",
        parameters={
            "type": "object",
            "properties": {
                **COMMON_FILTER_PROPERTIES,
                "search": {"type": "string", "description": "Search term to match against merchant names"},
                "limit": {"type": "integer", "description": "Max results to return (default 50, max 50)"},
            },
        },
    ),
    ToolDefinition(
        name="get_spend_summary",
        description="Get total net spend, currency breakdown, and per-card breakdown for a date range.",
        parameters={
            "type": "object",
            "properties": COMMON_FILTER_PROPERTIES,
        },
    ),
    ToolDefinition(
        name="get_category_breakdown",
        description="Get spending broken down by category with amounts, percentages, and transaction counts.",
        parameters={
            "type": "object",
            "properties": COMMON_FILTER_PROPERTIES,
        },
    ),
    ToolDefinition(
        name="get_monthly_trends",
        description="Get monthly net spend over time. Useful for seeing spending patterns across months.",
        parameters={
            "type": "object",
            "properties": {
                **COMMON_FILTER_PROPERTIES,
                "months": {"type": "integer", "description": "Number of months to look back (default 12)"},
            },
        },
    ),
    ToolDefinition(
        name="get_top_merchants",
        description="Get top merchants ranked by total spend amount.",
        parameters={
            "type": "object",
            "properties": {
                **COMMON_FILTER_PROPERTIES,
                "limit": {"type": "integer", "description": "Number of top merchants to return (default 10)"},
            },
        },
    ),
    ToolDefinition(
        name="list_cards",
        description="List all registered credit cards and bank accounts with their IDs, bank names, and last 4 digits. Optionally filter by bank name or last4 digits. Call this first when the user mentions a specific card.",
        parameters={
            "type": "object",
            "properties": {
                "bank": {"type": "string", "description": "Optional: Filter by bank name (case insensitive)"},
                "last4": {"type": "string", "description": "Optional: Filter by last 4 digits"},
            },
        },
    ),
    ToolDefinition(
        name="get_card_by_identifier",
        description="Look up a specific card by bank name and/or last 4 digits. Returns the card UUID, full details, or an error if not found. Use this when the user mentions a specific card (e.g., 'my HDFC card ending in 1234').",
        parameters={
            "type": "object",
            "properties": {
                "bank": {"type": "string", "description": "Bank name (hdfc, icici, axis, etc.) - case insensitive"},
                "last4": {"type": "string", "description": "Last 4 digits of card number"},
            },
            "required": [],
        },
    ),
    ToolDefinition(
        name="get_categories",
        description="List all available spending categories with their slugs. Call this first when the user references a category by name to get the correct slug.",
        parameters={
            "type": "object",
            "properties": {},
        },
    ),
    ToolDefinition(
        name="get_statement_periods",
        description="Get the date ranges of all imported statements. Useful for understanding what data is available.",
        parameters={
            "type": "object",
            "properties": {},
        },
    ),
    ToolDefinition(
        name="detect_subscriptions",
        description="Detect recurring payments and subscriptions from transaction patterns. Identifies merchants with regular charges at consistent intervals (weekly, monthly, yearly). Useful for finding subscription services like Netflix, Spotify, gym memberships, etc.",
        parameters={
            "type": "object",
            "properties": {
                "from_date": {"type": "string", "description": "Start date in YYYY-MM-DD format (default: 12 months ago)"},
                "to_date": {"type": "string", "description": "End date in YYYY-MM-DD format (default: today)"},
                "cards": {"type": "string", "description": "Comma-separated card UUIDs to filter by"},
                "source": {"type": "string", "enum": ["CC", "BANK"], "description": "Filter by source type"},
                "bank_accounts": {"type": "string", "description": "Comma-separated bank:last4 pairs"},
                "min_amount": {"type": "number", "description": "Minimum transaction amount to consider"},
            },
        },
    ),
]
