import hmac

from fastapi import Header, HTTPException

from food_policy_impact_tool.core.config import get_settings


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Validate the X-API-Key header when API_KEY is configured.

    When API_KEY is unset, auth is disabled to keep local development frictionless.

    Args:
        x_api_key: Value of the X-API-Key request header.

    Raises:
        HTTPException: If API_KEY is configured and the header is missing or invalid.
    """
    settings = get_settings()
    if settings.api_key is None:
        return

    if x_api_key is None or not hmac.compare_digest(x_api_key, settings.api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
