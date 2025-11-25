from fastapi.testclient import TestClient


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_coordinator_can_list_users(client: TestClient, coordinator_token: str):
    res = client.get("/users/", headers=_auth_headers(coordinator_token))
    assert res.status_code == 200, res.text
    payload = res.json()
    assert isinstance(payload, list)
    assert any(user["email"] == "coordinator@test.com" for user in payload)


def test_get_profile_returns_authenticated_user(client: TestClient, admin_token: str):
    res = client.get("/users/me", headers=_auth_headers(admin_token))
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == "admin@test.com"
    assert data["full_name"] == "Admin Test"
    assert data["profile_image"] is None


def test_update_profile_persists_full_name(client: TestClient, admin_token: str):
    new_name = "Admin Updated"
    res = client.patch("/users/me", json={"full_name": new_name}, headers=_auth_headers(admin_token))
    assert res.status_code == 200
    assert res.json()["full_name"] == new_name

    res2 = client.get("/users/me", headers=_auth_headers(admin_token))
    assert res2.status_code == 200
    assert res2.json()["full_name"] == new_name


def test_update_profile_image_validates_data_url(client: TestClient, admin_token: str):
    valid_payload = {"image_data": "data:image/png;base64,AAA"}
    res = client.put("/users/me/avatar", json=valid_payload, headers=_auth_headers(admin_token))
    assert res.status_code == 200
    assert res.json()["profile_image"] == valid_payload["image_data"]

    bad = client.put("/users/me/avatar", json={"image_data": "not-a-data-url"}, headers=_auth_headers(admin_token))
    assert bad.status_code == 400

    cleared = client.put("/users/me/avatar", json={"image_data": None}, headers=_auth_headers(admin_token))
    assert cleared.status_code == 200
    assert cleared.json()["profile_image"] is None
