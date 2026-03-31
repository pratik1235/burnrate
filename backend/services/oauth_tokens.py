"""Fernet encryption for OAuth secrets stored in SQLite."""

import base64
import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from backend.models.database import DATA_DIR

_KEY_FILE = DATA_DIR / ".oauth_fernet.key"
_ENV_KEY = "BURNRATE_OAUTH_FERNET_KEY"


def _load_or_create_key() -> bytes:
    env = os.environ.get(_ENV_KEY)
    if env:
        return base64.urlsafe_b64decode(env.encode())
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if _KEY_FILE.exists():
        return _KEY_FILE.read_bytes()
    key = Fernet.generate_key()
    _KEY_FILE.write_bytes(key)
    try:
        _KEY_FILE.chmod(0o600)
    except OSError:
        pass
    return key


def get_fernet() -> Fernet:
    return Fernet(_load_or_create_key())


def encrypt_secret(plain: str) -> str:
    return get_fernet().encrypt(plain.encode()).decode()


def decrypt_secret(token: str) -> str:
    try:
        return get_fernet().decrypt(token.encode()).decode()
    except InvalidToken as e:
        raise ValueError("Invalid encrypted token") from e
