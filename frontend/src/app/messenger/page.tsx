'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Loader2, MessageSquare, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

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
// 웹소켓 URL 변환 (http -> ws,  https -> wss)
const WS_URL = API_URL.replace(/^http/, 'ws') + '/messenger/ws';

interface ChatPartner {
    user_id: number;
    name: string;
    role: string;
    unread_count: number;
    last_message: string | null;
    last_message_time: string | null;
}

interface Message {
    id: number;
    content: string;
    sender_id: number;
    receiver_id: number; // 추가
    created_at: string;
    is_read: boolean;
}

export default function MessengerPage() {
    const { user, isAuthed } = useAuth();
    const [partners, setPartners] = useState<ChatPartner[]>([]);
    const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    
    const socketRef = useRef<WebSocket | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // 1. 초기 데이터 로드 (파트너 목록)
    useEffect(() => {
        const fetchPartners = async () => {
            const token = localStorage.getItem('accessToken');
            if (!token) return;
            try {
                const res = await fetch(`${API_URL}/messenger/partners`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (res.ok) setPartners(await res.json());
            } catch (e) {} finally { setLoading(false); }
        };
        if (isAuthed) fetchPartners();
    }, [isAuthed]);

    // 2. WebSocket 연결
    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (!token || !isAuthed) return;

        // WebSocket 연결 생성 (쿼리 파라미터로 토큰 전달)
        const ws = new WebSocket(`${WS_URL}?token=${token}`);
        
        ws.onopen = () => {
            console.log('메신저 서버에 연결되었습니다.');
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'new_message') {
                handleNewMessage(data.message);
            }
        };

        ws.onclose = () => {
            console.log('메신저 서버 연결이 끊겼습니다.');
        };

        socketRef.current = ws;

        return () => {
            ws.close();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthed]);

    // 3. 새 메시지 도착 시 처리
    const handleNewMessage = (msg: Message) => {
        // (A) 현재 보고 있는 채팅방의 메시지라면 목록에 추가
        setMessages(prev => {
            // 중복 방지
            if (prev.some(m => m.id === msg.id)) return prev;
            // 내가 보냈거나, 내가 받고 있는 상대방의 메시지인 경우만 추가
            if (msg.sender_id === selectedPartnerId || (msg.sender_id === user?.id && msg.receiver_id === selectedPartnerId)) {
                setTimeout(scrollToBottom, 100);
                return [...prev, msg];
            }
            return prev;
        });

        // (B) 파트너 목록 업데이트 (마지막 메시지, 안읽은 뱃지)
        setPartners(prev => prev.map(p => {
            // 상대방이 보낸 메시지인 경우
            if (p.user_id === msg.sender_id) {
                // 현재 채팅 중이 아니면 안 읽은 수 증가
                const isChatting = selectedPartnerId === msg.sender_id;
                return { 
                    ...p, 
                    last_message: msg.content, 
                    last_message_time: msg.created_at,
                    unread_count: isChatting ? p.unread_count : p.unread_count + 1 
                };
            }
            // 내가 보낸 메시지인 경우
            if (p.user_id === msg.receiver_id) {
                return { 
                    ...p, 
                    last_message: msg.content, 
                    last_message_time: msg.created_at 
                };
            }
            return p;
        }));
    };

    // 4. 채팅방 선택 시 과거 기록 로드
    useEffect(() => {
        if (selectedPartnerId) {
            const fetchHistory = async () => {
                const token = localStorage.getItem('accessToken');
                try {
                    const res = await fetch(`${API_URL}/messenger/${selectedPartnerId}`, { headers: { 'Authorization': `Bearer ${token}` } });
                    if (res.ok) {
                        setMessages(await res.json());
                        scrollToBottom();
                        // 해당 파트너의 안 읽은 수 0으로 초기화
                        setPartners(prev => prev.map(p => p.user_id === selectedPartnerId ? { ...p, unread_count: 0 } : p));
                    }
                } catch (e) {}
            };
            fetchHistory();
        }
    }, [selectedPartnerId]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // 5. 메시지 전송
    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedPartnerId || !socketRef.current) return;

        const payload = {
            receiver_id: selectedPartnerId,
            content: newMessage
        };

        // WebSocket으로 전송
        socketRef.current.send(JSON.stringify(payload));
        setNewMessage('');
    };

    if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin text-indigo-600"/></div>;

    return (
        <div className="max-w-5xl mx-auto p-4 h-[calc(100vh-80px)] flex gap-4 bg-gray-50">
            
            {/* 왼쪽: 대화 상대 목록 */}
            <div className="w-1/3 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-100 font-bold text-lg text-gray-800">메시지함</div>
                <div className="flex-1 overflow-y-auto">
                    {partners.length === 0 ? (
                        <p className="p-4 text-center text-gray-500 text-sm mt-10">대화 가능한 상대가 없습니다.<br/>(상담 연결 후 이용 가능합니다)</p>
                    ) : (
                        partners.map(partner => (
                            <div 
                                key={partner.user_id}
                                onClick={() => setSelectedPartnerId(partner.user_id)}
                                className={`p-4 border-b border-gray-50 cursor-pointer hover:bg-indigo-50 transition-colors ${selectedPartnerId === partner.user_id ? 'bg-indigo-50' : ''}`}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${partner.role === 'therapist' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                                            {partner.role === 'therapist' ? <ShieldCheck className="w-5 h-5"/> : <User className="w-5 h-5"/>}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1">
                                                <p className="font-bold text-gray-900 text-sm">{partner.name}</p>
                                                {partner.role === 'therapist' && <span className="text-[10px] bg-green-600 text-white px-1.5 py-0.5 rounded-full">상담사</span>}
                                            </div>
                                            <p className="text-xs text-gray-500 truncate w-32 mt-0.5">{partner.last_message || '대화 없음'}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <span className="text-[10px] text-gray-400">
                                            {partner.last_message_time ? new Date(partner.last_message_time).toLocaleDateString() : ''}
                                        </span>
                                        {partner.unread_count > 0 && (
                                            <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                                {partner.unread_count}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* 오른쪽: 채팅창 */}
            <div className="w-2/3 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
                {!selectedPartnerId ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                        <MessageSquare className="w-16 h-16 mb-4 opacity-20"/>
                        <p>대화 상대를 선택하여 채팅을 시작하세요.</p>
                    </div>
                ) : (
                    <>
                        <div className="p-4 border-b border-gray-100 bg-white shadow-sm z-10 flex items-center">
                             {(() => {
                                 const p = partners.find(p => p.user_id === selectedPartnerId);
                                 return p ? (
                                     <>
                                        <span className="font-bold text-gray-800 mr-2">{p.name}</span>
                                        {p.role === 'therapist' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">상담사</span>}
                                     </>
                                 ) : <span>대화 상대</span>
                             })()}
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                            {messages.map((msg, idx) => {
                                const isMe = msg.sender_id === user?.id;
                                return (
                                    <div key={idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[70%] p-3 rounded-2xl text-sm shadow-sm relative group ${
                                            isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'
                                        }`}>
                                            {msg.content}
                                            <div className={`text-[10px] mt-1 text-right ${isMe ? 'text-indigo-200' : 'text-gray-400'}`}>
                                                {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                {isMe && msg.is_read && " • 읽음"}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>
                        
                        <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-gray-100 flex gap-2">
                            <input 
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="메시지를 입력하세요..."
                                className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                            />
                            <button type="submit" disabled={!newMessage.trim()} className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-gray-300 transition shadow-md">
                                <Send className="w-5 h-5"/>
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}