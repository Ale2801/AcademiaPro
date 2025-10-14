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
