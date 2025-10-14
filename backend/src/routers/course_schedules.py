from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import CourseSchedule
from ..security import require_roles


router = APIRouter(prefix="/course-schedules", tags=["course_schedules"]) 


@router.get("/", response_model=List[CourseSchedule])
def list_course_schedules(session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
	return session.exec(select(CourseSchedule)).all()


@router.post("/", response_model=CourseSchedule)
def create_course_schedule(cs: CourseSchedule, session=Depends(get_session), user=Depends(require_roles("admin"))):
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
	for k, v in payload.model_dump(exclude_unset=True).items():
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
