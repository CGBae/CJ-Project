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
 * AI와 실시간으로 채팅하고, 대화 내용에 따라 음악 생성을 트리거하는 페이지입니다.
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
    const [isLoading, setIsLoading] = useState(false); // 채팅 로딩 상태
    const [error, setError] = useState<string | null>(null);
    const [isGeneratingMusic, setIsGeneratingMusic] = useState(false);

    // 새 메시지가 추가될 때마다 스크롤을 맨 아래로 이동시킵니다.
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    /**
     * 폼 제출 시 백엔드 API와 통신하는 핸들러 함수
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
            const assistantMessage: Message = {
                id: Date.now().toString() + '-ai',
                role: 'assistant',
                content: data.assistant
            };
            setMessages(currentMsgs => [...currentMsgs, assistantMessage]);

        } catch (err) {
            console.error('Chat API Error:', err);
            setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
            setMessages(currentMsgs => currentMsgs.filter(msg => msg.id !== userMessage.id));
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * "음악 생성" 버튼 클릭 시 실행될 함수
     */
    const handleGenerateMusic = () => {
        setIsGeneratingMusic(true);
        setError(null);

        const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();
        const prompt = lastUserMessage ? lastUserMessage.content : "오늘의 기분";

        console.log(`음악 생성 시작... (프롬프트: "${prompt}")`);

        setTimeout(() => {
            const newTrack: MusicTrack = {
                id: `track_${Date.now()}`,
                title: `(AI 생성) '${prompt.substring(0, 15)}...'을 위한 음악`,
                artist: 'TheraMusic AI',
                prompt: prompt,
                audioUrl: '/placeholder.mp3',
            };

            addTrackToPlaylist(newTrack);
            alert(`'${newTrack.title}' 음악이 생성되었습니다!`);
            setIsGeneratingMusic(false);
            router.push('/music');
        }, 2500);
    };

    const isReadyToGenerate = messages.some(m => m.role === 'user');

    return (
        <div className="flex flex-col h-screen max-w-2xl mx-auto bg-white shadow-2xl relative">
            {/* 💡 음악 생성 시에만 전체 화면 로딩 오버레이를 표시합니다. */}
            {isGeneratingMusic && (
                <div className="absolute inset-0 bg-white bg-opacity-80 flex flex-col justify-center items-center z-10">
                    <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
                    <p className="mt-4 text-lg font-semibold text-gray-700">AI가 음악을 작곡하고 있습니다...</p>
                    <p className="text-sm text-gray-500">잠시만 기다려주세요.</p>
                </div>
            )}

            <header className="p-4 bg-indigo-600 text-white text-xl font-bold text-center">
                AI 심리 상담
            </header>

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

                {/* 💡 AI 답변 로딩 시, 채팅창 내부에 간결한 로딩 인디케이터를 표시합니다. */}
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
                        onClick={handleGenerateMusic}
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
                    <button
                        type="submit"
                        disabled={isLoading || isGeneratingMusic || !sessionId || !input.trim()}
                        className="p-3 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-400 shadow-lg transition"
                    >
                        <Send className="h-5 w-5" />
                    </button>
                </form>
            </footer>
        </div>
    );
}
