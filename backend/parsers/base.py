"""Abstract base parser for bank statements."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from typing import List, Optional


@dataclass
class ParsedTransaction:
    """A single parsed transaction."""

    date: date
    merchant: str
    amount: float
    type: str  # 'debit' or 'credit'
    description: str
    category: Optional[str] = None  # Optional parser-provided category slug override
    card_network: Optional[str] = None  # 'visa' or 'rupay'; None = shared/unassigned (Scapia combined statements)


@dataclass
class ParsedStatement:
    """Parsed statement with metadata and transactions."""

    bank: str
    period_start: Optional[date]
    period_end: Optional[date]
    transactions: List[ParsedTransaction]
    card_last4: Optional[str] = None
    card_last4_secondary: Optional[str] = None  # Second card last-4 in combined dual-card statements
    total_amount_due: Optional[float] = None
    credit_limit: Optional[float] = None
    payment_due_date: Optional[date] = None
    currency: str = "INR"


def detect_emi_transaction(merchant: str, description: str = "") -> bool:
    """Detect if a transaction is an EMI payment.

    Args:
        merchant: Merchant name
        description: Full transaction description

    Returns:
        True if transaction appears to be an EMI payment
    """
    import re

    # Combine merchant and description for pattern matching
    text = f"{merchant} {description}".lower()

    # EMI patterns
    emi_patterns = [
        r'\bemi\b',                    # Word "EMI"
        r'\bequated monthly\b',        # Full form
        r'\binstallment\b',            # Installment
        r'\bint nbr\b',                # Interest number
    ]

    for pattern in emi_patterns:
        if re.search(pattern, text):
            return True

    return False


class BaseParser(ABC):
    """Abstract base class for bank statement parsers."""

    @abstractmethod
    def parse(self, pdf_path: str) -> ParsedStatement:
        """Parse a PDF file and return a ParsedStatement."""
        pass
