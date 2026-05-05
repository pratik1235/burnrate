# Statement due dates and daily “mark paid” reminder

**Version:** 1.0  
**Last updated:** April 2026

Product specification aligned with [docs/CONSTITUTION.md](../CONSTITUTION.md). See implementation in backend `due_reminders` router, `payment_reminders` service, and frontend `PaymentRemindersModal`.

---

## Bank PDF research appendix (payment due date labels)

Corpus: project root `statements/<bank>/<period>/` PDFs. Unlock via production [`unlock_pdf`](../../backend/services/pdf_unlock.py) when encrypted.

Extraction strategy:

| Bank | Typical label / region | Date formats | Parser notes |
|------|------------------------|--------------|----------------|
| HDFC | “Payment Due Date”, summary near Total Amount Due | `DD/MM/YYYY`, `DD Mon, YYYY` | Scan first pages; regex after label |
| ICICI | “Payment Due Date” / “Due Date” | `DD/MM/YYYY`, backtick-number layout | ICICI template uses distinctive typography |
| Axis | “Payment Due Date” in summary | `DD-MM-YYYY`, `DD/MM/YYYY` | Often adjacent to Total Payment Due |
| Federal | Summary block | `DD/MM/YYYY` | Same window as total due |
| IDFC FIRST | “Payment Due Date” (documented in parser docstring) | `DD/Mon/YYYY` | Summary strip |
| Indian Bank | Payment due section | Various | Label-based |
| Generic fallback | Any of: Payment Due Date, Due Date, Pay By, Last Date for Payment | Mixed | [`payment_due_date.py`](../../backend/parsers/payment_due_date.py) shared heuristics |

Incremental bank-specific patterns live in each parser where layout differs; shared heuristics reduce duplication.

---

## Product summary

- **Latest CC statement only** per registered card determines parsed `payment_due_date` and amount due for reminders.
- **Manual** `manual_next_due_date` on the card overrides parsed values when set.
- **Ack** `(card_id, statement_id)` suppresses reminders until a **new** statement becomes latest for that card.
- **Daily auto modal:** at most once per **local calendar day** (frontend sends `local_date`), combined list of all eligible cards.
- **Customize:** same modal component, manual open anytime.

---

## API (implemented)

- `GET /api/due-reminders` — eligible items.
- `GET /api/due-reminders/auto-prompt?local_date=YYYY-MM-DD` — whether to auto-open.
- `POST /api/due-reminders/record-auto-shown` — body `{ local_date }` after auto modal shown/dismissed.
- `POST /api/due-reminders/ack` — body `{ card_id }` marks paid for current latest statement.
- `PATCH /api/cards/{id}` — optional `manual_next_due_date`, `manual_next_due_amount` (nullable to clear).

---

## Edge cases

See plan: ack invalidation on new import, duplicate hash, manual-only due dates, amount unknown.
