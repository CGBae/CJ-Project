'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// 💡 1. '가짜 DB' import 제거
// import { getPatients, Patient } from '@/lib/utils/patients';
import { Users, Music, Plus, ArrowRight, Loader2, AlertTriangle, UserCheck } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext'; // 💡 2. AuthContext 훅 임포트

// --- 💡 3. 백엔드 API 응답 타입 정의 ---
interface CounselorStats {
    total_patients: number;
    total_music_tracks: number;
}

interface RecentMusicTrack {
    music_id: number | string;
    music_title: string;
    patient_id: number | string;
    patient_name: string | null;
}

// === 대시보드 통계 카드 컴포넌트 === (변경 없음)
interface StatCardProps {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    color: string;
}
const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color }) => (
    <div className="bg-white p-5 rounded-xl border shadow-sm flex items-center gap-4">
        <div className={`p-3 rounded-full ${color}`}>
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-2xl font-bold text-gray-800">{value}</p>
        </div>
    </div>
);


// === 상담가 대시보드 페이지 ===
export default function CounselorDashboardPage() {
    const router = useRouter();
    const { isAuthed } = useAuth(); // 💡 4. 인증 상태 확인

    // 💡 5. [수정] 실제 데이터를 위한 상태
    const [stats, setStats] = useState<CounselorStats>({ total_patients: 0, total_music_tracks: 0 });
    const [recentMusic, setRecentMusic] = useState<RecentMusicTrack[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 💡 6. [핵심 수정] '가짜 DB' 대신 실제 API 호출
    useEffect(() => {
        // AuthContext가 로딩 중이거나, 로그인 전이면 API 호출 안 함
        if (!isAuthed) return;

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            const token = localStorage.getItem('accessToken');
            if (!token) {
                setError('인증 토큰이 없습니다. 다시 로그인해 주세요.');
                setLoading(false);
                return;
            }

            try {
                // 🚨 [필수] 백엔드에 이 API 2개가 구현되어 있어야 합니다.
                // API 요청들을 병렬로 실행
                const [statsRes, musicRes] = await Promise.all([
                    fetch('http://localhost:8000/therapist/stats', { // 👈 1. 통계 API
                        headers: { 'Authorization': `Bearer ${token}` }
                    }),
                    fetch('http://localhost:8000/therapist/recent-music?limit=3', { // 👈 2. 최근 음악 API
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                ]);

                // 공통 에러 처리
                if (statsRes.status === 401 || musicRes.status === 401) throw new Error('인증 실패');
                if (!statsRes.ok) throw new Error('통계 정보 로딩 실패');
                if (!musicRes.ok) throw new Error('최근 음악 로딩 실패');

                const statsData: CounselorStats = await statsRes.json();
                const musicData: RecentMusicTrack[] = await musicRes.json();

                setStats(statsData);
                setRecentMusic(musicData);

            } catch (err: unknown) { // 💡 'any' 대신 'unknown' 사용
                setError(err instanceof Error ? err.message : "알 수 없는 오류");
                if (err instanceof Error && err.message === '인증 실패') {
                    localStorage.removeItem('accessToken');
                    router.push('/login?next=/dashboard/patient');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [isAuthed, router]); // 💡 isAuthed가 true가 되면 실행

    // --- 렌더링 로직 ---

    if (loading) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-200px)]">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                <p className="ml-2">대시보드 로딩 중...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center p-4">
                <AlertTriangle className="w-12 h-12 text-red-600 mb-4" />
                <h1 className="text-2xl font-bold mb-4 text-red-600">오류 발생</h1>
                <p className="text-gray-600 mb-6">{error}</p>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto p-6 bg-gray-50 min-h-screen space-y-8">
            {/* 1. 페이지 헤더 (환자 등록 버튼 -> 환자 관리 버튼으로 변경) */}
            <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">상담가 대시보드</h1>
                    <p className="text-gray-600 mt-1">배정된 환자 현황을 확인하세요.</p>
                </div>
                {/* 💡 [수정] '환자 관리' 페이지로 바로 가는 버튼 */}
                <button
                    onClick={() => router.push('/counselor')}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 transition-colors text-sm font-medium self-start sm:self-center"
                >
                    <UserCheck className="w-5 h-5" />
                    환자 관리 바로가기
                </button>
            </header>

            <main className="space-y-8">
                {/* 2. 통계 카드 섹션 (데이터 연동) */}
                <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <StatCard
                        title="담당 환자 수"
                        value={`${stats.total_patients}명`}
                        icon={<Users className="w-6 h-6 text-indigo-800" />}
                        color="bg-indigo-100"
                    />
                    <StatCard
                        title="총 생성된 음악"
                        value={`${stats.total_music_tracks}곡`}
                        icon={<Music className="w-6 h-6 text-green-800" />}
                        color="bg-green-100"
                    />
                </section>

                {/* 3. 💡 [수정] '최근 생성된 음악' 섹션 (상담 일정 섹션 제거) */}
                <section className="bg-white p-5 rounded-xl border shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-4">
                        <Music className="w-5 h-5 text-gray-500" />
                        환자들의 최근 생성 음악
                    </h2>

                    {recentMusic.length === 0 ? (
                        <div className="text-center p-6 text-gray-500">
                            최근 생성된 음악이 없습니다.
                        </div>
                    ) : (
                        <ul className="space-y-3">
                            {recentMusic.map(item => (
                                <li key={item.music_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-gray-700 truncate">{item.music_title}</p>
                                        <p className="text-xs text-gray-500">환자: {item.patient_name || '이름 없음'}</p>
                                    </div>
                                    <button onClick={() => router.push(`/counselor/${item.patient_id}`)} className="text-xs text-indigo-600 hover:underline ml-3 flex-shrink-0">
                                        환자 정보 보기 <ArrowRight className="w-3 h-3 inline" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {/* 4. 💡 [아이디어] 환자 연결/등록 페이지로 바로 가는 버튼 (헤더와 중복이지만 강조용) */}
                <section className="text-center pt-4">
                    <button
                        onClick={() => router.push('/counseloroption')} // 👈 설정 페이지의 '환자 연결' 탭으로
                        className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-800 font-semibold border border-gray-300 rounded-lg shadow-sm hover:bg-gray-100 transition duration-200"
                    >
                        <Plus className="w-5 h-5" />
                        신규 환자 검색 및 연결
                    </button>
                </section>
            </main>
        </div>
    );
}