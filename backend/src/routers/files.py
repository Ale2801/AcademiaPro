from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel
from typing import Optional

from ..db import get_session
from ..security import authenticate_token, get_current_user, get_current_user_optional
from ..models import User
from ..services.storage import get_storage_service, StorageService


class FileUploadResponse(BaseModel):
    id: int
    original_name: str
    content_type: Optional[str]
    size_bytes: int
    scope: Optional[str]
    download_url: str

    class Config:
        from_attributes = True


router = APIRouter(prefix="/files", tags=["files"])


@router.post("/upload", response_model=FileUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    request: Request,
    file: UploadFile = File(..., description="Archivo a cargar"),
    scope: Optional[str] = Form("general"),
    storage: StorageService = Depends(get_storage_service),
    user: User = Depends(get_current_user),
):
    stored = await storage.save_upload(file, scope=scope, owner_user_id=user.id)
    download_url = request.url_for("download_file", file_id=stored.id)
    return FileUploadResponse(
        id=stored.id,
        original_name=stored.original_name,
        content_type=stored.content_type,
        size_bytes=stored.size_bytes,
        scope=stored.scope,
        download_url=str(download_url),
    )


@router.get("/{file_id}", name="download_file")
def download_file(
    file_id: int,
    token: Optional[str] = Query(None, description="Token JWT para descargas directas"),
    storage: StorageService = Depends(get_storage_service),
    maybe_user: Optional[User] = Depends(get_current_user_optional),
    session=Depends(get_session),
):
    if maybe_user is None:
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")
        authenticate_token(token, session)
    stored = storage.get_file(file_id)
    return storage.build_download_response(stored)
