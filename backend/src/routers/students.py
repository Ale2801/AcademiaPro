from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import Student, User, Program
from ..security import require_roles


router = APIRouter(prefix="/students", tags=["students"]) 


@router.get("/", response_model=List[Student])
def list_students(session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
    return session.exec(select(Student)).all()


@router.post("/", response_model=Student)
def create_student(student: Student, session=Depends(get_session), user=Depends(require_roles("admin"))):
    program = session.get(Program, student.program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Programa no encontrado")
    session.add(student)
    session.commit()
    session.refresh(student)
    return student


@router.get("/{student_id}", response_model=Student)
def get_student(student_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
    obj = session.get(Student, student_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")
    return obj


@router.put("/{student_id}", response_model=Student)
def update_student(student_id: int, payload: Student, session=Depends(get_session), user=Depends(require_roles("admin"))):
    obj = session.get(Student, student_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")
    data = payload.model_dump(exclude_unset=True)
    if "program_id" in data:
        program = session.get(Program, data["program_id"])
        if not program:
            raise HTTPException(status_code=404, detail="Programa no encontrado")
    for k, v in data.items():
        setattr(obj, k, v)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


@router.delete("/{student_id}")
def delete_student(student_id: int, session=Depends(get_session), user=Depends(require_roles("admin"))):
    obj = session.get(Student, student_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")
    session.delete(obj)
    session.commit()
    return {"ok": True}