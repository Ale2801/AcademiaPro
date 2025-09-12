from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import Grade
from ..security import require_roles


router = APIRouter(prefix="/grades", tags=["grades"]) 


@router.get("/", response_model=List[Grade])
def list_grades(session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
	return session.exec(select(Grade)).all()


@router.post("/", response_model=Grade)
def create_grade(grade: Grade, session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
	session.add(grade)
	session.commit()
	session.refresh(grade)
	return grade


@router.get("/{grade_id}", response_model=Grade)
def get_grade(grade_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "teacher", "student"))):
	obj = session.get(Grade, grade_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Nota no encontrada")
	return obj


@router.put("/{grade_id}", response_model=Grade)
def update_grade(grade_id: int, payload: Grade, session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
	obj = session.get(Grade, grade_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Nota no encontrada")
	for k, v in payload.model_dump(exclude_unset=True).items():
		setattr(obj, k, v)
	session.add(obj)
	session.commit()
	session.refresh(obj)
	return obj


@router.delete("/{grade_id}")
def delete_grade(grade_id: int, session=Depends(get_session), user=Depends(require_roles("admin"))):
	obj = session.get(Grade, grade_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Nota no encontrada")
	session.delete(obj)
	session.commit()
	return {"ok": True}
