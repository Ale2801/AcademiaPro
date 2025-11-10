from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import Grade
from ..security import require_roles
from ..utils.sqlmodel_helpers import apply_partial_update


router = APIRouter(prefix="/grades", tags=["grades"]) 


@router.get("/", response_model=List[Grade])
def list_grades(session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher"))):
	return session.exec(select(Grade)).all()


@router.post("/", response_model=Grade)
def create_grade(grade: Grade, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher"))):
	session.add(grade)
	session.commit()
	session.refresh(grade)
	return grade


@router.get("/{grade_id}", response_model=Grade)
def get_grade(grade_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher", "student"))):
	obj = session.get(Grade, grade_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Nota no encontrada")
	return obj


@router.put("/{grade_id}", response_model=Grade)
def update_grade(grade_id: int, payload: Grade, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher"))):
	obj = session.get(Grade, grade_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Nota no encontrada")
	update_data = payload.model_dump(exclude_unset=True)
	apply_partial_update(obj, update_data)
	session.add(obj)
	session.commit()
	session.refresh(obj)
	return obj


@router.delete("/{grade_id}")
def delete_grade(grade_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
	obj = session.get(Grade, grade_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Nota no encontrada")
	session.delete(obj)
	session.commit()
	return {"ok": True}
