from __future__ import annotations

from datetime import datetime
from pathlib import Path
import secrets
from typing import Dict, Optional

import typer
from dotenv import dotenv_values
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

APP = typer.Typer(add_completion=False, help="Asistente para crear o actualizar el archivo .env de AcademiaPro.")

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent
ENV_PATH = ROOT_DIR / ".env"


def _load_existing_env() -> Dict[str, str]:
    if not ENV_PATH.exists():
        return {}
    raw = dotenv_values(ENV_PATH)
    return {k: v for k, v in raw.items() if isinstance(k, str) and v is not None}


def _format_env_value(value: str) -> str:
    if value is None:
        return ""
    needs_quotes = any(ch in value for ch in ' #"\n')
    if needs_quotes:
        escaped = value.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return value


def _bool_from_env(value: Optional[str], default: bool) -> bool:
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _validate_database_connection(url: str) -> tuple[bool, str]:
    """Try to open a database connection to make sure the DSN works."""
    engine = None
    try:
        engine = create_engine(url, pool_pre_ping=True)
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True, ""
    except SQLAlchemyError as exc:
        return False, str(exc)
    except Exception as exc:  # pragma: no cover - defensive fallback
        return False, str(exc)
    finally:
        if engine is not None:
            engine.dispose()


def _prompt_database_url(existing_value: Optional[str]) -> str:
    default_value = existing_value or "sqlite:///./data.db"
    while True:
        candidate = typer.prompt(
            "DATABASE_URL",
            default=default_value,
        ).strip()
        if not candidate:
            typer.secho("La cadena de conexión no puede estar vacía.", fg=typer.colors.RED)
            continue
        should_validate = typer.confirm(
            "¿Quieres validar la conexión ahora? (omite si la base aún no está disponible)",
            default=True,
        )
        if not should_validate:
            typer.echo("Guardaremos la URL sin probar la conexión.")
            return candidate

        typer.echo("Verificando la conexión...")
        success, error_msg = _validate_database_connection(candidate)
        if success:
            typer.secho("Conexión exitosa.", fg=typer.colors.GREEN)
            return candidate
        typer.secho("No pudimos conectarnos con esos datos:", fg=typer.colors.RED)
        typer.echo(error_msg)
        if not typer.confirm("¿Intentar nuevamente con otro valor?", default=True):
            typer.echo("Se guardará la URL aunque no haya pasado la validación.")
            return candidate
        default_value = candidate


def _prompt_secret(existing_value: Optional[str]) -> str:
    default_secret = existing_value or secrets.token_urlsafe(32)
    if existing_value:
        typer.echo("Se conservará el secreto actual si presionas Enter.")
    else:
        typer.echo("Generamos un SECRET_KEY aleatorio; puedes reemplazarlo si prefieres otro.")
    value = typer.prompt(
        "SECRET_KEY",
        default=default_secret,
        hide_input=True,
        show_default=False,
    ).strip()
    return value or default_secret


def _prompt_file_storage(existing: Dict[str, str]) -> Dict[str, str]:
    values: Dict[str, str] = {}
    driver_default = (existing.get("FILE_STORAGE_DRIVER") or "local").lower()
    while True:
        driver = typer.prompt(
            "FILE_STORAGE_DRIVER [local/docker_volume/s3]",
            default=driver_default,
        ).strip().lower()
        if driver in {"local", "docker_volume", "s3"}:
            break
        typer.secho("Selecciona uno de los valores permitidos.", fg=typer.colors.RED)
    values["FILE_STORAGE_DRIVER"] = driver

    local_default = existing.get("FILE_STORAGE_LOCAL_PATH") or "./uploads"
    docker_default = existing.get("FILE_STORAGE_DOCKER_PATH") or "/data/uploads"
    s3_bucket_default = existing.get("FILE_STORAGE_S3_BUCKET") or ""
    s3_region_default = existing.get("FILE_STORAGE_S3_REGION") or ""
    s3_endpoint_default = existing.get("FILE_STORAGE_S3_ENDPOINT") or ""
    s3_access_default = existing.get("FILE_STORAGE_S3_ACCESS_KEY_ID") or ""
    s3_secret_default = existing.get("FILE_STORAGE_S3_SECRET_ACCESS_KEY") or ""
    s3_ssl_default = _bool_from_env(existing.get("FILE_STORAGE_S3_USE_SSL"), True)

    local_path = typer.prompt("FILE_STORAGE_LOCAL_PATH", default=local_default).strip()
    values["FILE_STORAGE_LOCAL_PATH"] = local_path or local_default
    docker_path = typer.prompt("FILE_STORAGE_DOCKER_PATH", default=docker_default).strip()
    values["FILE_STORAGE_DOCKER_PATH"] = docker_path or docker_default

    if driver == "s3":
        while True:
            bucket = typer.prompt("FILE_STORAGE_S3_BUCKET", default=s3_bucket_default).strip()
            region = typer.prompt("FILE_STORAGE_S3_REGION", default=s3_region_default).strip()
            endpoint = typer.prompt("FILE_STORAGE_S3_ENDPOINT", default=s3_endpoint_default).strip()
            access_key = typer.prompt("FILE_STORAGE_S3_ACCESS_KEY_ID", default=s3_access_default).strip()
            secret_key = typer.prompt(
                "FILE_STORAGE_S3_SECRET_ACCESS_KEY",
                default=s3_secret_default,
                hide_input=True,
                show_default=False,
            ).strip()
            use_ssl = typer.confirm("¿S3 debe usar SSL?", default=s3_ssl_default)

            if not bucket:
                typer.secho("El bucket es obligatorio cuando usas S3.", fg=typer.colors.RED)
                continue

            values.update(
                {
                    "FILE_STORAGE_S3_BUCKET": bucket,
                    "FILE_STORAGE_S3_REGION": region,
                    "FILE_STORAGE_S3_ENDPOINT": endpoint,
                    "FILE_STORAGE_S3_ACCESS_KEY_ID": access_key,
                    "FILE_STORAGE_S3_SECRET_ACCESS_KEY": secret_key,
                    "FILE_STORAGE_S3_USE_SSL": "true" if use_ssl else "false",
                }
            )
            break
    else:
        # Limpiar claves S3 cuando no se necesitan
        values.update(
            {
                "FILE_STORAGE_S3_BUCKET": "",
                "FILE_STORAGE_S3_REGION": "",
                "FILE_STORAGE_S3_ENDPOINT": "",
                "FILE_STORAGE_S3_ACCESS_KEY_ID": "",
                "FILE_STORAGE_S3_SECRET_ACCESS_KEY": "",
                "FILE_STORAGE_S3_USE_SSL": "true",
            }
        )

    return values


def _ensure_local_directory(path_value: str) -> None:
    if not path_value:
        return
    candidate = Path(path_value)
    if not candidate.is_absolute():
        candidate = (ROOT_DIR / candidate).resolve()
    candidate.mkdir(parents=True, exist_ok=True)


def _collect_values(existing: Dict[str, str]) -> Dict[str, str]:
    values: Dict[str, str] = {}

    typer.echo("")
    env_default = existing.get("APP_ENV") or existing.get("ENVIRONMENT") or "dev"
    app_env = typer.prompt("APP_ENV", default=env_default).strip() or env_default
    values["APP_ENV"] = app_env
    values["ENVIRONMENT"] = app_env

    debug_default = _bool_from_env(existing.get("DEBUG"), app_env not in {"prod", "production"})
    debug_enabled = typer.confirm("¿Activar modo DEBUG?", default=debug_default)
    values["DEBUG"] = "true" if debug_enabled else "false"

    algorithm_default = existing.get("ALGORITHM") or "HS256"
    algorithm = typer.prompt("ALGORITHM", default=algorithm_default).strip() or algorithm_default
    values["ALGORITHM"] = algorithm

    values["SECRET_KEY"] = _prompt_secret(existing.get("SECRET_KEY"))

    expire_default = existing.get("ACCESS_TOKEN_EXPIRE_MINUTES") or ""
    expire_prompt = typer.prompt(
        "ACCESS_TOKEN_EXPIRE_MINUTES (vacío para usar el predeterminado)",
        default=expire_default,
        show_default=bool(expire_default),
    ).strip()
    if expire_prompt:
        values["ACCESS_TOKEN_EXPIRE_MINUTES"] = expire_prompt
    else:
        values.pop("ACCESS_TOKEN_EXPIRE_MINUTES", None)

    values["DATABASE_URL"] = _prompt_database_url(existing.get("DATABASE_URL"))

    storage_values = _prompt_file_storage({**existing, **values})
    values.update(storage_values)

    _ensure_local_directory(values.get("FILE_STORAGE_LOCAL_PATH", ""))

    return values


def _write_env_file(managed_values: Dict[str, str], previous_values: Dict[str, str]) -> None:
    extras = {k: v for k, v in previous_values.items() if k not in managed_values}

    lines = [
        "# Archivo generado por backend/scripts/configure_env.py",
        f"# {datetime.utcnow().isoformat()}Z",
        "",
    ]

    for key, value in managed_values.items():
        if value is None:
            continue
        lines.append(f"{key}={_format_env_value(value)}")

    if extras:
        lines.extend(
            [
                "",
                "# Variables adicionales preservadas",
            ]
        )
        for key in sorted(extras.keys()):
            extra_value = extras[key]
            if extra_value is None:
                continue
            lines.append(f"{key}={_format_env_value(extra_value)}")

    lines.append("")
    ENV_PATH.write_text("\n".join(lines), encoding="utf-8")


@APP.command()
def run() -> None:
    typer.secho("Configurador interactivo de .env", fg=typer.colors.CYAN, bold=True)
    typer.echo(f"Ubicación destino: {ENV_PATH}")
    existing = _load_existing_env()
    if existing:
        typer.echo("Se detectó un .env existente; solo actualizaremos las claves gestionadas.")

    values = _collect_values(existing)

    typer.echo("")
    typer.echo("Valores propuestos:")
    for key, value in values.items():
        masked = "********" if "SECRET" in key and value else value
        typer.echo(f"  - {key}: {masked}")

    if not typer.confirm("¿Guardar estos cambios en el .env?", default=True):
        typer.echo("No se realizaron modificaciones.")
        raise typer.Exit(code=0)

    _write_env_file(values, existing)
    typer.secho("Archivo .env actualizado correctamente.", fg=typer.colors.GREEN)


if __name__ == "__main__":
    APP()
