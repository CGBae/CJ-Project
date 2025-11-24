from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, insert, delete, desc, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from typing import List, Optional

from app.db import get_db
from app.models import User, BoardPost, BoardComment, Track, BoardLike
from app.schemas import PostCreate, PostResponse, PostDetailResponse, CommentCreate, CommentResponse, BoardTrackInfo
from app.services.auth_service import get_current_user, get_current_user_optional # (로그인 안 해도 볼 수 있게 optional 추가 필요)

router = APIRouter(prefix="/board", tags=["board"])

def map_track_to_schema(track: Track | None) -> BoardTrackInfo | None:
    if not track: return None
    return BoardTrackInfo(id=track.id, title=f"공유된 음악 #{track.id}", audioUrl=track.track_url)

# 1. 게시글 목록 조회 (검색 + 좋아요 수 + 태그)
@router.get("/", response_model=List[PostResponse])
async def get_posts(
    skip: int = 0, 
    limit: int = 20, 
    keyword: Optional[str] = None, # 💡 검색어
    tag: Optional[str] = None, # 💡 태그 필터
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional) # 비로그인 사용자도 조회 가능하도록
):
    query = select(BoardPost).options(joinedload(BoardPost.author), joinedload(BoardPost.track))
    
    # 💡 검색 로직
    if keyword:
        query = query.where(or_(
            BoardPost.title.ilike(f"%{keyword}%"),
            BoardPost.content.ilike(f"%{keyword}%")
        ))
    
    # 💡 태그 필터 (JSON 배열 안에 태그가 있는지 확인 - DB 종류에 따라 다를 수 있음. 여기선 Python 필터링이나 간단한 like 사용)
    # Postgres라면: BoardPost.tags.contains([tag]) 사용 가능
    # 범용성을 위해 여기서는 생략하거나, Python 레벨에서 처리 권장 (간단한 구현)

    query = query.order_by(desc(BoardPost.created_at)).offset(skip).limit(limit)
    
    posts = (await db.execute(query)).scalars().all()
    
    response = []
    for post in posts:
        # 댓글 수
        c_count = (await db.execute(select(func.count(BoardComment.id)).where(BoardComment.post_id == post.id))).scalar() or 0
        # 좋아요 수
        l_count = (await db.execute(select(func.count(BoardLike.user_id)).where(BoardLike.post_id == post.id))).scalar() or 0
        # 내가 좋아요 눌렀는지
        is_liked = False
        if current_user:
            liked = (await db.execute(select(BoardLike).where(BoardLike.post_id == post.id, BoardLike.user_id == current_user.id))).scalar_one_or_none()
            is_liked = bool(liked)

        response.append(PostResponse(
            id=post.id, title=post.title, content=post.content,
            author_name=post.author.name or "익명", author_id=post.author_id, author_role=post.author.role,
            created_at=post.created_at, track=map_track_to_schema(post.track),
            comments_count=c_count,
            views=post.views, tags=post.tags or [], like_count=l_count, is_liked=is_liked
        ))
    return response

# 💡 [신규] 좋아요 토글
@router.post("/{post_id}/like", status_code=status.HTTP_200_OK)
async def toggle_like(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 이미 좋아요 눌렀는지 확인
    q = select(BoardLike).where(BoardLike.post_id == post_id, BoardLike.user_id == current_user.id)
    existing = (await db.execute(q)).scalar_one_or_none()
    
    if existing:
        await db.delete(existing) # 취소
        await db.commit()
        return {"status": "unliked"}
    else:
        new_like = BoardLike(post_id=post_id, user_id=current_user.id)
        db.add(new_like) # 추가
        await db.commit()
        return {"status": "liked"}

# 2. 게시글 작성 (태그 저장 추가)
@router.post("/", response_model=PostResponse)
async def create_post(
    post_in: PostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    new_post = BoardPost(
        title=post_in.title, content=post_in.content,
        author_id=current_user.id, track_id=post_in.track_id,
        tags=post_in.tags # 💡 태그 저장
    )
    db.add(new_post)
    await db.commit()
    await db.refresh(new_post)
    
    q = select(BoardPost).where(BoardPost.id == new_post.id).options(joinedload(BoardPost.author), joinedload(BoardPost.track))
    post = (await db.execute(q)).scalar_one()
    
    return PostResponse(
        id=post.id, title=post.title, content=post.content,
        author_name=current_user.name or "익명", author_id=current_user.id, author_role=current_user.role,
        created_at=post.created_at, track=map_track_to_schema(post.track), comments_count=0,
        views=0, tags=post.tags or [], like_count=0, is_liked=False
    )

# 3. 게시글 상세 조회 (조회수 증가 + 좋아요 상태)
@router.get("/{post_id}", response_model=PostDetailResponse)
async def get_post_detail(
    post_id: int, 
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    q = select(BoardPost).where(BoardPost.id == post_id).options(
        joinedload(BoardPost.author), joinedload(BoardPost.track),
        selectinload(BoardPost.comments).joinedload(BoardComment.author)
    )
    post = (await db.execute(q)).scalar_one_or_none()
    if not post: raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    
    # 💡 조회수 증가
    post.views += 1
    await db.commit() # 조회수 저장
    
    # 좋아요 정보 계산
    l_count = (await db.execute(select(func.count(BoardLike.user_id)).where(BoardLike.post_id == post.id))).scalar() or 0
    is_liked = False
    if current_user:
        liked = (await db.execute(select(BoardLike).where(BoardLike.post_id == post.id, BoardLike.user_id == current_user.id))).scalar_one_or_none()
        is_liked = bool(liked)

    comments_resp = [
        CommentResponse(
            id=c.id, content=c.content, author_name=c.author.name or "익명", author_id=c.author_id, 
            author_role=c.author.role, created_at=c.created_at
        ) for c in post.comments
    ]
    
    return PostDetailResponse(
        id=post.id, title=post.title, content=post.content,
        author_name=post.author.name or "익명", author_id=post.author_id, author_role=post.author.role,
        created_at=post.created_at, track=map_track_to_schema(post.track),
        comments_count=len(comments_resp), comments=comments_resp,
        views=post.views, tags=post.tags or [], like_count=l_count, is_liked=is_liked
    )

# ... (댓글 작성, 삭제 API 등 기존 유지) ...
@router.post("/{post_id}/comments", response_model=CommentResponse)
async def create_comment(
    post_id: int, comment_in: CommentCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    post = await db.get(BoardPost, post_id)
    if not post: raise HTTPException(404, "게시글이 없습니다.")
    new_comment = BoardComment(content=comment_in.content, post_id=post_id, author_id=current_user.id)
    db.add(new_comment)
    await db.commit()
    await db.refresh(new_comment)
    return CommentResponse(id=new_comment.id, content=new_comment.content, author_name=current_user.name or "익명", author_id=current_user.id, author_role=current_user.role, created_at=new_comment.created_at)

@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(post_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    post = await db.get(BoardPost, post_id)
    if not post: raise HTTPException(404, "찾을 수 없음")
    if post.author_id != current_user.id: raise HTTPException(403, "권한 없음")
    await db.delete(post)
    await db.commit()

@router.get("/my", response_model=List[PostResponse])
async def get_my_posts(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = select(BoardPost).where(BoardPost.author_id == current_user.id).options(joinedload(BoardPost.author), joinedload(BoardPost.track)).order_by(desc(BoardPost.created_at))
    posts = (await db.execute(query)).scalars().all()
    response = []
    for post in posts:
        c_count = (await db.execute(select(func.count(BoardComment.id)).where(BoardComment.post_id == post.id))).scalar() or 0
        l_count = (await db.execute(select(func.count(BoardLike.user_id)).where(BoardLike.post_id == post.id))).scalar() or 0
        liked = (await db.execute(select(BoardLike).where(BoardLike.post_id == post.id, BoardLike.user_id == current_user.id))).scalar_one_or_none()
        response.append(PostResponse(
            id=post.id, title=post.title, content=post.content, author_name=post.author.name or "익명", author_id=post.author_id,
            author_role=post.author.role, created_at=post.created_at, track=map_track_to_schema(post.track),
            comments_count=c_count, views=post.views, tags=post.tags or [], like_count=l_count, is_liked=bool(liked)
        ))
    return response

@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(comment_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    comment = await db.get(BoardComment, comment_id)
    if not comment: raise HTTPException(404, "댓글 없음")
    if comment.author_id != current_user.id: raise HTTPException(403, "권한 없음")
    await db.delete(comment)
    await db.commit()