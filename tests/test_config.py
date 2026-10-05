import os
from unittest import mock
from backend.config import Settings

def test_port_changes_based_on_env(tmp_path):
    # Create a dummy .env.test file
    env_file = tmp_path / ".env.test"
    env_file.write_text("BURNRATE_PORT=9999\nBURNRATE_ENV=test")

    with mock.patch.dict(os.environ, {"BURNRATE_ENV_FILE": str(env_file)}):
        settings = Settings()
        assert settings.burnrate_port == 9999
        assert settings.burnrate_env == "test"
