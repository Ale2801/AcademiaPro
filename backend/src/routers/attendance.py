from fastapi import APIRouter, Depends, HTTPException
from datetime import date as dt_date
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import Attendance
from ..security import require_roles


router = APIRouter(prefix="/attendance", tags=["attendance"]) 


@router.get("/", response_model=List[Attendance])
def list_attendance(session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
	return session.exec(select(Attendance)).all()


@router.post("/", response_model=Attendance)
def create_attendance(att: Attendance, session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
	if isinstance(att.session_date, str):
		att.session_date = dt_date.fromisoformat(att.session_date)
	session.add(att)
	session.commit()
	session.refresh(att)
	return att


@router.get("/{attendance_id}", response_model=Attendance)
def get_attendance(attendance_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "teacher", "student"))):
	obj = session.get(Attendance, attendance_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Asistencia no encontrada")
	return obj


@router.put("/{attendance_id}", response_model=Attendance)
def update_attendance(attendance_id: int, payload: Attendance, session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
	obj = session.get(Attendance, attendance_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Asistencia no encontrada")
	data = payload.model_dump(exclude_unset=True)
	if isinstance(data.get("session_date"), str):
		data["session_date"] = dt_date.fromisoformat(data["session_date"])
	for k, v in data.items():
		setattr(obj, k, v)
	session.add(obj)
	session.commit()
	session.refresh(obj)
	return obj


@router.delete("/{attendance_id}")
def delete_attendance(attendance_id: int, session=Depends(get_session), user=Depends(require_roles("admin"))):
	obj = session.get(Attendance, attendance_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Asistencia no encontrada")
	session.delete(obj)
	session.commit()
	return {"ok": True}
