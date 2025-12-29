from fastapi.testclient import TestClient


def _upload_sample_file(client: TestClient, admin_token: str):
    payload = {"scope": (None, "materials")}
    files = {"file": ("guia.pdf", b"contenido-demo", "application/pdf")}
    res = client.post(
        "/files/upload",
        data=payload,
        files=files,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_upload_and_download_file(client: TestClient, admin_token: str):
    body = _upload_sample_file(client, admin_token)
    assert body["id"] > 0
    assert body["download_url"].endswith(f"/files/{body['id']}")

    download = client.get(body["download_url"], headers={"Authorization": f"Bearer {admin_token}"})
    assert download.status_code == 200, download.text
    assert download.content == b"contenido-demo"
    assert download.headers.get("content-type") == "application/pdf"
    assert download.headers.get("content-disposition") is not None


def test_upload_requires_authentication(client: TestClient):
    res = client.post(
        "/files/upload",
        data={"scope": (None, "materials")},
        files={"file": ("demo.txt", b"hola", "text/plain")},
    )
    assert res.status_code == 401


def test_download_requires_authentication(client: TestClient, admin_token: str):
    body = _upload_sample_file(client, admin_token)
    res = client.get(body["download_url"])
    assert res.status_code == 401


def test_download_with_query_token(client: TestClient, admin_token: str):
    body = _upload_sample_file(client, admin_token)
    res = client.get(f"{body['download_url']}?token={admin_token}")
    assert res.status_code == 200
    assert res.content == b"contenido-demo"


def test_download_missing_file_returns_404(client: TestClient, admin_token: str):
    res = client.get(
        "/files/999999",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 404
