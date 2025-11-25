'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Loader2, MessageSquare, ShieldCheck, RefreshCcw } from 'lucide-react';
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
    receiver_id: number;
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
    const [sending, setSending] = useState(false);
    
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // 1. 대화 상대 목록 로드 (API 호출)
    const fetchPartners = async () => {
        const token = localStorage.getItem('accessToken');
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/messenger/partners`, { 
                headers: { 'Authorization': `Bearer ${token}` } 
            });
            if (res.ok) {
                const data = await res.json();
                setPartners(data);
            }
        } catch (e) {
            console.error("파트너 목록 로드 실패", e);
        } finally {
            setLoading(false);
        }
    };

    // 2. 특정 상대와의 메시지 로드 (API 호출)
    const fetchMessages = async (partnerId: number) => {
        const token = localStorage.getItem('accessToken');
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/messenger/${partnerId}`, { 
                headers: { 'Authorization': `Bearer ${token}` } 
            });
            if (res.ok) {
                const data = await res.json();
                setMessages(data);
                // 메시지를 읽었으니 파트너 목록(안읽은 뱃지)도 갱신
                fetchPartners();
            }
        } catch (e) {
            console.error("메시지 로드 실패", e);
        }
    };

    // 초기 로딩 및 주기적 폴링 (5초마다 목록 갱신 - 새 메시지 확인용)
    useEffect(() => {
        if (isAuthed) {
            fetchPartners();
            const interval = setInterval(fetchPartners, 5000); 
            return () => clearInterval(interval);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthed]);

    // 채팅방 선택 시 메시지 로드 및 주기적 갱신 (3초마다 대화 내용 갱신)
    useEffect(() => {
        if (selectedPartnerId) {
            fetchMessages(selectedPartnerId);
            const interval = setInterval(() => fetchMessages(selectedPartnerId), 3000);
            return () => clearInterval(interval);
        }
    }, [selectedPartnerId]);

    // 스크롤 자동 이동
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // 3. 메시지 전송 (API 호출)
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedPartnerId) return;
        
        setSending(true);
        const token = localStorage.getItem('accessToken');
        
        try {
            const res = await fetch(`${API_URL}/messenger/`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ 
                    receiver_id: selectedPartnerId, 
                    content: newMessage 
                })
            });

            if (res.ok) {
                setNewMessage('');
                fetchMessages(selectedPartnerId); // 전송 후 즉시 갱신
            }
        } catch (e) {
            alert("메시지 전송에 실패했습니다.");
        } finally {
            setSending(false);
        }
    };

    if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="w-10 h-10 animate-spin text-indigo-600"/></div>;

    return (
        <div className="max-w-6xl mx-auto p-4 h-[calc(100vh-80px)] flex gap-4 bg-gray-50">
            
            {/* 왼쪽: 대화 상대 목록 */}
            <div className="w-1/3 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-100 bg-white flex justify-between items-center">
                    <span className="font-bold text-lg text-gray-800">쪽지함</span>
                    <button onClick={fetchPartners} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors" title="새로고침">
                        <RefreshCcw className="w-4 h-4 text-gray-500"/>
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto">
                    {partners.length === 0 ? (
                        <div className="p-6 text-center text-gray-400 text-sm mt-10">
                            <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-20"/>
                            <p>대화 가능한 상대가 없습니다.<br/>(상담 연결 후 이용 가능합니다)</p>
                        </div>
                    ) : (
                        partners.map(partner => (
                            <div 
                                key={partner.user_id}
                                onClick={() => setSelectedPartnerId(partner.user_id)}
                                className={`p-4 border-b border-gray-50 cursor-pointer hover:bg-indigo-50 transition-all ${selectedPartnerId === partner.user_id ? 'bg-indigo-50 border-l-4 border-l-indigo-500 pl-3' : ''}`}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm ${partner.role === 'therapist' ? 'bg-green-500' : 'bg-indigo-400'}`}>
                                            {partner.role === 'therapist' ? <ShieldCheck className="w-5 h-5"/> : <User className="w-5 h-5"/>}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <p className="font-bold text-gray-900 text-sm">{partner.name}</p>
                                                {partner.role === 'therapist' && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">상담사</span>}
                                            </div>
                                            <p className={`text-xs truncate w-36 mt-1 ${partner.unread_count > 0 ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                                                {partner.last_message || '대화 없음'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <span className="text-[10px] text-gray-400">
                                            {partner.last_message_time ? new Date(partner.last_message_time).toLocaleDateString() : ''}
                                        </span>
                                        {partner.unread_count > 0 && (
                                            <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm animate-pulse">
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
            <div className="w-2/3 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden relative">
                {!selectedPartnerId ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50">
                        <MessageSquare className="w-16 h-16 mb-4 opacity-20"/>
                        <p>왼쪽 목록에서 대화 상대를 선택하세요.</p>
                    </div>
                ) : (
                    <>
                        {/* 채팅 헤더 */}
                        <div className="p-4 border-b border-gray-100 bg-white shadow-sm z-10 flex items-center justify-between">
                             {(() => {
                                 const p = partners.find(p => p.user_id === selectedPartnerId);
                                 return p ? (
                                     <div className="flex items-center gap-2">
                                        <span className="font-bold text-gray-800 text-lg">{p.name}</span>
                                        {p.role === 'therapist' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">상담사</span>}
                                     </div>
                                 ) : <span>대화 상대</span>
                             })()}
                             <button onClick={() => fetchMessages(selectedPartnerId)} className="text-xs text-gray-500 hover:text-indigo-600 flex items-center gap-1">
                                <RefreshCcw className="w-3 h-3"/> 갱신
                             </button>
                        </div>

                        {/* 메시지 목록 */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50 scroll-smooth">
                            {messages.length === 0 && (
                                <div className="text-center py-10 text-gray-400 text-sm">
                                    <p>대화 내역이 없습니다.</p>
                                    <p>첫 메시지를 보내보세요!</p>
                                </div>
                            )}
                            {messages.map((msg, idx) => {
                                const isMe = msg.sender_id === user?.id;
                                return (
                                    <div key={idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[70%] p-3.5 rounded-2xl text-sm shadow-sm relative group ${
                                            isMe 
                                            ? 'bg-indigo-600 text-white rounded-tr-none' 
                                            : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'
                                        }`}>
                                            {msg.content}
                                            <div className={`text-[10px] mt-1.5 text-right opacity-70 ${isMe ? 'text-indigo-100' : 'text-gray-400'}`}>
                                                {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                {isMe && msg.is_read && <span className="ml-1 font-bold text-yellow-300">• 읽음</span>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>
                        
                        {/* 입력창 */}
                        <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-gray-100 flex gap-2">
                            <input 
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="메시지를 입력하세요..."
                                className="flex-1 p-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                                disabled={sending}
                            />
                            <button 
                                type="submit" 
                                disabled={!newMessage.trim() || sending} 
                                className="p-3.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-gray-300 transition shadow-md flex items-center justify-center w-12"
                            >
                                {sending ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5"/>}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}