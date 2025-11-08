from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from sqlmodel import select

from ..db import get_session
from ..models import Course, ProgramSemester
from ..security import require_roles


router = APIRouter(prefix="/courses", tags=["courses"]) 


@router.get("/", response_model=List[Course])
def list_courses(
    program_semester_id: Optional[int] = None,
    session=Depends(get_session),
    user=Depends(require_roles("admin", "coordinator", "teacher", "student"))
):
    stmt = select(Course)
    if program_semester_id is not None:
        stmt = stmt.where(Course.program_semester_id == program_semester_id)
    return session.exec(stmt).all()


@router.post("/", response_model=Course)
def create_course(course: Course, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    semester = session.get(ProgramSemester, course.program_semester_id)
    if not semester:
        raise HTTPException(status_code=404, detail="Semestre de programa no encontrado")
    session.add(course)
    session.commit()
    session.refresh(course)
    return course


@router.get("/{course_id}", response_model=Course)
def get_course(course_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher", "student"))):
    obj = session.get(Course, course_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    return obj


@router.put("/{course_id}", response_model=Course)
def update_course(course_id: int, payload: Course, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    obj = session.get(Course, course_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    data = payload.model_dump(exclude_unset=True)
    if "program_semester_id" in data:
        semester = session.get(ProgramSemester, data["program_semester_id"])
        if not semester:
            raise HTTPException(status_code=404, detail="Semestre de programa no encontrado")
    for k, v in data.items():
        setattr(obj, k, v)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


@router.delete("/{course_id}")
def delete_course(course_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    obj = session.get(Course, course_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    session.delete(obj)
    session.commit()
    return {"ok": True}