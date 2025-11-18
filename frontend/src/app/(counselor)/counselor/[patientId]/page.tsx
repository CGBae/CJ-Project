'use client';

// 💡 1. [핵심 수정] 필요한 모든 React 훅과 아이콘을 import
import React, { useState, useEffect, useRef, FormEvent, useCallback, Fragment } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
    Play, Pause, // 👈 [추가] Pause 아이콘 (handlePlay 오류 수정용)
    ArrowLeft, Volume2, Loader2, User, MessageSquare, Music,
    AlertTriangle, ChevronDown, Plus, ClipboardList, Send, Trash2, XCircle, Info
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

// 💡 2. 백엔드 API 응답 타입 정의
interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}
interface SessionInfo {
    id: number;
    created_at: string;
    initiator_type: string | null;
    has_dialog: boolean | null;
}
interface MusicTrackInfo {
    id: number | string;
    title: string;
    prompt: string;
    audioUrl: string; // schemas.py의 'audioUrl' 필드
    track_url?: string;
    created_at: string; // 👈 날짜
    session_id: number;
    initiator_type: string | null;
    has_dialog: boolean | null;
    is_favorite: boolean; // 👈 (환자 페이지와 타입 동기화)
}
interface PatientProfile {
    id: number | string;
    name: string | null;
    age: number | null; // 👈 age 필드
    email: string | null;
    role: string;
    social_provider: string | null; // 👈 [추가] 카카오 여부
}
interface CounselorNote {
    id: number;
    patient_id: number;
    therapist_id: number;
    content: string;
    created_at: string;
    updated_at: string;
}

// 💡 3. 헬퍼 함수: 동적 제목 (세션 ID/번호 제거)
const getDynamicTitle = (track: MusicTrackInfo): string => {
    if (track.title && !track.title.includes("AI 생성 트랙")) {
        // 백엔드 title이 "상담사 처방 음악 (세션 123)" 형태일 수 있으므로 (세션) 부분 제거
        return track.title.split(' (')[0];
    }
    // (폴백)
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

// 💡 4. 헬퍼 함수: 메모 시간 포맷
const formatMemoTime = (dateString: string): string => {
    return new Date(dateString).toLocaleString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

// 💡 5. 헬퍼 함수: 환자 식별자 (카카오/이메일)
const getPatientIdentifier = (patient: PatientProfile | null) => {
    if (!patient) return '';
    if (patient.email) {
        return patient.email;
    }
    if (patient.social_provider === 'kakao') {
        return <span className="italic text-yellow-600">카카오 로그인 환자</span>;
    }
    return '정보 없음';
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

export default function PatientDetailPage() {
    const router = useRouter();
    const params = useParams();
    const patientId = params.patientId as string;
    const { isAuthed } = useAuth();

    // --- State 정의 ---
    const [patient, setPatient] = useState<PatientProfile | null>(null);
    const [sessions, setSessions] = useState<SessionInfo[]>([]);
    const [music, setMusic] = useState<MusicTrackInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [currentTrackId, setCurrentTrackId] = useState<string | number | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // 💡 6. [핵심 수정] 탭 상태에 'memos' 추가
    const [activeTab, setActiveTab] = useState<'music' | 'logs' | 'memos'>('music');

    const [chatLogs, setChatLogs] = useState<Record<number, ChatMessage[]>>({});
    const [logLoading, setLogLoading] = useState<number | null>(null);

    // 💡 7. [추가] 메모 탭 상태
    const [memos, setMemos] = useState<CounselorNote[]>([]);
    const [newMemoContent, setNewMemoContent] = useState("");
    const [isMemoLoading, setIsMemoLoading] = useState(false);
    const [memoError, setMemoError] = useState<string | null>(null);

    const API_URL = getApiUrl();

    // 💡 8. [수정] useEffect (API 3개 호출)
    useEffect(() => {
        if (typeof window !== "undefined" && !audioRef.current) {
            const audio = new Audio();
            // 💡 [수정] 재생 종료 시 (루프가 아닐 때)
            audio.onended = () => {
                if (audioRef.current && !audioRef.current.loop) {
                    setCurrentTrackId(null);
                }
            };
            audioRef.current = audio;
        }

        if (!isAuthed) {
            if (!localStorage.getItem('accessToken')) {
                router.push('/login?next=/counselor');
            }
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            const token = localStorage.getItem('accessToken');
            if (!token) {
                setError("인증 토큰이 없습니다.");
                setLoading(false);
                return;
            }

            try {
                // (API 호출 - 변경 없음)
                const [profileRes, sessionsRes, musicRes] = await Promise.all([
                    fetch(`${API_URL}/therapist/patient/${patientId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch(`${API_URL}/therapist/patient/${patientId}/sessions`, { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch(`${API_URL}/therapist/patient/${patientId}/music`, { headers: { 'Authorization': `Bearer ${token}` } })
                ]);

                // (에러 처리 - 변경 없음)
                if (profileRes.status === 401 || sessionsRes.status === 401 || musicRes.status === 401) throw new Error('인증 실패. 다시 로그인해주세요.');
                if (profileRes.status === 403 || sessionsRes.status === 403 || musicRes.status === 403) throw new Error('이 환자에 대한 접근 권한이 없습니다.');

                // (데이터 set)
                if (!profileRes.ok) throw new Error(`환자 정보 로딩 실패 (${profileRes.status})`);
                setPatient(await profileRes.json());

                if (!sessionsRes.ok) throw new Error(`상담 기록 로딩 실패 (${sessionsRes.status})`);
                setSessions(await sessionsRes.json());

                if (!musicRes.ok) throw new Error(`음악 목록 로딩 실패 (${musicRes.status})`);
                const musicData: MusicTrackInfo[] = await musicRes.json();
                setMusic(musicData.map(t => ({
                    ...t,
                    audioUrl: t.audioUrl || t.track_url || '',
                })));

            } catch (err: unknown) {
                // (catch 블록 - 변경 없음)
                const errorMessage = err instanceof Error ? err.message : '데이터 로딩 오류';
                setError(errorMessage);
                if (errorMessage.includes('인증 실패')) {
                    localStorage.removeItem('accessToken');
                    router.push('/login?next=/counselor');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        // (cleanup 함수 - 변경 없음)
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.onended = null;
                audioRef.current = null;
            }
        };
    }, [patientId, isAuthed, router]);

    // 💡 9. [수정] handlePlay (async/await 적용)
    const handlePlay = async (track: MusicTrackInfo) => {
        const audio = audioRef.current;
        if (!audio) return;
        if (currentTrackId === track.id) {
            audio.pause();
            setCurrentTrackId(null);
            return;
        }
        try {
            audio.pause();
            audio.src = track.audioUrl;
            setCurrentTrackId(track.id);

            await new Promise<void>((resolve, reject) => {
                audio.oncanplaythrough = () => resolve();
                audio.onerror = (err) => reject(new Error("오디오 로드 실패: " + String(err)));
                audio.load();
            });

            await audio.play();
        } catch (error: unknown) {
            console.error("Audio playback failed", error);
            setError(error instanceof Error ? error.message : `음악 재생/로드 실패: ${track.title}`);
            setCurrentTrackId(null);
        }
    };

    // --- (fetchChatLog - 변경 없음) ---
    const fetchChatLog = async (sessionId: number) => {
        if (chatLogs[sessionId]) {
            setChatLogs(prevLogs => {
                const newLogs = { ...prevLogs };
                delete newLogs[sessionId];
                return newLogs;
            });
            return;
        }
        setLogLoading(sessionId);
        setError(null);
        const token = localStorage.getItem('accessToken');
        if (!token) { setError("인증 토큰이 없습니다."); setLogLoading(null); return; }
        try {
            const response = await fetch(`${API_URL}/chat/history/${sessionId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.status === 401) throw new Error('인증 실패');
            if (response.status === 403) throw new Error('이 기록에 접근할 권한이 없습니다.');
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "채팅 기록 로딩 실패");
            }
            const data = await response.json();
            setChatLogs(prevLogs => ({
                ...prevLogs,
                [sessionId]: data.history.length > 0 ? data.history : [{ id: 'empty', role: 'assistant', content: '저장된 대화 기록이 없습니다.' }]
            }));
        } catch (error: unknown) {
            setError(error instanceof Error ? error.message : "알 수 없는 오류");
            if (error instanceof Error && (error.message.includes('인증 실패') || error.message.includes('401'))) {
                localStorage.removeItem('accessToken');
                router.push('/login?next=/counselor');
            }
        } finally {
            setLogLoading(null);
        }
    };

    // 💡 10. [핵심 추가] 메모 탭 관련 함수들

    // 메모 목록 불러오기
    const loadMemos = useCallback(async () => {
        if (!patientId) return;
        setIsMemoLoading(true);
        setMemoError(null);
        const token = localStorage.getItem('accessToken');
        if (!token) { setMemoError("인증 토큰이 없습니다."); setIsMemoLoading(false); return; }

        try {
            const response = await fetch(`${API_URL}/therapist/patient/${patientId}/notes`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('메모 목록 로딩 실패');
            const data: CounselorNote[] = await response.json();
            setMemos(data);
        } catch (err: unknown) {
            setMemoError(err instanceof Error ? err.message : "메모 로딩 오류");
        } finally {
            setIsMemoLoading(false);
        }
    }, [patientId]);

    // 메모 탭을 클릭할 때만 API 호출
    useEffect(() => {
        if (activeTab === 'memos') {
            loadMemos();
        }
    }, [activeTab, loadMemos]);

    // 새 메모 생성
    const handleCreateMemo = async (e: FormEvent) => {
        e.preventDefault();
        const content = newMemoContent.trim();
        if (!content || !patientId) return;

        setIsMemoLoading(true);
        setMemoError(null);
        const token = localStorage.getItem('accessToken');
        if (!token) { setMemoError("인증 토큰이 없습니다."); setIsMemoLoading(false); return; }

        try {
            const response = await fetch(`${API_URL}/therapist/patient/${patientId}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: content })
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "메모 생성 실패");
            }
            const newNote: CounselorNote = await response.json();
            setMemos([newNote, ...memos]);
            setNewMemoContent("");
        } catch (err: unknown) {
            setMemoError(err instanceof Error ? err.message : "메모 생성 오류");
        } finally {
            setIsMemoLoading(false);
        }
    };

    // 메모 삭제
    const handleDeleteMemo = async (noteId: number) => {
        if (!window.confirm("이 메모를 정말 삭제하시겠습니까?")) return;

        setIsMemoLoading(true);
        setMemoError(null);
        const token = localStorage.getItem('accessToken');
        if (!token) { setMemoError("인증 토큰이 없습니다."); setIsMemoLoading(false); return; }

        try {
            const response = await fetch(`${API_URL}/therapist/notes/${noteId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.status === 403) throw new Error('삭제 권한이 없습니다.');
            if (response.status === 404) throw new Error('메모를 찾을 수 없습니다.');
            if (!response.ok) throw new Error('메모 삭제 실패');

            setMemos(memos.filter(m => m.id !== noteId));
        } catch (err: unknown) {
            setMemoError(err instanceof Error ? err.message : "메모 삭제 오류");
        } finally {
            setIsMemoLoading(false);
        }
    };

    // --- 렌더링 로직 (생략 없음) ---

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col justify-center items-center h-screen text-center p-4">
                <AlertTriangle className="w-12 h-12 text-red-600 mb-4" />
                <h1 className="text-2xl font-bold mb-4 text-red-600">오류 발생</h1>
                <p className="text-gray-600 mb-6">{error}</p>
                <button onClick={() => router.push('/counselor')} className="text-indigo-600 hover:underline">
                    환자 목록으로 돌아가기
                </button>
            </div>
        );
    }

    if (!patient) {
        return (
            <div className="flex flex-col justify-center items-center h-screen text-center">
                <h1 className="text-2xl font-bold mb-4 text-gray-600">데이터 없음</h1>
                <p className="text-gray-600 mb-6">환자 정보를 찾을 수 없습니다. (ID: {patientId})</p>
                <button onClick={() => router.push('/counselor')} className="text-indigo-600 hover:underline">
                    환자 목록으로 돌아가기
                </button>
            </div>
        );
    }

    // 💡 11. [핵심] JSX 렌더링 (생략 없음)
    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 bg-gray-50 min-h-screen">
            <header className="flex justify-between items-center pb-4 border-b border-gray-200 mb-6">
                <button onClick={() => router.push('/counselor')} className="text-indigo-600 hover:text-indigo-800 flex items-center transition-colors text-sm font-medium">
                    <ArrowLeft className="h-4 w-4 mr-1" /> 모든 환자 목록
                </button>
            </header>

            {/* 환자 정보 섹션 */}
            <section className="bg-white p-6 border rounded-xl shadow-md mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border">
                        <User className="w-8 h-8 text-gray-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">
                            {patient.name || '이름 없음'}
                            {/* 💡 [추가] 나이 표시 */}
                            {patient.age && (
                                <span className="text-2xl font-medium text-gray-500 ml-2">({patient.age}세)</span>
                            )}
                        </h1>
                        <p className="text-md text-gray-500">
                            {/* 💡 [수정] 카카오 로그인 여부 표시 */}
                            {getPatientIdentifier(patient)}
                        </p>
                    </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="text-gray-600">총 상담 횟수:</div>
                    <div className="font-medium text-indigo-600">{sessions.length}회</div>
                    <div className="text-gray-600">생성된 음악:</div>
                    <div className="font-medium text-green-600">{music.length}곡</div>
                </div>
            </section>

            {/* 탭 메뉴 UI (메모 탭 추가) */}
            <div className="mb-6">
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab('music')}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'music' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            음악 목록 ({music.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('logs')}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'logs' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            상담 기록 ({sessions.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('memos')}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'memos' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            상담사 메모
                        </button>
                    </nav>
                </div>
            </div>

            {/* --- 음악 목록 탭 (UI 수정됨) --- */}
            {activeTab === 'music' && (
                <section>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-gray-800">생성된 음악</h2>
                        <button
                            onClick={() => router.push(`/intake/counselor?patientId=${patient.id}`)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 transition-colors shadow-sm font-medium"
                        >
                            <Plus className="w-4 h-4" /> 음악 처방하기
                        </button>
                    </div>
                    {music.length === 0 ? (
                        <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg bg-white mt-6">
                            <Music className="mx-auto h-12 w-12 text-gray-400" />
                            <h3 className="mt-2 text-sm font-semibold text-gray-900">생성된 음악 없음</h3>
                            <p className="mt-1 text-sm text-gray-500">아직 이 환자를 위해 생성된 음악이 없습니다.</p>
                        </div>
                    ) : (
                        <ul className="space-y-3">
                            {music.map((track) => (
                                <li
                                    key={track.id}
                                    className={`p-4 bg-white border border-gray-200 rounded-lg shadow-sm transition-all flex items-center justify-between ${currentTrackId === track.id ? 'border-indigo-300 shadow-md' : 'hover:bg-gray-50'
                                        }`}
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={`flex-shrink-0 p-3 rounded-full ${currentTrackId === track.id ? 'bg-indigo-600' : 'bg-indigo-100'}`}>
                                            <Music className={`w-5 h-5 ${currentTrackId === track.id ? 'text-white' : 'text-indigo-600'}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`font-semibold text-gray-900 truncate ${currentTrackId === track.id ? 'text-indigo-700' : ''}`}>
                                                {getDynamicTitle(track)}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {new Date(track.created_at).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex-shrink-0 ml-4">
                                        <button
                                            onClick={() => handlePlay(track)}
                                            className={`p-3 rounded-full transition-colors shadow-sm ${currentTrackId === track.id ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-700'
                                                } text-white`}
                                            aria-label={currentTrackId === track.id ? '일시정지' : '재생'}
                                        >
                                            {currentTrackId === track.id ? <Volume2 className="h-5 w-5" /> : <Play className="h-5 w-5 fill-white pl-0.5" />}
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {/* --- 상담 기록 탭 (UI 수정됨) --- */}
            {activeTab === 'logs' && (
                <section>
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">과거 상담 기록</h2>
                    {sessions.length === 0 ? (
                        <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg bg-white">
                            <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
                            <h3 className="mt-2 text-sm font-semibold text-gray-900">상담 기록 없음</h3>
                            <p className="mt-1 text-sm text-gray-500">이 환자는 아직 상담 기록이 없습니다.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {sessions.map((session) => (
                                <div key={session.id} className="bg-white border rounded-lg shadow-sm overflow-hidden">
                                    <button
                                        onClick={() => fetchChatLog(session.id)}
                                        className="w-full p-4 text-left font-medium text-gray-800 flex justify-between items-center hover:bg-gray-50"
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-indigo-700">
                                                {new Date(session.created_at).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <span className="text-xs text-gray-500 font-normal mt-1">
                                                (ID: {session.id})
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {logLoading === session.id ? <Loader2 className="w-4 h-4 animate-spin text-indigo-500" /> : <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${chatLogs[session.id] ? 'rotate-180' : ''}`} />}
                                        </div>
                                    </button>

                                    {chatLogs[session.id] && (
                                        <div className="p-4 border-t border-gray-200 bg-gray-50 max-h-96 overflow-y-auto space-y-3">
                                            {chatLogs[session.id].map((msg, msgIndex) => (
                                                <div key={msg.id || msgIndex} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`p-3 max-w-lg rounded-xl shadow-sm ${msg.role === 'user'
                                                        ? 'bg-blue-100 text-blue-900 rounded-br-none'
                                                        : 'bg-gray-200 text-gray-800 rounded-tl-none'
                                                        }`}>
                                                        <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {/* 💡 [핵심 추가] --- 상담사 메모 탭 --- */}
            {activeTab === 'memos' && (
                <section className="space-y-6">
                    {/* 1. 새 메모 작성 폼 */}
                    <form onSubmit={handleCreateMemo} className="bg-white p-6 border rounded-xl shadow-md">
                        <h2 className="text-xl font-semibold text-gray-800 flex items-center mb-4">
                            <Plus className="w-5 h-5 mr-3 text-indigo-600" />
                            새 메모 추가
                        </h2>
                        <textarea
                            value={newMemoContent}
                            onChange={(e) => setNewMemoContent(e.target.value)}
                            rows={4}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                            placeholder={patient ? `${patient.name || '환자'}님에 대한 소견이나 다음 상담 계획을 기록하세요...` : '메모 작성...'}
                            disabled={isMemoLoading}
                        />
                        {memoError && !isMemoLoading && ( // 👈 로딩 중 아닐 때만 에러 표시
                            <p className="text-sm text-red-600 mt-2">{memoError}</p>
                        )}
                        <div className="flex justify-end mt-4">
                            <button
                                type="submit"
                                disabled={isMemoLoading || !newMemoContent.trim()}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg shadow hover:bg-indigo-700 transition-colors disabled:bg-gray-400"
                            >
                                {isMemoLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                메모 저장
                            </button>
                        </div>
                    </form>

                    {/* 2. 메모 목록 */}
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                        <h2 className="text-xl font-semibold text-gray-800 flex items-center mb-5">
                            <ClipboardList className="w-5 h-5 mr-3 text-indigo-500" />
                            메모 기록
                        </h2>
                        {isMemoLoading && memos.length === 0 ? (
                            <div className="flex justify-center items-center p-4">
                                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                                <span className="ml-2 text-gray-500">메모 로딩 중...</span>
                            </div>
                        ) : !isMemoLoading && memoError && memos.length === 0 ? (
                            <Alert type="error" message={memoError} />
                        ) : memos.length === 0 ? (
                            <div className="p-6 text-center bg-gray-50 rounded-lg border border-gray-200">
                                <p className="text-gray-500">아직 작성된 메모가 없습니다.</p>
                            </div>
                        ) : (
                            <ul className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                                {memos.map(note => (
                                    <li key={note.id} className="p-4 bg-gray-50 border border-gray-200 rounded-lg shadow-sm">
                                        <p className="text-gray-700 whitespace-pre-wrap text-sm">
                                            {note.content}
                                        </p>
                                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-200">
                                            <p className="text-xs text-gray-500">
                                                {formatMemoTime(note.created_at)}
                                                {note.created_at !== note.updated_at && ' (수정됨)'}
                                            </p>
                                            <button
                                                onClick={() => handleDeleteMemo(note.id)}
                                                disabled={isMemoLoading}
                                                className="p-1 text-red-500 hover:bg-red-100 rounded-md disabled:opacity-50"
                                                aria-label="메모 삭제"
                                            >
                                                {isMemoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </section>
            )}

        </div>
    );
}

// 💡 12. [추가] Alert 컴포넌트 (메모 탭 에러 표시용)
interface AlertProps {
    type: 'error' | 'info' | 'success';
    message: string | null;
    onClose?: () => void;
}
const Alert: React.FC<AlertProps> = ({ type, message, onClose }) => {
    if (!message) return null;
    let bgColor, Icon;
    switch (type) {
        case 'error':
            bgColor = 'bg-red-100 border-red-400 text-red-700'; Icon = AlertTriangle; break;
        // 💡 [수정] 'info' 케이스 추가 (기본값과 동일)
        case 'info':
        default:
            bgColor = 'bg-blue-100 border-blue-400 text-blue-700'; Icon = Info; break;
    }
    return (
        <div className={`p-4 border rounded-xl flex items-start ${bgColor} relative mb-6`} role="alert">
            <Icon className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
                <p className="text-sm">{message}</p>
            </div>
            {onClose && (
                <button
                    onClick={onClose}
                    className="absolute top-2 right-2 p-1 rounded-full hover:bg-black hover:bg-opacity-10"
                >
                    <XCircle className="w-4 h-4" />
                </button>
            )}
        </div>
    );
};