from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from sqlmodel import select

from ..db import get_session
from ..models import Program
from ..security import require_roles


router = APIRouter(prefix="/programs", tags=["programs"]) 


class ProgramUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    level: Optional[str] = None
    duration_semesters: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/", response_model=List[Program])
def list_programs(session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher"))):
    return session.exec(select(Program)).all()


@router.post("/", response_model=Program)
def create_program(program: Program, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    session.add(program)
    session.commit()
    session.refresh(program)
    return program


@router.get("/{program_id}", response_model=Program)
def get_program(program_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher"))):
    obj = session.get(Program, program_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Programa no encontrado")
    return obj


@router.put("/{program_id}", response_model=Program)
def update_program(program_id: int, payload: ProgramUpdate, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    obj = session.get(Program, program_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Programa no encontrado")
    update_data = payload.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(obj, k, v)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


@router.patch("/{program_id}", response_model=Program)
def patch_program(program_id: int, payload: ProgramUpdate, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    return update_program(program_id, payload, session=session, user=user)


@router.delete("/{program_id}")
def delete_program(program_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    obj = session.get(Program, program_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Programa no encontrado")
    session.delete(obj)
    session.commit()
    return {"ok": True}
