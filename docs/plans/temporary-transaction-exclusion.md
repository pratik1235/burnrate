# Temporary Transaction Exclusion

## Overview

Allow users to temporarily exclude individual transactions from the summation value on the Transactions page, enabling quick what-if analysis without modifying persisted data.

## User Story

As a user, I want to temporarily exclude certain transactions from the total spend summary so that I can quickly see how my spending looks without specific charges (e.g., one-off large purchases, disputed charges), without any permanent data changes.

## Acceptance Criteria

1. A **"Temporarily Exclude Txns"** button appears in the Transactions page header area (near the Export button).
2. Hovering over the button shows a tooltip: _"This allows you to temporarily exclude some transactions from the summation value above"_.
3. Clicking the button enters **exclusion mode** — each transaction row displays a clickable exclude icon (e.g., `EyeOff` from lucide-react).
4. Clicking the exclude icon on a transaction row:
   - Marks that transaction as temporarily excluded.
   - Greys out the entire transaction row (reduced opacity + desaturated style).
   - Subtracts that transaction's signed amount from the displayed total spend.
5. Clicking the exclude icon again on an already-excluded row restores it (un-excludes).
6. The summation header updates in real-time to reflect: `originalTotalAmount − sum(excluded transaction amounts)`.
7. A counter badge shows the number of currently excluded transactions (e.g., "3 excluded").
8. A **"Reset Exclusions"** action clears all temporary exclusions and restores the original total.
9. Exiting exclusion mode (clicking the button again) hides the per-row exclude icons but **retains** exclusions until a reset event occurs.
10. **All temporary exclusions are cleared** on:
    - Page refresh / navigation away.
    - Any filter change (card, category, tag, date range, amount range, direction, source).
    - New search query submission or search clear.
11. Excluded transactions remain visible in the list (greyed out) — they are NOT hidden.
12. The exclusion state is **purely frontend** — no API calls, no database writes, no persistence.
13. CC Bill Payment transactions (already excluded from `totalAmount` by the backend) can also be temporarily excluded from the visible list styling, but their amounts do NOT affect the adjusted total (since they were never in the total).

## Scope Boundaries

### IN Scope
- Frontend-only toggle mechanism for excluding transactions from summation.
- Visual greying out of excluded rows.
- Real-time recalculation of displayed total.
- Tooltip on the exclusion mode button.
- Auto-reset on filter/search/navigation changes.
- Exclusion counter indicator.

### OUT of Scope
- Persisting exclusions across sessions or page reloads.
- Backend API changes — no new endpoints, no schema changes.
- Excluding transactions from the Analytics page or any other page.
- Bulk exclude (e.g., "exclude all transactions in this category") — possible future enhancement.
- Export behavior — excluded transactions are still exported normally via CSV export.

## Data Changes

**None.** This feature is entirely client-side. No SQLite schema modifications. No new API endpoints. No backend changes whatsoever.

## Parser Changes

**None.** No modifications to `src/parsers/`.

## UI/UX Changes

### Recommended Approach: Toggle-Mode with Per-Row Icons

This is the cleanest UX pattern for this use case. Similar to how "edit mode" works in many list UIs.

#### Flow

```
[Normal Mode]
  User clicks "Temporarily Exclude Txns" button
    → Enters exclusion mode
    → Each transaction row shows an EyeOff icon on the left
    → User clicks icon on rows they want to exclude
    → Rows grey out, total updates live
    → User clicks button again or continues browsing
    → Exclusions persist until reset event

[Reset Events]
  Filter change / search change / page refresh / navigation
    → Exclusions cleared, mode exits
```

#### Affected Components

##### `src/pages/Transactions.tsx`
- Add `excludedIds: Set<string>` state — tracks temporarily excluded transaction IDs.
- Add `exclusionMode: boolean` state — controls whether per-row exclude icons are visible.
- Compute `adjustedTotal` via `useMemo`:
  ```
  adjustedTotal = totalAmount - sum of (excluded transactions' signed amounts)
  ```
  Where signed amount = `type === 'debit' ? amount : -amount`.
- Display `adjustedTotal` instead of `totalAmount` when exclusions are active.
- Show exclusion count badge when `excludedIds.size > 0`.
- Reset `excludedIds` in the existing `useEffect` that watches filter/search changes (line 109–111).
- Add the "Temporarily Exclude Txns" button with hover tooltip (reuse existing tooltip pattern from the `?` info icon and search tooltip).

##### `src/components/TransactionRow.tsx`
- Accept new optional props:
  - `exclusionMode?: boolean` — whether to show the exclude icon.
  - `isExcluded?: boolean` — whether this row is currently excluded.
  - `onToggleExclude?: (id: string) => void` — callback when exclude icon is clicked.
- When `isExcluded` is true:
  - Set `opacity: 0.35` on the `RowContainer`.
  - Apply a subtle strikethrough or desaturated style.
  - Change the exclude icon to `Eye` (indicating "click to re-include").
- When `exclusionMode` is true:
  - Show `EyeOff` icon (from lucide-react) at the start or end of the row.

### UI/UX Design Options

#### Option A — Inline Toggle Button (Recommended ✅)

Place the "Temporarily Exclude Txns" button next to the Export button in the header. When active, it becomes a secondary (highlighted) button showing "Exit Exclusion Mode" or similar.

**Pros**: Discoverable, follows existing button patterns, minimal layout changes.
**Cons**: Adds another button to the header bar.

```
┌──────────────────────────────────────────────────────┐
│  127 transactions         ₹45,000 spent              │
│  (3 excluded → adjusted: ₹42,500)                    │
│                          [Exclude Txns] [Export]      │
├──────────────────────────────────────────────────────┤
│  👁̸  ░░░░░░ Swiggy           Food       -₹450 ░░░░░  │ ← greyed out
│     Amazon Pay          Shopping   -₹2,500            │
│  👁̸  ░░░░░░ Uber             Travel     -₹350 ░░░░░  │ ← greyed out
│     Netflix             Entertainment -₹649           │
└──────────────────────────────────────────────────────┘
```

#### Option B — Checkbox Selection Mode

Instead of a separate icon, show checkboxes on each row when in exclusion mode. Checked = excluded.

**Pros**: Familiar selection pattern.
**Cons**: Checkboxes imply "select for action" (like delete), which could confuse users. Also, NeoPOP doesn't have a native checkbox component, so we'd need a custom one.

#### Option C — Right-Click Context Menu

Add "Exclude from total" as a right-click context menu option on each row.

**Pros**: Zero UI clutter.
**Cons**: Not discoverable, doesn't work on touch devices, breaks convention for web apps.

#### Option D — Swipe-to-Exclude

On hover, reveal a sliding "Exclude" action on the row (similar to iOS swipe actions).

**Pros**: Modern feel.
**Cons**: Complex implementation, not standard for desktop web, accessibility concerns.

### Visual Treatment for Excluded Rows

```css
/* Excluded row styling */
opacity: 0.35;
filter: grayscale(40%);
position: relative;

/* Optional: subtle diagonal strikethrough overlay */
&::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 8px,
    rgba(255,255,255,0.03) 8px,
    rgba(255,255,255,0.03) 9px
  );
  pointer-events: none;
}
```

### Adjusted Total Display

When exclusions are active, show both original and adjusted amounts:

```
₹42,500 spent  (₹2,500 excluded from 3 txns)
```

Use a muted color for the exclusion info, matching the existing `rgba(255,255,255,0.5)` pattern.

## Testing Strategy

### Automated Tests
- No backend tests needed (no backend changes).
- Frontend unit tests (if test infrastructure exists):
  - `adjustedTotal` computation correctly subtracts excluded debits and adds back excluded credits.
  - Exclusion state resets when filters change.
  - CC Payment exclusions don't affect the adjusted total.

### Manual Verification
1. Navigate to Transactions page → verify "Temporarily Exclude Txns" button is visible.
2. Hover over the button → verify tooltip appears.
3. Click the button → verify per-row exclude icons appear on each transaction row.
4. Click exclude on a debit transaction → verify row greys out and total decreases.
5. Click exclude on a credit transaction → verify total increases (credit was reducing spend).
6. Click the exclude icon again → verify row un-greys and total restores.
7. Change a filter (e.g., select a card) → verify all exclusions are cleared.
8. Submit a search → verify all exclusions are cleared.
9. Refresh the page → verify exclusions are cleared.
10. Navigate to Analytics and back → verify exclusions are cleared.
11. Verify excluded count badge appears and is accurate.

### Browser/Playwright Tests
- Test exclusion mode toggle via button click.
- Test row grey-out CSS class application.
- Test summary value updates after exclusion.
- Test reset on filter interaction.

## Risks

- **Performance with many exclusions**: If a user excludes hundreds of transactions, the `useMemo` recalculation could be slow. Mitigated by the fact that pagination limits visible transactions to 20 at a time — users can only exclude what's loaded.
- **Load More interaction**: When "Load More" loads additional transactions, previously excluded transactions (by ID) remain excluded if they're still in the list. New transactions are not excluded. This is the expected behavior, but worth documenting.
- **Stale data edge case**: If a background process modifies transactions while exclusions are active (unlikely in a local-only app), the adjusted total could be based on stale amounts. Acceptable given the temporary nature.
- **Accessibility**: The `EyeOff`/`Eye` toggle needs appropriate `aria-label` attributes for screen readers (e.g., "Exclude transaction" / "Include transaction").
