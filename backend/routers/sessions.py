# backend/routers/sessions.py
from fastapi import APIRouter, Depends
from auth_dep import get_current_user, User

router = APIRouter(prefix="/sessions", tags=["sessions"])

@router.get("/")
async def list_sessions(user: User = Depends(get_current_user)):
    return [{"id":1,"owner":user.email}]
