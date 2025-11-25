from fastapi.testclient import TestClient


def test_students_crud(client: TestClient, admin_token: str):
    headers = {"Authorization": f"Bearer {admin_token}"}

    program_payload = {"code": "TEST-PRG", "name": "Programa Test", "level": "test", "duration_semesters": 2}
    program_resp = client.post("/programs/", json=program_payload, headers=headers)
    assert program_resp.status_code == 200, program_resp.text
    program_id = program_resp.json()["id"]

    # Crear un estudiante (se requiere referencia a user_id, para tests usaremos un id inexistente y esperamos 200 al persistir sin FK estricta)
    r = client.post("/students/", json={"user_id": 1, "enrollment_year": 2025, "program_id": program_id}, headers=headers)
    assert r.status_code == 200
    sid = r.json()["id"]

    r = client.get(f"/students/{sid}", headers=headers)
    assert r.status_code == 200

    r = client.put(f"/students/{sid}", json={"id": sid, "user_id": 1, "enrollment_year": 2026, "program_id": program_id}, headers=headers)
    assert r.status_code == 200
    assert r.json()["enrollment_year"] == 2026

    r = client.get("/students/", headers=headers)
    assert r.status_code == 200
    assert any(s["id"] == sid for s in r.json())

    r = client.delete(f"/students/{sid}", headers=headers)
    assert r.status_code == 200


def test_students_me_returns_profile(client: TestClient, admin_token: str):
    headers = {"Authorization": f"Bearer {admin_token}"}

    program_payload = {"code": "SELF-PRG", "name": "Programa Self", "level": "test", "duration_semesters": 2}
    program_resp = client.post("/programs/", json=program_payload, headers=headers)
    assert program_resp.status_code == 200
    program_id = program_resp.json()["id"]

    student_email = "student-self@test.com"
    signup = client.post("/auth/signup", json={
        "email": student_email,
        "full_name": "Student Self",
        "password": "student123",
        "role": "student",
    })
    assert signup.status_code == 200
    token_resp = client.post(
        "/auth/token",
        data={"username": student_email, "password": "student123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert token_resp.status_code == 200
    student_token = token_resp.json()["access_token"]

    user_lookup = client.get("/users/by-email", params={"email": student_email}, headers=headers)
    assert user_lookup.status_code == 200
    user_id = user_lookup.json()["id"]

    create_student = client.post(
        "/students/",
        json={"user_id": user_id, "program_id": program_id, "enrollment_year": 2025},
        headers=headers,
    )
    assert create_student.status_code == 200

    me_resp = client.get("/students/me", headers={"Authorization": f"Bearer {student_token}"})
    assert me_resp.status_code == 200
    payload = me_resp.json()
    assert payload["user_id"] == user_id
    assert payload["program_id"] == program_id
