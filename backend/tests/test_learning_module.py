from uuid import uuid4

from fastapi.testclient import TestClient


def _create_token(client: TestClient, email: str, password: str) -> str:
    token_resp = client.post(
        "/auth/token",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert token_resp.status_code == 200, token_resp.text
    return token_resp.json()["access_token"]


def _bootstrap_course_bundle(client: TestClient, admin_token: str):
    headers = {"Authorization": f"Bearer {admin_token}"}
    suffix = uuid4().hex[:6]

    program_resp = client.post(
        "/programs/",
        json={"code": f"PRG-{suffix}", "name": f"Programa {suffix}", "level": "test", "duration_semesters": 2},
        headers=headers,
    )
    assert program_resp.status_code == 200, program_resp.text
    program = program_resp.json()

    semester_resp = client.post(
        "/program-semesters/",
        json={"program_id": program["id"], "semester_number": 1, "label": f"{suffix}-1"},
        headers=headers,
    )
    assert semester_resp.status_code == 200, semester_resp.text
    semester = semester_resp.json()

    subject_resp = client.post(
        "/subjects/",
        json={
            "code": f"SUBJ-{suffix}",
            "name": f"Asignatura {suffix}",
            "pedagogical_hours_per_week": 4,
            "theoretical_hours_per_week": 2,
            "practical_hours_per_week": 2,
            "laboratory_hours_per_week": 0,
            "weekly_autonomous_work_hours": 2,
            "program_id": program["id"],
            "prerequisite_subject_ids": [],
        },
        headers=headers,
    )
    assert subject_resp.status_code == 200, subject_resp.text
    subject = subject_resp.json()

    teacher_email = f"teacher-{suffix}@test.com"
    teacher_password = "teacher123"
    signup_teacher = client.post(
        "/auth/signup",
        json={"email": teacher_email, "full_name": f"Teacher {suffix}", "password": teacher_password, "role": "teacher"},
    )
    assert signup_teacher.status_code == 200, signup_teacher.text
    teacher_token = _create_token(client, teacher_email, teacher_password)

    teacher_lookup = client.get("/users/by-email", params={"email": teacher_email}, headers=headers)
    assert teacher_lookup.status_code == 200, teacher_lookup.text
    teacher_user = teacher_lookup.json()

    teacher_resp = client.post(
        "/teachers/",
        json={"user_id": teacher_user["id"], "department": "STEM"},
        headers=headers,
    )
    assert teacher_resp.status_code == 200, teacher_resp.text
    teacher = teacher_resp.json()

    course_resp = client.post(
        "/courses/",
        json={
            "subject_id": subject["id"],
            "teacher_id": teacher["id"],
            "program_semester_id": semester["id"],
            "term": "2025-1",
            "group": "A",
            "weekly_hours": 4,
        },
        headers=headers,
    )
    assert course_resp.status_code == 200, course_resp.text
    course = course_resp.json()

    student_email = f"student-{suffix}@test.com"
    student_password = "student123"
    signup_student = client.post(
        "/auth/signup",
        json={"email": student_email, "full_name": f"Student {suffix}", "password": student_password, "role": "student"},
    )
    assert signup_student.status_code == 200, signup_student.text
    student_token = _create_token(client, student_email, student_password)

    student_lookup = client.get("/users/by-email", params={"email": student_email}, headers=headers)
    assert student_lookup.status_code == 200, student_lookup.text
    student_user = student_lookup.json()

    student_resp = client.post(
        "/students/",
        json={"user_id": student_user["id"], "program_id": program["id"], "enrollment_year": 2025},
        headers=headers,
    )
    assert student_resp.status_code == 200, student_resp.text
    student = student_resp.json()

    enrollment_resp = client.post(
        "/enrollments/",
        json={"student_id": student["id"], "course_id": course["id"]},
        headers=headers,
    )
    assert enrollment_resp.status_code == 200, enrollment_resp.text

    return {
        "program": program,
        "semester": semester,
        "subject": subject,
        "teacher": teacher,
        "teacher_token": teacher_token,
        "student": student,
        "student_token": student_token,
        "course": course,
    }


def test_student_reads_published_material(client: TestClient, admin_token: str):
    ctx = _bootstrap_course_bundle(client, admin_token)
    teacher_headers = {"Authorization": f"Bearer {ctx['teacher_token']}"}

    create_resp = client.post(
        "/course-materials/",
        json={
            "course_id": ctx["course"]["id"],
            "title": "Guía de estudio",
            "description": "Contenido introductorio",
            "material_type": "document",
            "file_url": "https://files.example.com/guide.pdf",
        },
        headers=teacher_headers,
    )
    assert create_resp.status_code == 201, create_resp.text

    student_headers = {"Authorization": f"Bearer {ctx['student_token']}"}
    list_resp = client.get(
        "/course-materials/",
        params={"course_id": ctx["course"]["id"]},
        headers=student_headers,
    )
    assert list_resp.status_code == 200, list_resp.text
    materials = list_resp.json()
    assert len(materials) == 1
    assert materials[0]["title"] == "Guía de estudio"

    forbidden_resp = client.post(
        "/course-materials/",
        json={"course_id": ctx["course"]["id"], "title": "Intento no permitido"},
        headers=student_headers,
    )
    assert forbidden_resp.status_code == 403


def test_assignment_submission_and_grading(client: TestClient, admin_token: str):
    ctx = _bootstrap_course_bundle(client, admin_token)
    teacher_headers = {"Authorization": f"Bearer {ctx['teacher_token']}"}

    assignment_resp = client.post(
        "/assignments/",
        json={
            "course_id": ctx["course"]["id"],
            "title": "Proyecto 1",
            "instructions": "Desarrolla una propuesta",
            "assignment_type": "project",
            "max_score": 100,
        },
        headers=teacher_headers,
    )
    assert assignment_resp.status_code == 201, assignment_resp.text
    assignment = assignment_resp.json()

    student_headers = {"Authorization": f"Bearer {ctx['student_token']}"}
    list_resp = client.get(
        "/assignments/",
        params={"course_id": ctx["course"]["id"]},
        headers=student_headers,
    )
    assert list_resp.status_code == 200, list_resp.text
    data = list_resp.json()
    assert len(data) == 1

    submit_resp = client.post(
        f"/assignments/{assignment['id']}/submissions",
        json={"text_response": "Entrega inicial", "external_url": "https://docs.example.com/entrega"},
        headers=student_headers,
    )
    assert submit_resp.status_code == 200, submit_resp.text
    submission = submit_resp.json()

    teacher_view = client.get(
        f"/assignments/{assignment['id']}/submissions",
        headers=teacher_headers,
    )
    assert teacher_view.status_code == 200, teacher_view.text
    submissions = teacher_view.json()
    assert len(submissions) == 1

    grade_resp = client.post(
        f"/assignments/submissions/{submission['id']}/grade",
        json={"score": 95, "feedback": "Trabajo destacado"},
        headers=teacher_headers,
    )
    assert grade_resp.status_code == 200, grade_resp.text
    graded = grade_resp.json()
    assert graded["grade_score"] == 95

    student_submission = client.get(
        f"/assignments/{assignment['id']}/submissions",
        params={"mine": "true"},
        headers=student_headers,
    )
    assert student_submission.status_code == 200, student_submission.text
    own = student_submission.json()
    assert len(own) == 1
    assert own[0]["grade_score"] == 95
    assert own[0]["feedback"] == "Trabajo destacado"
