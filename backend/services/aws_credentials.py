"""AWS credential resolution with precedence: env → keychain → SSO"""

import logging
from typing import Optional, Tuple
import boto3
from botocore.exceptions import NoCredentialsError, ClientError

from backend import config
from backend.services import keychain

logger = logging.getLogger(__name__)


def get_aws_credentials_from_env() -> Optional[Tuple[str, str]]:
    """
    Check environment variables for AWS credentials.

    Returns:
        Tuple of (access_key, secret_key) if both found, None otherwise
    """
    access_key = config.AWS_ACCESS_KEY_ID
    secret_key = config.AWS_SECRET_ACCESS_KEY

    if access_key and secret_key:
        logger.debug("AWS credentials found in environment variables")
        return (access_key, secret_key)

    return None


def get_aws_credentials_from_keychain() -> Optional[Tuple[str, str]]:
    """
    Retrieve AWS credentials from OS keychain.

    Returns:
        Tuple of (access_key, secret_key) if both found, None otherwise
    """
    creds = keychain.get_aws_credentials()
    if creds:
        logger.debug("AWS credentials found in OS keychain")
    return creds


def get_aws_credentials_from_sso() -> Optional[boto3.Session]:
    """
    Attempt to get AWS session from SSO (boto3 default credential chain).

    Returns:
        boto3.Session if SSO credentials available, None otherwise
    """
    try:
        session = boto3.Session()
        # Test if credentials are available by calling STS
        session.client('sts').get_caller_identity()
        logger.debug("AWS credentials found via SSO/default credential chain")
        return session
    except (NoCredentialsError, ClientError) as e:
        logger.debug("AWS SSO credentials not available: %s", e)
        return None
    except Exception as e:
        logger.warning("Unexpected error checking AWS SSO credentials: %s", e)
        return None


def get_aws_session() -> boto3.Session:
    """
    Unified credential resolver with precedence: env → keychain → SSO.

    Returns:
        boto3.Session configured with AWS credentials

    Raises:
        ValueError: If no AWS credentials found in any source
    """
    # 1. Environment variables (highest priority)
    env_creds = get_aws_credentials_from_env()
    if env_creds:
        return boto3.Session(
            aws_access_key_id=env_creds[0],
            aws_secret_access_key=env_creds[1],
            region_name=config.AWS_REGION
        )

    # 2. OS keychain
    keychain_creds = get_aws_credentials_from_keychain()
    if keychain_creds:
        return boto3.Session(
            aws_access_key_id=keychain_creds[0],
            aws_secret_access_key=keychain_creds[1],
            region_name=config.AWS_REGION
        )

    # 3. AWS SSO / default credential chain (lowest priority)
    sso_session = get_aws_credentials_from_sso()
    if sso_session:
        return sso_session

    raise ValueError("No AWS credentials found (checked environment, keychain, SSO)")
