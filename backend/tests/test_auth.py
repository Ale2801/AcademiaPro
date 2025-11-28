from fastapi.testclient import TestClient
from sqlmodel import Session, select

import src.db as db
from src.models import User
from src.seed import ensure_default_admin, DEFAULT_ADMIN_EMAIL


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
    assert r.json()["must_change_password"] is False

    r2 = client.post("/auth/token", data={"username": email, "password": "pass1234"}, headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert r2.status_code == 200
    assert r2.json()["access_token"]
    assert r2.json()["must_change_password"] is False


def test_change_password_endpoint_enforces_current_secret(client: TestClient):
    email = "change@test.com"
    password = "Original123"
    client.post("/auth/signup", json={
        "email": email,
        "full_name": "Changer",
        "password": password,
        "role": "admin",
    })
    login = client.post(
        "/auth/token",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    bad = client.post(
        "/auth/change-password",
        json={"current_password": "badpass", "new_password": "NewPassword123"},
        headers=headers,
    )
    assert bad.status_code == 400

    ok = client.post(
        "/auth/change-password",
        json={"current_password": password, "new_password": "NewPassword123"},
        headers=headers,
    )
    assert ok.status_code == 200
    assert ok.json()["must_change_password"] is False

    relog = client.post(
        "/auth/token",
        data={"username": email, "password": "NewPassword123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert relog.status_code == 200


def test_force_password_reset_flag_sets_on_admin_creation(client: TestClient):
    ensure_default_admin(force_password_reset=True)
    with Session(db.engine) as session:
        admin = session.exec(select(User).where(User.email == DEFAULT_ADMIN_EMAIL)).first()
        assert admin is not None
        assert admin.must_change_password is True


def test_force_password_reset_allows_changing_without_current_secret(client: TestClient):
    ensure_default_admin(force_password_reset=True)

    login = client.post(
        "/auth/token",
        data={"username": DEFAULT_ADMIN_EMAIL, "password": "admin123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 200
    assert login.json()["must_change_password"] is True

    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    same_password = client.post(
        "/auth/change-password",
        json={"new_password": "admin123"},
        headers=headers,
    )
    assert same_password.status_code == 400

    ok = client.post(
        "/auth/change-password",
        json={"new_password": "Nuev4Secure!"},
        headers=headers,
    )
    assert ok.status_code == 200
    assert ok.json()["must_change_password"] is False

    relog = client.post(
        "/auth/token",
        data={"username": DEFAULT_ADMIN_EMAIL, "password": "Nuev4Secure!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert relog.status_code == 200
    assert relog.json()["must_change_password"] is False
