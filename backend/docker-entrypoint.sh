#!/bin/sh
set -eu

if [ "${DATABASE_URL:-}" ]; then
  python <<'PY'
import os
import time
from sqlalchemy.engine import make_url
import psycopg2

dsn = os.environ["DATABASE_URL"]
max_attempts = int(os.environ.get("DB_MAX_RETRIES", "30"))
sleep_seconds = float(os.environ.get("DB_RETRY_DELAY", "2"))

url = make_url(dsn)

def wait_postgres():
    kwargs = {
        "dbname": url.database,
        "user": url.username,
        "password": url.password,
        "host": url.host or "localhost",
        "port": url.port or 5432,
    }
    for attempt in range(1, max_attempts + 1):
        try:
            with psycopg2.connect(**kwargs) as conn:
                conn.cursor().execute("SELECT 1")
        except Exception as exc:
            print(f"[wait-for-db] Attempt {attempt}/{max_attempts} failed: {exc}", flush=True)
            if attempt == max_attempts:
                raise
            time.sleep(sleep_seconds)
        else:
            print("[wait-for-db] Database is ready.", flush=True)
            break

if url.drivername.startswith("postgresql"):
    wait_postgres()
else:
    print(f"[wait-for-db] Skipping wait for driver '{url.drivername}'.", flush=True)
PY
fi

alembic upgrade head
exec "$@"
