from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlmodel import select

from ..db import get_session
from ..models import User
from ..security import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
)


router = APIRouter(prefix="/auth", tags=["auth"])


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_change_password: bool = False


@router.post("/token", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), session=Depends(get_session)):
    user = session.exec(select(User).where(User.email == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Credenciales inválidas")
    token = create_access_token(user.email, extra={"role": user.role})
    return TokenResponse(access_token=token, must_change_password=user.must_change_password)


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
    return TokenResponse(access_token=token, must_change_password=user.must_change_password)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=6)
    new_password: str = Field(min_length=8)


@router.post("/change-password", response_model=TokenResponse)
def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    session=Depends(get_session),
):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe ser diferente")
    user.hashed_password = get_password_hash(payload.new_password)
    user.must_change_password = False
    session.add(user)
    session.commit()
    session.refresh(user)
    token = create_access_token(user.email, extra={"role": user.role})
    return TokenResponse(access_token=token, must_change_password=user.must_change_password)