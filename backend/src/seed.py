from __future__ import annotations

from datetime import date, datetime, time
from typing import Dict, Optional

from sqlmodel import Session, select

from .db import engine
from .models import (
    Attendance,
    Course,
    CourseSchedule,
    Enrollment,
    EnrollmentStatusEnum,
    ModalityEnum,
    Program,
    Room,
    RoomTypeEnum,
    Student,
    StudentStatusEnum,
    Subject,
    Teacher,
    Timeslot,
    User,
    Evaluation,
    Grade,
)
from .security import get_password_hash


DEFAULT_ADMIN_EMAIL = "admin@academiapro.dev"
DEFAULT_ADMIN_PASSWORD = "admin123"
DEFAULT_ADMIN_NAME = "Administrador Demo"


def ensure_default_admin(session: Optional[Session] = None) -> User:
    """Create a default admin user for local development if none exists."""
    owns_session = session is None
    session = session or Session(engine)
    try:
        existing = session.exec(select(User).where(User.email == DEFAULT_ADMIN_EMAIL)).first()
        if existing:
            return existing
        user = User(
            email=DEFAULT_ADMIN_EMAIL,
            full_name=DEFAULT_ADMIN_NAME,
            hashed_password=get_password_hash(DEFAULT_ADMIN_PASSWORD),
            role="admin",
            is_active=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user
    finally:
        if owns_session:
            session.close()


def ensure_demo_data() -> None:
    """Populate the main catalog tables with deterministic demo data for the UI."""
    with Session(engine) as session:
        ensure_default_admin(session)

        program_map = _ensure_programs(session)
        subject_map = _ensure_subjects(session, program_map)
        teacher_map = _ensure_teachers(session)
        room_map = _ensure_rooms(session)
        timeslot_map = _ensure_timeslots(session)
        course_map = _ensure_courses(session, subject_map, teacher_map)
        _ensure_course_schedules(session, course_map, room_map, timeslot_map)
        student_map = _ensure_students(session, program_map)
        enrollment_map = _ensure_enrollments(session, student_map, course_map)
        evaluation_map = _ensure_evaluations(session, course_map)
        _ensure_grades(session, enrollment_map, evaluation_map)
        _ensure_attendance(session, enrollment_map)


def _get_or_create_user(
    session: Session,
    *,
    email: str,
    full_name: str,
    role: str,
    password: str,
    **extra,
) -> User:
    user = session.exec(select(User).where(User.email == email)).first()
    if user:
        updated = False
        if user.full_name != full_name:
            user.full_name = full_name
            updated = True
        if user.role != role:
            user.role = role
            updated = True
        if extra:
            for key, value in extra.items():
                if getattr(user, key, None) != value:
                    setattr(user, key, value)
                    updated = True
        if updated:
            session.add(user)
            session.commit()
        return user

    user = User(
        email=email,
        full_name=full_name,
        hashed_password=get_password_hash(password),
        role=role,
        is_active=True,
        **extra,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _ensure_programs(session: Session) -> Dict[str, Program]:
    data = [
        {
            "code": "ING-SIS",
            "name": "Ingeniería en Sistemas",
            "level": "undergrad",
            "duration_semesters": 10,
            "description": "Formación en ingeniería de software, redes y gestión de proyectos.",
        },
        {
            "code": "ADM-EMP",
            "name": "Administración de Empresas",
            "level": "undergrad",
            "duration_semesters": 8,
            "description": "Negocios, finanzas y estrategia organizacional.",
        },
        {
            "code": "DS-AV",
            "name": "Ciencia de Datos Avanzada",
            "level": "postgrad",
            "duration_semesters": 4,
            "description": "Análisis predictivo, machine learning y visualización de datos.",
        },
    ]
    mapping: Dict[str, Program] = {}
    for item in data:
        program = session.exec(select(Program).where(Program.code == item["code"])).first()
        if not program:
            program = Program(**item)
            session.add(program)
            session.commit()
            session.refresh(program)
        mapping[item["code"]] = program
    return mapping


def _ensure_subjects(session: Session, program_map: Dict[str, Program]) -> Dict[str, Subject]:
    data = [
        {
            "code": "MAT101",
            "name": "Cálculo Diferencial",
            "credits": 6,
            "program_code": "ING-SIS",
            "description": "Funciones, límites y derivadas.",
            "hours_per_week": 5,
        },
        {
            "code": "PRO201",
            "name": "Programación Orientada a Objetos",
            "credits": 5,
            "program_code": "ING-SIS",
            "description": "Aplicaciones con patrones de diseño y pruebas.",
            "hours_per_week": 4,
        },
        {
            "code": "ADM120",
            "name": "Contabilidad Gerencial",
            "credits": 4,
            "program_code": "ADM-EMP",
            "description": "Contabilidad para la toma de decisiones.",
            "hours_per_week": 3,
        },
        {
            "code": "DS501",
            "name": "Machine Learning Aplicado",
            "credits": 5,
            "program_code": "DS-AV",
            "description": "Modelos supervisados, pipelines y ML Ops.",
            "hours_per_week": 4,
        },
    ]
    mapping: Dict[str, Subject] = {}
    for item in data:
        subject = session.exec(select(Subject).where(Subject.code == item["code"])).first()
        if not subject:
            program = program_map.get(item["program_code"])
            subject = Subject(
                code=item["code"],
                name=item["name"],
                credits=item["credits"],
                description=item["description"],
                hours_per_week=item["hours_per_week"],
                program_id=program.id if program else None,
            )
            session.add(subject)
            session.commit()
            session.refresh(subject)
        mapping[item["code"]] = subject
    return mapping


def _ensure_teachers(session: Session) -> Dict[str, Teacher]:
    data = [
        {
            "email": "docente1@academiapro.dev",
            "full_name": "Laura Fernández",
            "password": "teacher123",
            "department": "Matemáticas",
            "specialty": "Álgebra avanzada",
            "office": "B-301",
        },
        {
            "email": "docente2@academiapro.dev",
            "full_name": "Martín Aguilar",
            "password": "teacher123",
            "department": "Ciencias de la Computación",
            "specialty": "Arquitectura de Software",
            "office": "C-210",
        },
    ]

    mapping: Dict[str, Teacher] = {}
    for item in data:
        user = _get_or_create_user(
            session,
            email=item["email"],
            full_name=item["full_name"],
            role="teacher",
            password=item["password"],
        )
        teacher = session.exec(select(Teacher).where(Teacher.user_id == user.id)).first()
        if not teacher:
            teacher = Teacher(
                user_id=user.id,
                department=item["department"],
                specialty=item["specialty"],
                office=item["office"],
            )
            session.add(teacher)
            session.commit()
            session.refresh(teacher)
        mapping[item["email"]] = teacher
    return mapping


def _ensure_rooms(session: Session) -> Dict[str, Room]:
    data = [
        {
            "code": "A-201",
            "capacity": 35,
            "building": "Edificio A",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.classroom,
            "has_projector": True,
        },
        {
            "code": "LAB-IA",
            "capacity": 20,
            "building": "Centro de Innovación",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.lab,
            "has_projector": True,
            "has_computers": True,
        },
        {
            "code": "AUD-1",
            "capacity": 120,
            "building": "Auditorio Principal",
            "campus": "Campus Norte",
            "room_type": RoomTypeEnum.auditorium,
            "has_projector": True,
        },
    ]
    mapping: Dict[str, Room] = {}
    for item in data:
        room = session.exec(select(Room).where(Room.code == item["code"])).first()
        if not room:
            room = Room(**item)
            session.add(room)
            session.commit()
            session.refresh(room)
        mapping[item["code"]] = room
    return mapping


def _ensure_timeslots(session: Session) -> Dict[str, Timeslot]:
    data = [
        {"day_of_week": 0, "start_time": time(8, 0), "end_time": time(9, 30)},
        {"day_of_week": 2, "start_time": time(10, 0), "end_time": time(11, 30)},
        {"day_of_week": 4, "start_time": time(14, 0), "end_time": time(16, 0)},
    ]
    mapping: Dict[str, Timeslot] = {}
    for item in data:
        key = f"{item['day_of_week']}-{item['start_time'].strftime('%H:%M')}"
        timeslot = (
            session.exec(
                select(Timeslot).where(
                    Timeslot.day_of_week == item["day_of_week"],
                    Timeslot.start_time == item["start_time"],
                    Timeslot.end_time == item["end_time"],
                )
            ).first()
        )
        if not timeslot:
            timeslot = Timeslot(**item)
            session.add(timeslot)
            session.commit()
            session.refresh(timeslot)
        mapping[key] = timeslot
    return mapping


def _ensure_courses(
    session: Session,
    subject_map: Dict[str, Subject],
    teacher_map: Dict[str, Teacher],
) -> Dict[str, Course]:
    data = [
        {
            "key": "MAT101-2025-1-A",
            "subject_code": "MAT101",
            "teacher_email": "docente1@academiapro.dev",
            "term": "2025-1",
            "group": "A",
            "weekly_hours": 5,
            "capacity": 40,
            "modality": ModalityEnum.in_person,
        },
        {
            "key": "PRO201-2025-1-A",
            "subject_code": "PRO201",
            "teacher_email": "docente2@academiapro.dev",
            "term": "2025-1",
            "group": "A",
            "weekly_hours": 4,
            "capacity": 35,
            "modality": ModalityEnum.hybrid,
        },
        {
            "key": "ADM120-2025-1-A",
            "subject_code": "ADM120",
            "teacher_email": "docente2@academiapro.dev",
            "term": "2025-1",
            "group": "A",
            "weekly_hours": 3,
            "capacity": 50,
            "modality": ModalityEnum.in_person,
        },
        {
            "key": "DS501-2025-1-A",
            "subject_code": "DS501",
            "teacher_email": "docente1@academiapro.dev",
            "term": "2025-1",
            "group": "A",
            "weekly_hours": 4,
            "capacity": 25,
            "modality": ModalityEnum.online,
        },
    ]

    mapping: Dict[str, Course] = {}
    for item in data:
        subject = subject_map.get(item["subject_code"])
        teacher = teacher_map.get(item["teacher_email"])
        if not subject or not teacher:
            continue

        course = (
            session.exec(
                select(Course).where(
                    Course.subject_id == subject.id,
                    Course.teacher_id == teacher.id,
                    Course.term == item["term"],
                    Course.group == item["group"],
                )
            ).first()
        )
        if not course:
            course = Course(
                subject_id=subject.id,
                teacher_id=teacher.id,
                term=item["term"],
                group=item["group"],
                weekly_hours=item["weekly_hours"],
                capacity=item["capacity"],
                modality=item["modality"],
            )
            session.add(course)
            session.commit()
            session.refresh(course)
        mapping[item["key"]] = course
    return mapping


def _ensure_course_schedules(
    session: Session,
    course_map: Dict[str, Course],
    room_map: Dict[str, Room],
    timeslot_map: Dict[str, Timeslot],
) -> None:
    data = [
        {"course_key": "MAT101-2025-1-A", "room_code": "A-201", "timeslot_key": "0-08:00"},
        {"course_key": "PRO201-2025-1-A", "room_code": "LAB-IA", "timeslot_key": "2-10:00"},
        {"course_key": "ADM120-2025-1-A", "room_code": "AUD-1", "timeslot_key": "4-14:00"},
    ]

    for item in data:
        course = course_map.get(item["course_key"])
        room = room_map.get(item["room_code"])
        timeslot = timeslot_map.get(item["timeslot_key"])
        if not course or not room or not timeslot:
            continue

        existing = session.exec(
            select(CourseSchedule).where(
                CourseSchedule.course_id == course.id,
                CourseSchedule.room_id == room.id,
                CourseSchedule.timeslot_id == timeslot.id,
            )
        ).first()
        if not existing:
            session.add(
                CourseSchedule(
                    course_id=course.id,
                    room_id=room.id,
                    timeslot_id=timeslot.id,
                )
            )
            session.commit()


def _ensure_students(session: Session, program_map: Dict[str, Program]) -> Dict[str, Student]:
    data = [
        {
            "email": "estudiante1@academiapro.dev",
            "full_name": "Carlos Méndez",
            "password": "student123",
            "enrollment_year": 2023,
            "program_code": "ING-SIS",
            "registration_number": "2023-001",
            "section": "A",
            "current_term": "2025-1",
        },
        {
            "email": "estudiante2@academiapro.dev",
            "full_name": "María González",
            "password": "student123",
            "enrollment_year": 2022,
            "program_code": "ADM-EMP",
            "registration_number": "2022-014",
            "section": "B",
            "current_term": "2025-1",
        },
        {
            "email": "estudiante3@academiapro.dev",
            "full_name": "Diego Salazar",
            "password": "student123",
            "enrollment_year": 2024,
            "program_code": "DS-AV",
            "registration_number": "2024-009",
            "section": "A",
            "current_term": "2025-1",
        },
    ]

    mapping: Dict[str, Student] = {}
    for item in data:
        user = _get_or_create_user(
            session,
            email=item["email"],
            full_name=item["full_name"],
            role="student",
            password=item["password"],
        )
        student = session.exec(select(Student).where(Student.user_id == user.id)).first()
        if not student:
            program = program_map.get(item["program_code"])
            student = Student(
                user_id=user.id,
                enrollment_year=item["enrollment_year"],
                program_id=program.id if program else None,
                registration_number=item["registration_number"],
                section=item["section"],
                current_term=item["current_term"],
                modality=ModalityEnum.in_person,
                status=StudentStatusEnum.active,
            )
            session.add(student)
            session.commit()
            session.refresh(student)
        mapping[item["email"]] = student
    return mapping


def _ensure_enrollments(
    session: Session,
    student_map: Dict[str, Student],
    course_map: Dict[str, Course],
) -> Dict[str, Enrollment]:
    data = [
        {"student_email": "estudiante1@academiapro.dev", "course_key": "MAT101-2025-1-A"},
        {"student_email": "estudiante1@academiapro.dev", "course_key": "PRO201-2025-1-A"},
        {"student_email": "estudiante2@academiapro.dev", "course_key": "ADM120-2025-1-A"},
        {"student_email": "estudiante3@academiapro.dev", "course_key": "DS501-2025-1-A"},
    ]

    mapping: Dict[str, Enrollment] = {}
    for item in data:
        student = student_map.get(item["student_email"])
        course = course_map.get(item["course_key"])
        if not student or not course:
            continue

        enrollment = session.exec(
            select(Enrollment).where(
                Enrollment.student_id == student.id,
                Enrollment.course_id == course.id,
            )
        ).first()
        if not enrollment:
            enrollment = Enrollment(
                student_id=student.id,
                course_id=course.id,
                status=EnrollmentStatusEnum.enrolled,
            )
            session.add(enrollment)
            session.commit()
            session.refresh(enrollment)
        key = f"{item['student_email']}|{item['course_key']}"
        mapping[key] = enrollment
    return mapping


def _ensure_evaluations(
    session: Session,
    course_map: Dict[str, Course],
) -> Dict[str, Evaluation]:
    data = [
        {
            "course_key": "MAT101-2025-1-A",
            "name": "Parcial 1",
            "weight": 0.3,
            "scheduled_at": datetime(2025, 3, 15, 9, 0),
        },
        {
            "course_key": "MAT101-2025-1-A",
            "name": "Proyecto Final",
            "weight": 0.4,
            "scheduled_at": datetime(2025, 5, 20, 8, 0),
        },
        {
            "course_key": "PRO201-2025-1-A",
            "name": "Sprint Demo",
            "weight": 0.5,
            "scheduled_at": datetime(2025, 4, 10, 10, 0),
        },
        {
            "course_key": "DS501-2025-1-A",
            "name": "Caso Práctico",
            "weight": 0.6,
            "scheduled_at": datetime(2025, 4, 22, 18, 0),
        },
    ]

    mapping: Dict[str, Evaluation] = {}
    for item in data:
        course = course_map.get(item["course_key"])
        if not course:
            continue

        evaluation = session.exec(
            select(Evaluation).where(
                Evaluation.course_id == course.id,
                Evaluation.name == item["name"],
            )
        ).first()
        if not evaluation:
            evaluation = Evaluation(
                course_id=course.id,
                name=item["name"],
                weight=item["weight"],
                scheduled_at=item["scheduled_at"],
            )
            session.add(evaluation)
            session.commit()
            session.refresh(evaluation)
        key = f"{item['course_key']}|{item['name']}"
        mapping[key] = evaluation
    return mapping


def _ensure_grades(
    session: Session,
    enrollment_map: Dict[str, Enrollment],
    evaluation_map: Dict[str, Evaluation],
) -> None:
    data = [
        {
            "key": ("estudiante1@academiapro.dev", "MAT101-2025-1-A", "Parcial 1"),
            "score": 87.0,
        },
        {
            "key": ("estudiante1@academiapro.dev", "PRO201-2025-1-A", "Sprint Demo"),
            "score": 92.0,
        },
        {
            "key": ("estudiante3@academiapro.dev", "DS501-2025-1-A", "Caso Práctico"),
            "score": 95.0,
        },
    ]

    for entry in data:
        student_email, course_key, eval_name = entry["key"]
        enrollment = enrollment_map.get(f"{student_email}|{course_key}")
        evaluation = evaluation_map.get(f"{course_key}|{eval_name}")
        if not enrollment or not evaluation:
            continue

        existing = session.exec(
            select(Grade).where(
                Grade.enrollment_id == enrollment.id,
                Grade.evaluation_id == evaluation.id,
            )
        ).first()
        if not existing:
            session.add(
                Grade(
                    enrollment_id=enrollment.id,
                    evaluation_id=evaluation.id,
                    score=entry["score"],
                )
            )
            session.commit()


def _ensure_attendance(session: Session, enrollment_map: Dict[str, Enrollment]) -> None:
    data = [
        {
            "key": "estudiante1@academiapro.dev|MAT101-2025-1-A",
            "session_date": date(2025, 3, 5),
            "present": True,
        },
        {
            "key": "estudiante1@academiapro.dev|PRO201-2025-1-A",
            "session_date": date(2025, 3, 6),
            "present": True,
        },
        {
            "key": "estudiante2@academiapro.dev|ADM120-2025-1-A",
            "session_date": date(2025, 3, 7),
            "present": False,
        },
    ]

    for item in data:
        enrollment = enrollment_map.get(item["key"])
        if not enrollment:
            continue

        existing = session.exec(
            select(Attendance).where(
                Attendance.enrollment_id == enrollment.id,
                Attendance.session_date == item["session_date"],
            )
        ).first()
        if not existing:
            session.add(
                Attendance(
                    enrollment_id=enrollment.id,
                    session_date=item["session_date"],
                    present=item["present"],
                )
            )
            session.commit()


if __name__ == "__main__":
    ensure_demo_data()
