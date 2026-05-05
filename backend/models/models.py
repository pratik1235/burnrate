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
    display_currency = Column(String(3), nullable=True)
    last_gmail_sync = Column(DateTime, nullable=True)
    llm_provider = Column(String(20), nullable=True)
    llm_model = Column(String(100), nullable=True)
    payment_reminder_last_auto_shown = Column(String(10), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DueReminderAck(Base):
    """User confirmed paid for a card's billing cycle (latest statement at ack time)."""

    __tablename__ = "due_reminder_acks"
    __table_args__ = (
        UniqueConstraint("card_id", "statement_id", name="uq_due_ack_card_statement"),
    )

    id = Column(String(36), primary_key=True, default=generate_uuid)
    card_id = Column(String(36), ForeignKey("cards.id", ondelete="CASCADE"), nullable=False)
    statement_id = Column(String(36), ForeignKey("statements.id", ondelete="CASCADE"), nullable=False)
    acknowledged_at = Column(DateTime, default=datetime.utcnow)


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
    template_id = Column(String(100), nullable=True)  # References CardTemplate.id from frontend
    manual_next_due_date = Column(Date, nullable=True)
    manual_next_due_amount = Column(Float, nullable=True)
    manual_due_acknowledged_for = Column(Date, nullable=True)
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
    original_upload_path = Column(String(2048), nullable=True)
    transaction_count = Column(Integer, default=0)
    total_spend = Column(Float, default=0.0)
    total_amount_due = Column(Float, nullable=True)
    credit_limit = Column(Float, nullable=True)
    source = Column(String(4), nullable=False, default="CC", server_default="CC")
    status = Column(String(20), nullable=False, default="success")
    # 1 when status is parse_error (denormalized for filtering and indexing).
    parse_failed = Column(Integer, nullable=False, default=0, server_default="0")
    status_message = Column(Text, nullable=True)
    imported_at = Column(DateTime, default=datetime.utcnow)
    currency = Column(String(3), nullable=False, default="INR", server_default="INR")
    payment_due_date = Column(Date, nullable=True)

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
    currency = Column(String(3), nullable=False, default="INR", server_default="INR")
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


# ---------------------------------------------------------------------------
# LLM Insights (Chat Sessions)
# ---------------------------------------------------------------------------

class ChatSession(Base):
    """Conversation container for LLM insights."""

    __tablename__ = "chat_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(200), nullable=True)
    provider = Column(String(20), nullable=False, default="ollama")
    model = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    messages = relationship(
        "ChatMessage", back_populates="session",
        cascade="all, delete-orphan", order_by="ChatMessage.sequence",
    )


class ChatMessage(Base):
    """Individual message within a chat session."""

    __tablename__ = "chat_messages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=True)
    tool_calls = Column(Text, nullable=True)
    tool_call_id = Column(String(100), nullable=True)
    tool_name = Column(String(100), nullable=True)
    sequence = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ChatSession", back_populates="messages")


# ---------------------------------------------------------------------------
# Offers & Benefits (Issue #6)
# ---------------------------------------------------------------------------

class SyncMetadata(Base):
    """Tracks per-provider sync status for offers and milestones."""

    __tablename__ = "sync_metadata"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    provider = Column(String(50), unique=True, nullable=False)
    last_sync_at = Column(DateTime, nullable=True)
    last_status = Column(String(20), nullable=True)  # success, partial, failed
    offers_fetched = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)


class CardOffer(Base):
    """Normalized offer record — fetched from aggregators or user-created."""

    __tablename__ = "card_offers"
    __table_args__ = (
        UniqueConstraint("source", "source_id", name="uq_offer_source"),
    )

    id = Column(String(36), primary_key=True, default=generate_uuid)

    # Source tracking
    source = Column(String(50), nullable=False)  # "hdfc_bank", "sbicard", "cardexpert", "user"
    source_id = Column(String(255), nullable=True)  # External ID or URL hash for dedup
    source_url = Column(String(1024), nullable=True)

    # Offer content
    title = Column(String(512), nullable=False)
    description = Column(Text, nullable=True)
    merchant = Column(String(255), nullable=True)
    discount_text = Column(String(255), nullable=True)  # "10% cashback up to ₹200"
    offer_type = Column(String(50), nullable=True)  # cashback, discount, reward_points, emi, lounge

    # Applicability
    bank = Column(String(50), nullable=True)  # NULL = all banks
    card_template_id = Column(String(100), nullable=True)
    network = Column(String(20), nullable=True)  # visa, mastercard, rupay
    min_transaction = Column(Float, nullable=True)
    max_discount = Column(Float, nullable=True)

    # Validity
    valid_from = Column(Date, nullable=True)
    valid_until = Column(Date, nullable=True)
    is_expired = Column(Integer, default=0)

    # Category for filtering
    category = Column(String(50), nullable=True)

    # Metadata
    is_user_created = Column(Integer, default=0)
    is_hidden = Column(Integer, default=0)
    fetched_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CardOfferCard(Base):
    """Junction table: which user cards an offer applies to."""

    __tablename__ = "card_offer_cards"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    offer_id = Column(String(36), ForeignKey("card_offers.id", ondelete="CASCADE"), nullable=False)
    card_id = Column(String(36), ForeignKey("cards.id", ondelete="CASCADE"), nullable=False)


# ---------------------------------------------------------------------------
# Milestones (Issue #7)
# ---------------------------------------------------------------------------

class MilestoneDefinition(Base):
    """Template milestone definitions fetched from internet sources."""

    __tablename__ = "milestone_definitions"

    id = Column(String(36), primary_key=True, default=generate_uuid)

    # Source tracking
    source = Column(String(50), nullable=False)  # "hdfc_bank", "paisabazaar", "user"
    source_url = Column(String(1024), nullable=True)

    # Card targeting
    card_template_id = Column(String(100), nullable=True)
    bank = Column(String(50), nullable=True)

    # Milestone details
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    milestone_type = Column(String(50), nullable=False)  # fee_waiver, bonus_points, lounge_access, accelerated_rewards, voucher, cashback

    # Target
    target_amount = Column(Float, nullable=False)

    # Period
    period_kind = Column(String(30), nullable=False)  # calendar_month, calendar_quarter, calendar_year, rolling_days, fixed_range
    period_config = Column(Text, nullable=True)  # JSON

    # Reward on achievement
    reward_description = Column(String(512), nullable=True)
    reward_value = Column(Float, nullable=True)

    # Filters
    category_filter = Column(Text, nullable=True)  # JSON list
    exclude_categories = Column(Text, nullable=True)  # JSON list

    # Metadata
    is_active = Column(Integer, default=1)
    fetched_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserMilestone(Base):
    """Per-user milestone tracker — links a definition to a user's card."""

    __tablename__ = "user_milestones"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    card_id = Column(String(36), ForeignKey("cards.id", ondelete="CASCADE"), nullable=False)
    definition_id = Column(String(36), ForeignKey("milestone_definitions.id", ondelete="SET NULL"), nullable=True)

    # User can override definition values
    title = Column(String(255), nullable=False)
    target_amount = Column(Float, nullable=False)
    period_kind = Column(String(30), nullable=False)
    period_config = Column(Text, nullable=True)  # JSON
    milestone_type = Column(String(50), nullable=False)
    reward_description = Column(String(512), nullable=True)
    category_filter = Column(Text, nullable=True)  # JSON list
    exclude_categories = Column(Text, nullable=True)  # JSON list

    # State
    is_auto_created = Column(Integer, default=0)
    is_archived = Column(Integer, default=0)
    is_custom = Column(Integer, default=0)  # 1 = fully user-created

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


