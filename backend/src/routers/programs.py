from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import Program
from ..security import require_roles


router = APIRouter(prefix="/programs", tags=["programs"]) 


@router.get("/", response_model=List[Program])
def list_programs(session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
    return session.exec(select(Program)).all()


@router.post("/", response_model=Program)
def create_program(program: Program, session=Depends(get_session), user=Depends(require_roles("admin"))):
    session.add(program)
    session.commit()
    session.refresh(program)
    return program


@router.get("/{program_id}", response_model=Program)
def get_program(program_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
    obj = session.get(Program, program_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Programa no encontrado")
    return obj


@router.put("/{program_id}", response_model=Program)
def update_program(program_id: int, payload: Program, session=Depends(get_session), user=Depends(require_roles("admin"))):
    obj = session.get(Program, program_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Programa no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


@router.delete("/{program_id}")
def delete_program(program_id: int, session=Depends(get_session), user=Depends(require_roles("admin"))):
    obj = session.get(Program, program_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Programa no encontrado")
    session.delete(obj)
    session.commit()
    return {"ok": True}
