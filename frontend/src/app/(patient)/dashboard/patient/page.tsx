'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// 💡 1. '가짜 DB' import 제거
// import { getPatientById, Patient, unlinkSessionFromPatient } from '@/lib/utils/patients';
// import { MusicTrack } from '@/lib/utils/music';
import { MessageSquare, Plus, Loader2, Music, ArrowRight, Trash2 } from 'lucide-react';

// 💡 2. 실제 데이터 타입을 정의합니다. (백엔드 API 응답에 맞춰야 함)
interface SessionInfo {
  id: number;
  created_at: string; // 또는 Date
  // 필요한 다른 정보 (예: 상태)
}

interface MusicTrackInfo {
  id: number; // 또는 string
  title: string;
  prompt: string;
  audioUrl: string;
  track_url?: string; // 💡 이 줄 추가 (?는 '있을 수도 있고 없을 수도 있다'는 뜻)
}

interface UserProfile {
  id: number; // 또는 string
  email: string; // 또는 name 등 사용자 식별 정보
  role: string;
  // 필요한 다른 정보
}

// 💡 3. 시뮬레이션 ID 제거
// const SIMULATED_LOGGED_IN_PATIENT_ID = 'p_user_001';

export default function PatientDashboardPage() {
  const router = useRouter();
  // 💡 4. 상태 타입을 실제 데이터에 맞게 변경
  const [user, setUser] = useState<UserProfile | null>(null); // 사용자 정보 상태 추가
  const [sessions, setSessions] = useState<SessionInfo[]>([]); // 세션 목록 상태
  const [recentMusic, setRecentMusic] = useState<MusicTrackInfo[]>([]); // 음악 목록 상태
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // 에러 상태 추가
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // 💡 5. [핵심 수정] useEffect에서 실제 API 호출
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('accessToken');

      if (!token) {
        setError("로그인이 필요합니다. 로그인 페이지로 이동합니다.");
        setLoading(false);
        router.push('/login?next=/dashboard/patient'); // 로그인 페이지로 리다이렉트
        return;
      }

      try {
        // --- API 호출 시작 ---

        // (1) 사용자 정보 가져오기 (/auth/me)
        const meResponse = await fetch('http://localhost:8000/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        // 401 오류 처리 추가
        if (meResponse.status === 401) throw new Error('인증 실패');
        if (!meResponse.ok) throw new Error('사용자 정보 로딩 실패');
        const userData: UserProfile = await meResponse.json();
        setUser(userData); // 사용자 정보 저장

        // (2) 상담 기록 가져오기 (/sessions/my) - 백엔드 경로 확인!
        const sessionsResponse = await fetch('http://localhost:8000/sessions/my', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!sessionsResponse.ok) throw new Error('상담 기록 로딩 실패');
        const sessionsData: SessionInfo[] = await sessionsResponse.json();
        setSessions(sessionsData); // 세션 목록 저장

        // (3) 최근 음악 가져오기 (/music/my?limit=3) - 백엔드 경로 확인!
        const musicResponse = await fetch('http://localhost:8000/music/my?limit=3', {
           headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!musicResponse.ok) throw new Error('최근 음악 로딩 실패');
        const musicData: MusicTrackInfo[] = await musicResponse.json();
        // 백엔드 track_url을 audioUrl로 매핑 (필요시)
        const mappedMusicData = musicData.map(track => ({
             ...track,
             audioUrl: track.audioUrl || track.track_url || ''
        }));
        setRecentMusic(mappedMusicData); // 음악 목록 저장

        // --- API 호출 끝 ---

      } catch (err) {
        console.error("Dashboard data fetch error:", err);
        const errorMessage = err instanceof Error ? err.message : "데이터 로딩 중 오류 발생";
        setError(errorMessage);
        // 인증 실패 시 localStorage 비우고 로그인 페이지로
        if (errorMessage === '인증 실패') {
             localStorage.removeItem('accessToken');
             router.push('/login?next=/dashboard/patient');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]); // 의존성 배열

  // 💡 6. [수정] 세션 기록 삭제 핸들러 (Authorization 헤더 추가)
  const handleDeleteSession = async (sessionId: number) => {
    if (window.confirm(`상담 세션 #${sessionId}의 모든 대화 기록을 삭제하시겠습니까?`)) {
        setDeletingId(sessionId);
        setError(null);
        const token = localStorage.getItem('accessToken');
        if (!token) {
             setError("로그인이 필요합니다.");
             setDeletingId(null);
             return;
        }

        try {
            const response = await fetch(`http://localhost:8000/chat/history/${sessionId}`, {
                method: 'DELETE',
                headers: { // ⬅️ 헤더 추가
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!response.ok) {
                // 401 오류 처리 추가
                if (response.status === 401) throw new Error('인증 실패');
                const err = await response.json();
                throw new Error(err.detail || "삭제에 실패했습니다.");
            }

            // UI 갱신: 삭제된 세션을 목록에서 제거
            setSessions(prevSessions => prevSessions.filter(s => s.id !== sessionId));

            alert("상담 기록이 삭제되었습니다.");

        } catch (err) {
             const errorMessage = err instanceof Error ? err.message : "삭제 중 오류 발생";
             setError(errorMessage);
             if (errorMessage === '인증 실패') {
                 localStorage.removeItem('accessToken');
                 router.push('/login?next=/dashboard/patient');
             }
        } finally {
            setDeletingId(null);
        }
    }
  };


  if (loading) {
    return <div className="flex justify-center items-center h-[calc(100vh-100px)]"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>;
  }

  // 💡 7. [수정] 에러 발생 시 에러 메시지 표시
  if (error) {
     return (
        <div className="flex flex-col justify-center items-center h-screen text-center p-4">
            <h1 className="text-2xl font-bold mb-4 text-red-600">오류 발생</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            {error.includes("로그인") && (
                 <button onClick={() => router.push('/login')} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                      로그인 페이지로 이동
                 </button>
            )}
        </div>
     );
  }

  // 💡 8. [수정] user 정보가 없을 때
  if (!user) {
    return (
        <div className="flex flex-col justify-center items-center h-screen text-center">
            <h1 className="text-2xl font-bold mb-4 text-gray-700">사용자 정보를 불러올 수 없습니다.</h1>
            <p className="text-gray-600 mb-6">다시 로그인하거나 새로고침해주세요.</p>
        </div>
    );
  }

  // 💡 9. [수정] JSX 부분을 실제 데이터(user, sessions, recentMusic)로 렌더링
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-10">
      {/* user.email 대신 user.name 등이 있다면 사용 */}
      <h1 className="text-3xl font-bold text-gray-900">
        {user.email || '사용자'}님, 안녕하세요!
      </h1>
      
      <section>
        {/* Intake 페이지로 이동 시 user.id 전달 (Intake 페이지도 수정 필요) */}
        <button
          onClick={() => router.push(`/intake/patient?userId=${user.id}`)}
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
            onClick={() => router.push('/music')} // 음악 페이지 경로 확인
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
                    <p className="font-medium text-gray-900 truncate">{track.title || `음악 트랙 #${track.id}`}</p>
                    <p className="text-sm text-gray-500 truncate">Prompt: {track.prompt || '정보 없음'}</p>
                  </div>
                </div>
                {/* 재생 버튼 */}
                <a 
                    href={track.audioUrl} // 백엔드가 제공한 URL 사용
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="ml-4 text-xs text-indigo-600 hover:underline flex-shrink-0">
                    재생하기
                </a>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 과거 상담 기록 섹션 */}
      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">과거 상담 기록</h2>
        {sessions.length === 0 ? (
          <div className="p-6 text-center bg-gray-100 rounded-lg border">
            <MessageSquare className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500">아직 완료된 상담 기록이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 최신순으로 정렬 */}
            {[...sessions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((session, index) => (
              <div
                key={session.id}
                className="bg-white p-4 rounded-lg border shadow-sm flex justify-between items-center"
              >
                <div>
                  <p className="font-semibold text-gray-700">상담 #{sessions.length - index}</p>
                  <p className="text-xs text-gray-500">세션 ID: {session.id}</p>
                  <p className="text-xs text-gray-500">
                     {new Date(session.created_at).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute:'2-digit' })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => router.push(`/counsel?session=${session.id}&patientId=${user.id}`)} 
                    disabled={deletingId === session.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-indigo-600 text-sm font-medium rounded-md border border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    <MessageSquare className="w-4 h-4" />
                    이어하기
                  </button>
                  <button
                    onClick={() => handleDeleteSession(session.id)}
                    disabled={deletingId === session.id}
                    className="p-2 text-red-500 hover:bg-red-100 rounded-md disabled:opacity-50"
                    aria-label="기록 삭제"
                  >
                    {deletingId === session.id ? (
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