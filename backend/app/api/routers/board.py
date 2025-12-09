from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, insert, delete, desc, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from typing import List, Optional, Literal

from app.db import get_db
from app.models import User, BoardPost, BoardComment, Track, BoardLike
from app.schemas import PostCreate, PostResponse, PostDetailResponse, CommentCreate, CommentResponse, BoardTrackInfo
from app.services.auth_service import get_current_user, get_current_user_optional

router = APIRouter(prefix="/board", tags=["board"])

def map_track_to_schema(track):
    # track 없거나 track_url 없으면 아예 music info 안 내려보냄
    if track is None or track.track_url is None:
        return None

    display_title = track.title or "Untitled"

    return BoardTrackInfo(
        id=track.id,
        title=display_title,
        audioUrl=track.track_url
    )

# 1. 게시글 목록 조회 (정렬 수정)
@router.get("/", response_model=List[PostResponse])
async def get_posts(
    skip: int = 0, 
    limit: int = 20, 
    keyword: Optional[str] = None,
    sort_by: Literal['latest', 'views', 'likes', 'comments'] = 'latest',
    has_music: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    # 기본 쿼리
    query = select(BoardPost).options(
        joinedload(BoardPost.author),
        joinedload(BoardPost.track)
    )

    # 🔍 검색
    if keyword:
        query = query.where(
            or_(
                BoardPost.title.ilike(f"%{keyword}%"),
                BoardPost.content.ilike(f"%{keyword}%")
            )
        )
    
    # 🎵 음악 포함 필터
    if has_music:
        query = query.where(BoardPost.track_id.isnot(None))

    # -----------------------------------------
    # 🔥 정렬 서브쿼리 방식 (PostgreSQL 100% 정상 동작)
    # -----------------------------------------
    
    if sort_by == 'likes':
        like_sub = (
            select(
                BoardLike.post_id, 
                func.count(BoardLike.user_id).label("like_count")
            )
            .group_by(BoardLike.post_id)
            .subquery()
        )
        
        query = (
            query
            .outerjoin(like_sub, like_sub.c.post_id == BoardPost.id)
            .order_by(desc(func.coalesce(like_sub.c.like_count, 0)))
            .order_by(desc(BoardPost.created_at)) # 동점일 경우 최신순
        )

    elif sort_by == 'comments':
        comment_sub = (
            select(
                BoardComment.post_id, 
                func.count(BoardComment.id).label("comment_count")
            )
            .group_by(BoardComment.post_id)
            .subquery()
        )
        
        query = (
            query
            .outerjoin(comment_sub, comment_sub.c.post_id == BoardPost.id)
            .order_by(desc(func.coalesce(comment_sub.c.comment_count, 0)))
            .order_by(desc(BoardPost.created_at))
        )

    elif sort_by == 'views':
        query = query.order_by(desc(BoardPost.views), desc(BoardPost.created_at))
        
    else:  # latest
        query = query.order_by(desc(BoardPost.created_at))

    # 페이징
    query = query.offset(skip).limit(limit)
    
    # 실행
    posts = (await db.execute(query)).unique().scalars().all()
    
    # -----------------------------------------
    # 🔥 각 게시글에 대해 좋아요/댓글 카운트 정확하게 다시 계산
    # (정렬은 서브쿼리 기준, 실제 값은 여기서 보장)
    # -----------------------------------------
    
    response = []
    for post in posts:
        c_count = (
            await db.execute(
                select(func.count(BoardComment.id)).where(BoardComment.post_id == post.id)
            )
        ).scalar() or 0
        
        l_count = (
            await db.execute(
                select(func.count(BoardLike.user_id)).where(BoardLike.post_id == post.id)
            )
        ).scalar() or 0
        
        is_liked = False
        if current_user:
            liked = (
                await db.execute(
                    select(BoardLike).where(
                        BoardLike.post_id == post.id, 
                        BoardLike.user_id == current_user.id
                    )
                )
            ).scalar_one_or_none()
            is_liked = bool(liked)

        response.append(
            PostResponse(
                id=post.id,
                title=post.title,
                content=post.content,
                author_name=post.author.name or "익명",
                author_id=post.author_id,
                author_role=post.author.role,
                created_at=post.created_at,
                track=map_track_to_schema(post.track),
                comments_count=c_count,
                views=post.views,
                tags=post.tags or [],
                like_count=l_count,
                is_liked=is_liked,
            )
        )
        
    return response


@router.get("/my", response_model=List[PostResponse])
async def get_my_posts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    keyword: Optional[str] = None,
    sort_by: Literal['latest', 'views', 'likes', 'comments'] = 'latest',
    has_music: bool = False,
):
    query = select(BoardPost).where(BoardPost.author_id == current_user.id).options(
        joinedload(BoardPost.author), joinedload(BoardPost.track)
    )

    if keyword:
        query = query.where(
            or_(
                BoardPost.title.ilike(f"%{keyword}%"),
                BoardPost.content.ilike(f"%{keyword}%")
            )
        )

    if has_music:
        query = query.where(BoardPost.track_id.isnot(None))

    # sort_by 처리 (get_posts와 동일)
    if sort_by == 'likes':
        like_sub = (
            select(BoardLike.post_id, func.count(BoardLike.user_id).label("like_count"))
            .group_by(BoardLike.post_id)
            .subquery()
        )
        query = query.outerjoin(like_sub, like_sub.c.post_id == BoardPost.id)\
                     .order_by(desc(func.coalesce(like_sub.c.like_count, 0)), desc(BoardPost.created_at))
    elif sort_by == 'comments':
        comment_sub = (
            select(BoardComment.post_id, func.count(BoardComment.id).label("comment_count"))
            .group_by(BoardComment.post_id)
            .subquery()
        )
        query = query.outerjoin(comment_sub, comment_sub.c.post_id == BoardPost.id)\
                     .order_by(desc(func.coalesce(comment_sub.c.comment_count, 0)), desc(BoardPost.created_at))
    elif sort_by == 'views':
        query = query.order_by(desc(BoardPost.views), desc(BoardPost.created_at))
    else:
        query = query.order_by(desc(BoardPost.created_at))

    posts = (await db.execute(query)).unique().scalars().all()

    # response 생성 (get_posts와 동일)
    response = []
    for post in posts:
        c_count = (await db.execute(select(func.count(BoardComment.id)).where(BoardComment.post_id == post.id))).scalar() or 0
        l_count = (await db.execute(select(func.count(BoardLike.user_id)).where(BoardLike.post_id == post.id))).scalar() or 0
        liked = (await db.execute(select(BoardLike).where(BoardLike.post_id == post.id, BoardLike.user_id == current_user.id))).scalar_one_or_none()
        response.append(PostResponse(
            id=post.id, title=post.title, content=post.content,
            author_name=post.author.name or "익명", author_id=post.author_id, author_role=post.author.role,
            created_at=post.created_at, track=map_track_to_schema(post.track),
            comments_count=c_count, views=post.views, tags=post.tags or [], like_count=l_count, is_liked=bool(liked)
        ))
    return response



# ... (나머지 API - create_post, toggle_like, delete_post 등 기존 유지) ...
@router.post("/{post_id}/like", status_code=status.HTTP_200_OK)
async def toggle_like(post_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = select(BoardLike).where(BoardLike.post_id == post_id, BoardLike.user_id == current_user.id)
    existing = (await db.execute(q)).scalar_one_or_none()
    if existing: await db.delete(existing); await db.commit(); return {"status": "unliked"}
    else: db.add(BoardLike(post_id=post_id, user_id=current_user.id)); await db.commit(); return {"status": "liked"}

@router.post("/", response_model=PostResponse)
async def create_post(post_in: PostCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    new_post = BoardPost(title=post_in.title, content=post_in.content, author_id=current_user.id, track_id=post_in.track_id, tags=post_in.tags)
    db.add(new_post); await db.commit(); await db.refresh(new_post)
    q = select(BoardPost).where(BoardPost.id == new_post.id).options(joinedload(BoardPost.author), joinedload(BoardPost.track))
    post = (await db.execute(q)).scalar_one()
    return PostResponse(id=post.id, title=post.title, content=post.content, author_name=current_user.name or "익명", author_id=current_user.id, author_role=current_user.role, created_at=post.created_at, track=map_track_to_schema(post.track), comments_count=0, views=0, tags=post.tags or [], like_count=0, is_liked=False)

@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(post_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    post = await db.get(BoardPost, post_id)
    if not post: raise HTTPException(404, "찾을 수 없음")
    if post.author_id != current_user.id: raise HTTPException(403, "권한 없음")
    await db.delete(post); await db.commit()

@router.get("/{post_id}", response_model=PostDetailResponse)
async def get_post_detail(post_id: int, db: AsyncSession = Depends(get_db), current_user: Optional[User] = Depends(get_current_user_optional)):
    q = select(BoardPost).where(BoardPost.id == post_id).options(joinedload(BoardPost.author), joinedload(BoardPost.track), selectinload(BoardPost.comments).joinedload(BoardComment.author))
    post = (await db.execute(q)).scalar_one_or_none()
    if not post: raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    post.views += 1; await db.commit()
    l_count = (await db.execute(select(func.count(BoardLike.user_id)).where(BoardLike.post_id == post.id))).scalar() or 0
    is_liked = False
    if current_user:
        liked = (await db.execute(select(BoardLike).where(BoardLike.post_id == post.id, BoardLike.user_id == current_user.id))).scalar_one_or_none()
        is_liked = bool(liked)
    comments_resp = [CommentResponse(id=c.id, content=c.content, author_name=c.author.name or "익명", author_id=c.author_id, author_role=c.author.role, created_at=c.created_at) for c in post.comments]
    return PostDetailResponse(id=post.id, title=post.title, content=post.content, author_name=post.author.name or "익명", author_id=post.author_id, author_role=post.author.role, created_at=post.created_at, track=map_track_to_schema(post.track), comments_count=len(comments_resp), comments=comments_resp, views=post.views, tags=post.tags or [], like_count=l_count, is_liked=is_liked)

@router.post("/{post_id}/comments", response_model=CommentResponse)
async def create_comment(post_id: int, comment_in: CommentCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    post = await db.get(BoardPost, post_id)
    if not post: raise HTTPException(404, "게시글이 없습니다.")
    new_comment = BoardComment(content=comment_in.content, post_id=post_id, author_id=current_user.id)
    db.add(new_comment); await db.commit(); await db.refresh(new_comment)
    return CommentResponse(id=new_comment.id, content=new_comment.content, author_name=current_user.name or "익명", author_id=current_user.id, author_role=current_user.role, created_at=new_comment.created_at)

@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(comment_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    comment = await db.get(BoardComment, comment_id)
    if not comment: raise HTTPException(404, "댓글 없음"); 
    if comment.author_id != current_user.id: raise HTTPException(403, "권한 없음")
    await db.delete(comment); await db.commit()