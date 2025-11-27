from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query, status # 💡 1. status 추가
from pydantic import BaseModel, Field
from sqlalchemy import select, update, insert, desc
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Literal, Optional
import json
from app.schemas import MusicTrackInfo, MusicTrackDetail, SimpleChatMessage, SimpleIntakeData, TherapistManualInput, TrackUpdate
from app.db import get_db
# 💡 2. Connection, SessionPatientIntake 모델 import 추가
from app.models import Session, SessionPrompt, Track, User, Connection, SessionPatientIntake, ConversationMessage, TherapistManualInputs
from app.services.auth_service import get_current_user
from sqlalchemy.orm import joinedload, selectinload
# 1. 함수 이름을 'compose_and_save'으로 변경합니다.
from app.services.elevenlabs_client import compose_and_save, ElevenLabsError
from app.api.routers.therapist import check_counselor_patient_access
import app.kafka as kafka
import os, uuid, datetime as dt
router = APIRouter(prefix="/music", tags=["music"])

# --- (ComposeReq, ComposeResp 클래스는 변경 없음) ---
class ComposeReq(BaseModel):
    session_id: int
    music_length_ms: int = Field(120_000, ge=10_000, le=300_000)
    force_instrumental: bool = True
    extra: dict | None = None

class ComposeResp(BaseModel):
    session_id: int
    track_id: int
    status: Literal["QUEUED", "PROCESSING", "READY", "FAILED"]
    track_url: Optional[str] = None

# --- 💡 4. [핵심 수정] /compose API 권한 검사 로직 변경 ---
@router.post("/compose", response_model=ComposeResp)
async def compose_music(
    req: ComposeReq,
    db: AsyncSession = Depends(get_db),
    # [핵심 추가] 인증된 사용자만 호출하도록 추가 (변경 없음)
    current_user: User = Depends(get_current_user)
):
    # 1) 세션 확인
    session = await db.get(Session, req.session_id)
    if not session:
        raise HTTPException(404, "session not found")

    # 💡 [수정] 세션 권한 검사
    is_owner = (session.created_by == current_user.id) # 요청자가 세션 소유자(환자)인가?
    is_therapist = (current_user.role == "therapist")  # 요청자가 상담사인가?

    if is_owner:
        # 소유자(환자 또는 상담사 본인 세션)이므로 통과
        pass
    elif is_therapist:
        # 상담사일 경우, 이 세션의 소유자(환자 ID)에게 접근 권한이 있는지 확인
        try:
            patient_id = session.created_by
            await check_counselor_patient_access(patient_id, current_user.id, db)
            # 권한 확인 성공 (통과)
        except HTTPException:
            # 권한 없는 상담사
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this session (Counselor mismatch)")
    else:
        # 소유자도 아니고, 권한 있는 상담사도 아님
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this session")

    # --- (이하 로직은 변경 없음) ---
    
    prompt_data = session.prompt if isinstance(session.prompt, dict) else {}
    prompt_text = prompt_data.get("music_prompt") or prompt_data.get("text") or ""
    
    # 2) Track 레코드 생성
    new_track = Track(
        session_id=req.session_id,
        status="QUEUED",
        provider="ElevenLabs",
        prompt=prompt_text,
        duration_sec=int(req.music_length_ms / 1000),
        quality=req.extra.get("preset") if req.extra else None,
    )
    db.add(new_track)
    await db.flush()  # new_track.id 확보

    # 3) Kafka 메시지 발행
    if not kafka.producer:
        raise HTTPException(503, "music queue not available")
    payload = {
        "task_id": new_track.id,
        "session_id": req.session_id,
        "prompt": prompt_text,
        "music_length_ms": req.music_length_ms,
        "force_instrumental": req.force_instrumental,
        "extra": req.extra or {},
    }
    await kafka.producer.send_and_wait(
        os.getenv("KAFKA_TOPIC_REQUESTS", "music.gen.requests"),
        key=new_track.id,
        value=payload,
    )

    await db.commit()

    return {
        "session_id": req.session_id,
        "track_id": new_track.id,
        "status": new_track.status,
        "track_url": None,
    }

@router.patch("/track/{track_id}", response_model=MusicTrackInfo)
async def update_track_title(
    track_id: int,
    update_req: TrackUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 트랙 조회
    result = await db.execute(select(Track).where(Track.id == track_id).options(joinedload(Track.session).joinedload(Session.patient_intake)))
    track = result.scalars().first()
    
    if not track:
        raise HTTPException(404, "트랙을 찾을 수 없습니다.")
    
    # 권한 확인 (본인만 수정 가능)
    if track.session.created_by != current_user.id:
        raise HTTPException(403, "수정 권한이 없습니다.")
        
    # 제목 업데이트
    track.title = update_req.title
    await db.commit()
    await db.refresh(track)
    
    # 응답 생성 (헬퍼 로직 재사용 필요하지만 간단히 구성)
    return MusicTrackInfo(
        id=track.id, title=track.title, prompt="", track_url=track.track_url,
        session_id=track.session_id, initiator_type=track.session.initiator_type, has_dialog=False,
        created_at=track.created_at, is_favorite=track.is_favorite, audioUrl=track.track_url
    )
# --- (/my API는 변경 없음, track_url 필드명 수정된 버전) ---
@router.get("/my", response_model=List[MusicTrackInfo])
async def get_my_music(
    limit: int | None = Query(None, ge=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        query = (
            select(Track)
            .options(
                joinedload(Track.session).joinedload(Session.patient_intake)
            )
            .join(Session)
            .where(Session.created_by == current_user.id)
            .order_by(Track.created_at.desc())
        )

        if limit:
            query = query.limit(limit)

        result = await db.execute(query)
        tracks = result.scalars().unique().all()

        res: list[MusicTrackInfo] = []

        for t in tracks:
            sess = t.session
            intake = getattr(sess, "patient_intake", None)

            # 제목 결정
            if t.title:
                title = t.title
            else:
                if sess.initiator_type == "therapist":
                    title = "상담사 처방 음악"
                elif sess.initiator_type == "patient":
                    if intake and getattr(intake, "has_dialog", False):
                        title = "AI 상담 음악"
                    else:
                        title = "작곡 체험 음악"
                else:
                    title = f"AI 트랙 (세션 {sess.id})"

            # prompt 안전 처리
            if isinstance(sess.prompt, dict):
                prompt_txt = sess.prompt.get("music_prompt") or "프롬프트 없음"
            else:
                if isinstance(sess.prompt, str) and sess.prompt.strip():
                    prompt_txt = sess.prompt
                else:
                    prompt_txt = "프롬프트 없음"

            res.append(
                MusicTrackInfo(
                    id=t.id,
                    title=title,
                    prompt=prompt_txt,
                    track_url=t.track_url,
                    audioUrl=t.track_url,
                    session_id=sess.id,
                    initiator_type=sess.initiator_type,
                    has_dialog=bool(intake and getattr(intake, "has_dialog", False)),
                    created_at=t.created_at,
                    is_favorite=t.is_favorite,
                )
            )

        return res

    except Exception as e:
        # 💥 디버깅용: 실제 에러 메시지를 바로 응답으로 확인
        import traceback
        print("ERROR in /music/my:", traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"/music/my internal error: {e!r}",
        )

@router.get("/my/favorites", response_model=List[MusicTrackInfo])
async def get_my_favorite_music(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """(신규) 현재 로그인한 사용자가 '즐겨찾기'한 음악 목록만 반환합니다."""
    query = (
        select(Track)
        .options(
            joinedload(Track.session).options(
                joinedload(Session.patient_intake)
            )
        )
        .join(Session, Track.session_id == Session.id)
        .where(
            Session.created_by == current_user.id,
            Track.is_favorite == True # 👈 즐겨찾기 필터
        )
        .order_by(Track.created_at.desc())
    )
        
    result = await db.execute(query)
    tracks = result.scalars().unique().all()
    
    # (위 /my API의 반환 로직과 동일)
    response_tracks = []
    for track in tracks:
        session = track.session
        intake = session.patient_intake
        title = f"AI 트랙"
        if session.initiator_type == "therapist": title = "상담사 처방 음악"
        elif session.initiator_type == "patient":
            if intake and intake.has_dialog: title = "AI 상담 기반 음악"
            else: title = "작곡 체험 음악"
        if isinstance(session.prompt, dict):
            session_prompt_text = session.prompt.get("music_prompt", "프롬프트 없음")
        else:
            if isinstance(session.prompt, str) and session.prompt.strip():
                session_prompt_text = session.prompt
            else:
                session_prompt_text = "프롬프트 없음"
             
        response_tracks.append(MusicTrackInfo(
            id=track.id, title=title, prompt=session_prompt_text, track_url=track.track_url,
            session_id=session.id, initiator_type=session.initiator_type,
            has_dialog=intake.has_dialog if intake else False,
            created_at=track.created_at, is_favorite=track.is_favorite
        ))
    return response_tracks


# 💡 [핵심 API 추가] 즐겨찾기 토글(Toggle) API
class FavoriteResponse(BaseModel):
    track_id: int
    is_favorite: bool

@router.post("/track/{track_id}/toggle-favorite", response_model=FavoriteResponse)
async def toggle_favorite_track(
    track_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """(신규) 트랙 1개의 'is_favorite' 상태를 토글(Toggles)합니다."""
    
    query = (
        select(Track)
        .options(joinedload(Track.session)) # 👈 소유권 확인을 위해 세션 로드
        .where(Track.id == track_id)
    )
    result = await db.execute(query)
    track = result.scalars().unique().first()

    if not track or not track.session or not track.session.created_by:
        raise HTTPException(status_code=404, detail="트랙 또는 세션 정보를 찾을 수 없습니다.")
        
    session = track.session

    # 보안 검사 (환자 본인만 즐겨찾기 가능)
    if session.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="이 트랙에 접근할 권한이 없습니다.")
            
    # 상태 토글
    track.is_favorite = not track.is_favorite
    
    try:
        db.add(track)
        await db.commit()
        await db.refresh(track)
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, f"즐겨찾기 업데이트 실패: {e}")
        
    return FavoriteResponse(track_id=track.id, is_favorite=track.is_favorite)



@router.get("/track/{track_id}", response_model=MusicTrackDetail)
async def get_track_details(
    track_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. 트랙/세션 조회 (기존과 동일)
    query = (
        select(Track)
        .where(Track.id == track_id)
        .options(
            joinedload(Track.session).options(
                joinedload(Session.patient_intake), 
                joinedload(Session.therapist_manual),
                selectinload(Session.messages) 
            )
        )
    )
    result = await db.execute(query)
    track = result.scalars().unique().first()

    if not track or not track.session:
        raise HTTPException(status_code=404, detail="트랙 정보를 찾을 수 없습니다.")
    session = track.session

    # 2. 보안 검사 (기존과 동일)
    if session.created_by != current_user.id:
        if current_user.role == "therapist":
            try:
                await check_counselor_patient_access(session.created_by, current_user.id, db)
            except HTTPException:
                 raise HTTPException(status_code=403, detail="권한 없음")
        else:
            raise HTTPException(status_code=403, detail="권한 없음")

    # --- 3. 데이터 로딩 ---
    
    # (A) 환자 Intake (기존 코드 유지 - 생략 가능하지만 전체 코드 제공)
    intake_data = None
    # ... (JSON 스냅샷 우선 로직) ...
    q_prompt = select(SessionPrompt).where(SessionPrompt.session_id == session.id, SessionPrompt.stage == "user_input").order_by(desc(SessionPrompt.created_at)).limit(1)
    snapshot = (await db.execute(q_prompt)).scalar_one_or_none()
    
    if snapshot and snapshot.data:
        data = snapshot.data
        goal = data.get("goal", {})
        intake_data = SimpleIntakeData(
            goal_text=goal.get("text") if isinstance(goal, dict) else "N/A",
            vas=data.get("vas"),
            prefs=data.get("prefs")
        )
    else:
        p_intake = session.patient_intake
        if not p_intake:
            q_pi = select(SessionPatientIntake).where(SessionPatientIntake.session_id == session.id)
            p_intake = (await db.execute(q_pi)).scalar_one_or_none()
        if p_intake:
            intake_data = SimpleIntakeData(
                goal_text=p_intake.goal.get("text") if isinstance(p_intake.goal, dict) else "N/A",
                vas=p_intake.vas, 
                prefs=p_intake.prefs 
            )


    # (B) 상담사/작곡가 처방 데이터 복구
    therapist_manual = None
    
    # 1순위: JSON 스냅샷 확인 (여기에 VAS 점수가 들어있음!)
    q_manual_prompt = select(SessionPrompt).where(SessionPrompt.session_id == session.id, SessionPrompt.stage == "manual").order_by(desc(SessionPrompt.created_at)).limit(1)
    manual_snapshot = (await db.execute(q_manual_prompt)).scalar_one_or_none()
    
    if manual_snapshot and manual_snapshot.data:
        print(f"DEBUG: Manual Snapshot Found! Using JSON data.")
        manual_data = manual_snapshot.data
        
        # 호환성 처리
        if "mainInstrument" not in manual_data:
             if manual_data.get("include_instruments") and len(manual_data["include_instruments"]) > 0:
                 manual_data["mainInstrument"] = manual_data["include_instruments"][0]
             else:
                 manual_data["mainInstrument"] = "Piano"
        
        # 💡 [핵심] JSON 데이터에는 anxiety, depression, pain 키가 그대로 들어있음
        # Pydantic 모델로 변환 시 이 필드들이 자동으로 매핑됨
        therapist_manual = TherapistManualInput(**manual_data)
        
    else:
        # 2순위: DB 테이블 확인 (VAS 정보 없음)
        t_manual = session.therapist_manual
        if not t_manual:
            q_tm = select(TherapistManualInputs).where(TherapistManualInputs.session_id == session.id)
            t_manual = (await db.execute(q_tm)).scalar_one_or_none()

        if t_manual:
            print(f"DEBUG: Using DB Table for Manual Data (VAS Info Missing)")
            therapist_manual = TherapistManualInput(
                genre=t_manual.genre,
                mood=t_manual.mood,
                bpm_min=t_manual.bpm_min,
                bpm_max=t_manual.bpm_max,
                key_signature=t_manual.key_signature,
                vocals_allowed=t_manual.vocals_allowed,
                include_instruments=t_manual.include_instruments,
                exclude_instruments=t_manual.exclude_instruments,
                duration_sec=t_manual.duration_sec,
                notes=t_manual.notes,
                harmonic_dissonance=getattr(t_manual, 'harmonic_dissonance', 'Neutral'),
                rhythm_complexity=getattr(t_manual, 'rhythm_complexity', 'Neutral'),
                melody_contour=getattr(t_manual, 'melody_contour', 'Neutral'),
                texture_density=getattr(t_manual, 'texture_density', 'Neutral'),
                mainInstrument=t_manual.include_instruments[0] if t_manual.include_instruments else "Piano",
                
                # 💡 DB 테이블에는 VAS 컬럼이 없으므로 null 처리
                anxiety=None,
                depression=None,
                pain=None
            )

    # (C) ~ (E) 나머지 로직 (변경 없음)
    chat_history = [SimpleChatMessage.model_validate(msg) for msg in session.messages] if session.messages else []
    prompt_data = session.prompt if isinstance(session.prompt, dict) else {}
    lyrics = prompt_data.get("lyrics_text")
    prompt_text = prompt_data.get("music_prompt") or prompt_data.get("text") or "프롬프트 없음"

    if track.title:
        final_title = track.title
    else:
        if session.initiator_type == "therapist":
            final_title = "상담사 처방 음악"

        elif session.initiator_type == "patient":
            if intake_data and chat_history:
                final_title = "AI 상담 기반 음악"
            elif therapist_manual:
                final_title = "작곡 체험 음악"
            else:
                final_title = "AI 생성 음악"

    # 혹시 initiator_type이 예외일 경우 fallback
        else:
            final_title = f"AI 트랙 (세션 {session.id})"

    return MusicTrackDetail(
        id=track.id,
        title=final_title,
        prompt=prompt_text,
        track_url=track.track_url,
        audioUrl=track.track_url,
        session_id=session.id,
        initiator_type=session.initiator_type,
        has_dialog=bool(intake_data),
        created_at=track.created_at, 
        is_favorite=track.is_favorite,
        
        lyrics=lyrics,
        intake_data=intake_data,        
        therapist_manual=therapist_manual,
        chat_history=chat_history       
    )