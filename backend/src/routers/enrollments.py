from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import Enrollment
from ..security import require_roles


router = APIRouter(prefix="/enrollments", tags=["enrollments"]) 


@router.get("/", response_model=List[Enrollment])
def list_enrollments(session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
	return session.exec(select(Enrollment)).all()


@router.post("/", response_model=Enrollment)
def create_enrollment(enrollment: Enrollment, session=Depends(get_session), user=Depends(require_roles("admin"))):
	session.add(enrollment)
	session.commit()
	session.refresh(enrollment)
	return enrollment


@router.get("/{enrollment_id}", response_model=Enrollment)
def get_enrollment(enrollment_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "teacher", "student"))):
	obj = session.get(Enrollment, enrollment_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Matrícula no encontrada")
	return obj


@router.put("/{enrollment_id}", response_model=Enrollment)
def update_enrollment(enrollment_id: int, payload: Enrollment, session=Depends(get_session), user=Depends(require_roles("admin"))):
	obj = session.get(Enrollment, enrollment_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Matrícula no encontrada")
	for k, v in payload.model_dump(exclude_unset=True).items():
		setattr(obj, k, v)
	session.add(obj)
	session.commit()
	session.refresh(obj)
	return obj


@router.delete("/{enrollment_id}")
def delete_enrollment(enrollment_id: int, session=Depends(get_session), user=Depends(require_roles("admin"))):
	obj = session.get(Enrollment, enrollment_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Matrícula no encontrada")
	session.delete(obj)
	session.commit()
	return {"ok": True}
