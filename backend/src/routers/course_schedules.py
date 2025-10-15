from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import CourseSchedule, Course, Timeslot
from ..security import require_roles
from .schedule import _resolve_interval, _assert_no_overlap


router = APIRouter(prefix="/course-schedules", tags=["course_schedules"]) 


@router.get("/", response_model=List[CourseSchedule])
def list_course_schedules(
	program_semester_id: int | None = None,
	session=Depends(get_session),
	user=Depends(require_roles("admin", "teacher"))
):
	stmt = select(CourseSchedule)
	if program_semester_id is not None:
		stmt = stmt.where(CourseSchedule.program_semester_id == program_semester_id)
	return session.exec(stmt).all()


@router.post("/", response_model=CourseSchedule)
def create_course_schedule(cs: CourseSchedule, session=Depends(get_session), user=Depends(require_roles("admin"))):
	course = session.get(Course, cs.course_id)
	if not course:
		raise HTTPException(status_code=404, detail="Curso no encontrado")
	slot = session.get(Timeslot, cs.timeslot_id)
	if not slot:
		raise HTTPException(status_code=404, detail="Bloque horario no encontrado")

	existing = session.exec(
		select(CourseSchedule)
		.where(CourseSchedule.room_id == cs.room_id)
		.where(CourseSchedule.timeslot_id == cs.timeslot_id)
	).all()

	intervals: list[tuple[int, int]] = []
	for entry in existing:
		interval = _resolve_interval(slot, entry.duration_minutes, entry.start_offset_minutes)
		_assert_no_overlap(intervals, (interval[0], interval[1]))

	target_interval = _resolve_interval(slot, cs.duration_minutes, cs.start_offset_minutes)
	_assert_no_overlap(intervals, (target_interval[0], target_interval[1]))
	cs.duration_minutes = target_interval[1] - target_interval[0]
	cs.start_offset_minutes = target_interval[0]
	cs.program_semester_id = course.program_semester_id
	session.add(cs)
	session.commit()
	session.refresh(cs)
	return cs


@router.get("/{cs_id}", response_model=CourseSchedule)
def get_course_schedule(cs_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
	obj = session.get(CourseSchedule, cs_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Horario de curso no encontrado")
	return obj


@router.put("/{cs_id}", response_model=CourseSchedule)
def update_course_schedule(cs_id: int, payload: CourseSchedule, session=Depends(get_session), user=Depends(require_roles("admin"))):
	obj = session.get(CourseSchedule, cs_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Horario de curso no encontrado")
	updates = payload.model_dump(exclude_unset=True)
	if "course_id" in updates:
		course = session.get(Course, updates["course_id"])
		if not course:
			raise HTTPException(status_code=404, detail="Curso no encontrado")
		updates["program_semester_id"] = course.program_semester_id
	target_room_id = updates.get("room_id", obj.room_id)
	target_timeslot_id = updates.get("timeslot_id", obj.timeslot_id)
	target_duration = updates.get("duration_minutes", obj.duration_minutes)
	target_offset = updates.get("start_offset_minutes", obj.start_offset_minutes)

	slot = session.get(Timeslot, target_timeslot_id)
	if not slot:
		raise HTTPException(status_code=404, detail="Bloque horario no encontrado")

	existing = session.exec(
		select(CourseSchedule)
		.where(CourseSchedule.room_id == target_room_id)
		.where(CourseSchedule.timeslot_id == target_timeslot_id)
		.where(CourseSchedule.id != cs_id)
	).all()

	intervals: list[tuple[int, int]] = []
	for entry in existing:
		interval = _resolve_interval(slot, entry.duration_minutes, entry.start_offset_minutes)
		_assert_no_overlap(intervals, (interval[0], interval[1]))

	target_interval = _resolve_interval(slot, target_duration, target_offset)
	_assert_no_overlap(intervals, (target_interval[0], target_interval[1]))

	updates["duration_minutes"] = target_interval[1] - target_interval[0]
	updates["start_offset_minutes"] = target_interval[0]

	for k, v in updates.items():
		setattr(obj, k, v)
	session.add(obj)
	session.commit()
	session.refresh(obj)
	return obj


@router.delete("/{cs_id}")
def delete_course_schedule(cs_id: int, session=Depends(get_session), user=Depends(require_roles("admin"))):
	obj = session.get(CourseSchedule, cs_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Horario de curso no encontrado")
	session.delete(obj)
	session.commit()
	return {"ok": True}
