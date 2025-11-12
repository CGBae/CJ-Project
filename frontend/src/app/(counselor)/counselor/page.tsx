// 파일 경로: /src/app/counselor/page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// 1. 중앙 DB에서 환자 목록과 타입을 가져옵니다.
// import { getPatients, Patient } from '@/lib/utils/patients';
import { User, ChevronRight, Plus, Loader2} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext'; // 💡 2. AuthContext 훅 임포트

// 💡 3. 백엔드 UserPublic 스키마와 일치하는 새 타입 정의
interface PatientInfo {
  id: number | string;
  name: string | null;
  email: string | null;
  role: string;
  // (참고: age, lastSession 등은 User 모델에 없으므로 일단 제외)
}

const API_URL = process.env.INTERNAL_API_URL;

// === 환자 카드 컴포넌트 ===
// PatientCard 컴포넌트를 페이지 컴포넌트 외부 또는 별도 파일로 분리해도 좋습니다.
const PatientCard: React.FC<{ patient: PatientInfo }> = ({ patient }) => {
    const router = useRouter();

    const handleCardClick = () => {
        router.push(`/counselor/${patient.id}`);
    };

    return (
        <div
            onClick={handleCardClick}
            className="bg-white border border-gray-200 rounded-xl shadow-md p-5 transition-all duration-300 hover:shadow-lg hover:border-indigo-400 cursor-pointer"
        >
            {/* 카드 헤더: 프로필 사진과 이름 */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border">
                        {/* 💡 5. avatarUrl 대신 User 아이콘 기본 표시 */}
                        <User className="w-6 h-6 text-gray-400" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-gray-800">{patient.name || '이름 없음'}</h3>
                        <p className="text-sm text-gray-500">{patient.email || '이메일 없음'}</p>
                    </div>
                </div>
                <ChevronRight className="w-6 h-6 text-gray-400 group-hover:text-indigo-600" />
            </div>

            {/* 카드 본문: 요약 정보 */}
            {/* <div className="space-y-2 border-t pt-4 mt-4 border-gray-100">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-500">마지막 상담일</span>
                    <span className="font-medium text-gray-700">{patient.lastSession}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-500">총 상담 횟수</span>
                    <span className="font-medium text-indigo-600">{patient.totalSessions}회</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-500">생성된 음악</span>
                    <span className="font-medium text-green-600">{patient.generatedMusic.length}곡</span>
                </div>
            </div> */}
        </div>
    );
};

export default function CounselorDashboardPage() {
    // 💡 8. [수정] '가짜' Patient[] 대신 '실제' PatientInfo[] 사용
    const [patients, setPatients] = useState<PatientInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { isAuthed } = useAuth(); // 💡 9. 인증 상태 확인
    const router = useRouter();

    // 💡 10. [핵심 수정] '가짜 DB' useEffect를 실제 API 호출로 변경
    useEffect(() => {
        // AuthContext가 로딩 중이거나, 로그인 전이면 API 호출 안 함
        if (!isAuthed) {
            // AuthContext의 로딩이 끝날 때까지 기다리기 위해 로딩 상태를 유지
            // (AuthContext의 isLoading이 false가 되고 isAuthed가 true가 될 때까지)
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
                // 11. 백엔드 /therapist/my-patients API 호출
                // 🚨 [수정] API 경로 확인! (http://... 또는 프록시 경로)
                const response = await fetch(`${API_URL}/therapist/my-patients`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.status === 401) throw new Error('인증 실패');
                if (!response.ok) throw new Error('환자 목록을 불러오는 데 실패했습니다.');
                
                const data: PatientInfo[] = await response.json();
                setPatients(data);

            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : '데이터 로딩 오류');
            } finally {
                setLoading(false);
            }
        };

        fetchMyPatients();
    }, [isAuthed]); // 💡 12. isAuthed가 true가 되면(로그인 확인되면) 실행

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
        return <div className="p-4 text-center text-red-600">오류: {error}</div>;
    }
    
    return (
        <div className="max-w-4xl mx-auto p-6 bg-gray-50 min-h-screen">
            {/* 페이지 헤더 */}
            <header className="flex justify-between items-center mb-8 pb-4 border-b">
                <h1 className="text-3xl font-bold text-gray-900">환자 관리 대시보드</h1>
                {/* 💡 13. '환자 연결' 기능이 있는 설정(option) 페이지로 연결 */}
                <button
                    onClick={() => router.push('/counseloroption')} // 👈 경로 수정
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 transition-colors text-sm font-medium"
                >
                    <Plus className="w-5 h-5" />
                    환자 연결/관리
                </button>
            </header>

            {/* 환자 카드 목록 */}
            <main>
                {patients.length === 0 ? (
                    <div className="text-center py-20">
                        <User className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                        <p className="text-gray-500">배정된 환자가 없습니다.</p>
                        <p className="text-sm text-gray-400 mt-2"> -환자 연결/관리- 버튼을 눌러 환자를 추가하세요.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {patients.map(patient => (
                            <PatientCard key={patient.id} patient={patient} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}