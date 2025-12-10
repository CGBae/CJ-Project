'use client';

import React, { useState, useEffect, useRef, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import {
    Play, Pause, Music, Trash2, ArrowLeft, Volume2, Loader2, FileText,
    MessageSquare, ChevronDown, User, AlertTriangle, Heart,
    Volume1, VolumeX, RefreshCcw, Edit2, Check, X, CheckSquare, Square,
    Brain, Share2 // 💡 아이콘 추가
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

// --- 타입 정의 ---
interface MusicTrackInfo {
    id: number | string;
    title: string;
    prompt: string;
    audioUrl: string;
    track_url?: string;
    created_at: string;
    is_favorite: boolean;
    session_id: number;
    initiator_type: string | null;
    has_dialog: boolean | null;
}

interface ChatMessage {
    id: number | string;
    role: 'user' | 'assistant';
    content: string;
}

// 💡 [수정] Intake 데이터 구조 보강
interface PatientIntakeVas {
    anxiety: number;
    depression: number;
    pain: number;
}
interface PatientIntakePrefs {
    genres: string[];
    contraindications: string[];
    lyrics_allowed: boolean;
}
interface SimpleIntakeData {
    goal_text: string | null;
    vas?: PatientIntakeVas | null;
    prefs?: PatientIntakePrefs | null;
}

interface MusicTrackDetail extends MusicTrackInfo {
    lyrics: string | null;
    intake_data: SimpleIntakeData | null;
    chat_history: ChatMessage[];
}

// 헬퍼 함수들
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

// 한글 변환 헬퍼
const TRANSLATIONS: Record<string, string> = {
    calming: '차분한', uplifting: '기분 좋아지는', energetic: '활기찬',
    Piano: '피아노', 'Acoustic Guitar': '통기타', Violin: '바이올린',
    'Music Box': '오르골', Flute: '플룻', 'Nature Sounds': '자연의 소리',
    // ... 필요한 만큼 추가
};
const t = (key: string | null | undefined) => {
    if (!key) return '-';
    return TRANSLATIONS[key] || key;
};

function getApiUrl() {
    if (process.env.INTERNAL_API_URL) return process.env.INTERNAL_API_URL;
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    return 'http://backend:8000';
}
const API_URL = getApiUrl();


// === 메인 컴포넌트 ===
export default function MusicPlaylistPage() {
    const router = useRouter();
    const { isAuthed } = useAuth();

    const [playlist, setPlaylist] = useState<MusicTrackInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);


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
    const metaAudioRef = useRef<HTMLAudioElement | null>(null);
    const [panelTrack, setPanelTrack] = useState<MusicTrackDetail | null>(null);


    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number | string>>(new Set());
    useEffect(() => {
        if (!metaAudioRef.current) {
            metaAudioRef.current = new Audio();
            metaAudioRef.current.preload = 'metadata';
        }
    }, []);
    useEffect(() => {
        if (typeof window !== "undefined" && !audioRef.current) {
            const audio = new Audio();
            audio.onended = () => {
                if (!audio.loop) {
                    setIsPlaying(false);
                    setCurrentTrack(null);
                    setCurrentTime(0);
                }
            };
            audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
            audio.onloadedmetadata = () => setDuration(audio.duration);
            audio.onplay = () => setIsPlaying(true);
            audio.onpause = () => setIsPlaying(false);
            audioRef.current = audio;
        }

        const fetchPlaylist = async () => {
            setLoading(true);
            setError(null);
            const token = localStorage.getItem('accessToken');
            if (!token) {
                setError("로그인이 필요합니다.");
                setLoading(false);
                router.push('/login?next=/music');
                return;
            }

            try {
                const response = await fetch(`${API_URL}/music/my`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.status === 401) throw new Error('인증 실패');
                if (!response.ok) throw new Error('음악 목록 로딩 실패');

                const musicData: MusicTrackInfo[] = await response.json();
                const mappedMusicData = musicData.map(track => {
                    const raw = track.track_url || track.audioUrl || '';

                    // 절대 URL이 아니면 API_URL을 붙여서 백엔드로 보내기
                    const fullAudioUrl = raw
                        ? (raw.startsWith('http') ? raw : `${API_URL}${raw}`)
                        : '';

                    return {
                        ...track,
                        audioUrl: fullAudioUrl,
                    };
                });
                setPlaylist(mappedMusicData);

            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : "오류 발생";
                setError(errorMessage);
                if (errorMessage.includes('인증 실패')) {
                    localStorage.removeItem('accessToken');
                    router.push('/login?next=/music');
                }
            } finally {
                setLoading(false);
            }
        };

        if (isAuthed) fetchPlaylist();

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, [router, isAuthed]);

    // --- 기능 핸들러들 ---
    const handleDelete = async (idsToDelete: (number | string)[]) => {
        if (!confirm(idsToDelete.length > 1 ? `선택한 ${idsToDelete.length}곡을 삭제하시겠습니까?` : "정말 삭제하시겠습니까?")) return;
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        try {
            await Promise.all(idsToDelete.map(id =>
                fetch(`${API_URL}/music/track/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ));
            setPlaylist(prev => prev.filter(t => !idsToDelete.includes(t.id)));
            setSelectedTrackIds(new Set());
            if (idsToDelete.length > 1) setIsSelectionMode(false);
            alert("삭제되었습니다.");
        } catch (e) { alert("삭제 중 오류가 발생했습니다."); }
    };

    const toggleSelect = (id: number | string) => {
        const newSet = new Set(selectedTrackIds);
        if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
        setSelectedTrackIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedTrackIds.size === playlist.length) setSelectedTrackIds(new Set());
        else setSelectedTrackIds(new Set(playlist.map(t => t.id)));
    };

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
                setPlaylist(prev => prev.map(t => t.id === editingTrackId ? { ...t, title: editTitle } : t));
                setEditingTrackId(null);
            } else { alert("수정 실패"); }
        } catch (e) { alert("오류 발생"); }
    };

    const handlePlay = async (e: React.MouseEvent, track: MusicTrackInfo) => {
        e.stopPropagation();
        const audio = audioRef.current;
        if (!audio) return;

        // ✅ 같은 곡이면 토글
        if (currentTrack?.id === track.id) {
            if (isPlaying) audio.pause();
            else await audio.play();
            return;
        }

        try {
            audio.pause();
            audio.src = track.audioUrl;
            setCurrentTrack(track);   // ✅ 여기서만 currentTrack 변경
            setCurrentTime(0);
            await audio.play();
        } catch (err) {
            console.error(err);
            setCurrentTrack(null);
        }
    };


    const handleToggleFavorite = async (e: React.MouseEvent, trackId: number | string) => {
        e.stopPropagation();
        const token = localStorage.getItem('accessToken');
        if (!token) return setError("로그인이 필요합니다.");

        const updateState = (list: MusicTrackInfo[]) =>
            list.map(t => t.id === trackId ? { ...t, is_favorite: !t.is_favorite } : t);

        setPlaylist(updateState);
        if (trackDetail && trackDetail.id === trackId) {
            setTrackDetail(prev => prev ? ({ ...prev, is_favorite: !prev.is_favorite }) : null);
        }

        try {
            const response = await fetch(`${API_URL}/music/track/${trackId}/toggle-favorite`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error();
        } catch (err) {
            setPlaylist(updateState); // 롤백
        }
    };
    const normalizeAudioUrl = (url: string) =>
        url.startsWith('http') ? url : `${API_URL}${url}`;

    const handleToggleDetails = async (trackId: number | string) => {
        if (expandedTrackId === trackId) {
            setExpandedTrackId(null);
            setPanelTrack(null);
            return;
        }

        setDetailLoadingId(trackId);
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        try {
            const res = await fetch(`${API_URL}/music/track/${trackId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const detailData: MusicTrackDetail = await res.json();

            setPanelTrack(detailData);        // ✅ 여기
            setExpandedTrackId(trackId);

            // ✅ 길이만 미리 로드 (재생 ❌)
            if (metaAudioRef.current && detailData.audioUrl) {
                metaAudioRef.current.src = normalizeAudioUrl(detailData.audioUrl);
                metaAudioRef.current.load();
                metaAudioRef.current.onloadedmetadata = () => {
                    setDuration(metaAudioRef.current!.duration);
                };
            }

        } finally {
            setDetailLoadingId(null);
        }
    };






    if (loading) return (<div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>);
    if (error && playlist.length === 0) return (<div className="text-center p-10 text-red-500">{error}</div>);

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

            <div className="flex justify-between items-center mb-6 px-1 h-10">
                <p className="text-sm text-gray-600">총 {playlist.length} 곡</p>
                <div className="flex items-center gap-2">
                    {isSelectionMode ? (
                        <>
                            <button onClick={toggleSelectAll} className="text-xs font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 bg-white border rounded-md">
                                {selectedTrackIds.size === playlist.length ? '선택 해제' : '전체 선택'}
                            </button>
                            <button onClick={() => handleDelete(Array.from(selectedTrackIds))} disabled={selectedTrackIds.size === 0} className="text-xs font-medium text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-md disabled:bg-gray-300 flex items-center gap-1">
                                <Trash2 className="w-3 h-3" /> 삭제 ({selectedTrackIds.size})
                            </button>
                            <button onClick={() => { setIsSelectionMode(false); setSelectedTrackIds(new Set()); }} className="text-xs font-medium text-gray-600 hover:bg-gray-200 px-3 py-1.5 rounded-md">
                                취소
                            </button>
                        </>
                    ) : (
                        <button onClick={() => setIsSelectionMode(true)} disabled={playlist.length === 0} className="text-xs text-gray-600 hover:text-indigo-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100">
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
                                    {isSelectionMode && (
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 p-2 cursor-pointer z-10" onClick={(e) => { e.stopPropagation(); toggleSelect(track.id); }}>
                                            {selectedTrackIds.has(track.id) ? <CheckSquare className="w-5 h-5 text-indigo-600 fill-indigo-50" /> : <Square className="w-5 h-5 text-gray-400" />}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={`flex-shrink-0 p-3 rounded-full ${currentTrack?.id === track.id ? 'bg-indigo-600' : 'bg-indigo-100'
                                            }`}>
                                            <Music className={`w-5 h-5 ${currentTrack?.id === track.id ? 'text-white' : 'text-indigo-600'
                                                }`} />
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

                                    {!isSelectionMode && (
                                        <div className="flex items-center gap-3">
                                            <button onClick={(e) => handleToggleFavorite(e, track.id)} className={`p-2 rounded-full ${track.is_favorite ? 'text-pink-500 bg-pink-50' : 'text-gray-400 hover:bg-gray-100'}`}>
                                                <Heart className={`h-5 w-5 ${track.is_favorite ? 'fill-current' : ''}`} />
                                            </button>
                                            <button
                                                onClick={(e) => handlePlay(e, track)}
                                                className={`p-2.5 rounded-full ${isPlaying && currentTrack?.id === track.id
                                                    ? 'bg-red-500 text-white'
                                                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                                    }`}
                                            >
                                                {isPlaying && currentTrack?.id === track.id ? (
                                                    <Pause className="h-4 w-4" />
                                                ) : (
                                                    <Play className="h-4 w-4 ml-0.5" />
                                                )}
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDelete([track.id]); }} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                            <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${expandedTrackId === track.id ? 'rotate-180' : ''}`} />
                                        </div>
                                    )}
                                </li>

                                {/* 💡 [핵심] 상세 정보 패널 (접수 내용 & 채팅 기록 복구) */}
                                {!isSelectionMode && expandedTrackId === track.id && (
                                    <div className="border-t border-gray-100 bg-gray-50/50 p-5 animate-in slide-in-from-top-2 duration-200 rounded-b-lg mb-3 -mt-2">
                                        {detailLoadingId === String(track.id) ? (
                                            <div className="flex justify-center py-4">
                                                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                                            </div>
                                        ) : !panelTrack ? (
                                            <div className="text-center text-red-500 text-sm">
                                                정보를 불러오지 못했습니다.
                                            </div>
                                        ) : (
                                            <div className="space-y-5">
                                                {/* 플레이어 (기존 유지) */}
                                                {currentTrack && currentTrack.id === track.id && (
                                                    <div className="p-4 bg-gray-100 rounded-lg border">
                                                        {/* 타임라인 */}
                                                        <div className="flex items-center gap-4">
                                                            <span className="text-xs font-mono text-gray-600">
                                                                {formatTime(currentTime)}
                                                            </span>

                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max={duration || 0}
                                                                value={currentTime}
                                                                onChange={(e) => {
                                                                    const t = Number(e.target.value);
                                                                    setCurrentTime(t);
                                                                    if (audioRef.current) audioRef.current.currentTime = t;
                                                                }}
                                                                className="flex-1 h-1.5 bg-gray-300 rounded-full appearance-none cursor-pointer accent-indigo-600"
                                                            />

                                                            <span className="text-xs font-mono text-gray-600">
                                                                {formatTime(duration)}
                                                            </span>
                                                        </div>

                                                        {/* 컨트롤 */}
                                                        <div className="flex items-center justify-center gap-4 mt-3">
                                                            {/* 재생 / 일시정지 */}
                                                            <button
                                                                onClick={() => {
                                                                    if (!audioRef.current) return;
                                                                    if (isPlaying) audioRef.current.pause();
                                                                    else audioRef.current.play();
                                                                }}
                                                                className="p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700"
                                                            >
                                                                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                                                            </button>

                                                            {/* 볼륨 */}
                                                            <button
                                                                onClick={() => {
                                                                    const v = volume > 0 ? 0 : 1;
                                                                    setVolume(v);
                                                                    if (audioRef.current) audioRef.current.volume = v;
                                                                }}
                                                            >
                                                                {volume === 0 ? (
                                                                    <VolumeX className="w-5 h-5 text-gray-600" />
                                                                ) : (
                                                                    <Volume1 className="w-5 h-5 text-gray-600" />
                                                                )}
                                                            </button>

                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="1"
                                                                step="0.1"
                                                                value={volume}
                                                                onChange={(e) => {
                                                                    const v = Number(e.target.value);
                                                                    setVolume(v);
                                                                    if (audioRef.current) audioRef.current.volume = v;
                                                                }}
                                                                className="w-20 h-1.5 bg-gray-300 rounded-full appearance-none cursor-pointer accent-indigo-600"
                                                            />

                                                            {/* 루프 */}
                                                            <button
                                                                onClick={() => {
                                                                    const l = !isLooping;
                                                                    setIsLooping(l);
                                                                    if (audioRef.current) audioRef.current.loop = l;
                                                                }}
                                                                className={`p-2 rounded-full ${isLooping ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500'
                                                                    }`}
                                                            >
                                                                <RefreshCcw className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}


                                                {/* 💡 (1) 접수 내용 (AI 상담) 복구 */}
                                                {panelTrack.intake_data && <PatientIntakeView intake={panelTrack.intake_data} />}

                                                {/* (2) 가사 */}
                                                {panelTrack.lyrics && (
                                                    <div>
                                                        <h4 className="font-semibold text-gray-800 flex items-center"><FileText className="w-4 h-4 mr-2 text-indigo-600" />가사</h4>
                                                        <pre className="mt-2 p-3 bg-gray-50 rounded-md text-sm text-gray-600 whitespace-pre-wrap font-sans border">{panelTrack.lyrics}</pre>
                                                    </div>
                                                )}

                                                {/* 💡 (3) 채팅 요약 복구 */}
                                                {panelTrack.chat_history && panelTrack.chat_history.length > 0 && <ChatHistoryView chatHistory={panelTrack.chat_history} />}
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

// ==================================================================
// 🧩 하위 컴포넌트 (상세 정보 뷰)
// ==================================================================

// 1. 환자 접수 내용 (AI 상담)
const PatientIntakeView: React.FC<{ intake: SimpleIntakeData }> = ({ intake }) => {
    const vas = intake?.vas;
    const prefs = intake?.prefs;

    const getVasColor = (score: number) => {
        if (score <= 3) return 'bg-green-500';
        if (score <= 7) return 'bg-yellow-400';
        return 'bg-red-500';
    };

    return (
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <h4 className="font-bold text-gray-800 flex items-center mb-4">
                <Brain className="w-5 h-5 mr-2 text-indigo-500" />
                환자 자가 진단 (AI 상담)
            </h4>

            <div className="mb-6">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">상담 목표</span>
                <div className="mt-1.5 p-3 bg-indigo-50 rounded-lg text-sm text-indigo-900 font-medium">
                    {intake.goal_text || '기록 없음'}
                </div>
            </div>

            {vas && (
                <div className="mb-6">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">현재 상태 (VAS)</span>
                    <div className="grid grid-cols-3 gap-4 mt-2">
                        {[
                            { label: '불안', val: vas.anxiety },
                            { label: '우울', val: vas.depression },
                            { label: '통증', val: vas.pain }
                        ].map((item) => (
                            <div key={item.label} className="text-center">
                                <div className="text-xs text-gray-500 mb-1">{item.label}</div>
                                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                    <div className={`h-full ${getVasColor(item.val)}`} style={{ width: `${item.val * 10}%` }}></div>
                                </div>
                                <div className="text-sm font-bold text-gray-800 mt-1">{item.val}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {prefs && (
                <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">음악 선호도</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {prefs.genres?.map(g => <span key={g} className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded-md font-medium">👍 {t(g)}</span>)}
                        {prefs.contraindications?.map(g => <span key={g} className="px-2 py-1 bg-red-50 text-red-700 text-xs rounded-md font-medium">🚫 {t(g)}</span>)}
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">
                            🎤 {prefs.lyrics_allowed ? '보컬 포함' : '연주곡만'}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

// 2. 채팅 내역
const ChatHistoryView: React.FC<{ chatHistory: ChatMessage[] }> = ({ chatHistory }) => {
    return (
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <h4 className="font-bold text-gray-800 flex items-center mb-4"><MessageSquare className="w-5 h-5 mr-2 text-blue-500" />상담 대화 기록</h4>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {chatHistory.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                            ? 'bg-indigo-600 text-white rounded-tr-none shadow-md'
                            : 'bg-gray-100 text-gray-800 rounded-tl-none'
                            }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};