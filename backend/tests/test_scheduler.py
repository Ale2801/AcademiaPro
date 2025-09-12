from fastapi.testclient import TestClient


def test_scheduler_optimize_basic(client: TestClient, admin_token: str):
    headers = {"Authorization": f"Bearer {admin_token}"}
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
