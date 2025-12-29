import os
import re
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlmodel import Session

from ..config import settings
from ..models import StoredFile
from ..db import get_session

try:  # Optional dependency
    import boto3  # type: ignore
except ImportError:  # pragma: no cover - boto3 no disponible
    boto3 = None


_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_ALLOWED_SCOPE = re.compile(r"[^a-z0-9_-]+")
_ALLOWED_FILENAME = re.compile(r"[^A-Za-z0-9_.-]+")
_CHUNK_SIZE = 1024 * 1024


class StorageService:
    def __init__(self, session: Session):
        self.session = session
        self.config = settings.file_storage

    def _normalize_scope(self, scope: Optional[str]) -> str:
        base = (scope or "general").strip().lower()
        cleaned = _ALLOWED_SCOPE.sub("-", base)
        return cleaned or "general"

    def _sanitize_filename(self, filename: Optional[str]) -> str:
        if not filename:
            return "archivo"
        name = Path(filename).name
        parts = name.split(".")
        if len(parts) > 1:
            ext = parts[-1].lower()
            stem = ".".join(parts[:-1])
        else:
            ext = ""
            stem = parts[0]
        safe_stem = _ALLOWED_FILENAME.sub("-", stem).strip("-" ) or "archivo"
        safe_stem = safe_stem[:80]
        safe_ext = _ALLOWED_FILENAME.sub("", ext).lower()
        return f"{safe_stem}.{safe_ext}" if safe_ext else safe_stem

    def _build_storage_key(self, scope: str, filename: str) -> str:
        return f"{scope}/{uuid4().hex}-{filename}"

    def _resolve_local_base(self, driver: str) -> Path:
        base = self.config.local_path if driver == "local" else self.config.docker_volume_path
        path = Path(base)
        if not path.is_absolute():
            path = (_PROJECT_ROOT / path).resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _get_s3_client(self):
        if boto3 is None:
            raise HTTPException(status_code=500, detail="El soporte para S3 requiere instalar boto3")
        bucket = self.config.s3_bucket
        if not bucket:
            raise HTTPException(status_code=500, detail="FILE_STORAGE_S3_BUCKET no está configurado")
        params = {}
        if self.config.s3_access_key_id:
            params["aws_access_key_id"] = self.config.s3_access_key_id
        if self.config.s3_secret_access_key:
            params["aws_secret_access_key"] = self.config.s3_secret_access_key
        if self.config.s3_region:
            params["region_name"] = self.config.s3_region
        if self.config.s3_endpoint:
            params["endpoint_url"] = self.config.s3_endpoint
        params["use_ssl"] = bool(self.config.s3_use_ssl)
        return boto3.client("s3", **params), bucket

    async def save_upload(self, upload: UploadFile, scope: Optional[str], owner_user_id: Optional[int]) -> StoredFile:
        normalized_scope = self._normalize_scope(scope)
        safe_filename = self._sanitize_filename(upload.filename)
        storage_key = self._build_storage_key(normalized_scope, safe_filename)
        driver = self.config.driver
        size_bytes = 0

        if driver in {"local", "docker_volume"}:
            base_path = self._resolve_local_base(driver)
            destination = base_path / storage_key
            destination.parent.mkdir(parents=True, exist_ok=True)
            with destination.open("wb") as buffer:
                while True:
                    chunk = await upload.read(_CHUNK_SIZE)
                    if not chunk:
                        break
                    size_bytes += len(chunk)
                    buffer.write(chunk)
        elif driver == "s3":
            client, bucket = self._get_s3_client()
            data = await upload.read()
            size_bytes = len(data)
            client.put_object(
                Bucket=bucket,
                Key=storage_key,
                Body=data,
                ContentType=upload.content_type or "application/octet-stream",
            )
        else:
            raise HTTPException(status_code=500, detail=f"Driver de almacenamiento desconocido: {driver}")

        await upload.close()

        stored = StoredFile(
            original_name=upload.filename or safe_filename,
            scope=normalized_scope,
            driver=driver,
            storage_path=storage_key,
            content_type=upload.content_type,
            size_bytes=size_bytes,
            owner_user_id=owner_user_id,
        )
        self.session.add(stored)
        self.session.commit()
        self.session.refresh(stored)
        return stored

    def _local_file_path(self, stored: StoredFile) -> Path:
        base = self._resolve_local_base(stored.driver)
        target = base / stored.storage_path
        return target

    def get_file(self, file_id: int) -> StoredFile:
        stored = self.session.get(StoredFile, file_id)
        if not stored:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        return stored

    def build_download_response(self, stored: StoredFile):
        filename = stored.original_name or Path(stored.storage_path).name
        media_type = stored.content_type or "application/octet-stream"
        if stored.driver in {"local", "docker_volume"}:
            path = self._local_file_path(stored)
            if not path.exists():
                raise HTTPException(status_code=404, detail="Archivo no disponible en el almacenamiento local")
            return FileResponse(path, media_type=media_type, filename=filename)
        if stored.driver == "s3":
            client, bucket = self._get_s3_client()
            try:
                obj = client.get_object(Bucket=bucket, Key=stored.storage_path)
            except client.exceptions.NoSuchKey:  # type: ignore[attr-defined]
                raise HTTPException(status_code=404, detail="Archivo no encontrado en S3")

            body = obj["Body"]

            def iterator():
                while True:
                    chunk = body.read(_CHUNK_SIZE)
                    if not chunk:
                        break
                    yield chunk

            response = StreamingResponse(iterator(), media_type=media_type)
            response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response
        raise HTTPException(status_code=500, detail=f"Driver {stored.driver} no soportado para descargas")


def get_storage_service(session: Session = Depends(get_session)) -> StorageService:
    return StorageService(session=session)
