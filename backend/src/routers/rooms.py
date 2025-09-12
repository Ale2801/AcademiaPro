from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import Room
from ..security import require_roles


router = APIRouter(prefix="/rooms", tags=["rooms"]) 


@router.get("/", response_model=List[Room])
def list_rooms(session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
    return session.exec(select(Room)).all()


@router.post("/", response_model=Room)
def create_room(room: Room, session=Depends(get_session), user=Depends(require_roles("admin"))):
    session.add(room)
    session.commit()
    session.refresh(room)
    return room


@router.get("/{room_id}", response_model=Room)
def get_room(room_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
    obj = session.get(Room, room_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Sala no encontrada")
    return obj


@router.put("/{room_id}", response_model=Room)
def update_room(room_id: int, payload: Room, session=Depends(get_session), user=Depends(require_roles("admin"))):
    obj = session.get(Room, room_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Sala no encontrada")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


@router.delete("/{room_id}")
def delete_room(room_id: int, session=Depends(get_session), user=Depends(require_roles("admin"))):
    obj = session.get(Room, room_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Sala no encontrada")
    session.delete(obj)
    session.commit()
    return {"ok": True}