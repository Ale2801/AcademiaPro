import os
import importlib
import shutil
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    # Configurar SQLite de pruebas antes de importar la app
    test_db_path = os.path.abspath("test.db")
    os.environ["DATABASE_URL"] = f"sqlite:///{test_db_path}"
    os.environ["APP_ENV"] = "dev"
    os.environ.setdefault("SCHEDULER_FAST_TEST", "1")
    upload_dir = os.path.abspath("test_uploads")
    os.environ["FILE_STORAGE_DRIVER"] = "local"
    os.environ["FILE_STORAGE_LOCAL_PATH"] = upload_dir

    try:
        os.remove(test_db_path)
    except FileNotFoundError:
        pass
    try:
        shutil.rmtree(upload_dir)
    except FileNotFoundError:
        pass

    import src.config as config
    import src.db as db
    importlib.reload(config)
    importlib.reload(db)
    import src.main as main
    importlib.reload(main)

    # Crear tablas explícitamente para el entorno de tests
    print("[tests] Using DATABASE_URL:", os.environ["DATABASE_URL"])  # debug
    print("[tests] Engine before init:", db.engine.url)  # debug
    db.init_db()
    print("[tests] Engine after init:", db.engine.url)  # debug
    # Verificación: la tabla user debe existir en SQLite
    import sqlite3
    con = sqlite3.connect(test_db_path)
    cur = con.execute("SELECT name FROM sqlite_master WHERE type='table'")
    names = {r[0] for r in cur.fetchall()}
    print("[tests] SQLite tables:", sorted(names))  # debug
    con.close()
    assert 'user' in names, f"Tablas no creadas correctamente, encontradas: {sorted(names)}"

    # Forzar que FastAPI use la misma sesión/engine de pruebas
    from src.db import get_session as original_get_session
    from sqlmodel import Session as SQLModelSession

    def override_get_session():
        session = SQLModelSession(db.engine)
        # Asegurar que el engine apunta al archivo de pruebas configurado
        url = str(session.bind.url)
        assert test_db_path in url, f"Engine apunta a {url}, esperado contener {test_db_path}"
        # Garantizar que las tablas existen en este engine (defensivo)
        from sqlmodel import SQLModel
        from sqlalchemy import text
        SQLModel.metadata.create_all(session.bind)
        try:
            res = session.exec(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user'"))
            assert res.first() is not None, "Tabla 'user' no existe en la conexión activa"
        except Exception as e:
            raise AssertionError(f"Verificación de tablas falló en {url}: {e}")
        try:
            yield session
        finally:
            session.close()

    main.app.dependency_overrides[original_get_session] = override_get_session

    # Timeout defensivo para evitar bloqueos silenciosos del TestClient en pruebas largas
    client = TestClient(main.app)

    # Forzar timeout por petición (httpx permite timeout por llamada)
    import httpx

    original_request = client.request

    def _request_with_timeout(*args, **kwargs):
        kwargs.setdefault("timeout", httpx.Timeout(20.0))
        return original_request(*args, **kwargs)

    client.request = _request_with_timeout  # type: ignore[assignment]
    yield client
    client.close()
    try:
        shutil.rmtree(upload_dir)
    except FileNotFoundError:
        pass


@pytest.fixture()
def admin_token(client: TestClient):
    email = "admin@test.com"
    client.post("/auth/signup", json={
        "email": email,
        "full_name": "Admin Test",
        "password": "admin123",
        "role": "admin"
    })
    res = client.post("/auth/token", data={"username": email, "password": "admin123"}, headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


@pytest.fixture()
def coordinator_token(client: TestClient):
    email = "coordinator@test.com"
    client.post("/auth/signup", json={
        "email": email,
        "full_name": "Coordinador Test",
        "password": "coord123",
        "role": "coordinator"
    })
    res = client.post("/auth/token", data={"username": email, "password": "coord123"}, headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


@pytest.fixture(autouse=True)
def _cleanup_course_schedules():
    yield
    # Limpia las asignaciones después de cada prueba para evitar interferencias.
    try:
        from sqlmodel import Session, delete
        from src.db import engine
        from src.models import CourseSchedule
    except Exception:
        return

    if engine is None:
        return

    with Session(engine) as session:
        session.exec(delete(CourseSchedule))
        session.commit()
