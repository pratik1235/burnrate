# Milestones & Spending Goals Implementation Plan

## Overview

The Milestones feature allows users to set and track spending targets for their credit cards. Milestone definitions are fetched from public sources and used to auto-seed user milestones, while custom milestones can be created manually. Progress is computed in real-time based on transaction data.

## Rationale

Credit card benefits often have spending thresholds (annual fee waiver at ₹X spend, bonus points after ₹Y quarterly spend, lounge access at ₹Z annual spend). Rather than requiring users to manually track these, Burnrate automatically detects applicable milestones for each card and displays progress toward completion.

## Architecture

### Data Model

**MilestoneDefinition** — Known milestone templates sourced from the internet
- Per card template and bank
- Fields: source (PaisaBazaar, HDFC, BUILTIN), source_url, card_template_id, bank, title, description, milestone_type, target_amount, period_kind, period_config (JSON), reward_description, reward_value, category_filter, exclude_categories, is_active, fetched_at
- Indexed by card_template_id for fast lookup

**UserMilestone** — Per-user tracker linking to card and optionally to definition
- References CardDefinition or is_custom (is_custom=1, definition_id=null)
- Fields: card_id, definition_id, title, target_amount, period_kind, period_config, milestone_type, reward_description, category_filter, exclude_categories, is_auto_created, is_archived, is_custom, progress fields (computed on-read)
- is_auto_created=true when auto-seeded from definition
- is_custom=true when manually created by user
- is_archived=true hides from default view but preserves data

**Progress Fields (computed on-read):**
- currentAmount: Sum of spend for card + category filters within period
- percent: (currentAmount / targetAmount) * 100
- remaining: targetAmount - currentAmount
- periodStart, periodEnd: Resolved from period_kind
- daysLeft: Days until periodEnd

### Period Types

Milestones support multiple period kinds:

1. **calendar_month** — Current calendar month (1st to last day)
2. **calendar_quarter** — Current calendar quarter (Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec)
3. **calendar_year** — Current calendar year (Jan 1 - Dec 31)
4. **rolling_days** — Last N days (config: {days: 30})
5. **fixed_range** — Explicit date range (config: {start: "2026-01-01", end: "2026-03-31"})

### Milestone Types

Semantic categories for UI display and filtering:
- fee_waiver
- bonus_points
- lounge_access
- accelerated_rewards
- voucher
- cashback
- other

### Fetch Sources

**PaisaBazaarProvider**
- Scrapes card review pages (e.g., paisabazaar.com/credit-card/hdfc/hdfc-millennia-card/)
- Uses regex to extract milestone patterns: "spend ₹X in quarter to get Y", "annual fee waiver on ₹Z spend"
- Matches to known card templates via PAISABAZAAR_CARD_SLUGS mapping

**HDFCMilestoneProvider** (future expansion)
- Parses HDFC product pages for fee waiver thresholds, milestone definitions

**BUILTIN_MILESTONES** (hardcoded knowledge base)
- Well-known milestones for premium cards (HDFC Millennia, Diners Black, ICICI Premium, etc.)
- Ensures availability even if scraping fails
- Examples:
  - HDFC Millennia: ₹15,000 quarterly spend → 5% cashback + fee waiver
  - ICICI Premium: ₹1,00,000 annual fee waiver
  - Axis Premium: Lounge access at ₹5,00,000 annual spend

### Auto-Seeding

On app startup and after each milestone sync:

1. For each user card (Card.id):
   - Look up card's template_id (CardTemplate.id)
   - Find all applicable MilestoneDefinitions:
     - By exact template_id match, OR
     - By bank match (when template_id not available)
   - For each definition that doesn't already have a UserMilestone:
     - Create UserMilestone with is_auto_created=1

This ensures users always see applicable milestones without manual action.

## Frontend

### Pages

**Milestones.tsx** — User's milestone tracker
- Grouped by card (CardGroup showing "BANK ···· LAST4")
- Per milestone: title, type badge, auto-created badge, current/target amounts, progress bar, remaining, days left
- Archive/restore for auto-created milestones
- Delete for custom milestones
- Create custom milestone modal
- Manual sync button + last sync timestamp
- Disclaimer: "Milestone targets are sourced from public bank information. Actual terms may differ — verify with your card issuer."

**Dashboard Widget** (Milestones.tsx)
- Top 3 milestones by closest deadline or highest percent
- Compact progress bars with title, percent, remaining
- Link to full milestones page

### API Endpoints

```
GET /api/milestones
  ?cardId=uuid &include_archived=false
  → {milestones: [{id, cardId, title, percent, currentAmount, targetAmount, daysLeft, ...}], total}

GET /api/milestones/{id}
  → {milestone with progress fields}

POST /api/milestones
  {cardId, title, targetAmount, periodKind, milestoneType, rewardDescription}
  → {id, ...milestone, isCustom: true}

PUT /api/milestones/{id}
  {title, targetAmount, ...} (any field)
  → {updated milestone}

DELETE /api/milestones/{id}
  → 200

POST /api/milestones/{id}/archive
  → {id, isArchived: true}

POST /api/milestones/{id}/unarchive
  → {id, isArchived: false}

POST /api/milestones/sync (manual trigger)
  → {status, message, definitionsCreated, milestonesSeeded}

GET /api/milestones/definitions
  → {definitions: [{id, source, bank, title, milestoneType, targetAmount, periodKind, is_active}]}
```

### UX Considerations

- Progress bars use green gradient (same as Offers)
- Milestones sort by:
  1. Closest deadline first
  2. Highest percent completion within same deadline
- Archiving milestone doesn't delete data (preserved for historical analysis)
- Editing a milestone updates all fields (no partial updates)
- Period kind determines progress window — user never thinks about absolute dates
- Days left shown as countdown (0 days when period ends today, negative if overdue but not archived)

## Implementation Checklist

- ✅ Backend: models (MilestoneDefinition, UserMilestone)
- ✅ Backend: period_resolver service (handles all period kinds)
- ✅ Backend: milestone_progress service (computes progress on-read)
- ✅ Backend: milestone_fetcher service with PaisaBazaar + BUILTIN providers
- ✅ Backend: auto-seed logic in sync function
- ✅ Backend: background sync loop in app lifespan
- ✅ Backend: milestones router with CRUD + archive/unarchive
- ✅ Frontend: Milestones page with grouping, create modal, archive controls
- ✅ Frontend: Dashboard widget showing top 3 milestones
- ✅ Frontend: API integration (getMilestones, createMilestone, etc.)
- ✅ Frontend: Navbar integration (Milestones tab)
- ✅ Frontend: App routing (/milestones path)
- ☐ Tests: API integration tests (CRUD, progress computation, cascade)
- ☐ Tests: Unit tests for period_resolver (all period kinds + edge cases)
- ☐ Tests: Playwright browser tests (page load, form interaction, dashboard widget)
- ☐ Verification: Playwright MCP visual inspection

## Related Issues

- Issue #7: Milestones & Spending Goals
- Constitution §8.1 exemption: Explicit permission for outbound HTTP for milestone fetching
- Dependencies: Requires compute_net_spend function for progress calculation (already exists)
