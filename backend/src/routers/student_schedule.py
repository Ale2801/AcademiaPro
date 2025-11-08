from __future__ import annotations

import json
from collections import defaultdict
from datetime import UTC, datetime
from typing import Dict, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlmodel import Session, select

from ..db import get_session
from ..models import (
    Course,
    CourseSchedule,
    Enrollment,
    EnrollmentStatusEnum,
    Program,
    ProgramEnrollmentStatusEnum,
    ProgramSemester,
    ProgramSemesterStateEnum,
    ScheduleSupportRequest,
    Student,
    StudentProgramEnrollment,
    Subject,
    Timeslot,
)
from ..security import require_roles
from .schedule import ScheduleSlotOut, _build_schedule, _fetch_entries, _load_context

router = APIRouter(prefix="/student-schedule", tags=["student-schedule"])


class TimeslotSummaryOut(BaseModel):
    id: int
    day_of_week: int
    start_time: str
    end_time: str
    campus: Optional[str] = None
    comment: Optional[str] = None


class CourseSchedulePreview(BaseModel):
    timeslot_id: int
    day_of_week: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    room_id: Optional[int] = None
    room_code: Optional[str] = None


class CourseOptionOut(BaseModel):
    course_id: int
    term: str
    group: Optional[str] = None
    capacity: Optional[int] = None
    enrolled: int
    available: Optional[int] = None
    is_full: bool
    is_selected: bool
    schedule: List[CourseSchedulePreview]


class ProgramSemesterSummary(BaseModel):
    id: int
    semester_number: int
    label: Optional[str] = None
    description: Optional[str] = None
    is_active: bool
    state: ProgramSemesterStateEnum


class StudentProgramEnrollmentOut(BaseModel):
    enrollment_id: int
    enrolled_at: datetime
    program_semester: ProgramSemesterSummary
    status: ProgramEnrollmentStatusEnum


class StudentSemesterSelectionOut(BaseModel):
    current: Optional[StudentProgramEnrollmentOut]
    available: List[ProgramSemesterSummary]
    history: List[StudentProgramEnrollmentOut] = Field(default_factory=list)
    registration_number: Optional[str] = None


class SubjectOptionOut(BaseModel):
    subject_id: int
    subject_code: Optional[str] = None
    subject_name: str
    program_semester_id: int
    courses: List[CourseOptionOut]
    selected_course_id: Optional[int] = None
    all_groups_full: bool


class StudentScheduleOptionsOut(BaseModel):
    subjects: List[SubjectOptionOut]
    schedule: List[ScheduleSlotOut]
    timeslots: List[TimeslotSummaryOut]
    active_program_semester: Optional[ProgramSemesterSummary] = None


class EnrollmentRequest(BaseModel):
    course_id: int = Field(..., ge=1)


class ContactRequest(BaseModel):
    subject_id: Optional[int] = Field(default=None, ge=1)
    message: str = Field(..., min_length=5, max_length=1500)
    preferred_course_ids: Optional[List[int]] = Field(default=None)


class StudentSemesterEnrollRequest(BaseModel):
    program_semester_id: int = Field(..., ge=1)


def _get_student(session: Session, user) -> Student:
    student = session.exec(select(Student).where(Student.user_id == user.id)).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")
    return student


def _generate_registration_number(session: Session, program: Program | None = None) -> str:
    year = datetime.now(UTC).year
    prefix_parts = [str(year)]
    if program and program.code:
        prefix_parts.append(program.code)
    prefix = "-".join(prefix_parts)

    pattern = f"{prefix}%"
    existing_numbers = session.exec(
        select(Student.registration_number).where(Student.registration_number.like(pattern))
    ).all()

    highest_suffix = 0
    for existing in existing_numbers:
        registration = existing if isinstance(existing, str) else existing[0]
        if not registration or not registration.startswith(prefix):
            continue
        suffix_candidate = registration[len(prefix) :].lstrip("-")
        try:
            numeric = int(suffix_candidate)
        except (TypeError, ValueError):
            continue
        highest_suffix = max(highest_suffix, numeric)

    next_suffix = highest_suffix + 1
    return f"{prefix}-{next_suffix:04d}"


def _semester_to_summary(semester: ProgramSemester) -> ProgramSemesterSummary:
    return ProgramSemesterSummary(
        id=semester.id,
        semester_number=semester.semester_number,
        label=semester.label,
        description=semester.description,
        is_active=semester.is_active,
        state=semester.state,
    )


def _get_active_program_enrollment(session: Session, student: Student) -> tuple[StudentProgramEnrollment, ProgramSemester]:
    enrollment = session.exec(
        select(StudentProgramEnrollment)
        .where(
            StudentProgramEnrollment.student_id == student.id,
            StudentProgramEnrollment.status == ProgramEnrollmentStatusEnum.active,
        )
        .order_by(StudentProgramEnrollment.enrolled_at.desc())
    ).first()
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Debes inscribirte en un semestre activo de tu programa antes de gestionar tu horario.",
        )
    semester = session.get(ProgramSemester, enrollment.program_semester_id)
    if not semester or semester.program_id != student.program_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El semestre asignado ya no está disponible. Selecciona un semestre vigente para continuar.",
        )
    if not semester.is_active or semester.state == ProgramSemesterStateEnum.finished:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El semestre seleccionado fue deshabilitado por la administración. Elige otro semestre activo.",
        )
    return enrollment, semester


def _build_semester_selection(session: Session, student: Student) -> StudentSemesterSelectionOut:
    available_semesters = session.exec(
        select(ProgramSemester)
        .where(
            ProgramSemester.program_id == student.program_id,
            ProgramSemester.is_active == True,  # noqa: E712
            ProgramSemester.state != ProgramSemesterStateEnum.finished,
        )
        .order_by(ProgramSemester.semester_number)
    ).all()
    try:
        active_enrollment, active_semester = _get_active_program_enrollment(session, student)
        current = StudentProgramEnrollmentOut(
            enrollment_id=active_enrollment.id,
            enrolled_at=active_enrollment.enrolled_at,
            program_semester=_semester_to_summary(active_semester),
            status=active_enrollment.status,
        )
    except HTTPException:
        active_enrollment = None
        current = None
    summaries = [_semester_to_summary(item) for item in available_semesters]
    # If the active semester is no longer in the active list (e.g., disabled after enrollment), expose it explicitly.
    if current and all(summary.id != current.program_semester.id for summary in summaries):
        summaries.append(current.program_semester)
        summaries.sort(key=lambda item: item.semester_number)
    enrollment_rows = session.exec(
        select(StudentProgramEnrollment, ProgramSemester)
        .join(ProgramSemester, ProgramSemester.id == StudentProgramEnrollment.program_semester_id)
        .where(StudentProgramEnrollment.student_id == student.id)
        .order_by(StudentProgramEnrollment.enrolled_at.desc())
    ).all()
    history: List[StudentProgramEnrollmentOut] = []
    for enrollment_obj, semester_obj in enrollment_rows:
        history.append(
            StudentProgramEnrollmentOut(
                enrollment_id=enrollment_obj.id,
                enrolled_at=enrollment_obj.enrolled_at,
                program_semester=_semester_to_summary(semester_obj),
                status=enrollment_obj.status,
            )
        )
    return StudentSemesterSelectionOut(
        current=current,
        available=summaries,
        history=history,
        registration_number=student.registration_number,
    )


def _build_timeslot_summary(timeslots: List[Timeslot]) -> List[TimeslotSummaryOut]:
    ordered = sorted(timeslots, key=lambda slot: (slot.day_of_week, slot.start_time))
    return [
        TimeslotSummaryOut(
            id=slot.id,
            day_of_week=slot.day_of_week,
            start_time=slot.start_time.strftime("%H:%M"),
            end_time=slot.end_time.strftime("%H:%M"),
            campus=slot.campus,
            comment=slot.comment,
        )
        for slot in ordered
    ]


def _build_course_schedule_map(session: Session, course_ids: Set[int]) -> tuple[Dict[int, List[CourseSchedulePreview]], List[ScheduleSlotOut]]:
    if not course_ids:
        return {}, []
    entries = _fetch_entries(session, list(course_ids))
    if not entries:
        return {}, []
    context = _load_context(session)
    schedule_slots = _build_schedule(entries, context, include_students=False)
    slots_by_course: Dict[int, List[CourseSchedulePreview]] = defaultdict(list)
    for slot in schedule_slots:
        preview = CourseSchedulePreview(
            timeslot_id=slot.timeslot_id,
            day_of_week=slot.day_of_week,
            start_time=slot.start_time,
            end_time=slot.end_time,
            room_id=slot.room_id,
            room_code=slot.room_code,
        )
        slots_by_course[slot.course_id].append(preview)
    return slots_by_course, schedule_slots


def _build_student_options(session: Session, student: Student) -> StudentScheduleOptionsOut:
    _, active_semester = _get_active_program_enrollment(session, student)

    courses = session.exec(
        select(Course).where(Course.program_semester_id == active_semester.id)
    ).all()
    if not courses:
        return StudentScheduleOptionsOut(
            subjects=[],
            schedule=[],
            timeslots=[],
            active_program_semester=_semester_to_summary(active_semester),
        )

    course_ids = {course.id for course in courses}
    course_map = {course.id: course for course in courses}
    subject_ids = {course.subject_id for course in courses}

    subjects = session.exec(select(Subject).where(Subject.id.in_(subject_ids))).all()
    subject_map = {subject.id: subject for subject in subjects}

    slots_by_course, schedule_slots = _build_course_schedule_map(session, course_ids)

    timeslot_ids = {slot.timeslot_id for slot in schedule_slots if slot.timeslot_id is not None}
    timeslots = (
        session.exec(select(Timeslot).where(Timeslot.id.in_(timeslot_ids))).all()
        if timeslot_ids
        else []
    )

    enrollment_counts: Dict[int, int] = {course_id: 0 for course_id in course_ids}
    rows = session.exec(
        select(Enrollment.course_id, func.count())
        .where(
            Enrollment.course_id.in_(course_ids),
            Enrollment.status == EnrollmentStatusEnum.enrolled,
        )
        .group_by(Enrollment.course_id)
    ).all()
    for course_id, total in rows:
        enrollment_counts[course_id] = int(total)

    student_enrollments = session.exec(
        select(Enrollment)
        .where(
            Enrollment.student_id == student.id,
            Enrollment.status == EnrollmentStatusEnum.enrolled,
            Enrollment.course_id.in_(course_ids),
        )
    ).all()
    selected_course_ids = {enrollment.course_id for enrollment in student_enrollments}

    subject_selected_course: Dict[int, int] = {}
    for enrollment in student_enrollments:
        related_course = course_map.get(enrollment.course_id)
        if related_course:
            subject_selected_course[related_course.subject_id] = related_course.id

    courses_by_subject: Dict[int, List[Course]] = defaultdict(list)
    for course in courses:
        courses_by_subject[course.subject_id].append(course)

    subject_options: List[SubjectOptionOut] = []
    for subject_id, course_list in courses_by_subject.items():
        subject = subject_map.get(subject_id)
        if not subject:
            continue
        selected_course_id = subject_selected_course.get(subject_id)
        course_options: List[CourseOptionOut] = []
        for course in sorted(course_list, key=lambda item: item.group or ""):
            enrolled = enrollment_counts.get(course.id, 0)
            capacity = course.capacity
            available = None if capacity is None else max(capacity - enrolled, 0)
            is_full = capacity is not None and available <= 0
            is_selected = course.id in selected_course_ids
            course_options.append(
                CourseOptionOut(
                    course_id=course.id,
                    term=course.term,
                    group=course.group,
                    capacity=capacity,
                    enrolled=enrolled,
                    available=available,
                    is_full=is_full,
                    is_selected=is_selected,
                    schedule=slots_by_course.get(course.id, []),
                )
            )
        all_full = bool(course_options) and all(option.is_full for option in course_options)
        parent_semester_id = course_list[0].program_semester_id if course_list else 0
        subject_options.append(
            SubjectOptionOut(
                subject_id=subject.id,
                subject_code=subject.code,
                subject_name=subject.name,
                program_semester_id=parent_semester_id,
                courses=course_options,
                selected_course_id=selected_course_id,
                all_groups_full=all_full,
            )
        )

    subject_options.sort(key=lambda option: option.subject_name.lower())

    student_schedule = [slot for slot in schedule_slots if slot.course_id in selected_course_ids]

    return StudentScheduleOptionsOut(
        subjects=subject_options,
        schedule=student_schedule,
        timeslots=_build_timeslot_summary(timeslots),
        active_program_semester=_semester_to_summary(active_semester),
    )


@router.get("/options", response_model=StudentScheduleOptionsOut)
def get_student_schedule_options(session=Depends(get_session), user=Depends(require_roles("student"))):
    student = _get_student(session, user)
    return _build_student_options(session, student)


@router.get("/semesters", response_model=StudentSemesterSelectionOut)
def list_student_semesters(session=Depends(get_session), user=Depends(require_roles("student"))):
    student = _get_student(session, user)
    return _build_semester_selection(session, student)


@router.post("/semesters", response_model=StudentSemesterSelectionOut)
def select_student_semester(payload: StudentSemesterEnrollRequest, session=Depends(get_session), user=Depends(require_roles("student"))):
    student = _get_student(session, user)
    semester = session.get(ProgramSemester, payload.program_semester_id)
    if not semester or semester.program_id != student.program_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Semestre no disponible para tu programa")
    if not semester.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El semestre seleccionado no está habilitado actualmente")
    if semester.state == ProgramSemesterStateEnum.finished:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El semestre seleccionado ya fue marcado como finalizado")

    active_enrollment = session.exec(
        select(StudentProgramEnrollment)
        .where(
            StudentProgramEnrollment.student_id == student.id,
            StudentProgramEnrollment.status == ProgramEnrollmentStatusEnum.active,
        )
        .order_by(StudentProgramEnrollment.enrolled_at.desc())
    ).first()

    if active_enrollment and active_enrollment.program_semester_id == semester.id:
        return _build_semester_selection(session, student)

    if active_enrollment and active_enrollment.program_semester_id != semester.id:
        active_enrollment.status = ProgramEnrollmentStatusEnum.completed
        active_enrollment.ended_at = datetime.now(UTC)
        session.add(active_enrollment)

    existing_for_semester = session.exec(
        select(StudentProgramEnrollment)
        .where(
            StudentProgramEnrollment.student_id == student.id,
            StudentProgramEnrollment.program_semester_id == semester.id,
        )
        .order_by(StudentProgramEnrollment.enrolled_at.desc())
    ).first()

    if existing_for_semester:
        existing_for_semester.status = ProgramEnrollmentStatusEnum.active
        existing_for_semester.enrolled_at = datetime.now(UTC)
        existing_for_semester.ended_at = None
        session.add(existing_for_semester)
    else:
        new_enrollment = StudentProgramEnrollment(
            student_id=student.id,
            program_semester_id=semester.id,
            status=ProgramEnrollmentStatusEnum.active,
        )
        session.add(new_enrollment)

    if semester.label:
        student.current_term = semester.label
    else:
        student.current_term = f"Semestre {semester.semester_number}"

    if not student.registration_number:
        program = session.get(Program, student.program_id) if student.program_id else None
        student.registration_number = _generate_registration_number(session, program)

    session.add(student)

    session.commit()
    return _build_semester_selection(session, student)


@router.post("/enroll", response_model=StudentScheduleOptionsOut)
def enroll_in_course(payload: EnrollmentRequest, session=Depends(get_session), user=Depends(require_roles("student"))):
    student = _get_student(session, user)
    _, active_semester = _get_active_program_enrollment(session, student)
    course = session.get(Course, payload.course_id)
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curso no encontrado")

    semester = session.get(ProgramSemester, course.program_semester_id)
    if not semester or semester.program_id != student.program_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="El curso no pertenece a tu programa")
    if semester.id != active_semester.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes inscribirte en cursos del semestre activo de tu programa.",
        )

    existing_subject_enrollment = session.exec(
        select(Enrollment)
        .join(Course, Enrollment.course_id == Course.id)
        .where(
            Enrollment.student_id == student.id,
            Enrollment.status == EnrollmentStatusEnum.enrolled,
            Course.subject_id == course.subject_id,
        )
    ).first()
    if existing_subject_enrollment and existing_subject_enrollment.course_id != course.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya tienes un grupo asignado para esta clase",
        )

    capacity = course.capacity
    if capacity is not None:
        current_count = session.exec(
            select(func.count())
            .select_from(Enrollment)
            .where(
                Enrollment.course_id == course.id,
                Enrollment.status == EnrollmentStatusEnum.enrolled,
            )
        ).one()
        if current_count >= capacity:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El grupo seleccionado ya no tiene cupos disponibles")

    existing_enrollment = session.exec(
        select(Enrollment)
        .where(
            Enrollment.student_id == student.id,
            Enrollment.course_id == course.id,
        )
    ).first()
    if existing_enrollment:
        if existing_enrollment.status != EnrollmentStatusEnum.enrolled:
            existing_enrollment.status = EnrollmentStatusEnum.enrolled
            existing_enrollment.dropped_at = None
            session.add(existing_enrollment)
            session.commit()
        return _build_student_options(session, student)

    enrollment = Enrollment(student_id=student.id, course_id=course.id)
    session.add(enrollment)
    session.commit()
    session.refresh(enrollment)
    return _build_student_options(session, student)


@router.delete("/enroll/{course_id}", response_model=StudentScheduleOptionsOut)
def drop_course(course_id: int, session=Depends(get_session), user=Depends(require_roles("student"))):
    student = _get_student(session, user)
    enrollment = session.exec(
        select(Enrollment)
        .where(
            Enrollment.student_id == student.id,
            Enrollment.course_id == course_id,
        )
    ).first()
    if not enrollment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No estás inscrito en este curso")

    session.delete(enrollment)
    session.commit()
    return _build_student_options(session, student)


@router.post("/contact", status_code=status.HTTP_201_CREATED)
def contact_administration(payload: ContactRequest, session=Depends(get_session), user=Depends(require_roles("student"))):
    student = _get_student(session, user)
    _, active_semester = _get_active_program_enrollment(session, student)

    preferred_payload = None
    if payload.preferred_course_ids:
        preferred_payload = json.dumps(sorted(set(payload.preferred_course_ids)))

    request_obj = ScheduleSupportRequest(
        student_id=student.id,
        subject_id=payload.subject_id,
        message=payload.message.strip(),
        preferred_course_ids=preferred_payload,
    )
    session.add(request_obj)
    session.commit()
    session.refresh(request_obj)
    return {"request_id": request_obj.id, "status": "received"}
