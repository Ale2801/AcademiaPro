from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import Subject
from ..security import require_roles


router = APIRouter(prefix="/subjects", tags=["subjects"]) 


@router.get("/", response_model=List[Subject])
def list_subjects(session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher"))):
    return session.exec(select(Subject)).all()


@router.post("/", response_model=Subject)
def create_subject(subject: Subject, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    session.add(subject)
    session.commit()
    session.refresh(subject)
    return subject


@router.get("/{subject_id}", response_model=Subject)
def get_subject(subject_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher"))):
    obj = session.get(Subject, subject_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Asignatura no encontrada")
    return obj


@router.put("/{subject_id}", response_model=Subject)
def update_subject(subject_id: int, payload: Subject, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    obj = session.get(Subject, subject_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Asignatura no encontrada")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


@router.delete("/{subject_id}")
def delete_subject(subject_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    obj = session.get(Subject, subject_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Asignatura no encontrada")
    session.delete(obj)
    session.commit()
    return {"ok": True}