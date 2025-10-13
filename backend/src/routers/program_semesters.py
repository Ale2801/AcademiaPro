from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import ProgramSemester, Program
from ..security import require_roles

router = APIRouter(prefix="/program-semesters", tags=["program_semesters"])


@router.get("/", response_model=List[ProgramSemester])
def list_program_semesters(program_id: int | None = None, session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
    stmt = select(ProgramSemester)
    if program_id is not None:
        stmt = stmt.where(ProgramSemester.program_id == program_id)
    return session.exec(stmt.order_by(ProgramSemester.program_id, ProgramSemester.semester_number)).all()


@router.post("/", response_model=ProgramSemester)
def create_program_semester(payload: ProgramSemester, session=Depends(get_session), user=Depends(require_roles("admin"))):
    program = session.get(Program, payload.program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Programa no encontrado")
    session.add(payload)
    session.commit()
    session.refresh(payload)
    return payload


@router.get("/{semester_id}", response_model=ProgramSemester)
def get_program_semester(semester_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
    obj = session.get(ProgramSemester, semester_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Semestre de programa no encontrado")
    return obj


@router.put("/{semester_id}", response_model=ProgramSemester)
def update_program_semester(semester_id: int, payload: ProgramSemester, session=Depends(get_session), user=Depends(require_roles("admin"))):
    obj = session.get(ProgramSemester, semester_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Semestre de programa no encontrado")
    if payload.program_id:
        program = session.get(Program, payload.program_id)
        if not program:
            raise HTTPException(status_code=404, detail="Programa no encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


@router.delete("/{semester_id}")
def delete_program_semester(semester_id: int, session=Depends(get_session), user=Depends(require_roles("admin"))):
    obj = session.get(ProgramSemester, semester_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Semestre de programa no encontrado")
    session.delete(obj)
    session.commit()
    return {"ok": True}
