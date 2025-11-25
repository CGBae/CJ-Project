'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, Mail, Calendar, ShieldCheck, Link as LinkIcon, Plus, LogOut, Loader2, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface UserProfile {
    id: number;
    name: string;
    email: string;
    role: 'patient' | 'therapist';
    // 💡 dob 제거, age 유지
    age: number | null; 
}

interface ConnectionInfo {
    connection_id: number;
    partner_id: number;
    partner_name: string;
    partner_email: string;
    partner_role: string;
    status: 'PENDING' | 'ACCEPTED';
    created_at: string;
}

export default function MyPage() {
    const router = useRouter();
    const { user, logout, isAuthed } = useAuth();
    
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [connections, setConnections] = useState<ConnectionInfo[]>([]);
    const [searchInput, setSearchInput] = useState('');
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        const token = localStorage.getItem('accessToken');
        if (!token) { router.push('/login'); return; }
        
        try {
            setLoading(true);
            // 1. 프로필 조회
            const meRes = await fetch(`${API_URL}/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (meRes.ok) setProfile(await meRes.json());

            // 💡 2. 연결 목록 조회 (주석 해제 및 경로 수정)
            const connRes = await fetch(`${API_URL}/connection/list`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (connRes.ok) setConnections(await connRes.json());
            
        } catch (e) { console.error(e); } 
        finally { setLoading(false); }
    };

    useEffect(() => {
        if (isAuthed) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthed]);

    // 연결 요청 (ID 또는 이메일)
    const handleConnectRequest = async () => {
        if (!searchInput.trim()) return;
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        // 💡 payload 타입 지정
        const payload: { target_id?: number; email?: string } = {};
        
        if (!isNaN(Number(searchInput))) {
            payload.target_id = Number(searchInput);
        } else {
            payload.email = searchInput;
        }

        try {
             const res = await fetch(`${API_URL}/connection/request`, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                 body: JSON.stringify(payload)
             });
             
             if(res.ok) {
                 alert("연결 요청을 보냈습니다.");
                 setSearchInput('');
                 fetchData(); 
             } else {
                 const err = await res.json();
                 alert(`요청 실패: ${err.detail}`);
             }
        } catch (e) {
            alert("요청 중 오류가 발생했습니다.");
        }
    };

    // 요청 응답 (수락/거절)
    const handleRespond = async (connId: number, response: 'ACCEPTED' | 'REJECTED') => {
        const token = localStorage.getItem('accessToken');
        try {
            const res = await fetch(`${API_URL}/connection/respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ connection_id: connId, response })
            });
            if(res.ok) {
                alert(response === 'ACCEPTED' ? "연결되었습니다!" : "거절되었습니다.");
                fetchData();
            } else {
                const err = await res.json();
                alert(err.detail);
            }
        } catch(e) { alert("처리 실패"); }
    };

    // 연결 삭제/취소
    const handleDeleteConnection = async (connectionId: number) => {
        if (!confirm("연결을 끊거나 요청을 취소하시겠습니까?")) return;
        const token = localStorage.getItem('accessToken');
        try {
            const res = await fetch(`${API_URL}/connection/${connectionId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                alert("삭제되었습니다.");
                fetchData();
            }
        } catch (e) { alert("삭제 실패"); }
    }

    // 💡 나이 수정 (간단한 프롬프트 방식 - 필요시 모달로 변경 가능)
    const handleUpdateAge = async () => {
        const newAgeStr = prompt("수정할 나이를 입력하세요:", String(profile?.age || ''));
        if (newAgeStr === null) return;
        
        const newAge = parseInt(newAgeStr, 10);
        if (isNaN(newAge) || newAge < 1 || newAge > 150) {
            alert("유효한 나이를 입력해주세요.");
            return;
        }

        const token = localStorage.getItem('accessToken');
        try {
            // age 수정을 위한 별도 API가 필요할 수 있음. 
            // 여기서는 기존 /auth/me PUT이 있다면 사용하거나, 없다면 추가 구현 필요.
            // (auth.py에 update_users_me가 dob 대신 age를 받도록 수정되어야 함)
            
            // *주의: auth.py 수정 없이 이 기능은 작동하지 않을 수 있습니다.
            // 만약 age 수정 기능이 꼭 필요하다면 auth.py의 update_users_me도 수정해야 합니다.
            
            // 임시: 단순히 UI 업데이트만 하는 것이 아니라 실제 API 호출 필요
            alert("나이 수정 기능은 백엔드 업데이트가 필요합니다.");
        } catch(e) {}
    };

    if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="w-10 h-10 animate-spin text-indigo-600"/></div>;
    if (!profile) return <div className="text-center p-10">정보를 불러올 수 없습니다.</div>;

    return (
        <div className="max-w-4xl mx-auto p-6 min-h-screen bg-gray-50">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">마이페이지</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* 1. 내 정보 카드 */}
                <section className="bg-white p-8 rounded-3xl shadow-sm border border-gray-200 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><User className="w-40 h-40 text-indigo-600"/></div>
                    <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center"><User className="w-6 h-6 mr-2 text-indigo-600"/> 내 정보</h2>
                    
                    <div className="space-y-5 relative z-10">
                        <div className="flex justify-between border-b border-gray-100 pb-3">
                            <span className="text-gray-500 flex items-center text-sm"><User className="w-4 h-4 mr-2"/> 이름</span>
                            <span className="font-medium text-gray-900">{profile.name}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-100 pb-3">
                            <span className="text-gray-500 flex items-center text-sm"><Mail className="w-4 h-4 mr-2"/> 이메일</span>
                            <span className="font-medium text-gray-900">{profile.email}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-100 pb-3">
                            <span className="text-gray-500 flex items-center text-sm"><ShieldCheck className="w-4 h-4 mr-2"/> 고유 ID</span>
                            <span className="font-medium text-gray-900">{profile.id}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-100 pb-3">
                            <span className="text-gray-500 flex items-center text-sm"><Calendar className="w-4 h-4 mr-2"/> 나이</span>
                            <span className="font-medium text-gray-900">
                                {/* 💡 dob 제거하고 age만 표시 */}
                                {profile.age ? `${profile.age}세` : '정보 없음'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center pb-2">
                            <span className="text-gray-500 flex items-center text-sm"><ShieldCheck className="w-4 h-4 mr-2"/> 계정 유형</span>
                            <span className={`font-bold px-3 py-1 rounded-full text-sm ${profile.role === 'therapist' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                {profile.role === 'therapist' ? '상담사' : '환자'}
                            </span>
                        </div>
                    </div>
                    <button onClick={logout} className="mt-8 w-full py-3 flex justify-center gap-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl font-medium"><LogOut className="w-4 h-4"/> 로그아웃</button>
                </section>

                {/* 2. 연결 관리 카드 */}
                <section className="bg-white p-8 rounded-3xl shadow-sm border border-gray-200">
                    <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
                        <LinkIcon className="w-6 h-6 mr-2 text-indigo-600"/> 
                        {profile.role === 'patient' ? '내 상담사 관리' : '내 환자 관리'}
                    </h2>

                    {/* 연결 요청 폼 */}
                    <div className="bg-gray-50 p-5 rounded-2xl mb-6">
                        <p className="text-sm text-gray-600 mb-3 font-medium flex items-center gap-1"><Plus className="w-4 h-4"/> 새로운 연결 요청</p>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder="이메일 또는 ID 입력"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                className="flex-1 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white"
                            />
                            <button onClick={handleConnectRequest} className="px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium text-sm whitespace-nowrap shadow-sm">요청</button>
                        </div>
                    </div>

                    {/* 연결 목록 */}
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                        {connections.length === 0 ? (
                            <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-2xl">
                                <p className="text-gray-400 text-sm">연결된 사용자가 없습니다.</p>
                            </div>
                        ) : (
                            connections.map(conn => (
                                <div key={conn.connection_id} className="flex justify-between items-center p-4 border border-gray-100 rounded-2xl hover:bg-gray-50 transition-colors group">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-gray-900">{conn.partner_name}</p>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${conn.partner_role === 'therapist' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {conn.partner_role === 'therapist' ? '상담사' : '환자'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">{conn.partner_email}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {conn.status === 'ACCEPTED' ? (
                                            <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-bold border border-green-200 flex items-center gap-1">
                                                <CheckCircle className="w-3 h-3"/> 연결됨
                                            </span>
                                        ) : (
                                            <div className="flex gap-1">
                                                <button onClick={() => handleRespond(conn.connection_id, 'ACCEPTED')} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200">수락</button>
                                                <button onClick={() => handleRespond(conn.connection_id, 'REJECTED')} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200">거절</button>
                                            </div>
                                        )}
                                        <button onClick={() => handleDeleteConnection(conn.connection_id)} className="text-gray-300 hover:text-red-500 transition-colors p-1" title="삭제/취소">
                                            <Trash2 className="w-4 h-4"/>
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}