from datetime import time
import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.models import (
    Program,
    ProgramSemester,
    Subject,
    User,
    Teacher,
    Course,
    Room,
    Timeslot,
    CourseSchedule,
)


def _admin_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _clear_timeslots(client: TestClient, headers: dict[str, str]) -> None:
    listing = client.get("/timeslots/", headers=headers)
    if listing.status_code != 200:
        return
    for slot in listing.json():
        client.delete(f"/timeslots/{slot['id']}", headers=headers)


def test_timeslot_bulk_skip_duplicates(client: TestClient, admin_token: str):
    headers = _admin_headers(admin_token)
    _clear_timeslots(client, headers)

    create_payload = {"day_of_week": 0, "start_time": "08:00:00", "end_time": "09:30:00"}
    res = client.post("/timeslots/", json=create_payload, headers=headers)
    assert res.status_code == 200

    bulk_payload = {
        "slots": [
            {"day_of_week": 0, "start_time": "08:00", "end_time": "09:30"},
            {"day_of_week": 1, "start_time": "08:00", "end_time": "09:30"},
        ]
    }

    bulk_res = client.post("/timeslots/bulk", json=bulk_payload, headers=headers)
    assert bulk_res.status_code == 200, bulk_res.text
    data = bulk_res.json()
    assert data["created"] == 1
    assert data["skipped"] == 1
    assert data["removed_timeslots"] == 0
    assert data["removed_course_schedules"] == 0

    listing = client.get("/timeslots/", headers=headers)
    assert listing.status_code == 200
    slots = listing.json()
    assert len(slots) == 2
    assert any(slot["day_of_week"] == 1 for slot in slots)


def test_timeslot_bulk_replace_removes_schedules(client: TestClient, admin_token: str):
    headers = _admin_headers(admin_token)
    _clear_timeslots(client, headers)

    unique_suffix = uuid.uuid4().hex[:6]

    import src.db as db

    with Session(db.engine) as session:
        program = Program(code=f"PRG-BULK-{unique_suffix}", name="Programa Bulk")
        session.add(program)
        session.commit()
        session.refresh(program)

        semester = ProgramSemester(program_id=program.id, semester_number=1)
        session.add(semester)
        session.commit()
        session.refresh(semester)

        subject = Subject(code=f"SUBJ-BULK-{unique_suffix}", name="Materia Bulk", credits=3, program_id=program.id)
        session.add(subject)
        session.commit()
        session.refresh(subject)

        teacher_user = User(email=f"teacher-bulk-{unique_suffix}@example.com", full_name="Teacher Bulk", hashed_password="x", role="teacher", is_active=True)
        session.add(teacher_user)
        session.commit()
        session.refresh(teacher_user)

        teacher = Teacher(user_id=teacher_user.id)
        session.add(teacher)
        session.commit()
        session.refresh(teacher)

        course = Course(subject_id=subject.id, teacher_id=teacher.id, program_semester_id=semester.id, term="2025-1", group="A", weekly_hours=3)
        session.add(course)
        session.commit()
        session.refresh(course)

        room = Room(code=f"ROOM-BULK-{unique_suffix}", capacity=40)
        session.add(room)
        session.commit()
        session.refresh(room)

        course_id = course.id
        room_id = room.id
        semester_id = semester.id

    base_slot_resp = client.post(
        "/timeslots/",
        json={"day_of_week": 2, "start_time": "09:00:00", "end_time": "10:30:00"},
        headers=headers,
    )
    assert base_slot_resp.status_code == 200, base_slot_resp.text
    base_slot_id = base_slot_resp.json()["id"]

    schedule_resp = client.post(
        "/course-schedules/",
        json={
            "course_id": course_id,
            "room_id": room_id,
            "timeslot_id": base_slot_id,
            "program_semester_id": semester_id,
        },
        headers=headers,
    )
    assert schedule_resp.status_code == 200, schedule_resp.text

    listing_before = client.get("/timeslots/", headers=headers)
    assert listing_before.status_code == 200
    slots_before = listing_before.json()
    assert len(slots_before) == 1

    bulk_payload = {
        "replace_existing": True,
        "slots": [
            {"day_of_week": 3, "start_time": "10:00", "end_time": "11:30"},
            {"day_of_week": 4, "start_time": "11:45", "end_time": "13:15"},
        ],
    }

    bulk_res = client.post("/timeslots/bulk", json=bulk_payload, headers=headers)
    assert bulk_res.status_code == 200, bulk_res.text
    data = bulk_res.json()
    assert data["created"] == 2
    assert data["skipped"] == 0
    assert data["removed_timeslots"] == 1
    assert data["removed_course_schedules"] == 1

    listing = client.get("/timeslots/", headers=headers)
    assert listing.status_code == 200
    slots = listing.json()
    assert len(slots) == 2
    assert all(slot["day_of_week"] in {3, 4} for slot in slots)

    with Session(db.engine) as session:
        remaining = session.exec(select(CourseSchedule)).first()
        assert remaining is None
