// 파일 경로: /src/app/dashboard/counselor/page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// 💡 중앙 DB에서 환자 데이터를 가져옵니다.
import { getPatients, Patient } from '@/lib/utils/patients';
// 💡 대시보드에 필요한 아이콘들을 가져옵니다.
import { Users, Music, Calendar, Plus, ArrowRight } from 'lucide-react';

// === 대시보드 통계 카드 컴포넌트 ===
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
    // 💡 여러 종류의 데이터를 관리할 상태들
    const [stats, setStats] = useState({ totalPatients: 0, totalMusic: 0 });
    const [todaySchedule, setTodaySchedule] = useState<{ time: string; patientName: string; patientId: string }[]>([]);
    const [recentMusic, setRecentMusic] = useState<(Patient & { musicTitle: string; musicId: string })[]>([]);

    useEffect(() => {
        // 페이지 로드 시 데이터를 불러오고 가공합니다.
        const patients = getPatients();
        
        // 1. 통계 계산
        const totalPatients = patients.length;
        const totalMusic = patients.reduce((sum, p) => sum + p.generatedMusic.length, 0);
        setStats({ totalPatients, totalMusic });

        // 2. 가짜 '오늘의 상담 일정' 데이터 생성
        setTodaySchedule([
            { time: '10:00', patientName: '김현우 (기존 환자)', patientId: 'p001' },
            { time: '14:30', patientName: '이수민 (기존 환자)', patientId: 'p002' },
        ]);

        // 3. '최근 생성된 음악' 데이터 가공 (최신 3개)
        const allMusic = patients.flatMap(p => 
            p.generatedMusic.map(m => ({ ...p, musicTitle: m.title, musicId: m.id }))
        ).sort((a, b) => b.musicId.localeCompare(a.musicId)) // 최신순 정렬 (ID 기준)
         .slice(0, 3);
        setRecentMusic(allMusic);

    }, []);

    return (
        <div className="max-w-5xl mx-auto p-6 bg-gray-50 min-h-screen space-y-8">
            {/* 1. 페이지 헤더 */}
            <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">상담가 대시보드</h1>
                    <p className="text-gray-600 mt-1">오늘의 현황을 한눈에 파악하세요.</p>
                </div>
                <button
                    onClick={() => router.push('/intake/counselor')}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 transition-colors text-sm font-medium self-start sm:self-center"
                >
                    <Plus className="w-5 h-5" />
                    신규 환자 등록
                </button>
            </header>

            <main className="space-y-8">
                {/* 2. 통계 카드 섹션 */}
                <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <StatCard 
                        title="총 환자 수" 
                        value={`${stats.totalPatients}명`} 
                        icon={<Users className="w-6 h-6 text-indigo-800" />}
                        color="bg-indigo-100"
                    />
                    <StatCard 
                        title="총 생성된 음악" 
                        value={`${stats.totalMusic}곡`}
                        icon={<Music className="w-6 h-6 text-green-800" />}
                        color="bg-green-100"
                    />
                </section>

                {/* 3. 오늘의 일정 & 최근 활동 섹션 (좌우 분할) */}
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* 오늘의 상담 일정 */}
                    <div className="bg-white p-5 rounded-xl border shadow-sm">
                        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-4">
                            <Calendar className="w-5 h-5 text-gray-500"/>
                            오늘의 상담 일정
                        </h2>
                        <ul className="space-y-3">
                            {todaySchedule.map(item => (
                                <li key={item.patientId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div>
                                        <span className="font-bold text-indigo-600 mr-3">{item.time}</span>
                                        <span className="font-medium text-gray-700">{item.patientName}</span>
                                    </div>
                                    <button onClick={() => router.push(`/counselor/${item.patientId}`)} className="text-xs text-gray-500 hover:underline">
                                        상세보기
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                    {/* 최근 생성된 음악 */}
                    <div className="bg-white p-5 rounded-xl border shadow-sm">
                        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-4">
                            <Music className="w-5 h-5 text-gray-500"/>
                            최근 생성된 음악
                        </h2>
                        <ul className="space-y-3">
                            {recentMusic.map(item => (
                                <li key={item.musicId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-gray-700 truncate">{item.musicTitle}</p>
                                        <p className="text-xs text-gray-500">환자: {item.name}</p>
                                    </div>
                                    <button onClick={() => router.push(`/counselor/${item.id}`)} className="text-xs text-gray-500 hover:underline ml-3">
                                        환자 정보
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>
                
                {/* 4. 전체 환자 목록으로 이동 버튼 */}
                <section className="text-center pt-4">
                    <button
                        onClick={() => router.push('/counselor')}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-800 font-semibold border border-gray-300 rounded-lg shadow-sm hover:bg-gray-100 transition duration-200"
                    >
                        전체 환자 목록 보기 <ArrowRight className="w-5 h-5" />
                    </button>
                </section>
            </main>
        </div>
    );
}