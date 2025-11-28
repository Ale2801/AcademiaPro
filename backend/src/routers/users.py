from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from sqlmodel import select

from ..db import get_session
from ..models import User
from ..security import get_current_user, require_roles, get_password_hash


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    profile_image: Optional[str] = None

    class Config:
        from_attributes = True


router = APIRouter(prefix="/users", tags=["users"]) 


@router.get("/", response_model=List[UserOut])
def list_users(session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    return session.exec(select(User)).all()


@router.get("/by-email", response_model=UserOut)
def get_user_by_email(email: str, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    obj = session.exec(select(User).where(User.email == email)).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return obj


class UserProfileOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    profile_image: Optional[str] = None

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=3, max_length=120)


class UserAvatarUpdate(BaseModel):
    image_data: Optional[str] = Field(default=None, max_length=1_500_000)


@router.get("/me", response_model=UserProfileOut)
def get_profile(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserProfileOut)
def update_profile(payload: UserProfileUpdate, session=Depends(get_session), user: User = Depends(get_current_user)):
    data = payload.model_dump(exclude_unset=True)
    if not data:
        return user
    for field, value in data.items():
        setattr(user, field, value)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.put("/me/avatar", response_model=UserProfileOut)
def update_profile_image(payload: UserAvatarUpdate, session=Depends(get_session), user: User = Depends(get_current_user)):
    if payload.image_data and not payload.image_data.startswith("data:image"):
        raise HTTPException(status_code=400, detail="La imagen debe ser un data URL base64 válido")
    user.profile_image = payload.image_data
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


class UserCreateRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    full_name: str = Field(min_length=3, max_length=120)
    role: Literal["admin", "coordinator", "teacher", "student"]
    password: str = Field(min_length=8, max_length=128)
    require_password_change: bool = Field(default=True)


class UserCreateResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    must_change_password: bool
    temporary_password: str

    class Config:
        from_attributes = True


@router.post("/", response_model=UserCreateResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    session=Depends(get_session),
    _user: User = Depends(require_roles("admin")),
):
    normalized_email = payload.email.strip().lower()
    existing = session.exec(select(User).where(User.email == normalized_email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="El correo ya está registrado")

    user = User(
        email=normalized_email,
        full_name=payload.full_name.strip(),
        hashed_password=get_password_hash(payload.password),
        role=payload.role,
        must_change_password=payload.require_password_change,
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserCreateResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        must_change_password=user.must_change_password,
        temporary_password=payload.password,
    )
