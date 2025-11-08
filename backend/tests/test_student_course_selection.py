from datetime import UTC, datetime, time

from fastapi.testclient import TestClient
from sqlmodel import Session, select

import src.db as db
from src.models import (
    Course,
    CourseSchedule,
    Enrollment,
    Program,
    ProgramEnrollmentStatusEnum,
    ProgramSemester,
    Room,
    ScheduleSupportRequest,
    Student,
    StudentProgramEnrollment,
    Subject,
    Teacher,
    Timeslot,
    User,
)


def _create_user(session: Session, email: str) -> User:
    return session.exec(select(User).where(User.email == email)).first()


def test_student_schedule_enrollment_flow(client: TestClient, admin_token: str):
    # Create teacher and student accounts via API
    teacher_email = "teacher-schedule@test.com"
    student_email = "student-schedule@test.com"
    other_student_email = "student-alt@test.com"

    client.post(
        "/auth/signup",
        json={"email": teacher_email, "full_name": "Teacher Planner", "password": "secret123", "role": "teacher"},
    )
    client.post(
        "/auth/signup",
        json={"email": student_email, "full_name": "Student Planner", "password": "secret123", "role": "student"},
    )
    client.post(
        "/auth/signup",
        json={"email": other_student_email, "full_name": "Alt Student", "password": "secret123", "role": "student"},
    )

    student_token_resp = client.post(
        "/auth/token",
        data={"username": student_email, "password": "secret123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert student_token_resp.status_code == 200
    student_headers = {"Authorization": f"Bearer {student_token_resp.json()['access_token']}"}

    # Prepare catalog data using the ORM to avoid multiple API calls
    with Session(db.engine) as session:
        teacher_user = _create_user(session, teacher_email)
        student_user = _create_user(session, student_email)
        other_student_user = _create_user(session, other_student_email)
        assert teacher_user and student_user and other_student_user

        program = Program(code="ENG-SCHED", name="Ingeniería de Sistemas", level="undergrad", duration_semesters=8)
        session.add(program)
        session.commit()
        session.refresh(program)

        semester = ProgramSemester(program_id=program.id, semester_number=3, label="Semestre 3", is_active=True)
        session.add(semester)
        session.commit()
        session.refresh(semester)
        semester_id = semester.id

        subject = Subject(code="ALG-301", name="Álgebra Avanzada", credits=6, program_id=program.id)
        session.add(subject)
        session.commit()
        session.refresh(subject)

        teacher = Teacher(user_id=teacher_user.id)
        session.add(teacher)
        session.commit()
        session.refresh(teacher)

        student = Student(user_id=student_user.id, enrollment_year=2024, program_id=program.id)
        alt_student = Student(user_id=other_student_user.id, enrollment_year=2024, program_id=program.id)
        session.add_all([student, alt_student])
        session.commit()
        session.refresh(student)
        session.refresh(alt_student)

        session.add_all([
            StudentProgramEnrollment(
                student_id=student.id,
                program_semester_id=semester.id,
                status=ProgramEnrollmentStatusEnum.active,
            ),
            StudentProgramEnrollment(
                student_id=alt_student.id,
                program_semester_id=semester.id,
                status=ProgramEnrollmentStatusEnum.active,
            ),
        ])
        session.commit()

        room = Room(code="A-101", capacity=30)
        session.add(room)
        session.commit()
        session.refresh(room)

        timeslot_a = Timeslot(day_of_week=0, start_time=time(8, 0), end_time=time(10, 0))
        timeslot_b = Timeslot(day_of_week=2, start_time=time(10, 0), end_time=time(12, 0))
        session.add_all([timeslot_a, timeslot_b])
        session.commit()
        session.refresh(timeslot_a)
        session.refresh(timeslot_b)

        course_a = Course(
            subject_id=subject.id,
            teacher_id=teacher.id,
            program_semester_id=semester.id,
            term="2025-1",
            group="A",
            weekly_hours=4,
            capacity=1,
        )
        course_b = Course(
            subject_id=subject.id,
            teacher_id=teacher.id,
            program_semester_id=semester.id,
            term="2025-1",
            group="B",
            weekly_hours=4,
            capacity=1,
        )
        session.add_all([course_a, course_b])
        session.commit()
        session.refresh(course_a)
        session.refresh(course_b)

        schedule_a = CourseSchedule(
            course_id=course_a.id,
            room_id=room.id,
            timeslot_id=timeslot_a.id,
            program_semester_id=semester.id,
        )
        schedule_b = CourseSchedule(
            course_id=course_b.id,
            room_id=room.id,
            timeslot_id=timeslot_b.id,
            program_semester_id=semester.id,
        )
        session.add_all([schedule_a, schedule_b])
        session.commit()

        # Persist identifiers for later assertions outside the session scope
        subject_id = subject.id
        student_id = student.id
        alt_student_id = alt_student.id
        course_a_id = course_a.id
        course_b_id = course_b.id

    # Student fetches available options
    options_resp = client.get("/student-schedule/options", headers=student_headers)
    assert options_resp.status_code == 200, options_resp.text
    payload = options_resp.json()
    assert payload["subjects"], "Debe listar asignaturas disponibles"
    algebra = payload["subjects"][0]
    course_ids = {course["course_id"] for course in algebra["courses"]}
    assert course_a_id in course_ids and course_b_id in course_ids
    assert all(course["enrolled"] == 0 for course in algebra["courses"])

    # Student enrolls in group A
    enroll_resp = client.post("/student-schedule/enroll", json={"course_id": course_a_id}, headers=student_headers)
    assert enroll_resp.status_code == 200, enroll_resp.text
    enroll_payload = enroll_resp.json()
    algebra_after = next(subject for subject in enroll_payload["subjects"] if subject["subject_id"] == subject_id)
    selected_course = algebra_after["selected_course_id"]
    assert selected_course == course_a_id
    summary_course_a = next(course for course in algebra_after["courses"] if course["course_id"] == course_a_id)
    assert summary_course_a["is_selected"] is True
    assert summary_course_a["enrolled"] == 1

    # Attempt to enroll in the second group should fail
    conflict_resp = client.post("/student-schedule/enroll", json={"course_id": course_b_id}, headers=student_headers)
    assert conflict_resp.status_code == 400
    assert "grupo" in conflict_resp.json()["detail"].lower()

    # Fill capacity for group B with another student directly via ORM
    with Session(db.engine) as session:
        session.add(Enrollment(student_id=alt_student_id, course_id=course_b_id))
        session.commit()

    options_full_resp = client.get("/student-schedule/options", headers=student_headers)
    algebra_options = next(subject for subject in options_full_resp.json()["subjects"] if subject["subject_id"] == subject_id)
    group_b = next(course for course in algebra_options["courses"] if course["course_id"] == course_b_id)
    assert group_b["is_full"] is True
    assert group_b["available"] == 0

    # Student drops current enrollment
    drop_resp = client.delete(f"/student-schedule/enroll/{course_a_id}", headers=student_headers)
    assert drop_resp.status_code == 200
    after_drop = next(subject for subject in drop_resp.json()["subjects"] if subject["subject_id"] == subject_id)
    assert after_drop["selected_course_id"] is None

    # Attempt to enroll in full group should return 409
    full_resp = client.post("/student-schedule/enroll", json={"course_id": course_b_id}, headers=student_headers)
    assert full_resp.status_code == 409

    # Student submits a contact request because no groups are available
    contact_payload = {
        "subject_id": subject_id,
        "message": "No hay cupos disponibles, necesito apoyo para inscribirme.",
        "preferred_course_ids": [course_a_id, course_b_id],
    }
    contact_resp = client.post("/student-schedule/contact", json=contact_payload, headers=student_headers)
    assert contact_resp.status_code == 201
    request_id = contact_resp.json()["request_id"]

    with Session(db.engine) as verify_session:
        support_request = verify_session.get(ScheduleSupportRequest, request_id)
        assert support_request is not None
        assert support_request.student_id == student_id
        assert support_request.subject_id == subject_id
        assert support_request.handled is False
        assert support_request.preferred_course_ids is not None


def test_student_semester_selection_required(client: TestClient, admin_token: str):
    coordinator_email = "coordinator-semester@test.com"
    student_email = "student-semester@test.com"

    client.post(
        "/auth/signup",
        json={"email": coordinator_email, "full_name": "Coord Planner", "password": "secret123", "role": "coordinator"},
    )
    client.post(
        "/auth/signup",
        json={"email": student_email, "full_name": "Student Semester", "password": "secret123", "role": "student"},
    )

    student_token_resp = client.post(
        "/auth/token",
        data={"username": student_email, "password": "secret123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert student_token_resp.status_code == 200
    student_headers = {"Authorization": f"Bearer {student_token_resp.json()['access_token']}"}

    with Session(db.engine) as session:
        coordinator_user = _create_user(session, coordinator_email)
        student_user = _create_user(session, student_email)
        assert coordinator_user and student_user

        program = Program(code="SEM-PRG", name="Programa Semestral", level="undergrad", duration_semesters=4)
        session.add(program)
        session.commit()
        session.refresh(program)

        semester = ProgramSemester(program_id=program.id, semester_number=1, label="Semestre 1", is_active=True)
        session.add(semester)
        session.commit()
        session.refresh(semester)
        semester_id = semester.id

        subject = Subject(code="SEM101", name="Introducción", credits=3, program_id=program.id)
        session.add(subject)
        session.commit()
        session.refresh(subject)

        teacher = Teacher(user_id=coordinator_user.id)
        session.add(teacher)
        session.commit()
        session.refresh(teacher)

        timeslot = Timeslot(day_of_week=1, start_time=time(9, 0), end_time=time(11, 0))
        room = Room(code="S-01", capacity=25)
        session.add_all([timeslot, room])
        session.commit()
        session.refresh(timeslot)
        session.refresh(room)

        course = Course(
            subject_id=subject.id,
            teacher_id=teacher.id,
            program_semester_id=semester.id,
            term="2025-1",
            group="A",
            weekly_hours=2,
        )
        session.add(course)
        session.commit()
        session.refresh(course)

        schedule = CourseSchedule(
            course_id=course.id,
            room_id=room.id,
            timeslot_id=timeslot.id,
            program_semester_id=semester.id,
        )
        session.add(schedule)
        session.commit()

        student = Student(user_id=student_user.id, enrollment_year=2024, program_id=program.id)
        session.add(student)
        session.commit()
        session.refresh(student)
        student_id = student.id

    options_resp = client.get("/student-schedule/options", headers=student_headers)
    assert options_resp.status_code == 409
    assert "semestre" in options_resp.json()["detail"].lower()

    semesters_resp = client.get("/student-schedule/semesters", headers=student_headers)
    assert semesters_resp.status_code == 200
    semester_payload = semesters_resp.json()
    assert semester_payload["current"] is None
    available_ids = {item["id"] for item in semester_payload["available"]}
    assert available_ids == {semester_id}

    select_resp = client.post(
        "/student-schedule/semesters",
        json={"program_semester_id": semester_id},
        headers=student_headers,
    )
    assert select_resp.status_code == 200
    assert select_resp.json()["current"]["program_semester"]["id"] == semester_id

    options_after = client.get("/student-schedule/options", headers=student_headers)
    assert options_after.status_code == 200
    assert options_after.json()["subjects"]

    with Session(db.engine) as verify_session:
        matriculated_student = (
            verify_session.exec(
                select(Student)
                .join(User, Student.user_id == User.id)
                .where(User.email == student_email)
            ).first()
        )
        assert matriculated_student is not None
        assert matriculated_student.registration_number is not None
    assert str(datetime.now(UTC).year) in matriculated_student.registration_number
