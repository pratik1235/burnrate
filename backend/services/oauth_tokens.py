"""Fernet encryption for OAuth secrets stored in SQLite. (Deprecated, use crypto.py instead)"""

from backend.services.crypto import (
    _load_or_create_key,
    decrypt_secret,
    encrypt_secret,
    get_fernet,
)

__all__ = ["_load_or_create_key", "get_fernet", "encrypt_secret", "decrypt_secret"]
