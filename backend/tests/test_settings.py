from typing import Dict

from fastapi.testclient import TestClient


def _auth_headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_settings_list_and_update(client: TestClient, admin_token: str):
    headers = _auth_headers(admin_token)

    list_resp = client.get("/settings/", headers=headers)
    assert list_resp.status_code == 200, list_resp.text
    data = list_resp.json()
    keys = {item["key"] for item in data}
    assert "branding.app_name" in keys
    assert "contact.support_email" in keys

    update_payload = {"value": "Campus Académico Central"}
    update_resp = client.put("/settings/branding.app_name", json=update_payload, headers=headers)
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["value"] == "Campus Académico Central"

    read_resp = client.get("/settings/branding.app_name", headers=headers)
    assert read_resp.status_code == 200, read_resp.text
    assert read_resp.json()["value"] == "Campus Académico Central"


def test_settings_public_endpoint_exposes_public_subset(client: TestClient):
    public_resp = client.get("/settings/public")
    assert public_resp.status_code == 200, public_resp.text
    data = public_resp.json()
    assert all(item["is_public"] is True for item in data)
    keys = {item["key"] for item in data}
    assert "branding.app_name" in keys
    assert "contact.support_phone" not in keys


def test_settings_requires_admin_for_private_operations(client: TestClient):
    list_resp = client.get("/settings/")
    assert list_resp.status_code == 401

    update_resp = client.put("/settings/branding.primary_color", json={"value": "#000"})
    assert update_resp.status_code == 401
