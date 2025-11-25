'use client';

import React, { useState, useEffect, useRef, Fragment } from 'react';
import { useRouter } from 'next/navigation';
// 💡 1. [수정] 'Palette' (컬러테라피) 아이콘 import 제거
import {
    Play, Pause, Music, Trash2, ArrowLeft, Volume2, Loader2, FileText, MessageSquare, ChevronDown, User, AlertTriangle, Heart,
    Volume1, VolumeX, RefreshCcw, Edit2, Check, X, Share2
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
                <button
                    onClick={() => router.push('/dashboard/patient')} // 👈 대시보드로 돌아가기
                    className="text-indigo-600 hover:text-indigo-800 flex items-center transition-colors text-sm"
                >
                    <ArrowLeft className="h-4 w-4 mr-1" /> 대시보드로 돌아가기
                </button>
                <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                    <Volume2 className="h-6 w-6 mr-2 text-indigo-600" /> 나의 AI 음악
                </h1>
            </header>

            <div className="flex justify-between items-center mb-6 px-1">
                <p className="text-sm text-gray-600">총 {playlist.length} 곡</p>
                <div className="flex items-center gap-3">
                    {/* (추가 생성하기 버튼은 '상담' 또는 '작곡체험'으로 가야 하므로, 
                       환자 대시보드의 '새 상담' 버튼으로 유도하는 것이 더 명확할 수 있습니다.)
                    */}
                    <button
                        onClick={() => router.push('/intake/patient')} // 👈 새 상담(접수) 페이지로
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-md text-xs hover:bg-blue-600 transition-colors shadow-sm font-medium"
                    >
                        <Music className="w-4 h-4" />
                        새 음악 생성하기
                    </button>
                    <button
                        onClick={handleClear}
                        disabled={playlist.length === 0}
                        className="text-xs text-red-500 hover:text-red-700 transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Trash2 className="h-3 w-3 mr-1" /> 전체 삭제
                    </button>
                </div>
            </div>

            <section>
                {playlist.length === 0 ? (
                    <div className="text-center p-10 border-2 border-dashed border-gray-300 rounded-xl mt-8 bg-white">
                        <Music className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-500">아직 생성된 음악이 없습니다.</p>
                        <p className="text-sm text-gray-400 mt-1">새 음악 생성하기를 통해 나만의 음악을 만들어보세요!</p>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {playlist.map((track) => (
                            <Fragment key={track.id}>
                                <li
                                    className={`p-4 bg-white border border-gray-200 rounded-lg shadow-sm transition-all flex items-center justify-between cursor-pointer ${expandedTrackId === track.id ? 'border-indigo-300 shadow-md' : 'hover:bg-gray-50 hover:shadow-md'
                                        }`}
                                    onClick={() => handleToggleDetails(track.id)}
                                >
                                    {/* (왼쪽: 아이콘 + 제목) */}
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={`flex-shrink-0 p-3 rounded-full ${currentTrackId === track.id ? 'bg-indigo-600' : 'bg-indigo-100'
                                            } ${expandedTrackId === track.id ? 'bg-indigo-600' : ''}`}>
                                            <Music className={`w-5 h-5 ${currentTrackId === track.id ? 'text-white' : 'text-indigo-600'
                                                } ${expandedTrackId === track.id ? 'text-white' : ''}`} />
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
                                                    <button onClick={(e) => { e.stopPropagation(); startEditing(track) }} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-indigo-600 transition-opacity">
                                                        <Edit2 className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}

                                            <p className="text-xs text-gray-500 mt-1">
                                                {new Date(track.created_at).toLocaleString('ko-KR', {
                                                    year: 'numeric', month: 'long', day: 'numeric'
                                                })}
                                            </p>
                                        </div>
                                    </div>

                                    {/* (오른쪽: 버튼 영역) */}
                                    <div className="flex-shrink-0 flex items-center gap-2 ml-4">
                                        <button
                                            onClick={(e) => handleToggleFavorite(e, track.id)}
                                            className={`p-3 rounded-full transition-colors group ${track.is_favorite ? 'text-pink-500 bg-pink-100 hover:bg-pink-200' : 'text-gray-400 bg-gray-100 hover:bg-gray-200'
                                                }`}
                                            aria-label={track.is_favorite ? '즐겨찾기 해제' : '즐겨찾기'}
                                        >
                                            <Heart className={`h-5 w-5 ${track.is_favorite ? 'fill-pink-500' : 'fill-transparent group-hover:text-pink-500'
                                                }`} />
                                        </button>
                                        {/* 재생/일시정지 버튼 */}
                                        <button
                                            onClick={(e) => handlePlay(e, track)}
                                            className={`p-3 rounded-full transition-colors shadow-sm ${(isPlaying && currentTrack?.id === track.id) ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-700'
                                                } text-white`}
                                            aria-label={(isPlaying && currentTrack?.id === track.id) ? '일시정지' : '재생'}
                                        >
                                            {/* 💡 [핵심 수정] Pause 아이콘 사용 */}
                                            {(isPlaying && currentTrack?.id === track.id) ? <Pause className="h-5 w-5 fill-white" /> : <Play className="h-5 w-5 fill-white pl-0.5" />}
                                        </button>

                                        {/* 펼치기/접기 아이콘 */}
                                        <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${expandedTrackId === track.id ? 'rotate-180' : ''}`} />
                                    </div>
                                </li>

                                {/* 상세 정보 패널 (펼쳐졌을 때) */}
                                {expandedTrackId === track.id && (
                                    <div className="border border-t-0 rounded-b-lg p-6 bg-white shadow-inner mb-3 -mt-2 animate-in fade-in duration-200">
                                        {/* 상세 정보 로딩 중 */}
                                        {detailLoadingId === track.id && (
                                            <div className="flex justify-center items-center p-4">
                                                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                                                <span className="ml-2 text-gray-500">상세 정보 로딩 중...</span>
                                            </div>
                                        )}
                                        {/* 상세 정보 로드 완료 */}
                                        {trackDetail && trackDetail.id === track.id && (
                                            <div className="space-y-5">

                                                {/* 💡 고급 오디오 플레이어 */}
                                                {/* 💡 [수정] 현재 트랙이 아니더라도, 상세정보가 열린 트랙이면 플레이어 표시 */}
                                                {(currentTrack?.id === track.id || !currentTrack) && (
                                                    <div className="p-4 bg-gray-100 rounded-lg border">
                                                        <div className="flex items-center gap-4">
                                                            <span className="text-xs font-mono text-gray-600">{formatTime(currentTime)}</span>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max={duration || 0}
                                                                value={currentTime}
                                                                onChange={(e) => {
                                                                    const time = Number(e.target.value);
                                                                    setCurrentTime(time);
                                                                    if (audioRef.current) audioRef.current.currentTime = time;
                                                                }}
                                                                className="flex-1 h-1.5 bg-gray-300 rounded-full appearance-none cursor-pointer accent-indigo-600"
                                                            />
                                                            <span className="text-xs font-mono text-gray-600">{formatTime(duration)}</span>
                                                        </div>
                                                        <div className="flex items-center justify-center gap-4 mt-3">
                                                            <button
                                                                onClick={() => {
                                                                    const newVol = volume > 0 ? 0 : 1;
                                                                    setVolume(newVol);
                                                                    if (audioRef.current) audioRef.current.volume = newVol;
                                                                }}
                                                                className="text-gray-500 hover:text-indigo-600"
                                                                aria-label={volume > 0 ? "음소거" : "음소거 해제"}
                                                            >
                                                                {volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume1 className="w-5 h-5" />}
                                                            </button>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="1"
                                                                step="0.1"
                                                                value={volume}
                                                                onChange={(e) => {
                                                                    const newVol = Number(e.target.value);
                                                                    setVolume(newVol);
                                                                    if (audioRef.current) audioRef.current.volume = newVol;
                                                                }}
                                                                className="w-20 h-1.5 bg-gray-300 rounded-full appearance-none cursor-pointer accent-indigo-600"
                                                            />
                                                            <button
                                                                onClick={() => {
                                                                    const newLoop = !isLooping;
                                                                    setIsLooping(newLoop);
                                                                    if (audioRef.current) audioRef.current.loop = newLoop;
                                                                }}
                                                                className={`p-2 rounded-full ${isLooping ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-200'}`}
                                                                aria-label="반복 재생"
                                                            >
                                                                <RefreshCcw className={`w-4 h-4`} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                                {/* (1) 가사 */}
                                                {trackDetail.lyrics && (
                                                    <div>
                                                        <h4 className="font-semibold text-gray-800 flex items-center"><FileText className="w-4 h-4 mr-2 text-indigo-600" />생성된 가사</h4>
                                                        <pre className="mt-2 p-3 bg-gray-50 rounded-md text-sm text-gray-600 whitespace-pre-wrap font-sans overflow-y-auto max-h-40 border">
                                                            {trackDetail.lyrics}
                                                        </pre>
                                                    </div>
                                                )}

                                                {/* (2) 접수 기록 */}
                                                {trackDetail.intake_data && (
                                                    <div>
                                                        <h4 className="font-semibold text-gray-800 flex items-center"><User className="w-4 h-4 mr-2 text-green-600" />당시 접수 내용 (목표)</h4>
                                                        <p className="mt-2 p-3 bg-gray-50 rounded-md text-sm text-gray-600 italic border">
                                                            {trackDetail.intake_data.goal_text || '기록 없음'}
                                                        </p>
                                                    </div>
                                                )}

                                                {/* (3) 채팅 요약 */}
                                                {trackDetail.chat_history && trackDetail.chat_history.length > 0 && (
                                                    <div>
                                                        <h4 className="font-semibold text-gray-800 flex items-center"><MessageSquare className="w-4 h-4 mr-2 text-blue-500" />관련 대화</h4>
                                                        {/* 💡 [수정] .slice(-4) 제거 (전체 스크롤) */}
                                                        <div className="mt-2 space-y-2 p-3 bg-gray-50 rounded-md max-h-48 overflow-y-auto border">
                                                            {trackDetail.chat_history.map(msg => (
                                                                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                                    <div className={`p-2 rounded-lg text-sm max-w-[80%] ${msg.role === 'user' ? 'bg-blue-100 text-blue-900' : 'bg-gray-200 text-gray-800'
                                                                        }`}>
                                                                        <p className="whitespace-pre-wrap">{msg.content}</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
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