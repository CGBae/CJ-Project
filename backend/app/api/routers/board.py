from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, insert, delete, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from typing import List, Optional

from app.db import get_db
from app.models import User, BoardPost, BoardComment, Track
# 💡 [수정] BoardTrackInfo 추가
from app.schemas import PostCreate, PostResponse, PostDetailResponse, CommentCreate, CommentResponse, BoardTrackInfo
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/board", tags=["board"])

# 💡 헬퍼 함수: 트랙 정보를 안전하게 변환
def map_track_to_schema(track: Track | None) -> BoardTrackInfo | None:
    if not track: return None
    # 트랙 제목은 DB에 없으므로 임의로 생성하거나 session 정보를 로드해서 만들어야 함.
    # 여기서는 간단하게 ID 기반으로 생성
    return BoardTrackInfo(
        id=track.id,
        title=f"공유된 음악 #{track.id}", 
        audioUrl=track.track_url
    )

# 1. 게시글 목록 조회
@router.get("/", response_model=List[PostResponse])
async def get_posts(
    skip: int = 0, 
    limit: int = 20, 
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(BoardPost)
        .options(joinedload(BoardPost.author), joinedload(BoardPost.track))
        .order_by(desc(BoardPost.created_at))
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    posts = result.scalars().all()
    
    response = []
    for post in posts:
        count_q = select(func.count(BoardComment.id)).where(BoardComment.post_id == post.id)
        comments_count = (await db.execute(count_q)).scalar() or 0
        
        response.append(PostResponse(
            id=post.id, 
            title=post.title, 
            content=post.content,
            author_name=post.author.name or "익명", 
            author_id=post.author_id,
            author_role=post.author.role,
            created_at=post.created_at, 
            # 💡 [핵심] 트랙 정보 수동 매핑
            track=map_track_to_schema(post.track),
            comments_count=comments_count
        ))
    return response

@router.get("/my", response_model=List[PostResponse])
async def get_my_posts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = (
        select(BoardPost)
        .where(BoardPost.author_id == current_user.id) # 👈 내 글만 필터링
        .options(joinedload(BoardPost.author), joinedload(BoardPost.track))
        .order_by(desc(BoardPost.created_at))
    )
    result = await db.execute(query)
    posts = result.scalars().all()
    
    response = []
    for post in posts:
        count_q = select(func.count(BoardComment.id)).where(BoardComment.post_id == post.id)
        comments_count = (await db.execute(count_q)).scalar() or 0
        
        response.append(PostResponse(
            id=post.id, 
            title=post.title, 
            content=post.content,
            author_name=post.author.name or "익명", 
            author_id=post.author_id,
            author_role=post.author.role,
            created_at=post.created_at, 
            track=map_track_to_schema(post.track),
            comments_count=comments_count
        ))
    return response

# 2. 게시글 작성
@router.post("/", response_model=PostResponse)
async def create_post(
    post_in: PostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    new_post = BoardPost(
        title=post_in.title,
        content=post_in.content,
        author_id=current_user.id,
        track_id=post_in.track_id
    )
    db.add(new_post)
    await db.commit()
    await db.refresh(new_post)
    
    q = (
        select(BoardPost)
        .where(BoardPost.id == new_post.id)
        .options(joinedload(BoardPost.author), joinedload(BoardPost.track))
    )
    post = (await db.execute(q)).scalar_one()
    
    return PostResponse(
        id=post.id, 
        title=post.title, 
        content=post.content,
        author_name=post.author.name or "익명", 
        author_id=post.author_id,
        author_role=post.author.role,
        created_at=post.created_at, 
        # 💡 [핵심] 트랙 정보 수동 매핑
        track=map_track_to_schema(post.track),
        comments_count=0
    )

@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    post = await db.get(BoardPost, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    
    # 본인 글인지 확인
    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다.")
        
    await db.delete(post)
    await db.commit()
    return None

# 3. 게시글 상세 조회
@router.get("/{post_id}", response_model=PostDetailResponse)
async def get_post_detail(post_id: int, db: AsyncSession = Depends(get_db)):
    q = (
        select(BoardPost)
        .where(BoardPost.id == post_id)
        .options(
            joinedload(BoardPost.author), 
            joinedload(BoardPost.track),
            selectinload(BoardPost.comments).joinedload(BoardComment.author)
        )
    )
    post = (await db.execute(q)).scalar_one_or_none()
    if not post: raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    
    comments_resp = [
        CommentResponse(
            id=c.id, 
            content=c.content, 
            author_name=c.author.name or "익명", 
            author_id=c.author_id, 
            author_role=c.author.role,
            created_at=c.created_at
        ) for c in post.comments
    ]
    
    return PostDetailResponse(
        id=post.id, 
        title=post.title, 
        content=post.content,
        author_name=post.author.name or "익명", 
        author_id=post.author_id,
        author_role=post.author.role,
        created_at=post.created_at, 
        # 💡 [핵심] 트랙 정보 수동 매핑
        track=map_track_to_schema(post.track),
        comments_count=len(comments_resp), 
        comments=comments_resp
    )

# 4. 댓글 작성 (변경 없음)
@router.post("/{post_id}/comments", response_model=CommentResponse)
async def create_comment(
    post_id: int,
    comment_in: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    post = await db.get(BoardPost, post_id)
    if not post: raise HTTPException(404, "게시글이 없습니다.")
    
    new_comment = BoardComment(
        content=comment_in.content,
        post_id=post_id,
        author_id=current_user.id
    )
    db.add(new_comment)
    await db.commit()
    await db.refresh(new_comment)
    
    return CommentResponse(
        id=new_comment.id, 
        content=new_comment.content,
        author_name=current_user.name or "익명", 
        author_id=current_user.id,
        author_role=current_user.role,
        created_at=new_comment.created_at
    )

# 💡 [신규] 댓글 삭제
@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    comment = await db.get(BoardComment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    
    # 본인 댓글인지 확인
    if comment.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다.")
        
    await db.delete(comment)
    await db.commit()
    return None