'use client';

// 💡 1. [수정] Suspense, useCallback 추가
import React, { useEffect, useRef, useState, FormEvent, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
// 💡 2. [수정] 아이콘 추가
import {
    Loader2,
    Send,
    Music,
    Volume2,
    User,
    Bot,
    AlertTriangle,
    MessageSquare,
    FilePen,
    ArrowRight
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext'; // 💡 3. [추가] useAuth 임포트

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
// --- 타입 정의 ---
interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}
// 💡 4. [추가] 세션 목록 타입
interface SessionInfo {
    id: number;
    created_at: string;
    initiator_type: string | null;
    has_dialog: boolean | null;
}

interface ChatHistoryResponse {
    history: Message[];
    goal_text: string | null;
}

// 💡 5. [수정] Suspense로 감싸기 위해 컴포넌트 분리
// (useSearchParams는 Suspense 내부에서만 사용 가능)
export default function CounselPage() {
    return (
        <Suspense fallback={<LoadingScreen message="상담 정보 확인 중..." />}>
            <CounselChat />
        </Suspense>
    );
}

// 💡 6. [수정] 메인 로직을 CounselChat 컴포넌트로 이동
function CounselChat() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const { user, isAuthed } = useAuth(); // 💡 [추가] user 정보 가져오기
    const sessionId = searchParams.get('session');

    // 💡 [수정] patientName을 AuthContext의 user.name으로 초기화 시도
    const [patientName, setPatientName] = useState<string | null>(user?.name || null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isGeneratingMusic, setIsGeneratingMusic] = useState(false);
    const [musicGenerationStep, setMusicGenerationStep] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const [ongoingSessions, setOngoingSessions] = useState<SessionInfo[]>([]);

    // --- 초기 대화/세션 목록 불러오기 ---
    const loadSessionData = useCallback(async () => {
        setIsInitialLoading(true);
        setError(null);

        const token = localStorage.getItem('accessToken');
        if (!token) {
            setError('로그인이 필요합니다.');
            setIsInitialLoading(false);
            router.push('/login?next=/counsel');
            return;
        }

        try {
            if (sessionId) {
                // --- A. 세션 ID가 있는 경우 (기존 채팅 로드) ---
                                const response = await fetch(`${API_URL}/chat/history/${sessionId}`, {
                    headers: { 'Authorization': `Bearer ${token}` } // 👈 헤더 추가
                });
                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.detail || '대화 기록 불러오기 실패');
                }
                // 💡 8. [수정] 새로운 API 응답 타입(ChatHistoryResponse)으로 파싱
                const data: ChatHistoryResponse = await response.json();

                if (data.history.length > 0) {
                    // (기록이 있으면 그대로 표시)
                    setMessages(data.history);
                } else {
                    // 💡 9. [핵심 수정] 기록이 0개일 때 (새 세션) -> 'goal_text'를 사용해 첫 질문 생성
                    const goal = data.goal_text;
                    const name = user?.name || '사용자';
                    
                    let firstMessage = `안녕하세요. ${name}님, AI 상담을 시작하겠습니다.`;
                    
                    if (goal) {
                        // (목표가 있을 때)
                        firstMessage = `안녕하세요. ${name}님. '${goal}'라고 상담 목표를 작성해주신 것을 확인했습니다. 이 문제에 대해 조금 더 자세히 말씀해 주시겠어요?`;
                    } else {
                        // (목표가 없을 때 - 예: 작곡 체험 세션 등)
                        firstMessage = `안녕하세요. ${name}님, AI 상담을 시작하겠습니다. 오늘은 어떤 이야기를 나누고 싶으신가요?`;
                    }
                    
                    setMessages([
                        { id: 'initial', role: 'assistant', content: firstMessage },
                    ]);
                }
            } else {
                // --- B. 세션 ID가 없는 경우 (진행 중 세션 목록 로드) ---
                const response = await fetch(
                    `${API_URL}/sessions/my?has_dialog=true`, // 👈 대화 기록이 있는 세션만 요청
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (!response.ok) throw new Error('진행 중인 상담 목록 불러오기 실패');
                const data: SessionInfo[] = await response.json();
                
                setOngoingSessions(data); // 👈 (필터링은 백엔드에서 수행)
            }
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('오류가 발생했습니다.');
            }
            if (err instanceof Error && (err.message.includes('인증') || err.message.includes('로그인'))) {
                localStorage.removeItem('accessToken');
                router.push('/login?next=/counsel');
            }
        } finally {
            setIsInitialLoading(false);
        }
    }, [sessionId, user?.name, router]); // 👈 의존성 유지

    useEffect(() => {
        loadSessionData();
    }, [loadSessionData]);

    // 💡 [추가] AuthContext에서 사용자 이름 가져오기
    useEffect(() => {
        if (user && user.name) {
            setPatientName(user.name);
        }
    }, [user]);

    // --- (기존 로직: 자동 스크롤 - 변경 없음) ---
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // --- (기존 로직: 포커스 유지 - 변경 없음) ---
    useEffect(() => {
        if (!isLoading && !isGeneratingMusic && !isInitialLoading) {
            setTimeout(() => {
                inputRef.current?.focus();
            }, 0);
        }
    }, [isLoading, isGeneratingMusic, isInitialLoading]);

    // --- (기존 로직: 메시지 전송 - 변경 없음) ---
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const userText = input.trim();
        if (!userText || isLoading || !sessionId) return;

        const userMessage: Message = { id: Date.now().toString(), role: 'user', content: userText };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const token = localStorage.getItem('accessToken');
            if (!token) throw new Error('로그인이 필요합니다.');

            const response = await fetch(`${API_URL}/chat/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ session_id: Number(sessionId), message: userText, guideline_json: "{}" }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || '응답 수신 실패');
            }
            const data = await response.json();
            setMessages(prev => [
                ...prev,
                { id: Date.now().toString() + '-ai', role: 'assistant', content: data.assistant },
            ]);
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('오류가 발생했습니다.');
            }
            setMessages(prev => prev.filter(msg => msg.id !== userMessage.id)); // 롤백
            if (err instanceof Error && err.message.includes('인증')) {
                localStorage.removeItem('accessToken');
                router.push('/login?next=/counsel?session=' + sessionId);
            }
        } finally {
            setIsLoading(false);
        }
    };

    // --- (기존 로직: 음악 생성 - 변경 없음) ---
    const handleGenerateMusicClick = async () => {
        if (!sessionId) {
            setError('세션 ID가 없습니다.');
            return;
        }
        setIsGeneratingMusic(true);
        setMusicGenerationStep('대화 내용을 분석 중...');
        setError(null);

        const token = localStorage.getItem('accessToken');
        if (!token) {
            setError('로그인이 필요합니다.');
            setIsGeneratingMusic(false);
            return;
        }

        try {
            // 1단계: 분석
            const analyzeResponse = await fetch(`${API_URL}/patient/analyze-and-generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ session_id: Number(sessionId), guideline_json: "{}" }),
            });
            if (analyzeResponse.status === 401) throw new Error('인증 실패(분석)');
            if (!analyzeResponse.ok) {
                const errorData = await analyzeResponse.json();
                throw new Error(errorData.detail || "대화 분석 실패");
            }

            // 2단계: 음악 생성
            setMusicGenerationStep('AI가 음악을 작곡하고 있습니다...');
            const musicResponse = await fetch(`${API_URL}/music/compose`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    session_id: Number(sessionId),
                    music_length_ms: 180000,
                    force_instrumental: true
                }),
            });
            if (musicResponse.status === 401) throw new Error('인증 실패(음악생성)');
            if (!musicResponse.ok) {
                const errorData = await musicResponse.json();
                throw new Error(errorData.detail || "음악 생성 실패");
            }

            router.push('/music');

        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('음악 생성 중 알 수 없는 오류 발생');
            }
            if (err instanceof Error && err.message.includes('인증 실패')) {
                localStorage.removeItem('accessToken');
                router.push('/login?next=/counsel?session=' + sessionId);
            }
        } finally {
            setIsGeneratingMusic(false);
        }
    };


    const isReadyToGenerate = messages.some(m => m.role === 'user');

    // 💡 8. [핵심 수정] JSX (UI) 렌더링 분기

    // 8-1. 로딩 중
    if (isInitialLoading) {
        return <LoadingScreen message="상담 정보 확인 중..." />;
    }

    // 8-2. 세션 ID가 없는 경우 (선택 화면)
    if (!sessionId) {
        return (
            <div className="flex flex-col h-screen bg-gray-100 max-w-3xl mx-auto shadow-2xl">
                {/* 💡 [오류 수정] patientName state를 전달합니다. */}
                <Header patientName={user?.name || null} /> 
                <main className="flex-1 overflow-y-auto p-6 space-y-8">
                    <h2 className="text-2xl font-bold text-gray-800">AI 심리 상담</h2>
                    
                    {error && ( // 💡 [추가] 오류가 있을 경우 표시
                        <div className="p-3 bg-red-100 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
                             <AlertTriangle className="w-5 h-5"/> {error}
                        </div>
                    )}

                    {/* 새 상담 시작 */}
                    <div className="p-6 bg-white rounded-lg shadow border border-gray-200">
                        <h3 className="font-semibold text-lg text-gray-900 flex items-center">
                            <FilePen className="w-5 h-5 mr-3 text-indigo-600" />
                            새 상담 시작하기
                        </h3>
                        <p className="text-gray-600 mt-2 text-sm">
                            새로운 상담을 시작하려면, 먼저 상담 접수를 통해 현재 상태와 목표를 알려주세요.
                        </p>
                        <button
                            onClick={() => router.push('/intake/patient')}
                            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg shadow hover:bg-indigo-700 transition-colors"
                        >
                            상담 접수 페이지로 이동 <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>

                    {/* 이어하기 */}
                    <div className="p-6 bg-white rounded-lg shadow border border-gray-200">
                        <h3 className="font-semibold text-lg text-gray-900 flex items-center">
                            <MessageSquare className="w-5 h-5 mr-3 text-indigo-600" />
                            진행 중인 상담 이어하기
                        </h3>
                        {ongoingSessions.length === 0 ? (
                            <p className="text-gray-500 mt-3 text-sm">진행 중인 AI 상담이 없습니다.</p>
                        ) : (
                            <ul className="mt-4 space-y-3">
                                {ongoingSessions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(session => (
                                    <li key={session.id}>
                                        <button
                                            onClick={() => router.push(`/counsel?session=${session.id}`)}
                                            className="w-full text-left p-3 rounded-md bg-gray-50 border border-gray-200 hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
                                        >
                                            <span className="font-medium text-gray-700">
                                                {new Date(session.created_at).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit' })} 상담
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </main>
            </div>
        );
    }

    // 8-3. 세션 ID가 있는 경우 (채팅 UI)
    return (
        <div className="flex flex-col h-screen bg-gray-100 max-w-3xl mx-auto shadow-2xl">
            {/* 로딩 오버레이 */}
            <AnimatePresence>
                {isGeneratingMusic && (
                    <motion.div
                        className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col justify-center items-center z-50"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                        <p className="mt-4 text-lg font-medium text-gray-700">
                            {musicGenerationStep || '음악을 생성 중입니다...'}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 헤더 */}
            <Header patientName={patientName} />

            {/* 채팅 영역 */}
            <main className="flex-1 overflow-y-auto p-6 space-y-6">
                <AnimatePresence>
                    {messages.map((m) => (
                        <motion.div
                            key={m.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25 }}
                            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className="flex items-start gap-3 max-w-lg">
                                {m.role === 'assistant' && (
                                    <div className="flex-shrink-0 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white">
                                        <Bot className="w-4 h-4" />
                                    </div>
                                )}
                                <div
                                    className={`p-4 rounded-2xl shadow-sm ${m.role === 'user'
                                        ? 'bg-indigo-600 text-white rounded-br-none'
                                        : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                                        }`}
                                >
                                    <p className="whitespace-pre-wrap">{m.content}</p>
                                </div>
                                {m.role === 'user' && (
                                    <div className="flex-shrink-0 w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-700">
                                        <User className="w-4 h-4" />
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {isLoading && (
                    <motion.div
                        className="flex justify-start"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                    >
                        <div className="flex items-center gap-3 max-w-lg">
                            <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white">
                                <Bot className="w-4 h-4" />
                            </div>
                            <div className="px-4 py-3 bg-white border border-gray-100 rounded-2xl text-gray-400 rounded-tl-none">
                                <span className="animate-pulse">...</span>
                            </div>
                        </div>
                    </motion.div>
                )}
                <div ref={messagesEndRef} />
            </main>

            {/* 오류 표시 */}
            {error && (
                <div className="bg-red-50 border-t border-red-200 text-red-700 text-center p-3 text-sm flex items-center justify-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> {error}
                </div>
            )}

            {/* 입력 영역 */}
            <footer className="bg-white/90 backdrop-blur border-t border-gray-200 sticky bottom-0">
                <div className="max-w-3xl mx-auto p-4 space-y-3">
                    <button
                        onClick={handleGenerateMusicClick}
                        disabled={!isReadyToGenerate || isLoading || isGeneratingMusic}
                        className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-lg shadow hover:opacity-90 disabled:opacity-60 transition"
                    >
                        <Music className="inline-block w-5 h-5 mr-2" />
                        지금까지의 대화로 음악 만들기
                    </button>

                    <form onSubmit={handleSubmit} className="flex items-center gap-2">
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="메시지를 입력하세요..."
                            disabled={isLoading || isGeneratingMusic || !sessionId || isInitialLoading}
                            className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none transition"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading || isGeneratingMusic}
                            className="p-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-400 transition"
                        >
                            <Send className="w-5 h-5" />
                        </button>
                    </form>
                </div>
            </footer>
        </div>
    );
}

// 💡 9. [추가] 공용 컴포넌트
// (채팅방 UI가 전체 화면을 사용하므로, 헤더와 로딩 스크린을 여기에 포함)

// 💡 [수정] Header 컴포넌트가 patientName prop을 받도록 수정
const Header = ({ patientName }: { patientName: string | null }) => {
    const router = useRouter();
    return (
        <header className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm">
            <div className="max-w-3xl mx-auto p-4 flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">AI 심리 상담</h1>
                    <p className="text-sm text-gray-500">
                        {patientName ? `${patientName}님` : '사용자님'}의 마음에 귀 기울이는 중입니다.
                    </p>
                </div>
                <button
                    onClick={() => router.push('/music')}
                    className="flex-shrink-0 ml-3 text-sm text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1.5 p-2 rounded-lg hover:bg-indigo-50"
                    aria-label="플레이리스트 보기"
                >
                    <Volume2 className="h-5 w-5" />
                    <span className="hidden sm:inline">내 음악</span>
                </button>
            </div>
        </header>
    );
};

const LoadingScreen = ({ message }: { message: string }) => (
    <div className="flex flex-col h-screen bg-gray-100 max-w-3xl mx-auto shadow-2xl">
        {/* 💡 [수정] patientName에 null 전달 */}
        <Header patientName={null} />
        <div className="flex-1 flex items-center justify-center text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> {message}
        </div>
    </div>
);