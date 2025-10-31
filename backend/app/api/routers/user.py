from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from app.db import get_db
from app.models import User
from app.services.auth_service import get_current_user
from app.schemas import UserProfile, ProfileUpdate

# user 라우터 정의
router = APIRouter(prefix="/user", tags=["user"])

# [1] 프로필 조회
@router.get("/profile", response_model=UserProfile)
async def get_user_profile(
    current_user: User = Depends(get_current_user)
):
    """
    현재 인증된 사용자의 프로필 정보(이름, 나이 등)를 조회합니다.
    """
    # get_current_user가 이미 DB에서 User 객체를 가져왔으므로 바로 반환
    return current_user

# [2] 프로필 업데이트 (이름, 나이)
@router.put("/profile", response_model=UserProfile)
async def update_user_profile(
    profile_in: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    현재 인증된 사용자의 프로필 정보(이름, 나이)를 업데이트합니다.
    """
    update_data = profile_in.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="업데이트할 내용이 없습니다."
        )

    # User 모델 업데이트 (SQLAlchemy ORM 사용)
    current_user.name = update_data.get("name", current_user.name)
    current_user.age = update_data.get("age", current_user.age)

    await db.commit()
    await db.refresh(current_user)

    return current_user

# [3] 계정 탈퇴
@router.delete("/deactivate", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user_account(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    현재 인증된 사용자의 계정을 삭제합니다 (회원 탈퇴).
    ⚠️ 이 기능은 실제 프로덕션 환경에서는 '비활성화'로 처리하는 것이 일반적입니다.
    """
    # 사용자 삭제
    await db.execute(
        delete(User).where(User.id == current_user.id)
    )
    await db.commit()
    
    # 204 No Content 반환 (성공적으로 처리되었으나 반환할 내용 없음)
    return
