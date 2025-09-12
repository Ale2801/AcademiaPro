from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List

from ..security import require_roles
from ..scheduler.optimizer import CourseInput, RoomInput, TimeslotInput, Constraints, solve_schedule
from ..exporters import export_schedule_excel, export_schedule_pdf


router = APIRouter(prefix="/schedule", tags=["schedule"]) 


class CourseIn(BaseModel):
    course_id: int
    teacher_id: int
    weekly_hours: int


class RoomIn(BaseModel):
    room_id: int
    capacity: int


class TimeslotIn(BaseModel):
    timeslot_id: int
    day: int
    block: int


class ConstraintsIn(BaseModel):
    teacher_availability: dict[int, List[int]]
    room_allowed: dict[int, List[int]] | None = None
    max_consecutive_blocks: int = 3


@router.post("/optimize")
def optimize(courses: List[CourseIn], rooms: List[RoomIn], timeslots: List[TimeslotIn], constraints: ConstraintsIn, user=Depends(require_roles("admin"))):
    solution = solve_schedule(
        [CourseInput(**c.dict()) for c in courses],
        [RoomInput(**r.dict()) for r in rooms],
        [TimeslotInput(**t.dict()) for t in timeslots],
        Constraints(**constraints.dict()),
    )
    return {"assignments": solution}


@router.post("/export/excel")
def export_excel(assignments: List[tuple[int, int, int]], user=Depends(require_roles("admin"))):
    path = "/tmp/horario.xlsx"
    export_schedule_excel(assignments, path)
    return {"path": path}


@router.post("/export/pdf")
def export_pdf(assignments: List[tuple[int, int, int]], user=Depends(require_roles("admin"))):
    path = "/tmp/horario.pdf"
    export_schedule_pdf(assignments, path)
    return {"path": path}