'use client';

import React, { useEffect, useRef, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Send, Music, Volume2 } from 'lucide-react';
import { addTrackToPlaylist, getPlaylist, MusicTrack } from '@/lib/utils/music';

/**
 * 메시지 객체 타입을 명시적으로 정의합니다.
 */
interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

/**
 * AI와 채팅하고, 사용자가 원할 때 음악 생성을 트리거하는 페이지입니다.
 */
export default function CounselPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // URL에서 session ID를 가져옵니다.
    const sessionId = searchParams.get('session');

    // --- 상태 관리 ---
    const [messages, setMessages] = useState<Message[]>([
        { id: 'initial-greeting', role: 'assistant', content: '안녕하세요! AI 상담을 시작하겠습니다. 어떤 이야기를 나누고 싶으신가요?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false); // 채팅 응답 로딩 상태
    const [isGeneratingMusic, setIsGeneratingMusic] = useState(false); // 음악 생성 로딩 상태
    const [musicGenerationStep, setMusicGenerationStep] = useState(''); // 음악 생성 단계 텍스트
    const [error, setError] = useState<string | null>(null);

    // 새 메시지가 추가될 때마다 스크롤을 맨 아래로 이동시킵니다.
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);
    
    // 파일 경로: /src/app/counsel/page.tsx
// ... (파일 상단은 동일)

    /**
     * "음악 생성" 버튼 클릭 시, 2단계에 걸쳐 음악을 생성합니다.
     */
    const handleGenerateMusicClick = async () => {
        if (!sessionId) {
            setError("음악을 생성하려면 유효한 세션 ID가 필요합니다.");
            return;
        }
        setIsGeneratingMusic(true);
        setError(null);

        let finalPrompt = ''; // 최종 프롬프트를 저장할 변수

        try {
            // --- 1단계: 대화 내용 분석 및 최종 프롬프트 생성 요청 ---
            setMusicGenerationStep("대화 내용 분석 및 프롬프트 생성 중...");
            console.log("1단계: /patient/analyze-and-generate API 호출");
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
            finalPrompt = prompt_text; // 💡 받은 프롬프트를 변수에 저장
            console.log("백엔드로부터 최종 프롬프트 수신:", finalPrompt);


            // --- 2단계: 생성된 프롬프트로 실제 음악 생성 요청 ---
            setMusicGenerationStep("AI가 프롬프트를 기반으로 음악 작곡 중...");
            console.log("2단계: /music/compose API 호출");

            // 💡 1. API 경로를 '/music/compose'로 수정합니다.
            // 💡 2. 백엔드가 요구하는 데이터 형식에 맞춰 body를 수정합니다.
            //    (더 이상 prompt를 직접 보내지 않습니다.)
            const musicResponse = await fetch('http://localhost:8000/music/compose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: Number(sessionId),
                    music_length_ms: 180000, // 예시: 3분 (180,000ms)
                    force_instrumental: true,
                }),
            });

            if (!musicResponse.ok) {
                const errorData = await musicResponse.json();
                throw new Error(errorData.detail || "음악 생성 API 호출에 실패했습니다.");
            }
            
            // 💡 3. 백엔드는 이제 track_url만 반환하므로, 프론트에서 track 객체를 완성합니다.
            const result = await musicResponse.json(); // { session_id, track_url }
            if (result.track_url) {
                const newTrack: MusicTrack = {
                    id: `track_${result.session_id}_${Date.now()}`,
                    title: `(AI 생성) '${finalPrompt.substring(0, 20)}...'`,
                    artist: 'TheraMusic AI',
                    prompt: finalPrompt,
                    audioUrl: result.track_url, // 실제 ElevenLabs URL
                };
                
                addTrackToPlaylist(newTrack);
                alert("음악 생성이 완료되었습니다! 플레이리스트로 이동합니다.");
                router.push('/music');
            } else {
                throw new Error("음악 생성 결과가 올바르지 않습니다.");
            }

        } catch (err) {
            console.error('Music generation process failed:', err);
            setError(err instanceof Error ? err.message : '음악 생성 중 오류가 발생했습니다.');
        } finally {
            setIsGeneratingMusic(false);
            setMusicGenerationStep("");
        }
    };

// ... (이하 handleSubmit 및 return 문은 동일)
    
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
                    guideline_json: "{}", // 이 부분은 chat.py에서 음악 생성 의도 감지 시 사용
                }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "서버 응답 오류");
            }
            
            const data = await response.json(); // { assistant: string, composed_prompt: string | null }
            const assistantMessage: Message = { id: Date.now().toString() + '-ai', role: 'assistant', content: data.assistant };
            setMessages(currentMsgs => [...currentMsgs, assistantMessage]);
            
            // ⚠️ 자동 음악 생성 로직 제거: 이제 composed_prompt를 받아도 아무것도 하지 않습니다.

        } catch (err) {
            console.error('Chat API Error:', err);
            setError(err instanceof Error ? err.message : '알 수 없는 오류');
            setMessages(currentMsgs => currentMsgs.filter(msg => msg.id !== userMessage.id));
        } finally {
            setIsLoading(false);
        }
    };

    // 음악 생성 버튼 활성화 조건: 사용자가 메시지를 한 번이라도 보냈을 때
    const isReadyToGenerate = messages.some(m => m.role === 'user');

    return (
        <div className="flex flex-col h-screen max-w-2xl mx-auto bg-white shadow-2xl relative">
            {/* 음악 생성 시에만 전체 화면 로딩 오버레이를 표시합니다. */}
            {isGeneratingMusic && (
                <div className="absolute inset-0 bg-white bg-opacity-80 flex flex-col justify-center items-center z-10 text-center px-4">
                    <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
                    <p className="mt-4 text-lg font-semibold text-gray-700">{musicGenerationStep}</p>
                    <p className="text-sm text-gray-500">잠시만 기다려주세요.</p>
                </div>
            )}

            <header className="p-4 bg-indigo-600 text-white text-xl font-bold text-center">AI 심리 상담</header>

            <main className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((m) => (
                    <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`p-3 max-w-lg rounded-2xl shadow-md ${
                            m.role === 'user' 
                            ? 'bg-blue-500 text-white rounded-br-none' 
                            : 'bg-white text-gray-800 rounded-tl-none border'
                        }`}>
                            <p className="whitespace-pre-wrap">{m.content}</p>
                        </div>
                    </div>
                ))}
                {/* AI 답변 로딩 시, 채팅창 내부에 간결한 로딩 인디케이터를 표시합니다. */}
                {isLoading && (
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
                        disabled={!isReadyToGenerate || isLoading || isGeneratingMusic}
                        className="flex items-center justify-center w-full px-4 py-2 rounded-full bg-green-500 text-white hover:bg-green-600 disabled:bg-gray-400 transition-colors shadow font-semibold"
                    >
                        <Music className="h-5 w-5 mr-2" />
                        지금까지의 대화로 음악 만들기
                    </button>
                    <button
                        onClick={() => router.push('/music')}
                        className="flex-shrink-0 ml-3 text-sm text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1"
                        aria-label="플레이리스트 보기"
                    >
                        <Volume2 className="h-4 w-4"/>
                        ({getPlaylist().length})
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="flex items-center space-x-3">
                    <input
                        className="flex-1 p-3 border rounded-full focus:ring-2 focus:ring-indigo-500 transition"
                        value={input}
                        placeholder={sessionId ? "메시지를 입력하세요..." : "세션 ID가 없어 채팅을 시작할 수 없습니다."}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={isLoading || isGeneratingMusic || !sessionId}
                    />
                    <button type="submit" disabled={isLoading || isGeneratingMusic || !sessionId || !input.trim()} className="p-3 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-400 shadow-lg transition">
                        <Send className="h-5 w-5" />
                    </button>
                </form>
            </footer>
        </div>
    );
}

