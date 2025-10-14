from fastapi.testclient import TestClient


def test_students_crud(client: TestClient, admin_token: str):
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Crear un estudiante (se requiere referencia a user_id, para tests usaremos un id inexistente y esperamos 200 al persistir sin FK estricta)
    r = client.post("/students/", json={"user_id": 1, "enrollment_year": 2025}, headers=headers)
    assert r.status_code == 200
    sid = r.json()["id"]

    r = client.get(f"/students/{sid}", headers=headers)
    assert r.status_code == 200

    r = client.put(f"/students/{sid}", json={"id": sid, "user_id": 1, "enrollment_year": 2026}, headers=headers)
    assert r.status_code == 200
    assert r.json()["enrollment_year"] == 2026

    r = client.get("/students/", headers=headers)
    assert r.status_code == 200
    assert any(s["id"] == sid for s in r.json())

    r = client.delete(f"/students/{sid}", headers=headers)
    assert r.status_code == 200
