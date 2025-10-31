'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { MusicTrack } from '@/lib/utils/music';
import { getPatientById, Patient } from '@/lib/utils/patients';
import { Play, ArrowLeft, Volume2, Loader2, User, MessageSquare, Music } from 'lucide-react';

// 1. 채팅 메시지 타입을 정의합니다.
interface ChatMessage {
  id: string; // 💡 DB ID와 호환되도록 string으로 변경
  role: 'user' | 'assistant';
  content: string;
}

export default function PatientDetailPage() {
    const router = useRouter();
    const params = useParams();
    const patientId = params.patientId as string;

    const [patient, setPatient] = useState<Patient | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [currentTrack, setCurrentTrack] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // 2. 탭 UI를 위한 상태 추가
    const [activeTab, setActiveTab] = useState<'music' | 'logs'>('music');
    // 3. 불러온 채팅 로그를 저장할 상태 추가 (세션 ID를 키로 사용)
    const [chatLogs, setChatLogs] = useState<Record<number, ChatMessage[]>>({});
    const [logLoading, setLogLoading] = useState(false); // 채팅 로그 로딩 상태

    useEffect(() => {
        if (typeof window !== "undefined" && !audioRef.current) {
            audioRef.current = new Audio();
        }
        const foundPatient = getPatientById(patientId);
        setPatient(foundPatient);
        setLoading(false);
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, [patientId]);

    // 오디오 재생 로직
    const handlePlay = (track: MusicTrack) => {
        const audio = audioRef.current;
        if (!audio) return;
        if (currentTrack === track.id) {
            audio.pause();
            setCurrentTrack(null);
        } else {
            audio.pause();
            audio.src = track.audioUrl;
            audio.load();
            audio.play().catch(error => {
                console.error("Audio playback failed:", error);
                alert("오디오 재생 실패. 콘솔을 확인하세요.");
            });
            setCurrentTrack(track.id);
            audio.onended = () => setCurrentTrack(null);
        }
    };

    // 4. 특정 세션의 채팅 로그를 불러오는 함수
    const fetchChatLog = async (sessionId: number) => {
        if (chatLogs[sessionId]) {
            console.log(`세션 ${sessionId} 로그는 이미 로드되었습니다.`);
            return;
        }
        
        setLogLoading(true);
        try {
            const response = await fetch(`http://localhost:8000/chat/history/${sessionId}`);
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "채팅 기록을 불러오는 데 실패했습니다.");
            }
            const data = await response.json(); // { session_id, history }
            
            setChatLogs(prevLogs => ({
                ...prevLogs,
                [sessionId]: data.history
            }));
        } catch (error) {
            console.error("채팅 로그 불러오기 실패:", error);
            if (error instanceof Error) {
                alert(error.message);
            } else {
                alert("알 수 없는 오류가 발생했습니다.");
            }
        } finally {
            setLogLoading(false);
        }
    };

    if (loading) {
        return ( <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div> );
    }

    if (!patient) {
        return (
            <div className="flex flex-col justify-center items-center h-screen text-center">
                <h1 className="text-2xl font-bold mb-4 text-red-600">환자 정보를 찾을 수 없습니다.</h1>
                <p className="text-gray-600 mb-6">ID ({patientId})에 해당하는 환자가 없습니다.</p>
                <button onClick={() => router.push('/counselor')} className="text-indigo-600 hover:underline">
                    대시보드로 돌아가기
                </button>
            </div>
        );
    }

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
                        {patient.avatarUrl ? (
                            <img src={patient.avatarUrl} alt={patient.name} className="w-full h-full object-cover" />
                        ) : (
                            <User className="w-8 h-8 text-gray-400" />
                        )}
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">{patient.name}</h1>
                        <p className="text-md text-gray-500">{patient.age}세</p>
                    </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="text-gray-600">마지막 상담일:</div>
                    <div className="font-medium text-gray-800">{patient.lastSession}</div>
                    <div className="text-gray-600">총 상담 횟수:</div>
                    <div className="font-medium text-indigo-600">{patient.totalSessions}회</div>
                    <div className="text-gray-600">생성된 음악:</div>
                    <div className="font-medium text-green-600">{patient.generatedMusic.length}곡</div>
                </div>
            </section>

            {/* 5. 탭 메뉴 UI */}
            <div className="mb-6">
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab('music')}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'music'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            음악 목록 ({patient.generatedMusic.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('logs')}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'logs'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            상담 기록 ({patient.sessionIds.length})
                        </button>
                    </nav>
                </div>
            </div>

            {/* 6. 탭 컨텐츠 분기 처리 */}
            
            {/* --- 음악 목록 탭 --- */}
            {activeTab === 'music' && (
                <section>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-gray-800">생성된 음악 플레이리스트</h2>
                        <button onClick={() => router.push(`/counsel?patientId=${patient.id}`)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 transition-colors shadow-sm font-medium">
                            <MessageSquare className="w-4 h-4" />
                            AI 상담으로 음악 생성
                        </button>
                    </div>
                    {patient.generatedMusic.length === 0 ? (
                        <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg bg-white mt-6">
                             <Music className="mx-auto h-12 w-12 text-gray-400" />
                            <h3 className="mt-2 text-sm font-semibold text-gray-900">생성된 음악 없음</h3>
                            <p className="mt-1 text-sm text-gray-500">아직 이 환자를 위해 생성된 음악이 없습니다.</p>
                        </div>
                    ) : (
                        <ul className="space-y-3">
                            {/* --- 👇 [핵심 수정] 비어있던 <li> 내부를 채웠습니다 --- */}
                            {patient.generatedMusic.map((track, index) => (
                                <li
                                    key={track.id}
                                    className={`p-4 border rounded-lg transition-all flex items-center justify-between shadow-sm ${
                                        currentTrack === track.id ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200' : 'bg-white hover:bg-gray-50 border-gray-200'
                                    }`}
                                >
                                    <div className="flex-1 min-w-0 mr-4">
                                        <p className={`font-medium truncate ${currentTrack === track.id ? 'text-indigo-700' : 'text-gray-900'}`}>
                                            {index + 1}. {track.title}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1 truncate">
                                            아티스트: {track.artist} (Prompt: {track.prompt || 'N/A'})
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handlePlay(track)}
                                        className={`flex-shrink-0 p-3 rounded-full transition-colors shadow-sm ${
                                            currentTrack === track.id ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-500 hover:bg-indigo-600'
                                        } text-white`}
                                        aria-label={currentTrack === track.id ? 'Pause' : 'Play'}
                                    >
                                        {currentTrack === track.id ? <Volume2 className="h-5 w-5" /> : <Play className="h-5 w-5 fill-white pl-0.5" />}
                                    </button>
                                </li>
                            ))}
                            {/* --- 👆 [핵심 수정] --- */}
                        </ul>
                    )}
                </section>
            )}

            {/* --- 상담 기록 탭 --- */}
            {activeTab === 'logs' && (
                <section>
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">과거 상담 기록</h2>
                    {patient.sessionIds.length === 0 ? (
                        <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg bg-white">
                             <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
                             <h3 className="mt-2 text-sm font-semibold text-gray-900">상담 기록 없음</h3>
                             <p className="mt-1 text-sm text-gray-500">이 환자는 아직 상담 기록이 없습니다.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {patient.sessionIds.map((sessionId, index) => (
                                <div key={sessionId} className="bg-white border rounded-lg shadow-sm">
                                    <button
                                        onClick={() => fetchChatLog(sessionId)}
                                        className="w-full p-4 text-left font-medium text-indigo-700 flex justify-between items-center"
                                    >
                                        <span>세션 #{index + 1} (ID: {sessionId}) - 기록 보기</span>
                                        {logLoading && !chatLogs[sessionId] ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                        {chatLogs[sessionId] ? <span className="text-xs text-green-600">✓ 로드됨</span> : null}
                                    </button>
                                    
                                    {chatLogs[sessionId] && (
                                        <div className="p-4 border-t bg-gray-50 max-h-96 overflow-y-auto space-y-3">
                                            {chatLogs[sessionId].length === 0 ? (
                                                <p className="text-sm text-gray-500 text-center">삭제되었거나 비어있는 세션입니다.</p>
                                            ) : (
                                                chatLogs[sessionId].map((msg, msgIndex) => (
                                                    <div key={msgIndex} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                        <div className={`p-3 max-w-lg rounded-xl shadow-sm ${
                                                            msg.role === 'user' 
                                                            ? 'bg-blue-100 text-blue-900 rounded-br-none' 
                                                            : 'bg-gray-100 text-gray-800 rounded-tl-none'
                                                        }`}>
                                                            <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
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