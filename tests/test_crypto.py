import pytest
from backend.services.crypto import encrypt_secret, decrypt_secret

def test_crypto_encrypt_decrypt():
    original = "my_secret_password"
    encrypted = encrypt_secret(original)
    assert encrypted != original
    decrypted = decrypt_secret(encrypted)
    assert decrypted == original

def test_crypto_invalid_token():
    with pytest.raises(ValueError, match="Invalid encrypted token"):
        decrypt_secret("not_a_valid_token")
