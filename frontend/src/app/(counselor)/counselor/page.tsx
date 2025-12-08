'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { User, ChevronRight, Plus, Loader2, AlertTriangle, Music, MessageSquare, Search } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext'; 

// 💡 1. [수정] PatientInfo 타입 (age 필드 추가)
interface PatientInfo {
  id: number | string;
  name: string | null;
  email: string | null;
  role: string;
  age: number | null; // 👈 [추가] age (또는 dob)
  total_sessions: number;
  total_music_tracks: number;
  social_provider: string | null; // 👈 [추가] (카카오 여부 확인용)
}

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

// === 환자 카드 컴포넌트 ===
// 💡 2. [수정] PatientCard (나이, 카카오 로그인 표시)
const PatientCard: React.FC<{ patient: PatientInfo }> = ({ patient }) => {
    const router = useRouter();

    const handleCardClick = () => {
        router.push(`/counselor/${patient.id}`);
    };

    // 💡 [추가] 이메일 대신 표시할 텍스트
    const getPatientIdentifier = () => {
        if (patient.email) {
            return patient.email;
        }
        if (patient.social_provider === 'kakao') {
            return <span className="italic text-yellow-600">카카오 로그인 환자</span>;
        }
        return '이메일 없음';
    };

    return (
        <div
            onClick={handleCardClick}
            className="bg-white border border-gray-200 rounded-xl shadow-md p-5 transition-all duration-300 hover:shadow-lg hover:border-indigo-400 cursor-pointer"
        >
            {/* 카드 헤더: 프로필 사진과 이름 */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border">
                        <User className="w-6 h-6 text-gray-400" />
                    </div>
                    <div className="min-w-0">
                        {/* 💡 [수정] 이름과 나이 표시 */}
                        <h3 className="text-xl font-bold text-gray-800 truncate">
                            {patient.name || '이름 없음'}
                            {patient.age && (
                                <span className="text-lg font-medium text-gray-500 ml-2">({patient.age}세)</span>
                            )}
                        </h3>
                        {/* 💡 [수정] 이메일 또는 "카카오 로그인" 표시 */}
                        <p className="text-sm text-gray-500 truncate">{getPatientIdentifier()}</p>
                    </div>
                </div>
                <ChevronRight className="w-6 h-6 text-gray-400" />
            </div>

            {/* 카드 본문: 요약 정보 (변경 없음) */}
            <div className="space-y-2 border-t pt-4 mt-4 border-gray-100">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-500 flex items-center">
                        <MessageSquare className="w-4 h-4 mr-1.5" />
                        총 상담 횟수
                    </span>
                    <span className="font-medium text-indigo-600">{patient.total_sessions}회</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-500 flex items-center">
                        <Music className="w-4 h-4 mr-1.5" />
                        총 생성 음악
                    </span>
                    <span className="font-medium text-green-600">{patient.total_music_tracks}곡</span>
                </div>
            </div>
        </div>
    );
};

export default function CounselorPatientPage() {
    const [patients, setPatients] = useState<PatientInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { isAuthed } = useAuth(); 
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');

    // 💡 3. [수정] useEffect (API 호출)
    useEffect(() => {
        if (!isAuthed) {
            // (AuthContext 로딩 중이거나 로그아웃 상태)
            return; 
        }

        const fetchMyPatients = async () => {
            setLoading(true);
            setError(null);
            const token = localStorage.getItem('accessToken');
            if (!token) {
                setError('인증 토큰이 없습니다. 다시 로그인해 주세요.');
                setLoading(false);
                return;
            }

            try {
                // 💡 [수정] /therapist/my-patients API가 이제 통계 정보 + age + social_provider를 반환
                                const response = await fetch(`${API_URL}/therapist/my-patients`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.status === 401) throw new Error('인증 실패');
                if (!response.ok) throw new Error('환자 목록을 불러오는 데 실패했습니다.');
                
                const data: PatientInfo[] = await response.json();
                setPatients(data);

            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : '데이터 로딩 오류');
                if (err instanceof Error && err.message.includes('인증 실패')) {
                    localStorage.removeItem('accessToken');
                    router.push('/login?next=/counselor');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchMyPatients();
    }, [isAuthed, router]); 

    // 💡 4. [수정] 검색어 필터링 로직 (ID 검색 추가)
    const filteredPatients = useMemo(() => {
        const query = searchTerm.toLowerCase();
        if (!query) return patients; 

        return patients.filter(patient => {
            const nameMatch = patient.name?.toLowerCase().includes(query);
            const emailMatch = patient.email?.toLowerCase().includes(query);
            const idMatch = String(patient.id).includes(query); // 👈 ID로 검색
            return nameMatch || emailMatch || idMatch;
        });
    }, [patients, searchTerm]);


    // --- 렌더링 로직 ---

    if (loading) {
        return (
             <div className="flex justify-center items-center h-64">
                 <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                 <p className="ml-2">환자 목록 로딩 중...</p>
            </div>
        );
    }

    if (error) {
         return (
            <div className="flex flex-col items-center justify-center h-64 text-center p-4">
                <AlertTriangle className="w-12 h-12 text-red-600 mb-4" />
                <h1 className="text-xl font-bold mb-4 text-red-600">오류 발생</h1>
                <p className="text-gray-600 mb-6">{error}</p>
            </div>
        );
    }
    
    // 💡 5. [수정] JSX (UI) 수정
    return (
        <div className="max-w-4xl mx-auto p-6 bg-gray-50 min-h-screen">
            {/* 페이지 헤더 */}
            <header className="flex flex-col sm:flex-row justify-between sm:items-center mb-8 pb-4 border-b">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">환자 관리</h1>
                    <p className="text-gray-600 mt-1">담당 환자 목록 및 요약 정보를 확인합니다.</p>
                </div>
                <button
                    onClick={() => router.push('/mypage')} 
                    className="flex mt-4 sm:mt-0 items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 transition-colors text-sm font-medium"
                >
                    <Plus className="w-5 h-5" />
                    환자 연결/관리
                </button>
            </header>
            
            {/* 💡 [수정] 검색창 placeholder */}
            <div className="mb-6 relative">
                <input 
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="환자 이름, 이메일, 또는 ID로 검색..."
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>

            {/* 환자 카드 목록 */}
            <main>
                {patients.length === 0 ? (
                    // (환자가 아예 없는 경우)
                    <div className="text-center py-20">
                        <User className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                        <p className="text-gray-500">배정된 환자가 없습니다.</p>
                        <p className="text-sm text-gray-400 mt-2"> -환자 연결/관리- 버튼을 눌러 환자를 추가하세요.</p>
                    </div>
                ) : filteredPatients.length === 0 ? (
                    // (검색 결과가 없는 경우)
                    <div className="text-center py-20">
                        <Search className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                        <p className="text-gray-500">{searchTerm}에 대한 검색 결과가 없습니다.</p>
                    </div>
                ) : (
                    // (환자 목록 표시)
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {filteredPatients.map(patient => (
                            <PatientCard key={patient.id} patient={patient} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}