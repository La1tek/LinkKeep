from fastapi import APIRouter, Depends
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
    meta = await fetch_metadata(req.url)
    return meta
