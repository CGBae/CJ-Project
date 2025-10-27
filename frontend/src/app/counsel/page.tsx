'use client';

import React, { useEffect, useRef, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Send, Music, Volume2, Trash2} from 'lucide-react';
import { addTrackToPlaylist, getPlaylist, MusicTrack } from '@/lib/utils/music';
import { addMusicToPatient, getPatientById } from '@/lib/utils/patients';

/**
 * 메시지 객체 타입을 명시적으로 정의합니다.
 */
interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

/**
 * AI와 채팅하고, 버튼 클릭으로 대화 내용을 분석하여 음악을 생성하는 페이지입니다.
 */
export default function CounselPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // URL에서 session ID와 patient ID를 가져옵니다.
    const sessionId = searchParams.get('session');
    const patientId = searchParams.get('patientId');
    
    const [patientName, setPatientName] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]); // 💡 1. 초기 메시지를 비웁니다.
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false); // 채팅 응답 로딩
    const [isGeneratingMusic, setIsGeneratingMusic] = useState(false); // 음악 생성 로딩
    const [musicGenerationStep, setMusicGenerationStep] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isInitialLoading, setIsInitialLoading] = useState(true); // 💡 2. 페이지 첫 로딩 (기록 조회) 상태 추가

    // 💡 3. [핵심] 페이지 로드 시, 세션 ID로 과거 대화 기록을 불러옵니다.
    useEffect(() => {
        const loadSessionHistory = async () => {
            if (!sessionId) {
                setError("유효한 세션 ID가 없습니다. 대시보드부터 다시 시작해주세요.");
                setIsInitialLoading(false);
                return;
            }

            // 환자 이름 설정 (UI 표시용)
            if (patientId) {
                const patient = getPatientById(patientId);
                if (patient) setPatientName(patient.name);
            }

            try {
                // 백엔드의 /chat/history/{session_id} API 호출
                const response = await fetch(`http://localhost:8000/chat/history/${sessionId}`);
                if (!response.ok) {
                    throw new Error("과거 대화 기록을 불러오는 데 실패했습니다.");
                }
                const data = await response.json(); // { session_id, history }
                
                if (data.history.length > 0) {
                    // 4. 백엔드에서 받은 history로 messages 상태를 설정합니다.
                    setMessages(data.history);
                } else {
                    // (Intake 직후라) 대화 기록이 없으면, 정적인 첫인사
                    setMessages([
                        { id: 'initial-greeting', role: 'assistant', content: `${patientName || '사용자'}님, 안녕하세요! AI 상담을 시작하겠습니다.` }
                    ]);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : '초기화 중 오류 발생');
            } finally {
                setIsInitialLoading(false);
            }
        };

        loadSessionHistory();
    }, [sessionId, patientId]); // sessionId가 있을 때 한 번만 실행

    // 새 메시지가 추가될 때마다 스크롤을 맨 아래로 이동
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    /**
     * "음악 생성" 버튼 클릭 시, 2단계에 걸쳐 음악을 생성합니다.
     */
    const handleGenerateMusicClick = async () => {
        if (!sessionId) { /* ... (이전과 동일) ... */ return; }
        setIsGeneratingMusic(true);
        setError(null);
        let finalPrompt = '';

        try {
            // 1단계: 대화 분석 및 프롬프트 생성
            setMusicGenerationStep("대화 내용 분석 및 프롬프트 생성 중...");
            const analyzeResponse = await fetch('http://localhost:8000/patient/analyze-and-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: Number(sessionId),
                    guideline_json: "{}",
                }),
            });
            if (!analyzeResponse.ok) {
                const errorData = await analyzeResponse.json();
                throw new Error(errorData.detail || "대화 분석에 실패했습니다.");
            }
            const { prompt_text } = await analyzeResponse.json();
            finalPrompt = prompt_text;

            // 2단계: 실제 음악 생성 요청
            setMusicGenerationStep("AI가 프롬프트를 기반으로 음악 작곡 중...");
            const musicResponse = await fetch('http://localhost:8000/music/compose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: Number(sessionId),
                    music_length_ms: 180000,
                    force_instrumental: true,
                }),
            });
            if (!musicResponse.ok) {
                const errorData = await musicResponse.json();
                throw new Error(errorData.detail || "음악 생성 API 호출에 실패했습니다.");
            }
            const result = await musicResponse.json();
            if (!result.track_url) throw new Error("음악 생성 결과가 올바르지 않습니다.");

            // 3단계: 음악 정보 저장
            const newTrack: MusicTrack = {
                id: `track_${result.session_id}_${Date.now()}`,
                title: `(AI 생성) '${finalPrompt.substring(0, 20)}...'`,
                artist: 'TheraMusic AI',
                prompt: finalPrompt,
                audioUrl: `http://localhost:8000${result.track_url}`,
            };
            
            addTrackToPlaylist(newTrack); 
            if (patientId) {
                addMusicToPatient(patientId, newTrack);
            }

            alert("음악 생성이 완료되었습니다! 플레이리스트로 이동합니다.");
            router.push('/music');

        } catch (err) {
            console.error('Music generation process failed:', err);
            setError(err instanceof Error ? err.message : '음악 생성 중 오류가 발생했습니다.');
        } finally {
            setIsGeneratingMusic(false);
            setMusicGenerationStep("");
        }
    };
    
    /**
     * 채팅 메시지 전송 핸들러
     */
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const userText = input.trim();
        if (isLoading || isGeneratingMusic || !userText || !sessionId) return;

        const userMessage: Message = { id: Date.now().toString(), role: 'user', content: userText };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('http://localhost:8000/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: Number(sessionId),
                    message: userText,
                    guideline_json: "{}",
                }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "서버 응답 오류");
            }
            
            const data = await response.json();
            const assistantMessage: Message = { id: Date.now().toString() + '-ai', role: 'assistant', content: data.assistant };
            setMessages(currentMsgs => [...currentMsgs, assistantMessage]);
            
        } catch (err) {
            console.error('Chat API Error:', err);
            setError(err instanceof Error ? err.message : '알 수 없는 오류');
            setMessages(currentMsgs => currentMsgs.filter(msg => msg.id !== userMessage.id));
        } finally {
            setIsLoading(false);
        }
    };

    const isReadyToGenerate = messages.some(m => m.role === 'user');

    return (
        <div className="flex flex-col h-screen max-w-2xl mx-auto bg-white shadow-2xl relative">
            {(isGeneratingMusic || (isLoading && !isInitialLoading)) && (
                <div className="absolute inset-0 bg-white bg-opacity-80 flex flex-col justify-center items-center z-10 text-center px-4">
                    <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
                    <p className="mt-4 text-lg font-semibold text-gray-700">
                        {isGeneratingMusic ? musicGenerationStep : "AI가 답변을 생각하고 있습니다..."}
                    </p>
                    <p className="text-sm text-gray-500">잠시만 기다려주세요.</p>
                </div>
            )}

            <header className="p-4 bg-indigo-600 text-white text-xl font-bold text-center">
                AI 심리 상담 {patientName ? `(${patientName}님)` : ''}
            </header>

            <main className="flex-1 overflow-y-auto p-4 space-y-4">
                {isInitialLoading ? (
                     <div className="flex justify-center items-center h-full">
                        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                        <p className="ml-3 text-gray-500">과거 상담 기록을 불러오는 중...</p>
                    </div>
                ) : (
                    messages.map((m) => (
                        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`p-3 max-w-lg rounded-2xl shadow-md ${
                                m.role === 'user' 
                                ? 'bg-blue-500 text-white rounded-br-none' 
                                : 'bg-white text-gray-800 rounded-tl-none border'
                            }`}>
                                <p className="whitespace-pre-wrap">{m.content}</p>
                            </div>
                        </div>
                    ))
                )}
                {isLoading && !isInitialLoading && (
                    <div className="flex justify-start">
                        <div className="p-3 bg-white rounded-2xl border shadow-md">
                            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </main>

            {error && (
                <div className="p-4 border-t text-center text-red-600 bg-red-50">
                    <p>오류: {error}</p>
                </div>
            )}

            <footer className="border-t bg-white p-4 space-y-3">
                <div className="flex justify-between items-center">
                    <button
                        onClick={handleGenerateMusicClick}
                        disabled={!isReadyToGenerate || isLoading || isGeneratingMusic || isInitialLoading}
                        className="flex items-center justify-center w-full px-4 py-2 rounded-full bg-green-500 text-white hover:bg-green-600 disabled:bg-gray-400 transition-colors shadow font-semibold"
                    >
                        <Music className="h-5 w-5 mr-2" />
                        지금까지의 대화로 음악 만들기
                    </button>
                    <button
                        onClick={() => router.push(patientId ? `/counselor/${patientId}` : '/music')}
                        className="flex-shrink-0 ml-3 text-sm text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1"
                        aria-label="플레이리스트 보기"
                    >
                        <Volume2 className="h-4 w-4"/>
                        ({patientId ? (getPatientById(patientId)?.generatedMusic.length ?? 0) : getPlaylist().length})
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="flex items-center space-x-3">
                    <input
                        className="flex-1 p-3 border rounded-full focus:ring-2 focus:ring-indigo-500 transition"
                        value={input}
                        placeholder={isInitialLoading ? "상담 정보 로딩 중..." : (sessionId ? "메시지를 입력하세요..." : "세션 ID가 없습니다.")}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={isLoading || isGeneratingMusic || !sessionId || isInitialLoading}
                    />
                    <button type="submit" disabled={isLoading || isGeneratingMusic || !sessionId || !input.trim()} className="p-3 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-400 shadow-lg transition">
                        <Send className="h-5 w-5" />
                    </button>
                </form>
            </footer>
        </div>
    );
}