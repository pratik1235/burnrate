"""SQLAlchemy models for burnrate credit card analytics."""

from datetime import date, datetime
from uuid import uuid4

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from backend.models.database import Base


def generate_uuid() -> str:
    """Generate a UUID4 string for primary keys."""
    return str(uuid4())


class Settings(Base):
    """User settings including name, DOB, and watch folder."""

    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    dob_day = Column(String(2), nullable=True)
    dob_month = Column(String(2), nullable=True)
    dob_year = Column(String(4), nullable=True)
    watch_folder = Column(String(1024), nullable=True)
    last_gmail_sync = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Card(Base):
    """Credit card metadata."""

    __tablename__ = "cards"
    __table_args__ = (
        UniqueConstraint("bank", "last4", name="uq_card_bank_last4"),
    )

    id = Column(String(36), primary_key=True, default=generate_uuid)
    bank = Column(String(50), nullable=False)  # 'hdfc', 'icici', 'axis'
    last4 = Column(String(4), nullable=False)
    name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Statement(Base):
    """Imported credit card or bank account statement."""

    __tablename__ = "statements"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    bank = Column(String(50), nullable=False)
    card_last4 = Column(String(4), nullable=True)
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    file_hash = Column(String(64), nullable=False)  # SHA-256
    file_path = Column(String(1024), nullable=True)
    transaction_count = Column(Integer, default=0)
    total_spend = Column(Float, default=0.0)
    total_amount_due = Column(Float, nullable=True)
    credit_limit = Column(Float, nullable=True)
    source = Column(String(4), nullable=False, default="CC", server_default="CC")
    status = Column(String(20), nullable=False, default="success")
    imported_at = Column(DateTime, default=datetime.utcnow)

    transactions = relationship("Transaction", back_populates="statement", cascade="all, delete-orphan")


class Transaction(Base):
    """Individual transaction from a statement."""

    __tablename__ = "transactions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    statement_id = Column(String(36), ForeignKey("statements.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    merchant = Column(String(512), nullable=False)
    amount = Column(Float, nullable=False)
    type = Column(String(20), nullable=False)  # 'debit' or 'credit'
    category = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)
    card_id = Column(String(36), ForeignKey("cards.id"), nullable=True)
    bank = Column(String(50), nullable=True)
    card_last4 = Column(String(4), nullable=True)
    source = Column(String(4), nullable=False, default="CC", server_default="CC")
    created_at = Column(DateTime, default=datetime.utcnow)

    statement = relationship("Statement", back_populates="transactions")
    tags = relationship("TransactionTag", back_populates="transaction", cascade="all, delete-orphan")


class OAuthPending(Base):
    """Temporary PKCE verifier keyed by OAuth state (CSRF token)."""

    __tablename__ = "oauth_pending"

    state = Column(String(128), primary_key=True)
    code_verifier = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class OAuthCredential(Base):
    """Encrypted OAuth tokens for optional Gmail integration."""

    __tablename__ = "oauth_credentials"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider = Column(String(32), nullable=False, unique=True, default="google_gmail")
    encrypted_refresh_token = Column(Text, nullable=False)
    encrypted_access_token = Column(Text, nullable=True)
    access_token_expires_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TransactionTag(Base):
    """Tag attached to a transaction."""

    __tablename__ = "transaction_tags"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    transaction_id = Column(String(36), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    tag = Column(String(12), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    transaction = relationship("Transaction", back_populates="tags")


class CategoryDefinition(Base):
    """Category definition - both prebuilt and custom."""

    __tablename__ = "category_definitions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(50), nullable=False, unique=True)
    slug = Column(String(50), nullable=False, unique=True)  # lowercase, underscored key used in Transaction.category
    keywords = Column(Text, nullable=False, default="")
    color = Column(String(9), nullable=False, default="#9CA3AF")
    icon = Column(String(50), nullable=False, default="MoreHorizontal")
    is_prebuilt = Column(Integer, nullable=False, default=0)  # 1=prebuilt, 0=custom
    created_at = Column(DateTime, default=datetime.utcnow)


class TagDefinition(Base):
    """User-defined tag that can be applied to transactions."""

    __tablename__ = "tag_definitions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(12), nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ProcessingLog(Base):
    """Log of statement processing attempts (success, error, duplicate)."""

    __tablename__ = "processing_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    file_name = Column(String(512), nullable=False)
    status = Column(String(20), nullable=False)  # success, error, duplicate
    message = Column(Text, nullable=True)
    bank = Column(String(50), nullable=True)
    transaction_count = Column(Integer, default=0)
    acknowledged = Column(Integer, default=0)  # 0=unread, 1=dismissed
    created_at = Column(DateTime, default=datetime.utcnow)


