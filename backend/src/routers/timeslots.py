from fastapi import APIRouter, Depends, HTTPException
from datetime import time as dt_time
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import Timeslot
from ..security import require_roles


router = APIRouter(prefix="/timeslots", tags=["timeslots"]) 


@router.get("/", response_model=List[Timeslot])
def list_timeslots(session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
	return session.exec(select(Timeslot)).all()


@router.post("/", response_model=Timeslot)
def create_timeslot(timeslot: Timeslot, session=Depends(get_session), user=Depends(require_roles("admin"))):
	# Asegura tipos nativos para SQLite
	if isinstance(timeslot.start_time, str):
		timeslot.start_time = dt_time.fromisoformat(timeslot.start_time)
	if isinstance(timeslot.end_time, str):
		timeslot.end_time = dt_time.fromisoformat(timeslot.end_time)
	session.add(timeslot)
	session.commit()
	session.refresh(timeslot)
	return timeslot


@router.get("/{timeslot_id}", response_model=Timeslot)
def get_timeslot(timeslot_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
	obj = session.get(Timeslot, timeslot_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Bloque horario no encontrado")
	return obj


@router.put("/{timeslot_id}", response_model=Timeslot)
def update_timeslot(timeslot_id: int, payload: Timeslot, session=Depends(get_session), user=Depends(require_roles("admin"))):
	obj = session.get(Timeslot, timeslot_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Bloque horario no encontrado")
	data = payload.model_dump(exclude_unset=True)
	if isinstance(data.get("start_time"), str):
		data["start_time"] = dt_time.fromisoformat(data["start_time"])
	if isinstance(data.get("end_time"), str):
		data["end_time"] = dt_time.fromisoformat(data["end_time"]) 
	for k, v in data.items():
		setattr(obj, k, v)
	session.add(obj)
	session.commit()
	session.refresh(obj)
	return obj


@router.delete("/{timeslot_id}")
def delete_timeslot(timeslot_id: int, session=Depends(get_session), user=Depends(require_roles("admin"))):
	obj = session.get(Timeslot, timeslot_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Bloque horario no encontrado")
	session.delete(obj)
	session.commit()
	return {"ok": True}
