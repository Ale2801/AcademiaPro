from fastapi.testclient import TestClient


def test_signup_and_login_flow(client: TestClient):
    email = "user1@test.com"
    r = client.post("/auth/signup", json={
        "email": email,
        "full_name": "User One",
        "password": "pass1234",
        "role": "student"
    })
    assert r.status_code == 200
    token = r.json()["access_token"]
    assert token

    r2 = client.post("/auth/token", data={"username": email, "password": "pass1234"}, headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert r2.status_code == 200
    assert r2.json()["access_token"]
