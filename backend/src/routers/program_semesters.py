from datetime import UTC, datetime
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from sqlmodel import select

from ..db import get_session
from ..models import (
    Program,
    ProgramEnrollmentStatusEnum,
    ProgramSemester,
    ProgramSemesterStateEnum,
    StudentProgramEnrollment,
)
from ..security import require_roles

router = APIRouter(prefix="/program-semesters", tags=["program_semesters"])


class ProgramSemesterUpdate(BaseModel):
    program_id: Optional[int] = None
    semester_number: Optional[int] = None
    label: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    state: Optional[ProgramSemesterStateEnum] = None


@router.get("/", response_model=List[ProgramSemester])
def list_program_semesters(program_id: int | None = None, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher", "student"))):
    stmt = select(ProgramSemester)
    if program_id is not None:
        stmt = stmt.where(ProgramSemester.program_id == program_id)
    return session.exec(stmt.order_by(ProgramSemester.program_id, ProgramSemester.semester_number)).all()


@router.post("/", response_model=ProgramSemester)
def create_program_semester(payload: ProgramSemester, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    program = session.get(Program, payload.program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Programa no encontrado")
    session.add(payload)
    session.commit()
    session.refresh(payload)
    return payload


@router.get("/{semester_id}", response_model=ProgramSemester)
def get_program_semester(semester_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher", "student"))):
    obj = session.get(ProgramSemester, semester_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Semestre de programa no encontrado")
    return obj


@router.put("/{semester_id}", response_model=ProgramSemester)
def update_program_semester(semester_id: int, payload: ProgramSemesterUpdate, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    obj = session.get(ProgramSemester, semester_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Semestre de programa no encontrado")
    update_data = payload.model_dump(exclude_unset=True)
    target_program_id = update_data.get("program_id") or obj.program_id
    if "program_id" in update_data and update_data["program_id"] is not None:
        program = session.get(Program, update_data["program_id"])
        if not program:
            raise HTTPException(status_code=404, detail="Programa no encontrado")
    requested_state = update_data.get("state")
    if requested_state:
        if requested_state == ProgramSemesterStateEnum.current:
            others = session.exec(
                select(ProgramSemester)
                .where(
                    ProgramSemester.program_id == target_program_id,
                    ProgramSemester.id != obj.id,
                    ProgramSemester.state == ProgramSemesterStateEnum.current,
                )
            ).all()
            for other in others:
                other.state = ProgramSemesterStateEnum.planned
                if other.is_active is None:
                    other.is_active = True
                session.add(other)
            if update_data.get("is_active") is None:
                obj.is_active = True
        elif requested_state == ProgramSemesterStateEnum.finished:
            if update_data.get("is_active") is None:
                obj.is_active = False
            active_enrollments = session.exec(
                select(StudentProgramEnrollment)
                .where(
                    StudentProgramEnrollment.program_semester_id == obj.id,
                    StudentProgramEnrollment.status == ProgramEnrollmentStatusEnum.active,
                )
            ).all()
            if active_enrollments:
                now = datetime.now(UTC)
                for enrollment in active_enrollments:
                    enrollment.status = ProgramEnrollmentStatusEnum.completed
                    enrollment.ended_at = now
                    session.add(enrollment)
        elif requested_state == ProgramSemesterStateEnum.planned and update_data.get("is_active") is None:
            obj.is_active = True
    for key, value in update_data.items():
        if value is not None:
            setattr(obj, key, value)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


@router.patch("/{semester_id}", response_model=ProgramSemester)
def patch_program_semester(semester_id: int, payload: ProgramSemesterUpdate, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    return update_program_semester(semester_id, payload, session=session, user=user)


@router.delete("/{semester_id}")
def delete_program_semester(semester_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    obj = session.get(ProgramSemester, semester_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Semestre de programa no encontrado")
    session.delete(obj)
    session.commit()
    return {"ok": True}
