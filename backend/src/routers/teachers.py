from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import Teacher
from ..security import require_roles
from ..utils.sqlmodel_helpers import apply_partial_update


router = APIRouter(prefix="/teachers", tags=["teachers"]) 


@router.get("/", response_model=List[Teacher])
def list_teachers(session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    return session.exec(select(Teacher)).all()


@router.post("/", response_model=Teacher)
def create_teacher(teacher: Teacher, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    session.add(teacher)
    session.commit()
    session.refresh(teacher)
    return teacher


@router.get("/{teacher_id}", response_model=Teacher)
def get_teacher(teacher_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher"))):
    obj = session.get(Teacher, teacher_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Profesor no encontrado")
    return obj


@router.put("/{teacher_id}", response_model=Teacher)
def update_teacher(teacher_id: int, payload: Teacher, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    obj = session.get(Teacher, teacher_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Profesor no encontrado")
    update_data = payload.model_dump(exclude_unset=True)
    apply_partial_update(obj, update_data)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


@router.delete("/{teacher_id}")
def delete_teacher(teacher_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    obj = session.get(Teacher, teacher_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Profesor no encontrado")
    session.delete(obj)
    session.commit()
    return {"ok": True}