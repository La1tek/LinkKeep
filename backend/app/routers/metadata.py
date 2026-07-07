from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.link_service import fetch_metadata
from app.routers.auth import _get_current_user
from app.models import User

router = APIRouter(prefix="/api/metadata", tags=["metadata"])


class URLRequest(BaseModel):
    url: str


@router.post("")
async def get_metadata(req: URLRequest, user: User = Depends(_get_current_user)):
    try:
        meta = await fetch_metadata(req.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return meta
