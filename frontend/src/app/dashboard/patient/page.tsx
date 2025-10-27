'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// 1. 필요한 함수와 타입을 '가짜 DB'에서 모두 가져옵니다.
import { getPatientById, Patient, unlinkSessionFromPatient } from '@/lib/utils/patients';
import { MusicTrack } from '@/lib/utils/music';
// 2. 필요한 아이콘을 모두 가져옵니다.
import { MessageSquare, Plus, Loader2, Music, ArrowRight, Trash2 } from 'lucide-react';

// 3. 현재 로그인한 환자의 ID를 시뮬레이션합니다.
const SIMULATED_LOGGED_IN_PATIENT_ID = 'p_user_001';

export default function PatientDashboardPage() {
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [recentMusic, setRecentMusic] = useState<MusicTrack[]>([]);
  // 4. 삭제 작업 중인 세션 ID를 저장할 상태
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    // 5. '가짜 DB'에서 로그인한 환자의 정보를 불러옵니다.
    const patientData = getPatientById(SIMULATED_LOGGED_IN_PATIENT_ID);
    setPatient(patientData);
    if (patientData) {
        // 6. 환자의 음악 목록에서 최근 3개를 가져옵니다. (최신순 정렬)
        const recentTracks = [...patientData.generatedMusic].reverse().slice(0, 3);
        setRecentMusic(recentTracks);
    }
    setLoading(false);
  }, []); // 의존성 배열을 비워, 페이지 로드 시 1회만 실행

  // 7. 세션 기록 삭제 핸들러
  const handleDeleteSession = async (sessionId: number) => {
    if (!patient) return;
    // 사용자에게 재확인
    if (window.confirm(`상담 #${sessionId}의 모든 대화 기록을 삭제하시겠습니까? (생성된 음악은 유지됩니다)`)) {
        setDeletingId(sessionId); // 로딩 시작
        try {
            // (1) 백엔드 API에 삭제 요청
            const response = await fetch(`http://localhost:8000/chat/history/${sessionId}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "삭제에 실패했습니다.");
            }
            
            // (2) 프론트엔드 '가짜 DB'에서도 연결 해제
            unlinkSessionFromPatient(patient.id, sessionId);
            
            // (3) UI 갱신을 위해 patient 상태를 새 정보로 업데이트
            setPatient(prevPatient => {
                if (!prevPatient) return undefined;
                const updatedSessionIds = prevPatient.sessionIds.filter(id => id !== sessionId);
                return {
                    ...prevPatient,
                    sessionIds: updatedSessionIds,
                    totalSessions: updatedSessionIds.length
                };
            });

            alert("상담 기록이 삭제되었습니다.");

        } catch (err) {
            alert(err instanceof Error ? err.message : "알 수 없는 오류 발생");
        } finally {
            setDeletingId(null); // 로딩 종료
        }
    }
  };


  if (loading) {
    return <div className="flex justify-center items-center h-[calc(100vh-100px)]"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>;
  }

  if (!patient) {
    return (
        <div className="flex flex-col justify-center items-center h-screen text-center">
            <h1 className="text-2xl font-bold mb-4 text-red-600">환자 정보를 찾을 수 없습니다.</h1>
            <p className="text-gray-600 mb-6">로그인 정보(ID: {SIMULATED_LOGGED_IN_PATIENT_ID})를 확인해주세요.</p>
        </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-10">
      <h1 className="text-3xl font-bold text-gray-900">
        {patient.name}님, 안녕하세요!
      </h1>
      
      <section>
        <button
          onClick={() => router.push(`/intake/patient?userId=${patient.id}`)}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-indigo-600 text-white text-lg font-semibold rounded-lg shadow-lg hover:bg-indigo-700 transition"
        >
          <Plus className="w-6 h-6" />
          새로운 상담 시작하기 (Intake)
        </button>
      </section>

      {/* 최근 생성된 음악 섹션 */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">최근 생성된 음악</h2>
          <button
            onClick={() => router.push('/music')}
            className="flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            전체 플레이리스트 가기 <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </div>
        {recentMusic.length === 0 ? (
          <div className="p-6 text-center bg-gray-100 rounded-lg border border-gray-200">
            <Music className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500">아직 생성된 음악이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentMusic.map(track => (
              <div key={track.id} className="p-4 bg-white border rounded-lg shadow-sm flex items-center justify-between">
                <div className="flex items-center min-w-0">
                    <div className="p-2 bg-green-100 rounded-full mr-3">
                         <Music className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{track.title}</p>
                      <p className="text-sm text-gray-500 truncate">Prompt: {track.prompt}</p>
                    </div>
                </div>
                <button 
                    onClick={() => router.push('/music')}
                    className="ml-4 text-xs text-indigo-600 hover:underline flex-shrink-0">
                    재생하기
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 과거 상담 기록 섹션 */}
      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">과거 상담 기록</h2>
        {patient.sessionIds.length === 0 ? (
          <div className="p-6 text-center bg-gray-100 rounded-lg border">
            <MessageSquare className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500">아직 완료된 상담 기록이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {[...patient.sessionIds].reverse().map((sessionId, index) => (
              <div
                key={sessionId}
                className="bg-white p-4 rounded-lg border shadow-sm flex justify-between items-center"
              >
                <div>
                  <p className="font-semibold text-gray-700">상담 #{patient.sessionIds.length - index}</p>
                  <p className="text-xs text-gray-500">세션 ID: {sessionId}</p>
                </div>
                {/* 버튼 그룹핑 */}
                <div className="flex items-center gap-2">
                    <button
                      onClick={() => router.push(`/counsel?session=${sessionId}&patientId=${patient.id}`)}
                      disabled={deletingId === sessionId} // 삭제 중 비활성화
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-indigo-600 text-sm font-medium rounded-md border border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      <MessageSquare className="w-4 h-4" />
                      이어하기
                    </button>
                    {/* "삭제" 버튼 */}
                    <button
                      onClick={() => handleDeleteSession(sessionId)}
                      disabled={deletingId === sessionId} // 삭제 중 비활성화
                      className="p-2 text-red-500 hover:bg-red-100 rounded-md disabled:opacity-50"
                      aria-label="기록 삭제"
                    >
                        {deletingId === sessionId ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Trash2 className="w-4 h-4" />
                        )}
                    </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}