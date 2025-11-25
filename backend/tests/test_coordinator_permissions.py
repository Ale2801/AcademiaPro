from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient


def _create_user_and_get_id(client: TestClient, headers: dict[str, str], role: str) -> int:
    email = f"{role}-{uuid4().hex[:8]}@academiapro.dev"
    res = client.post(
        "/auth/signup",
        json={
            "email": email,
            "full_name": f"{role.title()} Demo",
            "password": "TestPass123!",
            "role": role,
        },
    )
    assert res.status_code == 200, res.text
    res = client.get("/users/by-email", params={"email": email}, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()["id"]


def test_coordinator_can_manage_students_courses_and_rooms(client: TestClient, coordinator_token: str):
    headers = {"Authorization": f"Bearer {coordinator_token}"}

    # Program + semester creation
    program_code = f"PRG-{uuid4().hex[:6]}"
    res = client.post(
        "/programs/",
        json={
            "code": program_code,
            "name": "Ingeniería de Prueba",
            "level": "Pregrado",
            "duration_semesters": 8,
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    program = res.json()

    res = client.post(
        "/program-semesters/",
        json={
            "program_id": program["id"],
            "semester_number": 1,
            "label": "Semestre 1",
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    semester = res.json()

    # Subject linked to the program (malla)
    subject_code = f"MAT-{uuid4().hex[:5]}"
    res = client.post(
        "/subjects/",
        json={
            "code": subject_code,
            "name": "Algebra para Coordinadores",
            "program_id": program["id"],
            "pedagogical_hours_per_week": 4,
            "prerequisite_subject_ids": [],
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    subject = res.json()

    # Teacher catalog entry requires a user profile
    teacher_user_id = _create_user_and_get_id(client, headers, role="teacher")
    res = client.post(
        "/teachers/",
        json={
            "user_id": teacher_user_id,
            "department": "Ciencias",
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    teacher = res.json()

    # Course planning tied to subject + program semester
    res = client.post(
        "/courses/",
        json={
            "subject_id": subject["id"],
            "teacher_id": teacher["id"],
            "program_semester_id": semester["id"],
            "term": "2025-1",
            "group": "A",
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    course = res.json()

    # Room inventory management
    room_code = f"LAB-{uuid4().hex[:4]}"
    res = client.post(
        "/rooms/",
        json={
            "code": room_code,
            "capacity": 40,
            "building": "Central",
            "campus": "Principal",
            "floor": "2",
            "room_type": "classroom",
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    room = res.json()

    # Student profile tied to the same program
    student_user_id = _create_user_and_get_id(client, headers, role="student")
    res = client.post(
        "/students/",
        json={
            "user_id": student_user_id,
            "program_id": program["id"],
            "enrollment_year": 2024,
            "registration_number": f"REG-{uuid4().hex[:6]}",
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    student = res.json()

    # Enrollment record proves coordinators can manage registered classes
    res = client.post(
        "/enrollments/",
        json={
            "student_id": student["id"],
            "course_id": course["id"],
            "status": "enrolled",
            "notes": "Asignado por coordinacion",
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    enrollment = res.json()

    # Read endpoints confirm visibility with the same role
    res = client.get("/students/", headers=headers)
    assert res.status_code == 200, res.text
    assert any(item["id"] == student["id"] for item in res.json())

    res = client.get(f"/courses/{course['id']}", headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["id"] == course["id"]

    res = client.get(f"/rooms/{room['id']}", headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["code"] == room_code

    res = client.get("/enrollments/", headers=headers)
    assert res.status_code == 200, res.text
    assert any(item["id"] == enrollment["id"] for item in res.json())
