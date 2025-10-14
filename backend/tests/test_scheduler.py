from typing import Dict, Any

from fastapi.testclient import TestClient


def _auth_headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _ensure_user(client: TestClient, headers: Dict[str, str], *, email: str, full_name: str, role: str, password: str) -> Dict[str, Any]:
    signup_payload = {"email": email, "full_name": full_name, "password": password, "role": role}
    resp = client.post("/auth/signup", json=signup_payload)
    if resp.status_code not in (200, 400):
        raise AssertionError(f"No se pudo crear usuario {email}: {resp.status_code} {resp.text}")
    user_resp = client.get("/users/by-email", params={"email": email}, headers=headers)
    assert user_resp.status_code == 200, user_resp.text
    return user_resp.json()


def _ensure_program(client: TestClient, headers: Dict[str, str]) -> Dict[str, Any]:
    listing = client.get("/programs/", headers=headers).json()
    for program in listing:
        if program["code"] == "TEST-PROG":
            return program
    payload = {
        "code": "TEST-PROG",
        "name": "Programa de Pruebas",
        "level": "test",
        "duration_semesters": 2,
    }
    created = client.post("/programs/", json=payload, headers=headers)
    assert created.status_code == 200, created.text
    return created.json()


def _ensure_program_semester(client: TestClient, headers: Dict[str, str], program_id: int, semester_number: int = 1) -> Dict[str, Any]:
    listing = client.get("/program-semesters/", params={"program_id": program_id}, headers=headers).json()
    for semester in listing:
        if semester["semester_number"] == semester_number:
            return semester
    payload = {
        "program_id": program_id,
        "semester_number": semester_number,
        "label": f"Semestre {semester_number}",
        "is_active": True,
    }
    created = client.post("/program-semesters/", json=payload, headers=headers)
    assert created.status_code == 200, created.text
    return created.json()


def _ensure_subject(client: TestClient, headers: Dict[str, str], program_id: int) -> Dict[str, Any]:
    listing = client.get("/subjects/", headers=headers).json()
    for subject in listing:
        if subject["code"] == "TEST-SUBJ":
            return subject
    payload = {
        "code": "TEST-SUBJ",
        "name": "Materia de Pruebas",
        "credits": 3,
        "program_id": program_id,
    }
    created = client.post("/subjects/", json=payload, headers=headers)
    assert created.status_code == 200, created.text
    return created.json()


def _ensure_room(client: TestClient, headers: Dict[str, str]) -> Dict[str, Any]:
    listing = client.get("/rooms/", headers=headers).json()
    for room in listing:
        if room["code"] == "TEST-RM":
            return room
    payload = {
        "code": "TEST-RM",
        "capacity": 25,
        "building": "Laboratorio",
    }
    created = client.post("/rooms/", json=payload, headers=headers)
    assert created.status_code == 200, created.text
    return created.json()


def _ensure_timeslot(client: TestClient, headers: Dict[str, str]) -> Dict[str, Any]:
    listing = client.get("/timeslots/", headers=headers).json()
    for slot in listing:
        if slot["day_of_week"] == 1 and slot["start_time"].startswith("09:00"):
            return slot
    payload = {
        "day_of_week": 1,
        "start_time": "09:00",
        "end_time": "10:30",
    }
    created = client.post("/timeslots/", json=payload, headers=headers)
    assert created.status_code == 200, created.text
    return created.json()


def _ensure_teacher(client: TestClient, headers: Dict[str, str]) -> Dict[str, Any]:
    user = _ensure_user(client, headers, email="teacher@test.dev", full_name="Docente Pruebas", role="teacher", password="teacher123!")
    listing = client.get("/teachers/", headers=headers).json()
    for teacher in listing:
        if teacher["user_id"] == user["id"]:
            return teacher
    payload = {"user_id": user["id"], "department": "Pruebas"}
    created = client.post("/teachers/", json=payload, headers=headers)
    assert created.status_code == 200, created.text
    return created.json()


def _ensure_student(client: TestClient, headers: Dict[str, str], program_id: int) -> Dict[str, Any]:
    user = _ensure_user(client, headers, email="student@test.dev", full_name="Estudiante Pruebas", role="student", password="student123!")
    listing = client.get("/students/", headers=headers).json()
    for student in listing:
        if student["user_id"] == user["id"]:
            return student
    payload = {"user_id": user["id"], "enrollment_year": 2025, "program_id": program_id}
    created = client.post("/students/", json=payload, headers=headers)
    assert created.status_code == 200, created.text
    return created.json()


def _ensure_course(
    client: TestClient,
    headers: Dict[str, str],
    subject_id: int,
    teacher_id: int,
    program_semester_id: int,
) -> Dict[str, Any]:
    listing = client.get("/courses/", headers=headers).json()
    for course in listing:
        if (
            course["subject_id"] == subject_id
            and course["term"] == "2025-1"
            and course["group"] == "A"
            and course["program_semester_id"] == program_semester_id
        ):
            return course
    payload = {
        "subject_id": subject_id,
        "teacher_id": teacher_id,
        "term": "2025-1",
        "group": "A",
        "weekly_hours": 2,
        "program_semester_id": program_semester_id,
    }
    created = client.post("/courses/", json=payload, headers=headers)
    assert created.status_code == 200, created.text
    return created.json()


def _ensure_schedule_entities(client: TestClient, headers: Dict[str, str]) -> Dict[str, Any]:
    program = _ensure_program(client, headers)
    semester = _ensure_program_semester(client, headers, program["id"], semester_number=1)
    subject = _ensure_subject(client, headers, program["id"])
    teacher = _ensure_teacher(client, headers)
    course = _ensure_course(client, headers, subject["id"], teacher["id"], semester["id"])
    room = _ensure_room(client, headers)
    timeslot = _ensure_timeslot(client, headers)
    student = _ensure_student(client, headers, program["id"])
    return {
        "program": program,
        "semester": semester,
        "subject": subject,
        "teacher": teacher,
        "course": course,
        "room": room,
        "timeslot": timeslot,
        "student": student,
    }


def test_scheduler_optimize_basic(client: TestClient, admin_token: str):
    headers = _auth_headers(admin_token)
    courses = [{"course_id": 1, "teacher_id": 1, "weekly_hours": 2}]
    rooms = [{"room_id": 10, "capacity": 30}]
    timeslots = [
        {"timeslot_id": 100, "day": 0, "block": 1},
        {"timeslot_id": 101, "day": 0, "block": 2},
    ]
    constraints = {"teacher_availability": {1: [100, 101]}, "max_consecutive_blocks": 2}

    r = client.post("/schedule/optimize", json={
        "courses": courses,
        "rooms": rooms,
        "timeslots": timeslots,
        "constraints": constraints
    }, headers=headers)
    assert r.status_code == 200, r.text
    assignments = r.json()["assignments"]
    assert len(assignments) == 2


def test_scheduler_respects_min_gap(client: TestClient, admin_token: str):
    headers = _auth_headers(admin_token)
    courses = [{"course_id": 1, "teacher_id": 1, "weekly_hours": 2}]
    rooms = [{"room_id": 10, "capacity": 30}]
    timeslots = [
        {"timeslot_id": 200, "day": 0, "block": 1},
        {"timeslot_id": 201, "day": 0, "block": 2},
        {"timeslot_id": 202, "day": 0, "block": 3},
    ]
    constraints = {
        "teacher_availability": {1: [200, 201, 202]},
        "max_consecutive_blocks": 3,
        "min_gap_blocks": 1,
    }

    r = client.post(
        "/schedule/optimize",
        json={
            "courses": courses,
            "rooms": rooms,
            "timeslots": timeslots,
            "constraints": constraints,
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assignments = r.json()["assignments"]
    assert len(assignments) == 2
    block_map = {slot["timeslot_id"]: slot["block"] for slot in timeslots}
    assigned_blocks = sorted(block_map[timeslot_id] for _, _, timeslot_id in assignments)
    assert assigned_blocks[1] - assigned_blocks[0] >= 2, assigned_blocks


def test_schedule_save_and_overview(client: TestClient, admin_token: str):
    headers = _auth_headers(admin_token)
    entities = _ensure_schedule_entities(client, headers)
    course_id = entities["course"]["id"]
    room_id = entities["room"]["id"]
    timeslot_id = entities["timeslot"]["id"]

    payload = {
        "assignments": [
            {
                "course_id": course_id,
                "room_id": room_id,
                "timeslot_id": timeslot_id,
            }
        ],
        "replace_existing": True,
    }
    r = client.post("/schedule/assignments/save", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    overview = client.get("/schedule/overview", headers=headers)
    assert overview.status_code == 200
    data = overview.json()
    assert any(item["course_id"] == course_id for item in data)


def test_schedule_my_for_teacher(client: TestClient):
    # Preparar entidades mediante administrador temporal
    client.post(
        "/auth/signup",
        json={"email": "admin@test.com", "full_name": "Admin Test", "password": "admin123", "role": "admin"},
    )
    admin_login = client.post(
        "/auth/token",
        data={"username": "admin@test.com", "password": "admin123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert admin_login.status_code == 200, admin_login.text
    admin_headers = _auth_headers(admin_login.json()["access_token"])
    entities = _ensure_schedule_entities(client, admin_headers)
    course_id = entities["course"]["id"]
    room_id = entities["room"]["id"]
    timeslot_id = entities["timeslot"]["id"]
    # Asegurar que el curso tiene un bloque programado
    client.post(
        "/schedule/assignments/save",
        json={
            "assignments": [
                {"course_id": course_id, "room_id": room_id, "timeslot_id": timeslot_id},
            ],
            "replace_existing": True,
        },
        headers=admin_headers,
    )

    login = client.post(
        "/auth/token",
        data={"username": "teacher@test.dev", "password": "teacher123!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    r = client.get("/schedule/my", headers=_auth_headers(token))
    assert r.status_code == 200
    schedule = r.json()
    assert isinstance(schedule, list)
    if schedule:
        assert all(item["teacher_id"] is not None for item in schedule)


def test_assign_students_endpoint(client: TestClient, admin_token: str):
    headers = _auth_headers(admin_token)
    entities = _ensure_schedule_entities(client, headers)
    course_id = entities["course"]["id"]
    student_id = entities["student"]["id"]
    target_students = [student_id]
    payload = {
        "course_id": course_id,
        "student_ids": target_students,
        "replace_existing": False,
    }
    r = client.post("/schedule/assignments/students", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    info = r.json()
    assert info["course_id"] == course_id
    assert info["added"] >= 0
    assert info["total"] >= info["added"]
