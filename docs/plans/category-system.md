# Category System Feature Plan

**Version:** 1.0  
**Last Updated:** March 2026

---

## Overview

The category system provides transaction categorization via keyword matching. It includes:

1. **Prebuilt categories** — 10 fixed categories (food, shopping, travel, bills, entertainment, fuel, health, groceries, cc_payment, other) with predefined keywords
2. **Custom categories** — Up to 20 user-defined categories with custom keywords
3. **Keyword matching** — Transaction merchant matched against category keywords (case-insensitive)
4. **Recategorization** — Re-run categorization on all existing transactions when definitions change

**Matching order:** Custom categories first (`is_prebuilt=0`), then prebuilt (`is_prebuilt=1`). Fallback: `"other"`.

---

## API Endpoints

### GET /api/categories/all

**Purpose:** Return ALL categories (prebuilt + custom) with id, name, slug, keywords, color, icon, is_prebuilt.

**Response (200):**
```json
[
  {
    "id": "uuid",
    "name": "Food & Dining",
    "slug": "food",
    "keywords": "swiggy,zomato,mcdonald,...",
    "color": "#F97316",
    "icon": "UtensilsCrossed",
    "is_prebuilt": true
  },
  {
    "id": "uuid",
    "name": "My Custom",
    "slug": "my_custom",
    "keywords": "custommerchant",
    "color": "#FF0000",
    "icon": "MoreHorizontal",
    "is_prebuilt": false
  }
]
```

**Order:** Prebuilt first (`is_prebuilt DESC`), then by name.

---

### POST /api/categories/custom

**Purpose:** Create custom category. Max 20 custom. Triggers recategorization after create.

**Request:**
```json
{
  "name": "My Category",
  "keywords": "merchant1,merchant2",
  "color": "#FF0000"
}
```

**Response (200):**
```json
{
  "id": "uuid",
  "name": "My Category",
  "slug": "my_category",
  "keywords": "merchant1,merchant2",
  "color": "#FF0000",
  "icon": "MoreHorizontal",
  "is_prebuilt": false
}
```

**Status Codes:**
- `400` — Max 20 custom categories; name/slug already exists; empty name

---

### PUT /api/categories/{category_id}

**Purpose:** Update category. Prebuilt: only color and keywords. Custom: name, keywords, color.

**Request:**
```json
{
  "name": "New Name",
  "keywords": "new,keywords",
  "color": "#00FF00"
}
```

All fields optional.

**Response (200):** Same shape as create.

**Status Codes:**
- `400` — Prebuilt: cannot change name; Custom: empty name, duplicate name/slug
- `404` — Category not found

---

### DELETE /api/categories/custom/{category_id}

**Purpose:** Delete only custom categories. Reject prebuilt with 400.

**Response (200):**
```json
{"status": "ok"}
```

**Status Codes:**
- `400` — Cannot delete prebuilt categories
- `404` — Category not found

---

### POST /api/categories/recategorize

**Purpose:** Re-categorize all transactions based on current category definitions.

**Response (200):**
```json
{"status": "ok", "updated": 42}
```

---

## Data Model

### CategoryDefinition

| Column | Type | Constraints |
|--------|------|-------------|
| id | VARCHAR(36) | PK |
| name | VARCHAR(50) | NOT NULL, UNIQUE |
| slug | VARCHAR(50) | NOT NULL, UNIQUE |
| keywords | TEXT | default "" |
| color | VARCHAR(9) | default "#9CA3AF" |
| icon | VARCHAR(50) | default "MoreHorizontal" |
| is_prebuilt | INTEGER | default 0 (1=prebuilt, 0=custom) |
| created_at | DATETIME | |

### Transaction.category

- Stores category slug (e.g., `food`, `other`)
- Updated by categorizer and recategorize

---

## Implementation Details

### Prebuilt Categories (Seed)

Defined in `main.py` `seed_categories()`:

| slug | name | keywords (sample) |
|------|------|-------------------|
| food | Food & Dining | swiggy,zomato,mcdonald,starbucks,... |
| shopping | Shopping | amazon,flipkart,myntra,... |
| travel | Travel | uber,ola,makemytrip,irctc,... |
| bills | Bills & Utilities | jio,airtel,vodafone,bsnl,... |
| entertainment | Entertainment | netflix,spotify,hotstar,... |
| fuel | Fuel | hp,bharat petroleum,iocl,... |
| health | Health | apollo,pharmeasy,1mg,... |
| groceries | Groceries | bigbasket,blinkit,zepto,... |
| cc_payment | CC Bill Payment | cc payment,bbps,neft payment,CREDIT CARD PAYMENTNet Banking,... |
| other | Other | (empty) |

- On startup: Insert if slug not exists; if exists and is_prebuilt, update keywords if changed

### _slug_from_name

- `name.lower().strip().replace(" ", "_")`
- Used for custom category slug generation

### categorize(merchant_name, db_session)

**Location:** `backend/services/categorizer.py`

**Logic:**
1. If `not merchant_name`: return `"other"`
2. `lower = merchant_name.lower()`
3. Query categories: `ORDER BY is_prebuilt ASC` (custom first)
4. For each category: split `keywords` by comma; for each keyword, strip; if `kw in lower`: return `cat.slug`
5. Return `"other"`

### Create Custom Category

1. Check custom count: `filter(is_prebuilt=0).count() >= 20` → 400
2. `name = payload.name.strip()`; empty → 400
3. `slug = _slug_from_name(name)`
4. Check existing: `(name == name) | (slug == slug)` → 400
5. Insert `CategoryDefinition(is_prebuilt=0, ...)`
6. Recategorize: `for txn in Transaction.all(): new_cat = categorize(txn.merchant); if new_cat != txn.category: txn.category = new_cat`
7. Commit

### Update Category

**Prebuilt:**
- Cannot change name → 400
- Can update color (if provided)
- Can update keywords (if provided)
- If keywords changed: recategorize

**Custom:**
- Can update name: new slug from name; check duplicate slug (excluding self)
- Can update keywords, color
- If keywords changed: recategorize

### Delete Custom

- If `is_prebuilt`: 400
- Delete category
- **Note:** Transactions with `category == slug` remain with that slug; they become orphaned (slug no longer in category_definitions). No automatic migration to "other".

---

## Edge Cases

### Invalid Input

| Scenario | Handling |
|---------|----------|
| Empty name on create | 400 "Category name is required" |
| Empty name on update | 400 "Category name cannot be empty" |
| Duplicate name on create | 400 "Category with this name or slug already exists" |
| Duplicate slug on create | Same |
| Duplicate slug on update (custom) | 400 "Category with this name already exists" | 
| Change prebuilt name | 400 "Cannot change name of prebuilt category" |
| Max 20 custom | 400 "Maximum 20 custom categories allowed" |

### Duplicate Data

| Scenario | Handling |
|----------|----------|
| Multiple keywords match | First match wins (custom before prebuilt) |
| Same keyword in multiple categories | First in order wins |

### Missing Data

| Scenario | Handling |
|----------|----------|
| Category not found | 404 |
| Empty keywords | Category skipped in matching |
| Merchant empty | Return "other" |

### Concurrent Access

| Scenario | Handling |
|----------|----------|
| Recategorize during transaction create | Categorize uses current DB state |
| Category deleted, transactions still have slug | Orphaned slug; no automatic fix |

### Large Datasets

| Scenario | Handling |
|----------|----------|
| Many transactions for recategorize | Full table scan; all in one transaction |
| Many categories | All loaded; iterate |

### Keyword Edge Cases

| Scenario | Handling |
|----------|----------|
| Keyword substring match | `kw in lower` — substring match |
| "swiggy" in "SWIGGY INSTAMART" | Matches |
| "amazon" in "AMAZON PAY" | Matches |
| "amazon" in "AMAZON.IN" | Matches |

---

## Error Handling

| Error | HTTP | Response |
|-------|------|----------|
| Max custom | 400 | "Maximum 20 custom categories allowed" |
| Duplicate name/slug | 400 | "Category with this name or slug already exists" |
| Empty name | 400 | "Category name is required" / "cannot be empty" |
| Prebuilt name change | 400 | "Cannot change name of prebuilt category" |
| Delete prebuilt | 400 | "Cannot delete prebuilt categories" |
| Not found | 404 | "Category not found" |

---

## Security Considerations

- **Keywords:** Stored as-is; matched case-insensitively; no injection risk (substring match)
- **Name/slug:** Unique constraints; validated before insert

---

## Testing Strategy

### Existing Tests

- **test_api.py:** `TestCategories` — list categories, create custom, delete custom

### Recommended Additional Tests

- Recategorize updates transactions
- Create category triggers recategorize
- Update keywords triggers recategorize
- Max 20 custom
- Duplicate name/slug rejected
- Prebuilt update (color only)
- Prebuilt delete rejected
- Custom category matching order

---

## Keyword Matching Algorithm (Detailed)

1. **Input:** `merchant_name` (from transaction)
2. **Normalize:** `lower = merchant_name.lower()`
3. **Load categories:** `ORDER BY is_prebuilt ASC` — custom first
4. **Iterate:** For each category:
   - Skip if `keywords` is empty
   - Split keywords by comma: `kw.lower().split(",")`
   - For each keyword: `kw = kw.strip()`
   - If `kw and kw in lower`: return `cat.slug`
5. **Fallback:** return `"other"`

**Substring match:** `"swiggy" in "swiggy instamart"` → True. First match wins.

---

## Orphaned Category Slugs

When a custom category is deleted, transactions may still have `category = "deleted_slug"`. The slug no longer exists in `CategoryDefinition`. Behavior:
- Transaction still displays with that slug
- Analytics/breakdown may show "deleted_slug" as a category
- Recategorize would not match (keyword gone); could add migration to "other" on delete

---

## Prebuilt Keyword Updates

On startup, `seed_categories` checks: if prebuilt exists and `keywords !=` predefined, update keywords. This allows upstream keyword list changes to propagate. Custom categories are never auto-updated.

---

## Recategorize Scope

- **Scope:** All transactions in DB
- **No filter:** Date, card, etc. ignored
- **Batch:** Single commit after all updates
- **Idempotent:** Running twice with same definitions yields same result

---

## Appendix: Prebuilt Category Keywords (Full)

| Slug | Keywords (comma-separated) |
|------|----------------------------|
| food | swiggy,zomato,mcdonald,starbucks,restaurant,cafe,dominos,kfc,subway,pizza hut,burger king,haldiram,barbeque nation |
| shopping | amazon,flipkart,myntra,ajio,meesho,nykaa,tatacliq,croma,reliance digital,infiniti retail,aptronix,indivinity |
| travel | uber,ola,makemytrip,irctc,cleartrip,goibibo,airline,railway,indigo,air india,vistara,yatra,agoda,ibibo,lounge |
| bills | jio,airtel,vodafone,bsnl,electricity,gas,insurance,broadband,tata power,adani,bharti,life insurance,lic |
| entertainment | netflix,spotify,hotstar,prime video,inox,pvr,youtube,apple,google play,bundl |
| fuel | hp,bharat petroleum,iocl,shell,indian oil,bpcl,hindustan petroleum |
| health | apollo,pharmeasy,1mg,hospital,medplus,netmeds,practo,lenskart |
| groceries | bigbasket,blinkit,zepto,dmart,jiomart,swiggy instamart,instamart,nature basket,more |
| cc_payment | cc payment,cc pymt,bppy cc payment,bbps payment,neft payment,imps payment,repayment,repayments,bbps,bill payment received,CREDIT CARD PAYMENTNet Banking |
| other | (empty) |

---

## Related Documentation

- **docs/plans/statement-processing.md** — Categorization during import
- **docs/plans/transaction-management.md** — Filter by category
- **docs/plans/analytics.md** — Category breakdown
