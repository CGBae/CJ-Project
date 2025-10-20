// 파일 경로: /src/app/counsel/page.tsx

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
// 💡 addMusicToPatient 와 getPatientById 를 가져옵니다.
import { addMusicToPatient, getPatientById } from '@/lib/utils/patients';
// 💡 MusicTrack 타입과 addTrackToPlaylist 함수를 가져옵니다.
import { MusicTrack, addTrackToPlaylist, getPlaylist } from '@/lib/utils/music';
import { Send, Music, Loader2, Volume2 } from 'lucide-react';

interface ChatMessage { id: number; role: 'user' | 'assistant'; content: string; }

export default function FullFeatureCounselingPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const patientId = searchParams.get('patientId');
    const [patientName, setPatientName] = useState<string | null>(null);

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [isMusicLoading, setIsMusicLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let initialMsgContent = '안녕하세요. AI 음악 심리 상담사입니다. 어떤 이야기를 나누고 싶으신가요?';
        if (patientId) {
            const patient = getPatientById(patientId);
            if (patient) {
                setPatientName(patient.name);
                initialMsgContent = `${patient.name}님, 안녕하세요. 어떤 이야기를 나누고 싶으신가요?`;
            } else {
                 initialMsgContent = `환자 정보를 찾을 수 없습니다. 안녕하세요, 어떤 이야기를 나누고 싶으신가요?`;
            }
        }
        setMessages([{ id: Date.now(), role: 'assistant', content: initialMsgContent }]);
    }, [patientId]);

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
            // ... (가짜 AI 답변 로직) ...
            const randomResponse = "AI 답변 예시입니다.";
            const assistantMessage: ChatMessage = { id: Date.now() + 1, role: 'assistant', content: randomResponse };
            setMessages(prev => [...prev, assistantMessage]);
            setIsChatLoading(false);
        }, 1500);
    };

    // --- 👇 음악 생성 로직 수정 ---
    const handleGenerateMusic = () => {
        setIsMusicLoading(true);
        const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();
        const prompt = lastUserMessage ? lastUserMessage.content : "상담 내용 기반 음악";

        console.log(`AI 상담 기반 음악 생성을 시작합니다... (환자 ID: ${patientId || '환자 본인'})`);
        console.log("음악 생성 프롬프트:", prompt);

        setTimeout(() => {
            const newTrack: MusicTrack = {
                id: `track_counsel_${Date.now()}`,
                title: `(상담 기반) ${prompt.substring(0, 15)}...`,
                artist: 'AI Composer',
                prompt: prompt,
                audioUrl: '/placeholder.mp3',
            };

            // 💡 --- 저장 로직 분기 ---
            if (patientId) {
                // 상담가 모드: 특정 환자의 generatedMusic 배열에 추가
                addMusicToPatient(patientId, newTrack);
                console.log(`환자(${patientId})의 플레이리스트에 음악이 추가되었습니다.`);
            } else {
                // 환자 본인 모드: music.ts의 playlist 배열에 추가
                addTrackToPlaylist(newTrack);
                console.log("환자 본인 플레이리스트에 음악이 추가되었습니다.");
            }
            // 💡 ---------------------

            alert(`'${newTrack.title}' 음악이 생성되었습니다!`);
            setIsMusicLoading(false);

            // 이동 로직
            if (patientId) {
                 router.push(`/counselor/${patientId}`); // 상담하던 환자의 상세 페이지로
            } else {
                 router.push('/music'); // 환자 본인 플레이리스트 페이지로
            }
        }, 2000);
    };
    // --- 👆 음악 생성 로직 수정 완료 ---

    const isReadyToGenerate = messages.filter(msg => msg.role === 'user').length > 0;

    return (
        <div style={{ maxWidth: '600px', margin: 'auto', border: '1px solid #e0e0e0', borderRadius: '12px', height: '95vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', backgroundColor: '#f9fafb' }}>

            <header style={{ padding: '16px', backgroundColor: '#4f46e5', color: 'white', textAlign: 'center', fontWeight: 'bold', fontSize: '1.2rem', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}>
                AI 음악 심리 상담 {patientName ? `(${patientName}님)` : ''}
            </header>

            <main style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {messages.map(msg => (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <div style={{ padding: '10px 16px', borderRadius: '20px', backgroundColor: msg.role === 'user' ? '#3b82f6' : 'white', color: msg.role === 'user' ? 'white' : '#1f2937', maxWidth: '75%', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                {isChatLoading && ( <div style={{ display: 'flex', justifyContent: 'flex-start' }}><div style={{ padding: '10px 16px', borderRadius: '20px', backgroundColor: 'white', border: '1px solid #e5e7eb' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></div></div> )}
                <div ref={messagesEndRef} />
            </main>

            <footer style={{ padding: '16px', borderTop: '1px solid #e0e0e0', backgroundColor: 'white', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <button onClick={handleGenerateMusic} disabled={!isReadyToGenerate || isMusicLoading} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '20px', border: 'none', backgroundColor: '#10b981', color: 'white', cursor: 'pointer', opacity: (!isReadyToGenerate || isMusicLoading) ? 0.5 : 1 }}>
                        {isMusicLoading ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Music size={20} />}
                        {isMusicLoading ? '음악 생성 중...' : '상담으로 음악 만들기'}
                    </button>
                    {/* 플레이리스트 버튼: patientId 유무에 따라 다른 텍스트/링크 */}
                    <button onClick={() => router.push(patientId ? `/counselor/${patientId}` : '/music')} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', fontSize: '0.875rem' }}>
                        <Volume2 size={16} />
                        {patientId ? '환자 플레이리스트 보기' : '내 플레이리스트 보기'} ({patientId ? getPatientById(patientId)?.generatedMusic.length ?? 0 : getPlaylist().length})
                    </button>
                </div>
                <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="메시지를 입력하세요..." style={{ flex: 1, padding: '12px', borderRadius: '20px', border: '1px solid #d1d5db', fontSize: '1rem' }} disabled={isChatLoading || isMusicLoading}/>
                    <button type="submit" style={{ padding: '12px', borderRadius: '50%', border: 'none', backgroundColor: '#4f46e5', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (isChatLoading || isMusicLoading || !inputValue.trim()) ? 0.5 : 1 }} disabled={isChatLoading || isMusicLoading || !inputValue.trim()}>
                        <Send size={20} />
                    </button>
                </form>
            </footer>
        </div>
    );
}