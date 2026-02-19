"""JWT 인증 유틸"""
from datetime import datetime, timedelta
from typing import Optional

import jwt
from fastapi import HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.core import settings

security = HTTPBearer(auto_error=False)


def create_access_token(user_id: str, email: str = "", name: str = "") -> str:
    """JWT 액세스 토큰 생성"""
    expire = datetime.utcnow() + timedelta(hours=settings.jwt_expire_hours)
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "exp": expire,
        "iat": datetime.utcnow(),
    }
    return jwt.encode(
        payload,
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


async def get_current_user_id(request: Request) -> Optional[str]:
    """
    Authorization: Bearer <token> 에서 user_id 추출.
    없거나 유효하지 않으면 None (또는 401).
    """
    creds: Optional[HTTPAuthorizationCredentials] = await security(request)
    if not creds or not creds.credentials:
        return None

    try:
        payload = jwt.decode(
            creds.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        return payload.get("sub")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="토큰이 만료되었습니다. 다시 로그인해주세요.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")


async def require_user_id(request: Request) -> str:
    """user_id 필수. 없으면 401."""
    user_id = await get_current_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return user_id
