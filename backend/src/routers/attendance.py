from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import Attendance
from ..security import require_roles
from ..utils.sqlmodel_helpers import apply_partial_update, normalize_payload_for_model


router = APIRouter(prefix="/attendance", tags=["attendance"]) 


@router.get("/", response_model=List[Attendance])
def list_attendance(session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher"))):
	return session.exec(select(Attendance)).all()


@router.post("/", response_model=Attendance)
def create_attendance(att: Attendance, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher"))):
	data = normalize_payload_for_model(Attendance, att.model_dump())
	obj = Attendance(**data)
	session.add(obj)
	session.commit()
	session.refresh(obj)
	return obj


@router.get("/{attendance_id}", response_model=Attendance)
def get_attendance(attendance_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher", "student"))):
	obj = session.get(Attendance, attendance_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Asistencia no encontrada")
	return obj


@router.put("/{attendance_id}", response_model=Attendance)
def update_attendance(attendance_id: int, payload: Attendance, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher"))):
	obj = session.get(Attendance, attendance_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Asistencia no encontrada")
	data = payload.model_dump(exclude_unset=True)
	apply_partial_update(obj, data)
	session.add(obj)
	session.commit()
	session.refresh(obj)
	return obj


@router.delete("/{attendance_id}")
def delete_attendance(attendance_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
	obj = session.get(Attendance, attendance_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Asistencia no encontrada")
	session.delete(obj)
	session.commit()
	return {"ok": True}
