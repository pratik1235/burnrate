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


@dataclass
class ParsedStatement:
    """Parsed statement with metadata and transactions."""

    bank: str
    period_start: Optional[date]
    period_end: Optional[date]
    transactions: List[ParsedTransaction]
    card_last4: Optional[str] = None
    total_amount_due: Optional[float] = None
    credit_limit: Optional[float] = None
    currency: str = "INR"


class BaseParser(ABC):
    """Abstract base class for bank statement parsers."""

    @abstractmethod
    def parse(self, pdf_path: str) -> ParsedStatement:
        """Parse a PDF file and return a ParsedStatement."""
        pass
