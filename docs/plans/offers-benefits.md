# Offers & Benefits Implementation Plan

## Overview

The Offers & Benefits feature allows Burnrate to fetch and display credit card offers from aggregator websites and bank product pages. Offers are fetched at application launch, cached locally in the database, and made available for filtering, searching, and management through the frontend.

## Rationale

Users need a centralized view of all available credit card offers relevant to their cards. Rather than requiring manual entry, offers are automatically sourced from public data providers, reducing user friction while maintaining quality through filtering and deduplication.

## Architecture

### Data Model

**CardOffer** — Normalized offer records
- Unique per provider (source + source_id) but deduplicated by content
- Fields: title, description, merchant, discount_text, offer_type, bank, card_template_id, network, min_transaction, max_discount, valid_from, valid_until, is_expired, category, source, source_url, is_user_created, is_hidden, fetched_at
- Soft deletes via is_hidden for user preferences
- Hard deletes only for user-created offers

**CardOfferCard** — Junction table
- Links offers to user cards via bank/template_id/network matching
- Populated after each sync

**SyncMetadata** — Provider status tracking
- Per-provider: last_sync_at, last_status, offers_fetched, error_message
- Enables incremental sync and retry logic

### Providers

Five data sources, prioritizing public aggregators over scraping:

1. **CardExpertProvider** — WordPress blog with manually curated offers
   - URL: cardexpert.in/tag/{bank}-offers/
   - Stable, human-maintained content

2. **PaisaBazaarProvider** (future) — Card comparison platform
   - URL pattern: paisabazaar.com/credit-card/{bank_slug}/{card_slug}/
   - Most comprehensive, updated frequently

3. **HDFCOfferProvider** — Official bank page
   - URL: hdfcbank.com/personal/pay/cards/credit-cards/credit-cards-offers
   - Bank-sourced, authoritative

4. **SBICardOfferProvider** — Official bank page
   - URL: sbicard.com/en/personal/offers.page
   - Bank-sourced, authoritative

5. **ICICIOfferProvider**, **AxisOfferProvider** — Similar official pages
   - Consistent pattern across all major issuers

### Fetch Strategy

- **Rate limiting**: 1 request/sec per domain, 2 retries with exponential backoff
- **Timeout**: 30 seconds per request
- **Error handling**: Graceful degradation — one provider failure doesn't block others
- **Schedule**: Every 6 hours (configurable via OFFER_SYNC_INTERVAL)
- **Startup**: Sync begins 5 seconds after app startup (after database connection)

### Normalization

Raw offers are normalized to a standard schema:
- Multiple merchants/categories are parsed into comma-separated values
- Discount text is extracted from natural language descriptions
- Bank is inferred from source or explicitly provided
- Category mapping uses OFFER_CATEGORY_MAP (e.g., "dining" → "dining")
- Expired offers are marked via is_expired (not deleted, for historical tracking)

## Frontend

### Pages

**Offers.tsx** — Browsable offer catalog
- Search by title/description/merchant
- Filter by bank, category, offer_type, source
- Toggle between showing all and hiding specific offers (is_hidden)
- Create manual offers for custom benefits
- Last sync timestamp and manual refresh button
- Disclaimer: "Offers are sourced from public bank pages and aggregator sites. Verify with your card issuer before use."

### API Endpoints

```
GET /api/offers
  ?search=swiggy &bank=hdfc &category=dining &include_expired=false &include_hidden=false
  &limit=50 &offset=0
  → {offers[], total, lastSyncAt}

POST /api/offers
  {title, description, bank, category, offer_type}
  → {id, ...offer, isUserCreated: true}

PUT /api/offers/{id}
  {title, description, ...} (user-created only)
  → {updated offer}

DELETE /api/offers/{id} (user-created only)
  → 200

POST /api/offers/{id}/hide
  → {id, isHidden: true}

POST /api/offers/{id}/unhide
  → {id, isHidden: false}

POST /api/offers/sync (manual trigger)
  → {status, message}

GET /api/offers/sync-status
  → {providers: [{provider, lastSyncAt, lastStatus, offersFetched, errorMessage}]}
```

### UX Considerations

- Offers for the user's cards are highlighted/prominently displayed
- Search uses full-text matching on title, description, merchant
- Expired offers are hidden by default but available with a toggle
- User-created offers can be edited/deleted; fetched offers can only be hidden
- Network badge shows offer source (bank website, CardExpert, PaisaBazaar)
- Valid until date shown when available

## Implementation Checklist

- ✅ Backend: models (CardOffer, CardOfferCard, SyncMetadata)
- ✅ Backend: offer_fetcher service with 5 provider implementations
- ✅ Backend: background sync loop in app lifespan
- ✅ Backend: offers router with CRUD + filtering + search
- ✅ Frontend: Offers page with grid layout, filters, create modal
- ✅ Frontend: API integration (getOffers, createOffer, hideOffer, etc.)
- ✅ Frontend: Navbar integration (Offers tab)
- ✅ Frontend: App routing (/offers path)
- ☐ Tests: API integration tests (CRUD, filtering, search safety)
- ☐ Tests: Playwright browser tests (page load, form interaction)
- ☐ Verification: Playwright MCP visual inspection

## Related Issues

- Issue #6: Offers & Benefits
- Constitution §8.1 exemption: Explicit permission for outbound HTTP for offer fetching
