'use client';

import React, { useState, useEffect, useRef, Fragment } from 'react';
import { useRouter } from 'next/navigation';
// 💡 1. [수정] 'Palette' (컬러테라피) 아이콘 import 제거
import {
    Play, Pause, Music, Trash2, ArrowLeft, Volume2, Loader2, FileText, MessageSquare, ChevronDown, User, AlertTriangle, Heart,
    Volume1, VolumeX, RefreshCcw, Edit2, Check, X,CheckSquare,Square, Share2
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext'; // 💡 AuthContext 임포트
// 💡 2. [수정] MusicTrackInfo 타입 (백엔드 schemas.py와 일치)
interface MusicTrackInfo {
    id: number | string;
    title: string; // 👈 백엔드에서 생성된 동적 제목
    prompt: string;
    audioUrl: string;
    track_url?: string;
    created_at: string;
    is_favorite: boolean;
    // 💡 artist 필드 제거

    // 💡 세션 정보 추가
    session_id: number;
    initiator_type: string | null;
    has_dialog: boolean | null;
}

// 3. 상세 정보 타입 (변경 없음)
interface ChatMessage {
    id: number | string;
    role: 'user' | 'assistant';
    content: string;
}
interface SimpleIntakeData {
    goal_text: string | null;
}
interface MusicTrackDetail extends MusicTrackInfo {
    lyrics: string | null;
    intake_data: SimpleIntakeData | null;
    chat_history: ChatMessage[];
}

// 💡 4. [핵심 수정] 헬퍼 함수: 제목에서 (세션 ID) 제거
const getDynamicTitle = (track: MusicTrackInfo): string => {
    if (track.title && !track.title.includes("AI 생성 트랙")) {
        return track.title.split(' (')[0];
    }
    if (track.initiator_type === "therapist") {
        return `상담사 처방 음악`;
    } else if (track.initiator_type === "patient") {
        if (track.has_dialog) {
            return `AI 상담 기반 음악`;
        } else {
            return `작곡 체험 음악`;
        }
    }
    return track.title ? track.title.split(' (')[0] : `AI 트랙 #${track.id}`;
};

const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds === Infinity) {
        return '0:00';
    }
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
};

function getApiUrl() {
    // 1순위: 내부 통신용 (docker 네트워크 안에서 backend 이름으로 호출)
    if (process.env.INTERNAL_API_URL) {
        return process.env.INTERNAL_API_URL;
    }

    // 2순위: 공개용 API URL (빌드 시점에라도 이건 거의 항상 들어있음)
    if (process.env.NEXT_PUBLIC_API_URL) {
        return process.env.NEXT_PUBLIC_API_URL;
    }

    // 3순위: 최후 fallback - 도커 네트워크 기준으로 backend 서비스 직접 호출
    return 'http://backend:8000';
}

const API_URL = getApiUrl();

export default function MusicPlaylistPage() {
    const router = useRouter();
    const [playlist, setPlaylist] = useState<MusicTrackInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentTrackId, setCurrentTrackId] = useState<number | string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // 💡 4. [수정] 상세 정보/펼치기 상태
    const [detailLoadingId, setDetailLoadingId] = useState<number | string | null>(null);
    const [expandedTrackId, setExpandedTrackId] = useState<number | string | null>(null);
    const [trackDetail, setTrackDetail] = useState<MusicTrackDetail | null>(null);
    const [editingTrackId, setEditingTrackId] = useState<number | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [currentTrack, setCurrentTrack] = useState<MusicTrackInfo | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1.0);
    const [isLooping, setIsLooping] = useState(false);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number | string>>(new Set());

    // useEffect (음악 목록 API 호출) - 변경 없음
    useEffect(() => {
        if (typeof window !== "undefined" && !audioRef.current) {
            const audio = new Audio();
            audio.onended = () => {
                if (!audio.loop) { // 👈 [수정] 루프가 아닐 때만 정지
                    setIsPlaying(false);
                    setCurrentTrack(null);
                    setCurrentTime(0); // 👈 재생 종료 시 시간 초기화
                }
            };
            audio.ontimeupdate = () => {
                setCurrentTime(audio.currentTime);
            };
            audio.onloadedmetadata = () => {
                setDuration(audio.duration);
            };
            audio.onplay = () => setIsPlaying(true);
            audio.onpause = () => setIsPlaying(false);
            audioRef.current = audio;
        }

        const fetchPlaylist = async () => {
            setLoading(true);
            setError(null);
            const token = localStorage.getItem('accessToken');
            if (!token) {
                setError("로그인이 필요합니다. 음악 목록을 보려면 로그인해주세요.");
                setLoading(false);
                router.push('/login?next=/music');
                return;
            }

            try {
                const response = await fetch(`${API_URL}/music/my`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.status === 401) throw new Error('인증 실패');
                if (!response.ok) throw new Error('음악 목록을 불러오는데 실패했습니다.');

                const musicData: MusicTrackInfo[] = await response.json();

                const mappedMusicData = musicData.map(track => ({
                    ...track,
                    audioUrl: track.track_url || track.audioUrl || '',
                }));
                setPlaylist(mappedMusicData);

            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : "음악 로딩 중 오류 발생";
                setError(errorMessage);
                if (errorMessage.includes('인증 실패')) {
                    localStorage.removeItem('accessToken');
                    router.push('/login?next=/music');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchPlaylist();

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.onended = null;
                audioRef.current = null;
            }
        };
    }, [router]);
    const startEditing = (track: MusicTrackInfo) => {
        setEditingTrackId(Number(track.id));
        setEditTitle(track.title);
    };
    const saveTitle = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!editingTrackId || !editTitle.trim()) return;
        const token = localStorage.getItem('accessToken');
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/music/track/${editingTrackId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ title: editTitle })
            });
            if (res.ok) {
                // 로컬 상태 업데이트 (새로고침 없이 반영)
                setPlaylist(prev => prev.map(t => t.id === editingTrackId ? { ...t, title: editTitle } : t));
                setEditingTrackId(null);
            } else { alert("수정 실패"); }
        } catch (e) { alert("오류 발생"); }
    };
    // handlePlay (오디오 재생) - 변경 없음
    const handlePlay = async (e: React.MouseEvent, track: MusicTrackInfo) => {
        e.stopPropagation();
        const audio = audioRef.current;
        if (!audio) return;

        // 1. 현재 재생 중인 곡을 다시 누른 경우 (일시정지/재생)
        if (currentTrack?.id === track.id) {
            if (isPlaying) {
                audio.pause();
            } else {
                try {
                    await audio.play();
                } catch (err) { console.error("Play error:", err); }
            }
            return;
        }

        // 2. 다른 곡을 누른 경우 (재생)
        try {
            // 💡 [요청 사항] 상세 정보 패널이 닫혀있다면, 먼저 엽니다.
            if (expandedTrackId !== track.id) {
                await handleToggleDetails(track.id); // 👈 (await로 상세 정보 로딩 대기)
            }

            audio.pause();
            audio.src = track.audioUrl;
            setCurrentTrack(track);
            setCurrentTime(0);

            // 💡 [수정] 오디오 로드 대기
            await new Promise<void>((resolve, reject) => {
                audio.oncanplaythrough = () => resolve(); // 👈 [수정] onloadedmetadata -> oncanplaythrough
                audio.onerror = (err) => reject(new Error("오디오 로드 실패"));
                audio.load();
            });

            await audio.play();

        } catch (error: unknown) {
            console.error("Audio playback failed", error);
            setError(error instanceof Error ? error.message : `음악 재생/로드 실패`);
            setCurrentTrack(null);
        }
    };

    const handleDelete = async (idsToDelete: (number | string)[]) => {
        if (!confirm(idsToDelete.length > 1 ? `선택한 ${idsToDelete.length}곡을 삭제하시겠습니까?` : "정말 삭제하시겠습니까?")) return;

        const token = localStorage.getItem('accessToken');
        if (!token) return;

        try {
            // 여러 개 삭제를 위해 Promise.all 사용 (백엔드에 벌크 삭제 API가 없다면 반복 호출)
            await Promise.all(idsToDelete.map(id => 
                fetch(`${API_URL}/music/track/${id}`, { // 백엔드에 DELETE /music/track/{id} 구현되어 있다고 가정
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ));

            // 목록 갱신
            setPlaylist(prev => prev.filter(t => !idsToDelete.includes(t.id)));
            
            // 선택 모드 초기화
            setSelectedTrackIds(new Set());
            if (idsToDelete.length > 1) setIsSelectionMode(false);

            alert("삭제되었습니다.");
        } catch (e) {
            alert("삭제 중 오류가 발생했습니다.");
        }
    };

    // 💡 [추가] 선택 토글
    const toggleSelect = (id: number | string) => {
        const newSet = new Set(selectedTrackIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedTrackIds(newSet);
    };

    // 💡 [추가] 전체 선택 토글
    const toggleSelectAll = () => {
        if (selectedTrackIds.size === playlist.length) {
            setSelectedTrackIds(new Set());
        } else {
            setSelectedTrackIds(new Set(playlist.map(t => t.id)));
        }
    };

    const handleToggleFavorite = async (e: React.MouseEvent, trackId: number | string) => {
        e.stopPropagation(); // 부모(펼치기) 클릭 방지
        const token = localStorage.getItem('accessToken');
        if (!token) {
            setError("로그인이 필요합니다.");
            return;
        }

        // 1. (Optimistic UI) 프론트엔드 상태 즉시 변경
        const updateState = (list: MusicTrackInfo[]) =>
            list.map(t => t.id === trackId ? { ...t, is_favorite: !t.is_favorite } : t);

        setPlaylist(updateState);
        if (trackDetail && trackDetail.id === trackId) {
            setTrackDetail(prev => prev ? ({ ...prev, is_favorite: !prev.is_favorite }) : null);
        }

        // 2. (API Call) 백엔드에 토글 요청
        try {
            const response = await fetch(`${API_URL}/music/track/${trackId}/toggle-favorite`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                throw new Error('즐겨찾기 업데이트 실패');
            }
            // (성공 시, 이미 UI가 반영되었으므로 별도 처리 안 함)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "즐겨찾기 오류");
            // 3. (Rollback) API 실패 시 UI 원상 복구
            setPlaylist(updateState); // (한 번 더 뒤집어서 원상 복구)
            if (trackDetail && trackDetail.id === trackId) {
                setTrackDetail(prev => prev ? ({ ...prev, is_favorite: !prev.is_favorite }) : null);
            }
        }
    };

    // handleToggleDetails (상세 정보 토글) - 변경 없음
    const handleToggleDetails = async (trackId: number | string) => {
        if (expandedTrackId === trackId) {
            setExpandedTrackId(null);
            setTrackDetail(null);
            return;
        }
        setDetailLoadingId(trackId);
        setError(null);
        const token = localStorage.getItem('accessToken');
        if (!token) { setError("인증 토큰이 없습니다."); setDetailLoadingId(null); return; }

        try {
            const response = await fetch(`${API_URL}/music/track/${trackId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('상세 정보를 불러오는 데 실패했습니다.');
            const detailData: MusicTrackDetail = await response.json();
            setTrackDetail(detailData);
            setExpandedTrackId(trackId);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "상세 정보 로딩 오류");
        } finally {
            setDetailLoadingId(null);
        }
    };

    const handleClear = () => { /* ... (주석 처리됨) ... */ };

    if (loading) {
        return (<div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>);
    }

    if (error && playlist.length === 0) {
        return (
            <div className="flex flex-col justify-center items-center h-screen text-center p-4">
                <AlertTriangle className="w-12 h-12 text-red-600 mb-4" />
                <h1 className="text-2xl font-bold mb-4 text-red-600">오류 발생</h1>
                <p className="text-gray-600 mb-6">{error}</p>
                {error.includes("로그인") && (
                    <button onClick={() => router.push('/login')} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                        로그인 페이지로 이동
                    </button>
                )}
            </div>
        );
    }

    // 💡 5. [핵심 수정] JSX (UI) 부분
    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 bg-gray-50 min-h-screen">
            <header className="flex justify-between items-center pb-4 border-b border-gray-200 mb-6">
                <button onClick={() => router.push('/dashboard/patient')} className="text-indigo-600 hover:text-indigo-800 flex items-center text-sm">
                    <ArrowLeft className="h-4 w-4 mr-1" /> 대시보드로
                </button>
                <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                    <Volume2 className="h-6 w-6 mr-2 text-indigo-600" /> 나의 AI 음악
                </h1>
            </header>

            {/* 💡 [수정] 상단 컨트롤 바 (선택/삭제) */}
            <div className="flex justify-between items-center mb-6 px-1 h-10">
                <p className="text-sm text-gray-600">총 {playlist.length} 곡</p>
                
                <div className="flex items-center gap-2">
                    {isSelectionMode ? (
                        <>
                            <button 
                                onClick={toggleSelectAll}
                                className="text-xs font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 bg-white border rounded-md"
                            >
                                {selectedTrackIds.size === playlist.length ? '선택 해제' : '전체 선택'}
                            </button>
                            <button 
                                onClick={() => handleDelete(Array.from(selectedTrackIds))}
                                disabled={selectedTrackIds.size === 0}
                                className="text-xs font-medium text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                                <Trash2 className="w-3 h-3"/> 삭제 ({selectedTrackIds.size})
                            </button>
                            <button 
                                onClick={() => { setIsSelectionMode(false); setSelectedTrackIds(new Set()); }}
                                className="text-xs font-medium text-gray-600 hover:bg-gray-200 px-3 py-1.5 rounded-md"
                            >
                                취소
                            </button>
                        </>
                    ) : (
                        <button 
                            onClick={() => setIsSelectionMode(true)}
                            disabled={playlist.length === 0}
                            className="text-xs text-gray-600 hover:text-indigo-600 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100"
                        >
                            <CheckSquare className="h-4 w-4" /> 선택 삭제
                        </button>
                    )}
                </div>
            </div>

            <section>
                {playlist.length === 0 ? (
                    <div className="text-center p-10 border-2 border-dashed border-gray-300 rounded-xl mt-8 bg-white">
                        <Music className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-500">아직 생성된 음악이 없습니다.</p>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {playlist.map((track) => (
                            <Fragment key={track.id}>
                                <li
                                    className={`p-4 bg-white border border-gray-200 rounded-lg shadow-sm transition-all flex items-center justify-between cursor-pointer relative
                                        ${expandedTrackId === track.id ? 'border-indigo-300 shadow-md' : 'hover:bg-gray-50'}
                                        ${isSelectionMode ? 'pl-12' : ''} 
                                    `}
                                    onClick={() => !isSelectionMode && handleToggleDetails(track.id)}
                                >
                                    {/* 💡 [추가] 선택 모드일 때 체크박스 */}
                                    {isSelectionMode && (
                                        <div 
                                            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 cursor-pointer z-10"
                                            onClick={(e) => { e.stopPropagation(); toggleSelect(track.id); }}
                                        >
                                            {selectedTrackIds.has(track.id) ? (
                                                <CheckSquare className="w-5 h-5 text-indigo-600 fill-indigo-50"/>
                                            ) : (
                                                <Square className="w-5 h-5 text-gray-400"/>
                                            )}
                                        </div>
                                    )}

                                    {/* 왼쪽: 아이콘 + 제목 */}
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={`flex-shrink-0 p-3 rounded-full ${currentTrackId === track.id ? 'bg-indigo-600' : 'bg-indigo-100'}`}>
                                            <Music className={`w-5 h-5 ${currentTrackId === track.id ? 'text-white' : 'text-indigo-600'}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            {editingTrackId === track.id ? (
                                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                    <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="border p-1 rounded text-sm w-full" autoFocus />
                                                    <button onClick={saveTitle} className="text-green-600 hover:bg-green-100 p-1 rounded"><Check className="w-4 h-4" /></button>
                                                    <button onClick={(e) => { e.stopPropagation(); setEditingTrackId(null) }} className="text-red-600 hover:bg-red-100 p-1 rounded"><X className="w-4 h-4" /></button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 group">
                                                    <p className="font-medium text-gray-900 truncate">{getDynamicTitle(track)}</p>
                                                    {!isSelectionMode && (
                                                        <button onClick={(e) => { e.stopPropagation(); startEditing(track) }} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-indigo-600 transition-opacity">
                                                            <Edit2 className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                                                <span>{new Date(track.created_at).toLocaleDateString()}</span>
                                                <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                                <span>{track.initiator_type === 'therapist' ? '처방됨' : '자가진행'}</span>
                                            </p>
                                        </div>
                                    </div>

                                    {/* 오른쪽: 컨트롤 버튼들 (선택 모드가 아닐 때만 표시) */}
                                    {!isSelectionMode && (
                                        <div className="flex items-center gap-3">
                                            <button onClick={(e) => handleToggleFavorite(e, track.id)} className={`p-2 rounded-full ${track.is_favorite ? 'text-pink-500 bg-pink-50' : 'text-gray-400 hover:bg-gray-100'}`}>
                                                <Heart className={`h-5 w-5 ${track.is_favorite ? 'fill-current' : ''}`} />
                                            </button>
                                            
                                            <button onClick={(e) => handlePlay(e, track)} className={`p-2.5 rounded-full ${isPlaying && currentTrack?.id === track.id ? 'bg-red-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                                                {isPlaying && currentTrack?.id === track.id ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                                            </button>

                                            <button onClick={(e) => { e.stopPropagation(); handleDelete([track.id]); }} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
                                                <Trash2 className="w-5 h-5"/>
                                            </button>

                                            <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${expandedTrackId === track.id ? 'rotate-180' : ''}`} />
                                        </div>
                                    )}
                                </li>

                                {/* 상세 정보 패널 (선택 모드가 아닐 때만 표시 가능) */}
                                {!isSelectionMode && expandedTrackId === track.id && (
                                    <div className="border-t border-gray-100 bg-gray-50/50 p-5 animate-in slide-in-from-top-2 duration-200 rounded-b-lg mb-3 -mt-2">
                                        {detailLoadingId === String(track.id) ? (
                                            <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-indigo-400"/></div>
                                        ) : !trackDetail ? (
                                            <div className="text-center text-red-500 text-sm">정보를 불러오지 못했습니다.</div>
                                        ) : (
                                            <div className="space-y-5">
                                                {/* 플레이어 */}
                                                {(currentTrack?.id === track.id || !currentTrack) && (
                                                    <div className="p-4 bg-gray-100 rounded-lg border">
                                                        <div className="flex items-center gap-4">
                                                            <span className="text-xs font-mono text-gray-600">{formatTime(currentTime)}</span>
                                                            <input type="range" min="0" max={duration || 0} value={currentTime} onChange={(e) => { const t = Number(e.target.value); setCurrentTime(t); if (audioRef.current) audioRef.current.currentTime = t; }} className="flex-1 h-1.5 bg-gray-300 rounded-full appearance-none cursor-pointer accent-indigo-600" />
                                                            <span className="text-xs font-mono text-gray-600">{formatTime(duration)}</span>
                                                        </div>
                                                        <div className="flex items-center justify-center gap-4 mt-3">
                                                            <button onClick={() => { const v = volume > 0 ? 0 : 1; setVolume(v); if (audioRef.current) audioRef.current.volume = v; }}>
                                                                {volume === 0 ? <VolumeX className="w-5 h-5 text-gray-500" /> : <Volume1 className="w-5 h-5 text-gray-500" />}
                                                            </button>
                                                            <input type="range" min="0" max="1" step="0.1" value={volume} onChange={(e) => { const v = Number(e.target.value); setVolume(v); if (audioRef.current) audioRef.current.volume = v; }} className="w-20 h-1.5 bg-gray-300 rounded-full appearance-none cursor-pointer accent-indigo-600" />
                                                            <button onClick={() => { const l = !isLooping; setIsLooping(l); if (audioRef.current) audioRef.current.loop = l; }} className={`p-2 rounded-full ${isLooping ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500'}`}>
                                                                <RefreshCcw className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                                {trackDetail.lyrics && (
                                                    <div>
                                                        <h4 className="font-semibold text-gray-800 flex items-center"><FileText className="w-4 h-4 mr-2 text-indigo-600" />가사</h4>
                                                        <pre className="mt-2 p-3 bg-gray-50 rounded-md text-sm text-gray-600 whitespace-pre-wrap font-sans border">{trackDetail.lyrics}</pre>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Fragment>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}