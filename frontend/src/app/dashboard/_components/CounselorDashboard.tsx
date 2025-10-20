// 파일 경로: /src/app/dashboard/_components/CounselorDashboard.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getPatients, Patient } from '@/lib/utils/patients';
import { User, ChevronRight, Plus } from 'lucide-react';

// 환자 카드 컴포넌트 (이전 코드 재사용)
const PatientCard: React.FC<{ patient: Patient }> = ({ patient }) => {
    const router = useRouter();
    return (
        <div onClick={() => router.push(`/counselor/${patient.id}`)}
             className="bg-white border border-gray-200 rounded-xl shadow-md p-5 transition-all duration-300 hover:shadow-lg hover:border-indigo-400 cursor-pointer group">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border">
                        {patient.avatarUrl ? ( <img src={patient.avatarUrl} alt={patient.name} className="w-full h-full object-cover" /> ) : ( <User className="w-6 h-6 text-gray-400" /> )}
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-gray-800 group-hover:text-indigo-600 transition-colors">{patient.name}</h3>
                        <p className="text-sm text-gray-500">{patient.age}세</p>
                    </div>
                </div>
                <ChevronRight className="w-6 h-6 text-gray-400 group-hover:text-indigo-600 transition-colors" />
            </div>
            <div className="space-y-2 border-t pt-4 mt-4 border-gray-100">
                <div className="flex justify-between text-sm"><span className="text-gray-500">마지막 상담일</span><span className="font-medium text-gray-700">{patient.lastSession}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">총 상담 횟수</span><span className="font-medium text-indigo-600">{patient.totalSessions}회</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">생성된 음악</span><span className="font-medium text-green-600">{patient.generatedMusic.length}곡</span></div>
            </div>
        </div>
    );
};

// 상담가 대시보드 메인 컴포넌트
export default function CounselorDashboard() {
    const [patients, setPatients] = useState<Patient[]>([]);
    const router = useRouter();

    useEffect(() => {
        setPatients(getPatients());
    }, []);

    return (
        <div className="max-w-4xl mx-auto p-6 bg-gray-50 min-h-screen">
            <header className="flex justify-between items-center mb-8 pb-4 border-b">
                <h1 className="text-3xl font-bold text-gray-900">환자 관리 대시보드</h1>
                <button onClick={() => router.push('/intake/counselor')}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 transition-colors text-sm font-medium">
                    <Plus className="w-5 h-5" />
                    신규 환자 등록
                </button>
            </header>
            <main>
                {patients.length === 0 ? (
                    <div className="text-center py-20"><p className="text-gray-500">등록된 환자가 없습니다.</p></div>
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