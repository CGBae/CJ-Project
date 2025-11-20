from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, insert, delete, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from typing import List, Optional

from app.db import get_db
from app.models import User, BoardPost, BoardComment, Track
from app.schemas import PostCreate, PostResponse, PostDetailResponse, CommentCreate, CommentResponse
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/board", tags=["board"])

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
        # 댓글 수 카운트
        count_q = select(func.count(BoardComment.id)).where(BoardComment.post_id == post.id)
        comments_count = (await db.execute(count_q)).scalar() or 0
        
        response.append(PostResponse(
            id=post.id, title=post.title, content=post.content,
            author_name=post.author.name or "익명", author_id=post.author_id,
            created_at=post.created_at, track=post.track, comments_count=comments_count
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
    # 관계 로딩을 위해 다시 조회
    q = select(BoardPost).where(BoardPost.id == new_post.id).options(joinedload(BoardPost.author), joinedload(BoardPost.track))
    post = (await db.execute(q)).scalar_one()
    
    return PostResponse(
        id=post.id, title=post.title, content=post.content,
        author_name=current_user.name or "익명", author_id=current_user.id,
        created_at=post.created_at, track=post.track, comments_count=0
    )

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
            id=c.id, content=c.content, 
            author_name=c.author.name or "익명", author_id=c.author_id, 
            created_at=c.created_at
        ) for c in post.comments
    ]
    
    return PostDetailResponse(
        id=post.id, title=post.title, content=post.content,
        author_name=post.author.name or "익명", author_id=post.author_id,
        created_at=post.created_at, track=post.track,
        comments_count=len(comments_resp), comments=comments_resp
    )

# 4. 댓글 작성
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
        id=new_comment.id, content=new_comment.content,
        author_name=current_user.name or "익명", author_id=current_user.id,
        created_at=new_comment.created_at
    )