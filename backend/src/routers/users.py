from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from sqlmodel import select

from ..db import get_session
from ..models import User
from ..security import require_roles


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


router = APIRouter(prefix="/users", tags=["users"]) 


@router.get("/", response_model=List[UserOut])
def list_users(session=Depends(get_session), user=Depends(require_roles("admin"))):
    return session.exec(select(User)).all()


@router.get("/by-email", response_model=UserOut)
def get_user_by_email(email: str, session=Depends(get_session), user=Depends(require_roles("admin"))):
    obj = session.exec(select(User).where(User.email == email)).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return obj
