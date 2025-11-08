from fastapi import APIRouter, Depends, HTTPException
from datetime import time as dt_time
from typing import List
from pydantic import BaseModel, Field, field_validator
from sqlmodel import select

from ..db import get_session
from ..models import Timeslot, CourseSchedule
from ..security import require_roles


router = APIRouter(prefix="/timeslots", tags=["timeslots"]) 


class TimeslotBulkItem(BaseModel):
	day_of_week: int = Field(ge=0, le=6)
	start_time: str
	end_time: str
	campus: str | None = None
	comment: str | None = None

	@field_validator("start_time", "end_time")
	@classmethod
	def _validate_time(cls, value: str) -> str:
		try:
			dt_time.fromisoformat(value)
		except ValueError as exc:
			raise ValueError("Formato de hora inválido, usa HH:MM") from exc
		return value


class TimeslotBulkRequest(BaseModel):
	slots: List[TimeslotBulkItem]
	replace_existing: bool = False

	@field_validator("slots")
	@classmethod
	def _validate_slots(cls, value: List[TimeslotBulkItem]) -> List[TimeslotBulkItem]:
		if not value:
			raise ValueError("Debes proveer al menos un bloque horario")
		return value


def _coerce_time(value: str | dt_time) -> dt_time:
	if isinstance(value, dt_time):
		return value
	return dt_time.fromisoformat(value)


def _time_key(day: int, start: dt_time, end: dt_time, campus: str | None, comment: str | None) -> tuple[int, dt_time, dt_time, str | None, str | None]:
	return (day, start, end, campus or None, comment or None)


@router.post("/bulk")
def bulk_upsert_timeslots(payload: TimeslotBulkRequest, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
	try:
		slots = payload.slots
	except ValueError as exc:  # Validación extra; en teoría Pydantic ya bloquea estos valores
		raise HTTPException(status_code=400, detail=str(exc)) from exc

	existing = session.exec(select(Timeslot)).all()
	existing_lookup = {_time_key(slot.day_of_week, slot.start_time, slot.end_time, slot.campus, slot.comment): slot for slot in existing}
	removed_timeslots = 0
	removed_course_schedules = 0

	if payload.replace_existing and existing:
		existing_ids = [slot.id for slot in existing if slot.id is not None]
		if existing_ids:
			schedules = session.exec(select(CourseSchedule).where(CourseSchedule.timeslot_id.in_(existing_ids))).all()
			for schedule in schedules:
				session.delete(schedule)
			removed_course_schedules = len(schedules)
		for slot in existing:
			session.delete(slot)
		removed_timeslots = len(existing)
		existing_lookup = {}

	created = 0
	skipped = 0
	seen_new: set[tuple[int, dt_time, dt_time, str | None, str | None]] = set()

	for item in slots:
		start_time = _coerce_time(item.start_time)
		end_time = _coerce_time(item.end_time)
		if end_time <= start_time:
			raise HTTPException(status_code=400, detail="La hora de término debe ser posterior al inicio")
		key = _time_key(item.day_of_week, start_time, end_time, item.campus, item.comment)
		if key in seen_new:
			skipped += 1
			continue
		if not payload.replace_existing and key in existing_lookup:
			skipped += 1
			continue
		slot = Timeslot(
			day_of_week=item.day_of_week,
			start_time=start_time,
			end_time=end_time,
			campus=item.campus,
			comment=item.comment,
		)
		session.add(slot)
		created += 1
		seen_new.add(key)

	session.commit()

	return {
		"created": created,
		"skipped": skipped,
		"removed_timeslots": removed_timeslots,
		"removed_course_schedules": removed_course_schedules,
	}


@router.get("/", response_model=List[Timeslot])
def list_timeslots(session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher"))):
	return session.exec(select(Timeslot)).all()


@router.post("/", response_model=Timeslot)
def create_timeslot(timeslot: Timeslot, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
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
def get_timeslot(timeslot_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher"))):
	obj = session.get(Timeslot, timeslot_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Bloque horario no encontrado")
	return obj


@router.put("/{timeslot_id}", response_model=Timeslot)
def update_timeslot(timeslot_id: int, payload: Timeslot, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
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
def delete_timeslot(timeslot_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
	obj = session.get(Timeslot, timeslot_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Bloque horario no encontrado")
	session.delete(obj)
	session.commit()
	return {"ok": True}
