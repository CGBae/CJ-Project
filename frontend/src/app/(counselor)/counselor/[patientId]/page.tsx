'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Play, ArrowLeft, Volume2, Loader2, User, MessageSquare, Music, AlertTriangle, ChevronDown } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext'; // 💡 AuthContext 임포트

// 💡 1. 백엔드 API 응답 타입 정의
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}
interface SessionInfo {
  id: number;
  created_at: string;
  initiator_type: string | null;
}
interface MusicTrackInfo {
  id: number | string;
  title: string;
  prompt: string;
  audioUrl: string; // schemas.py의 'audioUrl' 필드
  track_url?: string;
  artist?: string;
}
interface PatientProfile {
  id: number | string;
  name: string | null;
  email: string | null;
  role: string;
  // (참고: 'age'는 User 모델에 없으므로, UserPublic 스키마에 따라 제거)
}

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

export default function PatientDetailPage() {
    const router = useRouter();
    const params = useParams();
    const patientId = params.patientId as string;
    const { isAuthed } = useAuth(); // 💡 인증 상태 확인

    // 💡 2. [수정] 상태 타입 변경 (Patient -> PatientProfile)
    const [patient, setPatient] = useState<PatientProfile | null>(null);
    const [sessions, setSessions] = useState<SessionInfo[]>([]);
    const [music, setMusic] = useState<MusicTrackInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [currentTrackId, setCurrentTrackId] = useState<string | number | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [activeTab, setActiveTab] = useState<'music' | 'logs'>('music');
    const [chatLogs, setChatLogs] = useState<Record<number, ChatMessage[]>>({});
    const [logLoading, setLogLoading] = useState<number | null>(null);

    const API_URL = getApiUrl();

    // 💡 3. [핵심 수정] useEffect에서 실제 API 3개 호출
    useEffect(() => {
        // Audio 객체 초기화
        if (typeof window !== "undefined" && !audioRef.current) {
            audioRef.current = new Audio();
            audioRef.current.onended = () => setCurrentTrackId(null);
        }
        
        // 인증 상태 로딩이 끝나고, 로그인된 상태가 아니면 실행 중단
        if (!isAuthed) {
            if (localStorage.getItem('accessToken')) {
                // 토큰은 있는데 isAuthed가 false면 AuthContext 로딩 대기
                setLoading(true);
            } else {
                // 토큰 자체가 없으면 바로 로그인으로
                router.push('/login?next=/counselor');
            }
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            const token = localStorage.getItem('accessToken');
            if (!token) { // 이중 확인
                setError("인증 토큰이 없습니다.");
                setLoading(false);
                return;
            }

            try {
                // 3개 API 병렬 호출 (백엔드 URL 확인!)
                const [profileRes, sessionsRes, musicRes] = await Promise.all([
                    fetch(`${API_URL}/therapist/patient/${patientId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch(`${API_URL}/therapist/patient/${patientId}/sessions`, { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch(`${API_URL}/therapist/patient/${patientId}/music`, { headers: { 'Authorization': `Bearer ${token}` } })
                ]);

                // 공통 에러 처리
                if (profileRes.status === 401 || sessionsRes.status === 401 || musicRes.status === 401) throw new Error('인증 실패. 다시 로그인해주세요.');
                if (profileRes.status === 403 || sessionsRes.status === 403 || musicRes.status === 403) throw new Error('이 환자에 대한 접근 권한이 없습니다.');
                
                if (!profileRes.ok) throw new Error(`환자 정보 로딩 실패 (${profileRes.status})`);
                setPatient(await profileRes.json());
                
                if (!sessionsRes.ok) throw new Error(`상담 기록 로딩 실패 (${sessionsRes.status})`);
                setSessions(await sessionsRes.json());

                if (!musicRes.ok) throw new Error(`음악 목록 로딩 실패 (${musicRes.status})`);
                const musicData: MusicTrackInfo[] = await musicRes.json();
                setMusic(musicData.map(t => ({
                    ...t, 
                    audioUrl: t.audioUrl || t.track_url || '', // 필드명 보정
                    artist: t.artist || 'TheraMusic AI'
                })));

            } catch (err: unknown) {
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

        // 컴포넌트 언마운트 시 오디오 정리
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.onended = null;
                audioRef.current = null;
            }
        };
    }, [patientId, isAuthed, router]); // 💡 isAuthed와 router 추가

    // 💡 4. [수정] 오디오 재생 로직
    const handlePlay = (track: MusicTrackInfo) => {
        const audio = audioRef.current;
        if (!audio) return;
        if (currentTrackId === track.id) {
            audio.pause();
            setCurrentTrackId(null);
        } else {
            audio.pause();
            audio.src = track.audioUrl;
            audio.load();
            audio.play().catch(error => {
                console.error("Audio playback failed:", error);
                setError("오디오 재생 실패.");
            });
            setCurrentTrackId(track.id);
        }
    };

    // 💡 5. [수정] 채팅 로그 불러오기 (Authorization 헤더 추가)
    const fetchChatLog = async (sessionId: number) => {
        // 이미 로드된 로그가 있으면 -> 닫기 (토글)
        if (chatLogs[sessionId]) {
             setChatLogs(prevLogs => {
                 const newLogs = {...prevLogs};
                 delete newLogs[sessionId];
                 return newLogs;
             });
             return;
        }
        
        setLogLoading(sessionId);
        setError(null);
        const token = localStorage.getItem('accessToken');
        if (!token) { 
            setError("인증 토큰이 없습니다."); 
            setLogLoading(null); 
            return; 
        }

        try {
            const response = await fetch(`${API_URL}/chat/history/${sessionId}`, {
                 headers: { 'Authorization': `Bearer ${token}` } // ✅ 헤더 추가!
            });
            if (response.status === 401) throw new Error('인증 실패');
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "채팅 기록 로딩 실패");
            }
            const data = await response.json();
            setChatLogs(prevLogs => ({ 
                ...prevLogs, 
                [sessionId]: data.history.length > 0 ? data.history : [{id: 'empty', role: 'assistant', content: '저장된 대화 기록이 없습니다.'}]
            }));
        } catch (error) {
            setError(error instanceof Error ? error.message : "알 수 없는 오류");
        } finally {
            setLogLoading(null);
        }
    };

    // --- 렌더링 로직 ---

    if (loading) {
        return ( <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div> );
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

    // 💡 6. [수정] JSX 렌더링 (실제 데이터 사용, '가짜' 필드 제거)
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
                        <h1 className="text-3xl font-bold text-gray-900">{patient.name || '이름 없음'}</h1>
                        <p className="text-md text-gray-500">{patient.email || '이메일 없음'}</p>
                    </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {/* <div className="text-gray-600">마지막 상담일:</div>
                    <div className="font-medium text-gray-800">...</div> 
                    */}
                    <div className="text-gray-600">총 상담 횟수:</div>
                    <div className="font-medium text-indigo-600">{sessions.length}회</div>
                    <div className="text-gray-600">생성된 음악:</div>
                    <div className="font-medium text-green-600">{music.length}곡</div>
                </div>
            </section>

            {/* 탭 메뉴 UI */}
            <div className="mb-6">
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab('music')}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'music' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            음악 목록 ({music.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('logs')}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'logs' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            상담 기록 ({sessions.length})
                        </button>
                    </nav>
                </div>
            </div>
            
            {/* --- 음악 목록 탭 --- */}
            {activeTab === 'music' && (
                <section>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-gray-800">생성된 음악 플레이리스트</h2>
                        <button onClick={() => router.push(`/counsel?session=${sessions[0]?.id || ''}&patientId=${patient.id}`)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 transition-colors shadow-sm font-medium">
                            <MessageSquare className="w-4 h-4" />
                            AI 상담으로 음악 생성
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
                            {[...music].sort((a,b) => (b.id as number) - (a.id as number)).map((track, index) => ( // 최신순 정렬
                                <li
                                    key={track.id}
                                    className={`p-4 border rounded-lg transition-all flex items-center justify-between shadow-sm ${
                                        currentTrackId === track.id ? 'bg-indigo-50 border-indigo-300' : 'bg-white hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex-1 min-w-0 mr-4">
                                        <p className={`font-medium truncate ${currentTrackId === track.id ? 'text-indigo-700' : 'text-gray-900'}`}>
                                            {index + 1}. {track.title}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1 truncate">
                                            아티스트: {track.artist || 'TheraMusic AI'} (Prompt: {track.prompt || 'N/A'})
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handlePlay(track)}
                                        className={`flex-shrink-0 p-3 rounded-full transition-colors shadow-sm ${
                                            currentTrackId === track.id ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-500 hover:bg-indigo-600'
                                        } text-white`}
                                        aria-label={currentTrackId === track.id ? 'Pause' : 'Play'}
                                    >
                                        {currentTrackId === track.id ? <Volume2 className="h-5 w-5" /> : <Play className="h-5 w-5 fill-white pl-0.5" />}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {/* --- 상담 기록 탭 --- */}
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
                            {[...sessions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((session, index) => (
                                <div key={session.id} className="bg-white border rounded-lg shadow-sm overflow-hidden">
                                    <button
                                        onClick={() => fetchChatLog(session.id)}
                                        className="w-full p-4 text-left font-medium text-gray-800 flex justify-between items-center hover:bg-gray-50"
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-indigo-700">상담 #{sessions.length - index} <span className="text-xs text-gray-500 font-normal">(ID: {session.id})</span></span>
                                            <span className="text-xs text-gray-500 font-normal mt-1">
                                                {new Date(session.created_at).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {logLoading === session.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                                            ) : (
                                                <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${chatLogs[session.id] ? 'rotate-180' : ''}`} />
                                            )}
                                        </div>
                                    </button>
                                    
                                    {chatLogs[session.id] && (
                                        <div className="p-4 border-t border-gray-200 bg-gray-50 max-h-96 overflow-y-auto space-y-3">
                                            {chatLogs[session.id].map((msg, msgIndex) => (
                                                <div key={msg.id || msgIndex} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`p-3 max-w-lg rounded-xl shadow-sm ${
                                                        msg.role === 'user' 
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
        </div>
    );
}