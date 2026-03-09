import os
from functools import lru_cache

import httpx
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError

security = HTTPBearer()


@lru_cache(maxsize=1)
def _fetch_jwks() -> dict:
    """Fetch and cache Clerk's public JWKS. Refreshed on each cold start."""
    url = os.environ["CLERK_JWKS_URL"]
    resp = httpx.get(url, timeout=10)
    resp.raise_for_status()
    return resp.json()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> dict:
    """FastAPI dependency — verifies the Clerk JWT and returns the payload.

    Usage:
        @app.post("/query")
        def query(req: QueryRequest, user: dict = Depends(get_current_user)):
            user_id = user["sub"]
    """
    token = credentials.credentials
    try:
        jwks = _fetch_jwks()
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            options={"verify_aud": False},  # aud not required unless set in Clerk dashboard
        )
        return payload
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
