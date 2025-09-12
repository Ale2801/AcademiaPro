from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlmodel import select

from ..db import get_session
from ..models import User
from ..security import verify_password, get_password_hash, create_access_token


router = APIRouter(prefix="/auth", tags=["auth"])


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/token", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), session=Depends(get_session)):
    user = session.exec(select(User).where(User.email == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Credenciales inválidas")
    token = create_access_token(user.email, extra={"role": user.role})
    return TokenResponse(access_token=token)


class SignupRequest(BaseModel):
    email: str
    full_name: str
    password: str
    role: str


@router.post("/signup", response_model=TokenResponse)
def signup(payload: SignupRequest, session=Depends(get_session)):
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Usuario ya existe")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=get_password_hash(payload.password),
        role=payload.role,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    token = create_access_token(user.email, extra={"role": user.role})
    return TokenResponse(access_token=token)