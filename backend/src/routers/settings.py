from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ConfigDict
from sqlmodel import SQLModel, select

from ..db import get_session
from ..models import AppSetting
from ..security import require_roles

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingRead(SQLModel):
    key: str
    value: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    is_public: bool = False

    model_config = ConfigDict(from_attributes=True)


class SettingCreate(SQLModel):
    key: str
    value: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    is_public: bool = False

    model_config = ConfigDict(extra="forbid")


class SettingUpdate(SQLModel):
    value: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    is_public: Optional[bool] = None

    model_config = ConfigDict(extra="forbid")


@router.get("/", response_model=List[SettingRead])
def list_settings(
    category: Optional[str] = None,
    session=Depends(get_session),
    user=Depends(require_roles("admin")),
):
    statement = select(AppSetting)
    if category:
        statement = statement.where(AppSetting.category == category)
    results = session.exec(statement).all()
    return results


@router.get("/public", response_model=List[SettingRead])
def list_public_settings(
    category: Optional[str] = None,
    session=Depends(get_session),
):
    statement = select(AppSetting).where(AppSetting.is_public.is_(True))
    if category:
        statement = statement.where(AppSetting.category == category)
    return session.exec(statement).all()


@router.get("/{key}", response_model=SettingRead)
def get_setting(
    key: str,
    session=Depends(get_session),
    user=Depends(require_roles("admin")),
):
    setting = session.exec(select(AppSetting).where(AppSetting.key == key)).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")
    return setting


@router.post("/", response_model=SettingRead, status_code=201)
def create_setting(
    payload: SettingCreate,
    session=Depends(get_session),
    user=Depends(require_roles("admin")),
):
    existing = session.exec(select(AppSetting).where(AppSetting.key == payload.key)).first()
    if existing:
        raise HTTPException(status_code=400, detail="La clave de configuración ya existe")
    setting = AppSetting(**payload.model_dump())
    session.add(setting)
    session.commit()
    session.refresh(setting)
    return setting


@router.put("/{key}", response_model=SettingRead)
def update_setting(
    key: str,
    payload: SettingUpdate,
    session=Depends(get_session),
    user=Depends(require_roles("admin")),
):
    update_data = payload.model_dump(exclude_unset=True)
    setting = session.exec(select(AppSetting).where(AppSetting.key == key)).first()
    if setting:
        for attr, value in update_data.items():
            setattr(setting, attr, value)
    else:
        setting = AppSetting(key=key, **update_data)
        session.add(setting)
    session.add(setting)
    session.commit()
    session.refresh(setting)
    return setting


@router.delete("/{key}", status_code=204)
def delete_setting(
    key: str,
    session=Depends(get_session),
    user=Depends(require_roles("admin")),
):
    setting = session.exec(select(AppSetting).where(AppSetting.key == key)).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")
    session.delete(setting)
    session.commit()
    return None
