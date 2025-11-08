from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlmodel import Session, select

import src.db as db
from src.models import ProgramEnrollmentStatusEnum, StudentProgramEnrollment, User


def _get_user_id(email: str) -> int:
    with Session(db.engine) as session:
        user = session.exec(select(User).where(User.email == email)).first()
        assert user is not None, f"User {email} not found"
        return user.id


def test_marking_semester_as_current_reset_previous(client: TestClient, admin_token: str):
    headers = {"Authorization": f"Bearer {admin_token}"}

    program_resp = client.post(
        "/programs/",
        json={"code": "LIFE-PRG", "name": "Lifecycle Program", "level": "undergrad", "duration_semesters": 4},
        headers=headers,
    )
    assert program_resp.status_code == 200
    program_id = program_resp.json()["id"]

    sem1 = client.post(
        "/program-semesters/",
        json={"program_id": program_id, "semester_number": 1, "label": "Sem 1"},
        headers=headers,
    ).json()
    sem2 = client.post(
        "/program-semesters/",
        json={"program_id": program_id, "semester_number": 2, "label": "Sem 2"},
        headers=headers,
    ).json()

    make_current = client.patch(f"/program-semesters/{sem1['id']}", json={"state": "current"}, headers=headers)
    assert make_current.status_code == 200
    assert make_current.json()["state"] == "current"

    promote_second = client.patch(f"/program-semesters/{sem2['id']}", json={"state": "current"}, headers=headers)
    assert promote_second.status_code == 200
    data_second = promote_second.json()
    assert data_second["state"] == "current"

    sem1_state = client.get(f"/program-semesters/{sem1['id']}", headers=headers)
    assert sem1_state.status_code == 200
    assert sem1_state.json()["state"] == "planned"


def test_finishing_semester_completes_active_enrollments(client: TestClient, admin_token: str):
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Create program and semesters
    program_resp = client.post(
        "/programs/",
        json={"code": "FIN-PRG", "name": "Finaliza Program", "level": "undergrad", "duration_semesters": 4},
        headers=headers,
    )
    assert program_resp.status_code == 200
    program_id = program_resp.json()["id"]

    sem1 = client.post(
        "/program-semesters/",
        json={"program_id": program_id, "semester_number": 1, "label": "Sem 1"},
        headers=headers,
    ).json()
    sem2 = client.post(
        "/program-semesters/",
        json={"program_id": program_id, "semester_number": 2, "label": "Sem 2"},
        headers=headers,
    ).json()

    # Make first semester current so students can pick it
    client.patch(f"/program-semesters/{sem1['id']}", json={"state": "current"}, headers=headers)

    # Register student account and link to program
    student_email = "lifecycle-student@test.com"
    client.post(
        "/auth/signup",
        json={"email": student_email, "full_name": "Lifecycle Student", "password": "secret123", "role": "student"},
    )
    student_user_id = _get_user_id(student_email)

    student_resp = client.post(
        "/students/",
        json={"user_id": student_user_id, "enrollment_year": 2024, "program_id": program_id},
        headers=headers,
    )
    assert student_resp.status_code == 200
    student_id = student_resp.json()["id"]

    student_token_resp = client.post(
        "/auth/token",
        data={"username": student_email, "password": "secret123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert student_token_resp.status_code == 200
    student_headers = {"Authorization": f"Bearer {student_token_resp.json()['access_token']}"}

    select_resp = client.post(
        "/student-schedule/semesters",
        json={"program_semester_id": sem1["id"]},
        headers=student_headers,
    )
    assert select_resp.status_code == 200
    selection_payload = select_resp.json()
    assert selection_payload["current"]["program_semester"]["id"] == sem1["id"]
    assert selection_payload["current"]["status"] == ProgramEnrollmentStatusEnum.active.value

    # Finish first semester
    finish_resp = client.patch(f"/program-semesters/{sem1['id']}", json={"state": "finished"}, headers=headers)
    assert finish_resp.status_code == 200
    assert finish_resp.json()["state"] == "finished"
    assert finish_resp.json()["is_active"] is False

    with Session(db.engine) as session:
        enrollment = session.exec(
            select(StudentProgramEnrollment)
            .where(
                StudentProgramEnrollment.student_id == student_id,
                StudentProgramEnrollment.program_semester_id == sem1["id"],
            )
        ).first()
        assert enrollment is not None
        assert enrollment.status == ProgramEnrollmentStatusEnum.completed
        assert enrollment.ended_at is not None

    semesters_after = client.get("/student-schedule/semesters", headers=student_headers)
    assert semesters_after.status_code == 200
    semesters_payload = semesters_after.json()
    assert semesters_payload["current"] is None
    assert any(item["id"] == sem2["id"] for item in semesters_payload["available"])
    assert all(item["id"] != sem1["id"] for item in semesters_payload["available"])
    assert semesters_payload["registration_number"] is not None
    assert str(datetime.now(UTC).year) in semesters_payload["registration_number"]

    history_statuses = [entry["status"] for entry in semesters_payload.get("history", [])]
    assert ProgramEnrollmentStatusEnum.completed.value in history_statuses