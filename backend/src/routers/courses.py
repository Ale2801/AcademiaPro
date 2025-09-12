from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import Course
from ..security import require_roles


router = APIRouter(prefix="/courses", tags=["courses"]) 


@router.get("/", response_model=List[Course])
def list_courses(session=Depends(get_session), user=Depends(require_roles("admin", "teacher", "student"))):
    return session.exec(select(Course)).all()


@router.post("/", response_model=Course)
def create_course(course: Course, session=Depends(get_session), user=Depends(require_roles("admin"))):
    session.add(course)
    session.commit()
    session.refresh(course)
    return course


@router.get("/{course_id}", response_model=Course)
def get_course(course_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "teacher", "student"))):
    obj = session.get(Course, course_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    return obj


@router.put("/{course_id}", response_model=Course)
def update_course(course_id: int, payload: Course, session=Depends(get_session), user=Depends(require_roles("admin"))):
    obj = session.get(Course, course_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


@router.delete("/{course_id}")
def delete_course(course_id: int, session=Depends(get_session), user=Depends(require_roles("admin"))):
    obj = session.get(Course, course_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    session.delete(obj)
    session.commit()
    return {"ok": True}