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
    return _ensure_timeslot_at(client, headers, day_of_week=1, start_time="09:00", end_time="10:30")


def _ensure_timeslot_at(
    client: TestClient,
    headers: Dict[str, str],
    *,
    day_of_week: int,
    start_time: str,
    end_time: str,
) -> Dict[str, Any]:
    listing = client.get("/timeslots/", headers=headers).json()
    for slot in listing:
        if slot["day_of_week"] == day_of_week and slot["start_time"].startswith(start_time):
            return slot
    payload = {
        "day_of_week": day_of_week,
        "start_time": start_time,
        "end_time": end_time,
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
    entities = _ensure_schedule_entities(client, headers)
    course = entities["course"]
    room = entities["room"]

    slot_one = _ensure_timeslot_at(client, headers, day_of_week=0, start_time="08:00", end_time="09:00")
    slot_two = _ensure_timeslot_at(client, headers, day_of_week=0, start_time="09:00", end_time="10:00")

    courses = [
        {
            "course_id": course["id"],
            "teacher_id": course["teacher_id"],
            "weekly_hours": 2,
        }
    ]
    rooms = [
        {
            "room_id": room["id"],
            "capacity": room.get("capacity", 30),
        }
    ]
    timeslots = [
        {"timeslot_id": slot_one["id"], "day": slot_one["day_of_week"], "block": 1},
        {"timeslot_id": slot_two["id"], "day": slot_two["day_of_week"], "block": 2},
    ]
    constraints = {
        "teacher_availability": {course["teacher_id"]: [slot_one["id"], slot_two["id"]]},
        "max_consecutive_blocks": 2,
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
    data = r.json()
    assignments = [item for item in data["assignments"] if item["course_id"] == course["id"]]
    total_minutes = sum(item["duration_minutes"] for item in assignments)
    assert total_minutes == 120
    assert {item["timeslot_id"] for item in assignments} <= {slot_one["id"], slot_two["id"]}


def test_scheduler_respects_min_gap(client: TestClient, admin_token: str):
    headers = _auth_headers(admin_token)
    entities = _ensure_schedule_entities(client, headers)
    course = entities["course"]
    room = entities["room"]

    slot_one = _ensure_timeslot_at(client, headers, day_of_week=0, start_time="08:00", end_time="09:00")
    slot_two = _ensure_timeslot_at(client, headers, day_of_week=0, start_time="09:00", end_time="10:00")
    slot_three = _ensure_timeslot_at(client, headers, day_of_week=0, start_time="10:00", end_time="11:00")

    courses = [
        {
            "course_id": course["id"],
            "teacher_id": course["teacher_id"],
            "weekly_hours": 2,
        }
    ]
    rooms = [
        {
            "room_id": room["id"],
            "capacity": room.get("capacity", 30),
        }
    ]
    timeslots = [
        {"timeslot_id": slot_one["id"], "day": slot_one["day_of_week"], "block": 1},
        {"timeslot_id": slot_two["id"], "day": slot_two["day_of_week"], "block": 2},
        {"timeslot_id": slot_three["id"], "day": slot_three["day_of_week"], "block": 3},
    ]
    constraints = {
        "teacher_availability": {
            course["teacher_id"]: [slot_one["id"], slot_two["id"], slot_three["id"]]
        },
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
    data = r.json()
    assignments = [item for item in data["assignments"] if item["course_id"] == course["id"]]
    assert len(assignments) == 2
    assigned_ids = {item["timeslot_id"] for item in assignments}
    assert slot_one["id"] in assigned_ids
    assert slot_three["id"] in assigned_ids


def test_optimizer_does_not_split_course_across_rooms(client: TestClient, admin_token: str):
    headers = _auth_headers(admin_token)
    entities = _ensure_schedule_entities(client, headers)
    course = entities["course"]
    base_room = entities["room"]
    slot = _ensure_timeslot_at(client, headers, day_of_week=2, start_time="08:00", end_time="10:00")

    alt_room_res = client.post(
        "/rooms/",
        json={"code": "TEST-RM-ALT", "capacity": 20, "building": "Laboratorio"},
        headers=headers,
    )
    assert alt_room_res.status_code == 200, alt_room_res.text
    alt_room = alt_room_res.json()

    courses_payload = [
        {
            "course_id": course["id"],
            "teacher_id": course["teacher_id"],
            "weekly_hours": 4,
        }
    ]
    rooms_payload = [
        {"room_id": base_room["id"], "capacity": base_room.get("capacity", 30)},
        {"room_id": alt_room["id"], "capacity": alt_room.get("capacity", 0)},
    ]
    timeslots_payload = [
        {"timeslot_id": slot["id"], "day": slot["day_of_week"], "block": 1},
    ]

    response = client.post(
        "/schedule/optimize",
        json={
            "courses": courses_payload,
            "rooms": rooms_payload,
            "timeslots": timeslots_payload,
            "constraints": {"teacher_availability": {course["teacher_id"]: [slot["id"]]}}
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assignments = data["assignments"]
    assert len(assignments) == 1
    assignment = assignments[0]
    assert assignment["room_id"] in {base_room["id"], alt_room["id"]}
    assert assignment["duration_minutes"] == 120
    if "unassigned" in data:
        remaining = next((item for item in data["unassigned"] if item["course_id"] == course["id"]), None)
        assert remaining is not None
        assert remaining["remaining_minutes"] == 120


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


def test_partial_block_allocations_share_slot(client: TestClient, admin_token: str):
    headers = _auth_headers(admin_token)
    entities = _ensure_schedule_entities(client, headers)
    course_a = entities["course"]
    room = entities["room"]
    timeslot = entities["timeslot"]

    subject_id = entities["subject"]["id"]
    teacher_id = entities["teacher"]["id"]
    semester_id = entities["semester"]["id"]
    create_course_b = client.post(
        "/courses/",
        json={
            "subject_id": subject_id,
            "teacher_id": teacher_id,
            "term": "2025-1",
            "group": "B",
            "weekly_hours": 2,
            "program_semester_id": semester_id,
        },
        headers=headers,
    )
    assert create_course_b.status_code == 200, create_course_b.text
    course_b = create_course_b.json()

    payload = {
        "assignments": [
            {
                "course_id": course_a["id"],
                "room_id": room["id"],
                "timeslot_id": timeslot["id"],
                "duration_minutes": 45,
                "start_offset_minutes": 0,
            },
            {
                "course_id": course_b["id"],
                "room_id": room["id"],
                "timeslot_id": timeslot["id"],
                "duration_minutes": 45,
                "start_offset_minutes": 45,
            },
        ],
        "replace_existing": True,
    }

    save = client.post("/schedule/assignments/save", json=payload, headers=headers)
    assert save.status_code == 200, save.text
    data = save.json()
    assert len([item for item in data if item["timeslot_id"] == timeslot["id"]]) >= 2
    starts = sorted(
        item["start_time"]
        for item in data
        if item["timeslot_id"] == timeslot["id"] and item["room_id"] == room["id"]
    )
    assert starts == ["09:00", "09:45"], starts

    overview = client.get(
        "/schedule/overview",
        params={"program_semester_id": semester_id},
        headers=headers,
    )
    assert overview.status_code == 200, overview.text
    overview_data = [
        item
        for item in overview.json()
        if item["timeslot_id"] == timeslot["id"] and item["room_id"] == room["id"]
    ]
    assert len(overview_data) == 2
    assert {item["duration_minutes"] for item in overview_data} == {45}


def test_partial_block_conflict_detection(client: TestClient, admin_token: str):
    headers = _auth_headers(admin_token)
    entities = _ensure_schedule_entities(client, headers)
    course = entities["course"]
    room = entities["room"]
    timeslot = entities["timeslot"]

    base_payload = {
        "assignments": [
            {
                "course_id": course["id"],
                "room_id": room["id"],
                "timeslot_id": timeslot["id"],
                "duration_minutes": 90,
                "start_offset_minutes": 0,
            }
        ],
        "replace_existing": True,
    }
    save = client.post("/schedule/assignments/save", json=base_payload, headers=headers)
    assert save.status_code == 200, save.text

    subject_id = entities["subject"]["id"]
    teacher_id = entities["teacher"]["id"]
    semester_id = entities["semester"]["id"]
    other_course_res = client.post(
        "/courses/",
        json={
            "subject_id": subject_id,
            "teacher_id": teacher_id,
            "term": "2025-1",
            "group": "C",
            "weekly_hours": 2,
            "program_semester_id": semester_id,
        },
        headers=headers,
    )
    assert other_course_res.status_code == 200, other_course_res.text
    other_course = other_course_res.json()

    conflict_payload = {
        "assignments": [
            {
                "course_id": other_course["id"],
                "room_id": room["id"],
                "timeslot_id": timeslot["id"],
                "duration_minutes": 60,
                "start_offset_minutes": 30,
            }
        ],
        "replace_existing": False,
    }
    conflict = client.post("/schedule/assignments/save", json=conflict_payload, headers=headers)
    assert conflict.status_code == 400
    assert "ocupado" in conflict.json()["detail"]


def test_optimizer_assignments_can_be_saved(client: TestClient, admin_token: str):
    headers = _auth_headers(admin_token)
    entities = _ensure_schedule_entities(client, headers)
    course = entities["course"]
    room = entities["room"]
    timeslot = entities["timeslot"]

    optimize_payload = {
        "courses": [
            {
                "course_id": course["id"],
                "teacher_id": course["teacher_id"],
                "weekly_hours": 2,
            }
        ],
        "rooms": [
            {
                "room_id": room["id"],
                "capacity": room.get("capacity", 0),
            }
        ],
        "timeslots": [
            {
                "timeslot_id": timeslot["id"],
                "day": timeslot["day_of_week"],
                "block": 1,
            }
        ],
        "constraints": {
            "teacher_availability": {
                course["teacher_id"]: [timeslot["id"]],
            },
            "max_consecutive_blocks": 2,
        },
    }

    response = client.post("/schedule/optimize", json=optimize_payload, headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assignments = data["assignments"]
    assert len(assignments) == 1
    assignment = assignments[0]
    assert assignment["duration_minutes"] > 0

    formatted = [
        {
            "course_id": item["course_id"],
            "room_id": item["room_id"],
            "timeslot_id": item["timeslot_id"],
            "duration_minutes": item.get("duration_minutes"),
            "start_offset_minutes": item.get("start_offset_minutes"),
        }
        for item in assignments
    ]

    save_response = client.post(
        "/schedule/assignments/save",
        json={"assignments": formatted, "replace_existing": True},
        headers=headers,
    )
    assert save_response.status_code == 200, save_response.text

    overview = client.get(
        "/schedule/overview",
        params={"program_semester_id": entities["semester"]["id"]},
        headers=headers,
    )
    assert overview.status_code == 200, overview.text
    overview_data = overview.json()
    assert any(
        item["course_id"] == course["id"]
        and item["timeslot_id"] == timeslot["id"]
        and item.get("start_offset_minutes", 0) == 0
        and item.get("duration_minutes", 0) == assignment["duration_minutes"]
        for item in overview_data
    )


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
