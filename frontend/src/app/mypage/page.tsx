'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
    User, Mail, Calendar, ShieldCheck, Link as LinkIcon, 
    Plus, LogOut, Loader2, Trash2, CheckCircle, Edit2, X, XCircle, Check
} from 'lucide-react';
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

// 💡 UserProfile: dob 제거, age 사용
interface UserProfile {
    id: number;
    name: string;
    email: string;
    role: 'patient' | 'therapist';
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
    const { logout, isAuthed } = useAuth();
    
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [connections, setConnections] = useState<ConnectionInfo[]>([]);
    const [searchInput, setSearchInput] = useState('');
    const [loading, setLoading] = useState(true);

    // 나이 수정 상태
    const [isEditingAge, setIsEditingAge] = useState(false);
    const [editAge, setEditAge] = useState('');

    const fetchData = async () => {
        const token = localStorage.getItem('accessToken');
        if (!token) { router.push('/login'); return; }
        
        try {
            setLoading(true);
            // 1. 프로필 조회
            const meRes = await fetch(`${API_URL}/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (meRes.ok) {
                const data = await meRes.json();
                setProfile(data);
                setEditAge(data.age ? String(data.age) : '');
            }

            // 2. 연결 목록 조회 (/connection/list 사용)
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

    // 나이 수정
    const handleUpdateAge = async () => {
        const ageNum = parseInt(editAge, 10);
        if (isNaN(ageNum) || ageNum < 1 || ageNum > 150) {
            alert("유효한 나이를 입력해주세요.");
            return;
        }
        const token = localStorage.getItem('accessToken');
        try {
            // auth.py에 update_users_me API가 있어야 함 (PUT /auth/me)
            const res = await fetch(`${API_URL}/auth/me`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ age: ageNum })
            });
            if (res.ok) {
                alert("나이가 수정되었습니다.");
                setIsEditingAge(false);
                fetchData();
            } else {
                alert("수정 실패");
            }
        } catch (e) { alert("오류 발생"); }
    };
    
    // 계정 탈퇴
    const handleDeleteAccount = async () => {
        if(!confirm("정말 탈퇴하시겠습니까? 모든 데이터가 삭제됩니다.")) return;
        const token = localStorage.getItem('accessToken');
        try {
            await fetch(`${API_URL}/auth/me`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            logout();
        } catch(e) { alert("오류 발생"); }
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
                        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                            <span className="text-gray-500 flex items-center text-sm"><User className="w-4 h-4 mr-2"/> 이름</span>
                            <span className="font-medium text-gray-900">{profile.name}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                            <span className="text-gray-500 flex items-center text-sm"><Mail className="w-4 h-4 mr-2"/> 이메일</span>
                            <span className="font-medium text-gray-900">{profile.email}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                            <span className="text-gray-500 flex items-center text-sm"><ShieldCheck className="w-4 h-4 mr-2"/> 고유 ID</span>
                            <span className="font-medium text-gray-900">{profile.id}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                            <span className="text-gray-500 flex items-center text-sm"><Calendar className="w-4 h-4 mr-2"/> 나이</span>
                            <div className="flex items-center gap-2">
                                {isEditingAge ? (
                                    <>
                                        <input 
                                            type="number" 
                                            value={editAge} 
                                            onChange={e => setEditAge(e.target.value)} 
                                            className="w-16 p-1 border rounded text-right bg-gray-50 text-sm"
                                        />
                                        <button onClick={handleUpdateAge} className="text-green-600 hover:bg-green-50 p-1 rounded"><Check className="w-4 h-4"/></button>
                                        <button onClick={() => setIsEditingAge(false)} className="text-red-500 hover:bg-red-50 p-1 rounded"><X className="w-4 h-4"/></button>
                                    </>
                                ) : (
                                    <>
                                        <span className="font-medium text-gray-900">{profile.age ? `${profile.age}세` : '미입력'}</span>
                                        <button onClick={() => setIsEditingAge(true)} className="text-gray-400 hover:text-indigo-600 p-1"><Edit2 className="w-3 h-3"/></button>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-between items-center pb-2">
                            <span className="text-gray-500 flex items-center text-sm"><ShieldCheck className="w-4 h-4 mr-2"/> 계정 유형</span>
                            <span className={`font-bold px-3 py-1 rounded-full text-sm ${profile.role === 'therapist' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                {profile.role === 'therapist' ? '상담사' : '환자'}
                            </span>
                        </div>
                    </div>
                    <div className="mt-8 space-y-3">
                        <button onClick={logout} className="w-full py-3 flex justify-center gap-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-medium"><LogOut className="w-4 h-4"/> 로그아웃</button>
                        <button onClick={handleDeleteAccount} className="w-full py-3 flex justify-center gap-2 text-red-500 hover:bg-red-50 rounded-xl font-medium text-sm">회원 탈퇴</button>
                    </div>
                </section>

                {/* 2. 연결 관리 카드 */}
                <section className="bg-white p-8 rounded-3xl shadow-sm border border-gray-200">
                    <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
                        <LinkIcon className="w-6 h-6 mr-2 text-indigo-600"/> 
                        {profile.role === 'patient' ? '내 상담사 관리' : '내 환자 관리'}
                    </h2>

                    {/* 연결 요청 폼 */}
                    <div className="bg-gray-50 p-5 rounded-2xl mb-6">
                        <p className="text-sm text-gray-600 mb-3 font-medium flex items-center gap-1">
                            <Plus className="w-4 h-4"/> 새로운 연결 요청
                        </p>
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