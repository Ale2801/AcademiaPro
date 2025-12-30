from collections import defaultdict
from datetime import time, datetime, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import select

from ..db import get_session
from ..exporters import export_schedule_excel, export_schedule_pdf
from ..models import (
    Course,
    CourseSchedule,
    Enrollment,
    Room,
    Student,
    Subject,
    Teacher,
    Timeslot,
    User,
)
from ..models import Program, ProgramSemester
from ..scheduler.optimizer import Constraints, CourseInput, RoomInput, TimeslotInput, solve_schedule
from ..security import get_current_user, require_roles


router = APIRouter(prefix="/schedule", tags=["schedule"]) 


class CourseIn(BaseModel):
    course_id: int
    teacher_id: int
    weekly_hours: int
    program_semester_id: Optional[int] = None  # Para rastrear carga por programa


class RoomIn(BaseModel):
    room_id: int
    capacity: int


class TimeslotIn(BaseModel):
    timeslot_id: int
    day: int
    block: int


class ConstraintsIn(BaseModel):
    teacher_availability: Dict[int, List[int]]
    room_allowed: Optional[Dict[int, List[int]]] = None
    max_consecutive_blocks: int = 4  # Aumentado de 3 a 4 para ser más realista
    min_gap_blocks: int = 0
    min_gap_minutes: int = 15  # Recreos entre clases
    reserve_break_minutes: int = 0  # Minutos a reservar dentro del bloque
    teacher_conflicts: Optional[Dict[int, List[int]]] = None
    lunch_blocks: Optional[List[tuple[int, int]]] = None  # [(day, hour), ...]
    max_daily_hours_per_program: int = 6  # Máximo horas por día por programa
    balance_weight: float = 0.3  # Peso para distribución balanceada


class AssignmentIn(BaseModel):
    course_id: int
    room_id: int
    timeslot_id: int
    duration_minutes: Optional[int] = None
    start_offset_minutes: Optional[int] = None


class SaveAssignmentsRequest(BaseModel):
    assignments: List[AssignmentIn]
    replace_existing: bool = True


class TeacherAssignmentIn(BaseModel):
    course_id: int
    teacher_id: int


class StudentAssignmentIn(BaseModel):
    course_id: int
    student_ids: List[int]
    replace_existing: bool = True


class StudentAssignmentResult(BaseModel):
    course_id: int
    added: int
    removed: int
    total: int


class ScheduleSlotOut(BaseModel):
    id: Optional[int]
    course_id: int
    course_name: Optional[str]
    subject_name: Optional[str]
    room_id: Optional[int]
    room_code: Optional[str]
    timeslot_id: int
    day_of_week: Optional[int]
    start_time: Optional[str]
    end_time: Optional[str]
    duration_minutes: Optional[int]
    start_offset_minutes: Optional[int]
    teacher_id: Optional[int]
    teacher_name: Optional[str]
    student_ids: List[int] = Field(default_factory=list)
    program_id: Optional[int] = None
    program_semester_id: Optional[int] = None
    program_semester_label: Optional[str] = None


def _time_to_str(value: Optional[time]) -> Optional[str]:
    if not value:
        return None
    return value.strftime("%H:%M")


def _load_context(session):
    courses = {c.id: c for c in session.exec(select(Course)).all()}
    subjects = {s.id: s for s in session.exec(select(Subject)).all()}
    teachers = {t.id: t for t in session.exec(select(Teacher)).all()}
    teacher_users = {}
    for teacher_id, teacher in teachers.items():
        user_obj = session.get(User, teacher.user_id) if teacher.user_id else None
        teacher_users[teacher_id] = user_obj.full_name if user_obj else None
    timeslots = {t.id: t for t in session.exec(select(Timeslot)).all()}
    rooms = {r.id: r for r in session.exec(select(Room)).all()}
    enrollments = session.exec(select(Enrollment)).all()
    enrollments_by_course: Dict[int, List[int]] = defaultdict(list)
    enrollments_by_student: Dict[int, List[int]] = defaultdict(list)
    for enrollment in enrollments:
        enrollments_by_course[enrollment.course_id].append(enrollment.student_id)
        enrollments_by_student[enrollment.student_id].append(enrollment.course_id)
    programs = {p.id: p for p in session.exec(select(Program)).all()}
    semesters = {ps.id: ps for ps in session.exec(select(ProgramSemester)).all()}
    return {
        "courses": courses,
        "subjects": subjects,
        "teachers": teachers,
        "teacher_users": teacher_users,
        "timeslots": timeslots,
        "rooms": rooms,
        "programs": programs,
        "semesters": semesters,
        "enrollments_by_course": enrollments_by_course,
        "enrollments_by_student": enrollments_by_student,
    }


def _build_schedule(entries: List[CourseSchedule], context, include_students: bool) -> List[ScheduleSlotOut]:
    courses = context["courses"]
    subjects = context["subjects"]
    teacher_users = context["teacher_users"]
    timeslots = context["timeslots"]
    rooms = context["rooms"]
    programs = context["programs"]
    semesters = context["semesters"]
    enrollments_by_course = context["enrollments_by_course"]

    payload: List[ScheduleSlotOut] = []
    for entry in entries:
        course = courses.get(entry.course_id)
        subject_name = None
        teacher_id = None
        teacher_name = None
        course_name = None
        program_id: int | None = None
        program_semester_id: int | None = entry.program_semester_id
        program_semester_label: str | None = None

        if course:
            subject = subjects.get(course.subject_id) if course.subject_id else None
            subject_name = subject.name if subject else None
            parts = [subject_name or f"Curso {course.id}"]
            if course.term:
                parts.append(course.term)
            if course.group:
                parts.append(f"Grupo {course.group}")
            course_name = " · ".join(parts)
            teacher_id = course.teacher_id
            teacher_name = teacher_users.get(teacher_id)
            if course.program_semester_id:
                program_semester_id = course.program_semester_id

        if program_semester_id:
            semester = semesters.get(program_semester_id)
            if semester:
                program_id = semester.program_id
                program_semester_label = semester.label or f"Semestre {semester.semester_number}"
                program = programs.get(program_id)
                if program and program_semester_label and program_semester_label.startswith("Semestre"):
                    program_semester_label = f"{program.name} · {program_semester_label}"

        slot = timeslots.get(entry.timeslot_id)
        room = rooms.get(entry.room_id)

        start_label: Optional[str] = None
        end_label: Optional[str] = None

        if slot:
            base_start = datetime.combine(datetime.today(), slot.start_time)
            slot_end_dt = datetime.combine(datetime.today(), slot.end_time)
            block_start = base_start
            if entry.start_offset_minutes is not None and entry.start_offset_minutes >= 0:
                block_start = base_start + timedelta(minutes=entry.start_offset_minutes)
            block_end = slot_end_dt
            if entry.duration_minutes is not None and entry.duration_minutes > 0:
                block_end = block_start + timedelta(minutes=entry.duration_minutes)
            if block_start < base_start:
                block_start = base_start
            if block_end > slot_end_dt:
                block_end = slot_end_dt
            start_label = block_start.strftime("%H:%M")
            end_label = block_end.strftime("%H:%M")

        payload.append(
            ScheduleSlotOut(
                id=entry.id,
                course_id=entry.course_id,
                course_name=course_name,
                subject_name=subject_name,
                room_id=entry.room_id,
                room_code=room.code if room else None,
                timeslot_id=entry.timeslot_id,
                day_of_week=slot.day_of_week if slot else None,
                start_time=start_label or _time_to_str(slot.start_time if slot else None),
                end_time=end_label or _time_to_str(slot.end_time if slot else None),
                duration_minutes=entry.duration_minutes,
                start_offset_minutes=entry.start_offset_minutes,
                teacher_id=teacher_id,
                teacher_name=teacher_name,
                student_ids=enrollments_by_course.get(entry.course_id, []) if include_students else [],
                program_id=program_id,
                program_semester_id=program_semester_id,
                program_semester_label=program_semester_label,
            )
        )

    payload.sort(key=lambda item: (item.day_of_week or 0, item.start_time or "", item.course_id))
    return payload


def _fetch_entries(
    session,
    course_ids: Optional[List[int]] = None,
    program_semester_ids: Optional[List[int]] = None,
) -> List[CourseSchedule]:
    if course_ids is not None and len(course_ids) == 0:
        return []
    stmt = select(CourseSchedule)
    if course_ids is not None:
        stmt = stmt.where(CourseSchedule.course_id.in_(course_ids))
    if program_semester_ids is not None:
        if len(program_semester_ids) == 0:
            return []
        stmt = stmt.where(CourseSchedule.program_semester_id.in_(program_semester_ids))
    return session.exec(stmt).all()


def _timeslot_total_minutes(slot: Timeslot) -> int:
    start_dt = datetime.combine(datetime.today(), slot.start_time)
    end_dt = datetime.combine(datetime.today(), slot.end_time)
    delta = end_dt - start_dt
    minutes = int(delta.total_seconds() // 60)
    return max(minutes, 0)


def _resolve_interval(slot: Timeslot, duration_minutes: Optional[int], start_offset_minutes: Optional[int]) -> tuple[int, int, int]:
    total = _timeslot_total_minutes(slot)
    duration = duration_minutes if duration_minutes and duration_minutes > 0 else total
    if duration > total:
        raise HTTPException(status_code=400, detail="La duración supera el tiempo disponible del bloque")
    offset = start_offset_minutes or 0
    if offset < 0:
        raise HTTPException(status_code=400, detail="El inicio parcial no puede ser negativo")
    end_offset = offset + duration
    if end_offset > total:
        raise HTTPException(status_code=400, detail="La duración parcial excede el bloque seleccionado")
    return offset, end_offset, duration


def _assert_no_overlap(intervals: list[tuple[int, int]], new_interval: tuple[int, int]):
    for existing_start, existing_end in intervals:
        new_start, new_end = new_interval
        if new_start < existing_end and new_end > existing_start:
            raise HTTPException(status_code=400, detail="El bloque horario ya está ocupado en el intervalo seleccionado")
    intervals.append(new_interval)
    intervals.sort(key=lambda interval: interval[0])


@router.post("/optimize")
def optimize(
    courses: List[CourseIn],
    rooms: List[RoomIn],
    timeslots: List[TimeslotIn],
    constraints: ConstraintsIn,
    session=Depends(get_session),
    user=Depends(require_roles("admin", "coordinator")),
):
    target_ids = {slot.timeslot_id for slot in timeslots}
    db_slots = session.exec(select(Timeslot).where(Timeslot.id.in_(target_ids))).all()
    slot_map = {slot.id: slot for slot in db_slots}
    timeslot_inputs: List[TimeslotInput] = []
    for slot_payload in timeslots:
        slot = slot_map.get(slot_payload.timeslot_id)
        if not slot:
            raise HTTPException(status_code=404, detail=f"Bloque {slot_payload.timeslot_id} no encontrado")
        start_minutes = slot.start_time.hour * 60 + slot.start_time.minute
        duration_minutes = _timeslot_total_minutes(slot)
        timeslot_inputs.append(
            TimeslotInput(
                timeslot_id=slot_payload.timeslot_id,
                day=slot_payload.day,
                block=slot_payload.block,
                start_minutes=start_minutes,
                duration_minutes=duration_minutes,
            )
        )

    request_course_ids = {course.course_id for course in courses}
    teacher_conflicts: Dict[int, set[int]] = {}
    if target_ids:
        existing_entries = session.exec(
            select(CourseSchedule).where(CourseSchedule.timeslot_id.in_(target_ids))
        ).all()
        conflict_course_ids = {
            entry.course_id
            for entry in existing_entries
            if entry.course_id not in request_course_ids
        }
        if conflict_course_ids:
            related_courses = session.exec(
                select(Course).where(Course.id.in_(conflict_course_ids))
            ).all()
            teacher_lookup = {course.id: course.teacher_id for course in related_courses}
            for entry in existing_entries:
                if entry.course_id in request_course_ids:
                    continue
                teacher_id = teacher_lookup.get(entry.course_id)
                if not teacher_id:
                    continue
                if teacher_id not in teacher_conflicts:
                    teacher_conflicts[teacher_id] = set()
                teacher_conflicts[teacher_id].add(entry.timeslot_id)

    constraints_data = constraints.model_dump()
    raw_conflicts = constraints_data.get("teacher_conflicts") or {}
    merged_conflicts: Dict[int, set[int]] = {}
    for key, values in raw_conflicts.items():
        try:
            teacher_id = int(key)
        except (TypeError, ValueError):
            continue
        merged_conflicts[teacher_id] = set(int(value) for value in values)
    for teacher_id, slots in teacher_conflicts.items():
        merged_conflicts.setdefault(teacher_id, set()).update(slots)
    constraints_data["teacher_conflicts"] = {
        teacher_id: sorted(slots)
        for teacher_id, slots in merged_conflicts.items()
        if slots
    }

    result = solve_schedule(
        [CourseInput(**c.model_dump()) for c in courses],
        [RoomInput(**r.model_dump()) for r in rooms],
        timeslot_inputs,
        Constraints(**constraints_data),
    )

    best_result = getattr(result, "best_result", result)
    best_label = getattr(result, "best_label", None)

    def _serialize(solve_result):
        assignments_payload = [
            {
                "course_id": item.course_id,
                "room_id": item.room_id,
                "timeslot_id": item.timeslot_id,
                "duration_minutes": item.duration_minutes,
                "start_offset_minutes": item.start_offset_minutes,
            }
            for item in solve_result.assignments
        ]

        unassigned_payload = [
            {"course_id": course_id, "remaining_minutes": minutes}
            for course_id, minutes in solve_result.unassigned.items()
        ]

        performance_payload = {
            "runtime_seconds": solve_result.performance_metrics.runtime_seconds,
            "requested_courses": solve_result.performance_metrics.requested_courses,
            "assigned_courses": solve_result.performance_metrics.assigned_courses,
            "requested_minutes": solve_result.performance_metrics.requested_minutes,
            "assigned_minutes": solve_result.performance_metrics.assigned_minutes,
            "fill_rate": solve_result.performance_metrics.fill_rate,
        }

        diagnostics_payload = {
            "messages": list(solve_result.diagnostics.messages),
            "unassigned_causes": solve_result.diagnostics.unassigned_causes,
        }

        quality_payload = {
            "total_assigned": solve_result.quality_metrics.total_assigned,
            "total_unassigned": solve_result.quality_metrics.total_unassigned,
            "lunch_violations": solve_result.quality_metrics.lunch_violations,
            "consecutive_blocks_violations": solve_result.quality_metrics.consecutive_blocks_violations,
            "gap_violations": solve_result.quality_metrics.gap_violations,
            "teacher_overlap_violations": solve_result.quality_metrics.teacher_overlap_violations,
            "balance_score": solve_result.quality_metrics.balance_score,
            "daily_overload_count": solve_result.quality_metrics.daily_overload_count,
            "avg_daily_load": solve_result.quality_metrics.avg_daily_load,
            "max_daily_load": solve_result.quality_metrics.max_daily_load,
            "timeslot_utilization": solve_result.quality_metrics.timeslot_utilization,
            "unassigned_count": solve_result.quality_metrics.unassigned_count,
        }

        return {
            "assignments": assignments_payload,
            "unassigned": unassigned_payload,
            "quality_metrics": quality_payload,
            "performance_metrics": performance_payload,
            "diagnostics": diagnostics_payload,
        }

    proposals_payload = []
    for proposal in getattr(result, "proposals", []):
        proposals_payload.append({"strategy": proposal.strategy, **_serialize(proposal.result)})

    best_payload = _serialize(best_result)

    return {
        **best_payload,
        "selected_strategy": best_label,
        "proposals": proposals_payload,
    }


@router.post("/assignments/save", response_model=List[ScheduleSlotOut])
def save_assignments(payload: SaveAssignmentsRequest, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    context = _load_context(session)
    courses = context["courses"]
    rooms = context["rooms"]
    timeslots = context["timeslots"]
    semesters = context["semesters"]

    intervals_by_key: Dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    target_timeslot_ids = {a.timeslot_id for a in payload.assignments}
    assignment_course_ids = {a.course_id for a in payload.assignments}
    target_pairs = {
        (a.room_id, a.timeslot_id)
        for a in payload.assignments
        if a.room_id is not None
    }

    if payload.assignments:
        existing_for_timeslots = session.exec(
            select(CourseSchedule).where(CourseSchedule.timeslot_id.in_(target_timeslot_ids))
        ).all()
        for entry in existing_for_timeslots:
            if entry.room_id is None:
                continue
            pair = (entry.room_id, entry.timeslot_id)
            if payload.replace_existing and (
                entry.course_id in assignment_course_ids or pair in target_pairs
            ):
                continue
            slot = timeslots.get(entry.timeslot_id)
            if not slot:
                continue
            interval = _resolve_interval(slot, entry.duration_minutes, entry.start_offset_minutes)
            _assert_no_overlap(intervals_by_key[(entry.room_id, entry.timeslot_id)], (interval[0], interval[1]))

    for assignment in payload.assignments:
        if assignment.course_id not in courses:
            raise HTTPException(status_code=404, detail=f"Curso {assignment.course_id} no encontrado")
        if assignment.room_id not in rooms:
            raise HTTPException(status_code=404, detail=f"Sala {assignment.room_id} no encontrada")
        if assignment.timeslot_id not in timeslots:
            raise HTTPException(status_code=404, detail=f"Bloque {assignment.timeslot_id} no encontrado")
        semester = semesters.get(courses[assignment.course_id].program_semester_id)
        if not semester:
            raise HTTPException(status_code=400, detail="El curso no está asociado a un semestre válido")
        slot = timeslots[assignment.timeslot_id]
        key = (assignment.room_id, assignment.timeslot_id)
        interval = _resolve_interval(slot, assignment.duration_minutes, assignment.start_offset_minutes)
        _assert_no_overlap(intervals_by_key[key], (interval[0], interval[1]))

    if payload.replace_existing and payload.assignments:
        course_ids = {a.course_id for a in payload.assignments}
        existing = _fetch_entries(session, list(course_ids))
        for entry in existing:
            session.delete(entry)

        if target_pairs:
            existing_for_timeslots = session.exec(
                select(CourseSchedule).where(CourseSchedule.timeslot_id.in_(target_timeslot_ids))
            ).all()
            for entry in existing_for_timeslots:
                pair = (entry.room_id, entry.timeslot_id)
                if pair in target_pairs and entry.course_id not in course_ids:
                    session.delete(entry)

    for assignment in payload.assignments:
        course = courses[assignment.course_id]
        session.add(CourseSchedule(
            course_id=assignment.course_id,
            room_id=assignment.room_id,
            timeslot_id=assignment.timeslot_id,
            program_semester_id=course.program_semester_id,
            duration_minutes=assignment.duration_minutes,
            start_offset_minutes=assignment.start_offset_minutes,
        ))

    session.commit()
    entries = _fetch_entries(session)
    context = _load_context(session)
    return _build_schedule(entries, context, include_students=True)


@router.post("/assignments/teacher", response_model=Course)
def assign_teacher(payload: TeacherAssignmentIn, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    course = session.get(Course, payload.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    teacher = session.get(Teacher, payload.teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Profesor no encontrado")
    course.teacher_id = payload.teacher_id
    session.add(course)
    session.commit()
    session.refresh(course)
    return course


@router.post("/assignments/students", response_model=StudentAssignmentResult)
def assign_students(payload: StudentAssignmentIn, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    course = session.get(Course, payload.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    semester = session.get(ProgramSemester, course.program_semester_id) if course.program_semester_id else None
    target_program_id = semester.program_id if semester else None

    existing_enrollments = session.exec(select(Enrollment).where(Enrollment.course_id == payload.course_id)).all()
    existing_student_ids = {enrollment.student_id for enrollment in existing_enrollments}

    target_students = set(payload.student_ids)
    if target_students:
        target_sequence = tuple(target_students)
        found_students = {
            student.id for student in session.exec(
                select(Student).where(Student.id.in_(target_sequence))
            ).all()
        }
        missing = target_students - found_students
        if missing:
            missing_list = ", ".join(str(mid) for mid in sorted(missing))
            raise HTTPException(status_code=404, detail=f"Estudiantes no encontrados: {missing_list}")
        if target_program_id:
            mismatched: List[int] = []
            for student_id in found_students:
                student_obj = session.get(Student, student_id)
                if student_obj and student_obj.program_id != target_program_id:
                    mismatched.append(student_id)
            if mismatched:
                mismatch_list = ", ".join(str(mid) for mid in sorted(mismatched))
                raise HTTPException(status_code=400, detail=f"Estudiantes no pertenecen al programa requerido: {mismatch_list}")

    to_add = target_students - existing_student_ids
    to_remove = existing_student_ids - target_students if payload.replace_existing else set()

    for student_id in to_add:
        session.add(Enrollment(student_id=student_id, course_id=payload.course_id))

    if to_remove:
        for enrollment in existing_enrollments:
            if enrollment.student_id in to_remove:
                session.delete(enrollment)

    session.commit()
    total_enrollments = session.exec(select(Enrollment).where(Enrollment.course_id == payload.course_id)).all()
    return StudentAssignmentResult(course_id=payload.course_id, added=len(to_add), removed=len(to_remove), total=len(total_enrollments))


@router.get("/overview", response_model=List[ScheduleSlotOut])
def schedule_overview(
    program_id: int | None = None,
    program_semester_id: int | None = None,
    session=Depends(get_session),
    user=Depends(require_roles("admin", "coordinator")),
):
    context = _load_context(session)
    semesters = context["semesters"]
    target_semesters: Optional[List[int]] = None
    if program_semester_id is not None:
        target_semesters = [program_semester_id]
    elif program_id is not None:
        target_semesters = [ps.id for ps in semesters.values() if ps.program_id == program_id]
    entries = _fetch_entries(session, program_semester_ids=target_semesters)
    return _build_schedule(entries, context, include_students=True)


@router.get("/my", response_model=List[ScheduleSlotOut])
def my_schedule(session=Depends(get_session), user=Depends(get_current_user)):
    context = _load_context(session)
    if user.role == "teacher":
        teacher = session.exec(select(Teacher).where(Teacher.user_id == user.id)).first()
        if not teacher:
            return []
        course_ids = [course.id for course in context["courses"].values() if course.teacher_id == teacher.id]
        entries = _fetch_entries(session, course_ids)
        return _build_schedule(entries, context, include_students=True)

    if user.role == "student":
        student = session.exec(select(Student).where(Student.user_id == user.id)).first()
        if not student:
            return []
        course_ids = context["enrollments_by_student"].get(student.id, [])
        entries = _fetch_entries(session, course_ids)
        return _build_schedule(entries, context, include_students=False)

    # Los administradores u otros roles con permiso ven la malla completa
    entries = _fetch_entries(session)
    return _build_schedule(entries, context, include_students=True)


@router.post("/export/excel")
def export_excel(assignments: List[tuple[int, int, int]], user=Depends(require_roles("admin", "coordinator"))):
    path = "/tmp/horario.xlsx"
    export_schedule_excel(assignments, path)
    return {"path": path}


@router.post("/export/pdf")
def export_pdf(assignments: List[tuple[int, int, int]], user=Depends(require_roles("admin", "coordinator"))):
    path = "/tmp/horario.pdf"
    export_schedule_pdf(assignments, path)
    return {"path": path}