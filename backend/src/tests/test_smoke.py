from fastapi.testclient import TestClient
from src.main import app


def test_root_ok():
    client = TestClient(app)
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
