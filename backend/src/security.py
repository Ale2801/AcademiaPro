from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import select

from .config import settings
from .db import get_session
from .models import User


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")
oauth2_optional_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: str, expires_minutes: Optional[int] = None, extra: Optional[Dict[str, Any]] = None) -> str:
    effective_minutes = expires_minutes if expires_minutes is not None else settings.access_token_expire_minutes
    to_encode: Dict[str, Any] = {"sub": subject}
    if extra:
        to_encode.update(extra)
    if effective_minutes is not None and effective_minutes > 0:
        expire = datetime.now(timezone.utc) + timedelta(minutes=effective_minutes)
        to_encode["exp"] = int(expire.timestamp())
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def authenticate_token(token: str, session) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado", headers={"WWW-Authenticate": "Bearer"}
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        username: str = payload.get("sub")  # correo electrónico
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = session.exec(select(User).where(User.email == username)).first()
    if not user or not user.is_active:
        raise credentials_exception
    return user


def get_current_user(token: str = Depends(oauth2_scheme), session=Depends(get_session)) -> User:
    return authenticate_token(token, session)


def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_optional_scheme), session=Depends(get_session)
) -> Optional[User]:
    if not token:
        return None
    return authenticate_token(token, session)


def require_roles(*roles: str):
    def _inner(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Permisos insuficientes")
        return user

    return _inner