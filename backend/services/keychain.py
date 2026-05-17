import logging
from typing import Optional, Tuple
import keyring

logger = logging.getLogger(__name__)

SERVICE_NAME_STATEMENTS = "burnrate_statements"
"""OS keychain service for per-file statement PDF passwords (content hash)."""

SERVICE_NAME_STATEMENT_BANK = "burnrate_statement_bank_pdf"
"""OS keychain service for the last known PDF password per bank (user-provided unlocks)."""

SERVICE_NAME_LLM = "burnrate_llm"
SERVICE_NAME_AWS = "burnrate_aws"

# Backwards compatibility alias
SERVICE_NAME = SERVICE_NAME_STATEMENTS


def normalize_bank_key(bank: Optional[str]) -> Optional[str]:
    """Normalize bank name for keychain storage and lookup (lowercase, stripped)."""
    if not bank:
        return None
    s = bank.strip().lower()
    return s if s else None


def save_bank_statement_password(bank: str, password: str) -> None:
    """
    Store a user-provided statement PDF password keyed by bank.

    Used after a successful manual unlock so "Open statement" can decrypt
    other PDFs from the same bank without re-prompting.
    """
    bk = normalize_bank_key(bank)
    if not bk or bk == "unknown" or not password:
        return
    try:
        keyring.set_password(SERVICE_NAME_STATEMENT_BANK, bk, password)
        logger.debug("Saved statement PDF password to keychain for bank=%s", bk)
    except Exception as e:
        logger.warning("Failed to save bank statement password for bank=%s: %s", bk, e)


def get_bank_statement_password(bank: str) -> Optional[str]:
    """Retrieve the stored PDF password for a bank, if any."""
    bk = normalize_bank_key(bank)
    if not bk or bk == "unknown":
        return None
    try:
        return keyring.get_password(SERVICE_NAME_STATEMENT_BANK, bk)
    except Exception as e:
        logger.warning("Failed to get bank statement password for bank=%s: %s", bk, e)
        return None


def delete_bank_statement_password(bank: str) -> None:
    """Remove the stored PDF password for a bank."""
    bk = normalize_bank_key(bank)
    if not bk:
        return
    try:
        keyring.delete_password(SERVICE_NAME_STATEMENT_BANK, bk)
        logger.debug("Deleted bank statement password for bank=%s", bk)
    except keyring.errors.PasswordDeleteError:
        pass
    except Exception as e:
        logger.warning("Failed to delete bank statement password for bank=%s: %s", bk, e)


def save_statement_password(file_hash: str, password: str) -> None:
    """
    Save a statement's password to the OS keychain.
    Keyed by the file hash.
    """
    if not file_hash or not password:
        return

    try:
        keyring.set_password(SERVICE_NAME_STATEMENTS, file_hash, password)
        logger.debug("Successfully saved password to keychain for file_hash=%s", file_hash)
    except Exception as e:
        logger.warning("Failed to save password to keychain for file_hash=%s: %s", file_hash, e)


def get_statement_password(file_hash: str) -> Optional[str]:
    """
    Retrieve a statement's password from the OS keychain.
    """
    if not file_hash:
        return None

    try:
        return keyring.get_password(SERVICE_NAME_STATEMENTS, file_hash)
    except Exception as e:
        logger.warning("Failed to get password from keychain for file_hash=%s: %s", file_hash, e)
        return None


def delete_statement_password(file_hash: str) -> None:
    """
    Delete a statement's password from the OS keychain.
    """
    if not file_hash:
        return

    try:
        keyring.delete_password(SERVICE_NAME_STATEMENTS, file_hash)
        logger.debug("Successfully deleted password from keychain for file_hash=%s", file_hash)
    except keyring.errors.PasswordDeleteError:
        # Expected if the password doesn't exist
        pass
    except Exception as e:
        logger.warning("Failed to delete password from keychain for file_hash=%s: %s", file_hash, e)


# ---------------------------------------------------------------------------
# LLM API Key Management
# ---------------------------------------------------------------------------

def save_api_key(provider: str, api_key: str) -> None:
    """
    Save LLM provider API key to OS keychain.

    Args:
        provider: Provider name ("anthropic", "openai")
        api_key: The API key to store
    """
    if not provider or not api_key:
        return

    try:
        keyring.set_password(SERVICE_NAME_LLM, provider, api_key)
        logger.debug("Successfully saved API key to keychain for provider=%s", provider)
    except Exception as e:
        logger.warning("Failed to save API key to keychain for provider=%s: %s", provider, e)


def get_api_key(provider: str) -> Optional[str]:
    """
    Retrieve LLM provider API key from OS keychain.

    Args:
        provider: Provider name ("anthropic", "openai")

    Returns:
        The API key if found, None otherwise
    """
    if not provider:
        return None

    try:
        return keyring.get_password(SERVICE_NAME_LLM, provider)
    except Exception as e:
        logger.warning("Failed to get API key from keychain for provider=%s: %s", provider, e)
        return None


def delete_api_key(provider: str) -> None:
    """
    Delete LLM provider API key from OS keychain.

    Args:
        provider: Provider name ("anthropic", "openai")
    """
    if not provider:
        return

    try:
        keyring.delete_password(SERVICE_NAME_LLM, provider)
        logger.debug("Successfully deleted API key from keychain for provider=%s", provider)
    except keyring.errors.PasswordDeleteError:
        # Expected if the key doesn't exist
        pass
    except Exception as e:
        logger.warning("Failed to delete API key from keychain for provider=%s: %s", provider, e)


# ---------------------------------------------------------------------------
# AWS Credential Management
# ---------------------------------------------------------------------------

def save_aws_credentials(access_key: str, secret_key: str) -> None:
    """
    Save AWS credentials to OS keychain (separate entries for access and secret keys).

    Args:
        access_key: AWS access key ID
        secret_key: AWS secret access key
    """
    if not access_key or not secret_key:
        return

    try:
        keyring.set_password(SERVICE_NAME_AWS, "access_key", access_key)
        keyring.set_password(SERVICE_NAME_AWS, "secret_key", secret_key)
        logger.debug("Successfully saved AWS credentials to keychain")
    except Exception as e:
        logger.warning("Failed to save AWS credentials to keychain: %s", e)


def get_aws_credentials() -> Optional[Tuple[str, str]]:
    """
    Retrieve AWS credentials from OS keychain.

    Returns:
        Tuple of (access_key, secret_key) if both found, None otherwise
    """
    try:
        access_key = keyring.get_password(SERVICE_NAME_AWS, "access_key")
        secret_key = keyring.get_password(SERVICE_NAME_AWS, "secret_key")

        if access_key and secret_key:
            return (access_key, secret_key)
        return None
    except Exception as e:
        logger.warning("Failed to get AWS credentials from keychain: %s", e)
        return None


def delete_aws_credentials() -> None:
    """
    Delete AWS credentials from OS keychain.
    """
    try:
        keyring.delete_password(SERVICE_NAME_AWS, "access_key")
        keyring.delete_password(SERVICE_NAME_AWS, "secret_key")
        logger.debug("Successfully deleted AWS credentials from keychain")
    except keyring.errors.PasswordDeleteError:
        # Expected if the credentials don't exist
        pass
    except Exception as e:
        logger.warning("Failed to delete AWS credentials from keychain: %s", e)
