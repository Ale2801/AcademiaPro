from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import Student, User, Program
from ..security import get_current_user, require_roles
from ..utils.sqlmodel_helpers import apply_partial_update


router = APIRouter(prefix="/students", tags=["students"]) 


@router.get("/", response_model=List[Student])
def list_students(session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher"))):
    return session.exec(select(Student)).all()


@router.get("/me", response_model=Student)
def get_my_student(session=Depends(get_session), user=Depends(get_current_user)):
    obj = session.exec(select(Student).where(Student.user_id == user.id)).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Perfil de estudiante no encontrado")
    return obj


@router.post("/", response_model=Student)
def create_student(student: Student, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    program = session.get(Program, student.program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Programa no encontrado")
    session.add(student)
    session.commit()
    session.refresh(student)
    return student


@router.get("/{student_id}", response_model=Student)
def get_student(student_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher"))):
    obj = session.get(Student, student_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")
    return obj


@router.put("/{student_id}", response_model=Student)
def update_student(student_id: int, payload: Student, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    obj = session.get(Student, student_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")
    data = payload.model_dump(exclude_unset=True)
    if "program_id" in data:
        program = session.get(Program, data["program_id"])
        if not program:
            raise HTTPException(status_code=404, detail="Programa no encontrado")
    apply_partial_update(obj, data)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


@router.delete("/{student_id}")
def delete_student(student_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    obj = session.get(Student, student_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")
    session.delete(obj)
    session.commit()
    return {"ok": True}