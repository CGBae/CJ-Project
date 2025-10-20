// 파일 경로: /src/app/counsel/page.tsx

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// 💡 1. 새로 만든 music.ts 파일에서 유틸리티와 타입을 가져옵니다.
import { addTrackToPlaylist, getPlaylist, MusicTrack } from '@/lib/utils/music';
import { Send, Music, Loader2, Volume2 } from 'lucide-react';

// 채팅 메시지의 형태
interface ChatMessage {
    id: number;
    role: 'user' | 'assistant';
    content: string;
}

export default function FullFeatureCounselingPage() {
    const router = useRouter();
    const [messages, setMessages] = useState<ChatMessage[]>([
        { id: 1, role: 'assistant', content: '안녕하세요. AI 음악 심리 상담사입니다. 어떤 이야기를 나누고 싶으신가요?' }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [isMusicLoading, setIsMusicLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;

        const userMessage: ChatMessage = { id: Date.now(), role: 'user', content: inputValue };
        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsChatLoading(true);

        setTimeout(() => {
            const assistantMessage: ChatMessage = { id: Date.now() + 1, role: 'assistant', content: `"${userMessage.content}"에 대한 당신의 감정을 음악으로 만들어 볼까요?` };
            setMessages(prev => [...prev, assistantMessage]);
            setIsChatLoading(false);
        }, 1500);
    };

    const handleGenerateMusic = () => {
        setIsMusicLoading(true);
        const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();
        const prompt = lastUserMessage ? lastUserMessage.content : "잔잔한 위로의 음악";

        setTimeout(() => {
            // 💡 2. music 페이지가 필요로 하는 모든 정보를 포함하여 MusicTrack 객체를 생성합니다.
            const newTrack: MusicTrack = {
                id: `track_${Date.now()}`,
                title: `'${prompt.substring(0, 15)}...'을 위한 연주곡`,
                artist: 'AI Composer',
                prompt: prompt, // 프롬프트 정보 추가
                audioUrl: '/placeholder.mp3', // 실제 음악 파일 URL (지금은 가짜 경로)
            };
            
            addTrackToPlaylist(newTrack); // 생성된 트랙을 플레이리스트에 추가
            alert(`'${newTrack.title}' 음악이 생성되었습니다!`);
            setIsMusicLoading(false);
            router.push('/music'); // music 탭으로 이동
        }, 2000);
    };

    const isReadyToGenerate = messages.filter(msg => msg.role === 'user').length > 0;

    // (이하 return 문은 이전과 동일하므로 생략... 필요하다면 전체 코드를 다시 드릴 수 있습니다.)
    return (
        <div style={{ maxWidth: '600px', margin: 'auto', border: '1px solid #e0e0e0', borderRadius: '12px', height: '95vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', backgroundColor: '#f9fafb' }}>
            <header style={{ padding: '16px', backgroundColor: '#4f46e5', color: 'white', textAlign: 'center', fontWeight: 'bold', fontSize: '1.2rem', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}>
                AI 음악 심리 상담
            </header>
            <main style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {messages.map(msg => (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <div style={{ padding: '10px 16px', borderRadius: '20px', backgroundColor: msg.role === 'user' ? '#3b82f6' : 'white', color: msg.role === 'user' ? 'white' : '#1f2937', maxWidth: '75%', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                {isChatLoading && ( <div style={{ display: 'flex', justifyContent: 'flex-start' }}><div style={{ padding: '10px 16px', borderRadius: '20px', backgroundColor: 'white', border: '1px solid #e5e7eb' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></div></div>)}
                <div ref={messagesEndRef} />
            </main>
            <footer style={{ padding: '16px', borderTop: '1px solid #e0e0e0', backgroundColor: 'white', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <button onClick={handleGenerateMusic} disabled={!isReadyToGenerate || isMusicLoading} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '20px', border: 'none', backgroundColor: '#10b981', color: 'white', cursor: 'pointer', opacity: (!isReadyToGenerate || isMusicLoading) ? 0.5 : 1 }}>
                        {isMusicLoading ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Music size={20} />}
                        {isMusicLoading ? '생성 중...' : '대화로 음악 만들기'}
                    </button>
                    <button onClick={() => router.push('/music')} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer' }}>
                        <Volume2 size={16} />
                        플레이리스트 ({getPlaylist().length})
                    </button>
                </div>
                <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="메시지를 입력하세요..." style={{ flex: 1, padding: '12px', borderRadius: '20px', border: '1px solid #d1d5db', fontSize: '1rem' }} disabled={isChatLoading || isMusicLoading}/>
                    <button type="submit" style={{ padding: '12px', borderRadius: '50%', border: 'none', backgroundColor: '#4f46e5', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (isChatLoading || isMusicLoading) ? 0.5 : 1 }} disabled={isChatLoading || isMusicLoading}>
                        <Send size={20} />
                    </button>
                </form>
            </footer>
        </div>
    );
}