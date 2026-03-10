"""Clerk JWT verification to get user email from Bearer token."""

from __future__ import annotations

import httpx
import jwt
from jwt import PyJWKClient

from config import get_settings


def get_email_from_token(authorization: str | None) -> str | None:
    """
    Verify Clerk JWT and return the user's email, or None if invalid/missing.
    Expects header: Authorization: Bearer <jwt>.
    Uses JWKS from the token's issuer (Clerk Frontend API); email from token or Clerk API (needs CLERK_SECRET_KEY).
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        return None

    try:
        # Get issuer from token (unverified) to use correct Clerk JWKS endpoint
        unverified = jwt.decode(token, options={"verify_signature": False})
        iss = unverified.get("iss") or ""
        if not iss or ".clerk." not in iss:
            return None
        jwks_url = iss.rstrip("/") + "/.well-known/jwks.json"
        jwks_client = PyJWKClient(jwks_url, cache_jwk_set=True)
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False, "verify_exp": True},
        )
    except Exception:
        return None

    # Clerk JWT payload: sub = user id; email may be in token or we fetch via API
    email = payload.get("email") or payload.get("email_address")
    if email and isinstance(email, str):
        return email

    # Fallback: get user from Clerk API using sub (requires CLERK_SECRET_KEY in backend .env)
    sub = payload.get("sub")
    if not sub:
        return None
    return _fetch_email_from_clerk(sub)


def _fetch_email_from_clerk(user_id: str) -> str | None:
    """Fetch user email from Clerk Backend API."""
    settings = get_settings()
    if not settings.clerk_secret_key:
        return None
    url = f"https://api.clerk.com/v1/users/{user_id}"
    headers = {"Authorization": f"Bearer {settings.clerk_secret_key}"}
    try:
        with httpx.Client(timeout=10) as client:
            r = client.get(url, headers=headers)
            if r.status_code != 200:
                return None
            data = r.json()
            for ident in data.get("email_addresses") or []:
                if ident.get("id") == data.get("primary_email_address_id"):
                    return ident.get("email_address")
            first = (data.get("email_addresses") or [{}])[0]
            return first.get("email_address")
    except Exception:
        return None
