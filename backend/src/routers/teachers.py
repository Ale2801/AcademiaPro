from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import Teacher
from ..security import require_roles


router = APIRouter(prefix="/teachers", tags=["teachers"]) 


@router.get("/", response_model=List[Teacher])
def list_teachers(session=Depends(get_session), user=Depends(require_roles("admin"))):
    return session.exec(select(Teacher)).all()


@router.post("/", response_model=Teacher)
def create_teacher(teacher: Teacher, session=Depends(get_session), user=Depends(require_roles("admin"))):
    session.add(teacher)
    session.commit()
    session.refresh(teacher)
    return teacher


@router.get("/{teacher_id}", response_model=Teacher)
def get_teacher(teacher_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
    obj = session.get(Teacher, teacher_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Profesor no encontrado")
    return obj


@router.put("/{teacher_id}", response_model=Teacher)
def update_teacher(teacher_id: int, payload: Teacher, session=Depends(get_session), user=Depends(require_roles("admin"))):
    obj = session.get(Teacher, teacher_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Profesor no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


@router.delete("/{teacher_id}")
def delete_teacher(teacher_id: int, session=Depends(get_session), user=Depends(require_roles("admin"))):
    obj = session.get(Teacher, teacher_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Profesor no encontrado")
    session.delete(obj)
    session.commit()
    return {"ok": True}