from uuid import uuid4

from fastapi.testclient import TestClient


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _unique_code(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:6]}"


def _create_course_with_teacher(client: TestClient, admin_token: str) -> dict[str, int]:
    """Create program, semester, subject, teacher, and course records for tests."""
    headers = _auth_headers(admin_token)
    suffix = uuid4().hex[:5]

    program_payload = {
        "code": _unique_code("PRG"),
        "name": f"Programa {suffix}",
        "level": "test",
        "duration_semesters": 8,
        "description": "Programa de prueba",
        "is_active": True,
    }
    program = client.post("/programs/", json=program_payload, headers=headers)
    assert program.status_code == 200, program.text
    program_id = program.json()["id"]

    semester_payload = {
        "program_id": program_id,
        "semester_number": 1,
        "label": f"Semestre {suffix}",
        "description": "Semestre de prueba",
        "is_active": True,
    }
    semester = client.post("/program-semesters/", json=semester_payload, headers=headers)
    assert semester.status_code == 200, semester.text
    semester_id = semester.json()["id"]

    subject_payload = {
        "code": _unique_code("SUBJ"),
        "name": f"Materia {suffix}",
        "description": "Materia de prueba",
        "program_id": program_id,
        "pedagogical_hours_per_week": 4,
        "theoretical_hours_per_week": 2,
        "practical_hours_per_week": 2,
        "laboratory_hours_per_week": 0,
        "weekly_autonomous_work_hours": 4,
        "prerequisite_subject_ids": [],
    }
    subject = client.post("/subjects/", json=subject_payload, headers=headers)
    assert subject.status_code == 200, subject.text
    subject_id = subject.json()["id"]

    teacher_email = f"teacher-{suffix}@test.com"
    signup = client.post(
        "/auth/signup",
        json={
            "email": teacher_email,
            "full_name": f"Profesor {suffix}",
            "password": "teacher123",
            "role": "teacher",
        },
    )
    assert signup.status_code == 200, signup.text

    user_lookup = client.get("/users/by-email", params={"email": teacher_email}, headers=headers)
    assert user_lookup.status_code == 200, user_lookup.text
    teacher_user_id = user_lookup.json()["id"]

    teacher = client.post(
        "/teachers/",
        json={"user_id": teacher_user_id, "department": "Ciencias"},
        headers=headers,
    )
    assert teacher.status_code == 200, teacher.text
    teacher_id = teacher.json()["id"]

    course_payload = {
        "subject_id": subject_id,
        "teacher_id": teacher_id,
        "program_semester_id": semester_id,
        "term": "2025-1",
        "group": "A",
        "weekly_hours": 4,
        "capacity": 20,
    }
    course = client.post("/courses/", json=course_payload, headers=headers)
    assert course.status_code == 200, course.text
    course_id = course.json()["id"]

    return {"course_id": course_id, "teacher_id": teacher_id}


def _upload_sample_file(client: TestClient, admin_token: str) -> dict:
    headers = _auth_headers(admin_token)
    payload = {"scope": (None, "materials")}
    files = {"file": ("guia.pdf", b"contenido-demo", "application/pdf")}
    res = client.post("/files/upload", data=payload, files=files, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def test_course_material_uses_uploaded_file(client: TestClient, admin_token: str):
    headers = _auth_headers(admin_token)
    course_info = _create_course_with_teacher(client, admin_token)
    uploaded = _upload_sample_file(client, admin_token)

    payload = {
        "course_id": course_info["course_id"],
        "title": "Guía 1",
        "description": "Material con archivo",
        "material_type": "document",
        "file_url": uploaded["download_url"],
        "display_order": 1,
        "is_published": True,
    }
    res = client.post("/course-materials/", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    body = res.json()

    assert body["course_id"] == course_info["course_id"]
    assert body["teacher_id"] == course_info["teacher_id"]
    assert body["file_url"] == uploaded["download_url"]
    assert body["material_type"] == "document"
    assert body["published_at"] is not None


def test_assignment_keeps_uploaded_attachment_metadata(client: TestClient, admin_token: str):
    headers = _auth_headers(admin_token)
    course_info = _create_course_with_teacher(client, admin_token)
    uploaded = _upload_sample_file(client, admin_token)

    payload = {
        "course_id": course_info["course_id"],
        "title": "Tarea 1",
        "instructions": "Resolver ejercicios",
        "assignment_type": "homework",
        "attachment_url": uploaded["download_url"],
        "attachment_name": uploaded["original_name"],
        "is_published": True,
    }
    res = client.post("/assignments/", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    body = res.json()

    assert body["course_id"] == course_info["course_id"]
    assert body["teacher_id"] == course_info["teacher_id"]
    assert body["attachment_url"] == uploaded["download_url"]
    assert body["attachment_name"] == uploaded["original_name"]
    assert body["published_at"] is not None
