"""Cascade delete for a card and its related data."""

from sqlalchemy.orm import Session

from backend.models.models import Card, Statement, Transaction, TransactionTag


def delete_card_cascade(db: Session, card_id: str) -> bool:
    """Delete a card and all associated transactions, tags, and statements.

    Does not commit. Returns True if a card was deleted, False if not found.
    """
    card = db.query(Card).filter(Card.id == card_id).first()
    if not card:
        return False

    txn_ids = [
        t.id for t in db.query(Transaction.id).filter(Transaction.card_id == card_id).all()
    ]
    if txn_ids:
        db.query(TransactionTag).filter(TransactionTag.transaction_id.in_(txn_ids)).delete(
            synchronize_session=False
        )
    db.query(Transaction).filter(Transaction.card_id == card_id).delete(synchronize_session=False)
    db.query(Statement).filter(
        Statement.card_last4 == card.last4, Statement.bank == card.bank
    ).delete(synchronize_session=False)
    db.delete(card)
    return True
