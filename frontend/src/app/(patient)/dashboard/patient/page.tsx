'use client';

import React, { useState, useEffect, Fragment, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
// 💡 1. [수정] 아이콘 추가 (Heart)
import {
  MessageSquare, Plus, Loader2, Music, ArrowRight, Trash2,
  AlertTriangle, ChevronDown, User, Heart
} from 'lucide-react';

// 💡 2. [수정] MusicTrackInfo 타입 (is_favorite 추가)
interface UserProfile {
  id: number | string;
  email: string | null;
  role: string;
  name?: string | null;
}
interface SessionInfo {
  id: number;
  created_at: string;
  initiator_type: string | null;
  has_dialog: boolean | null;
}
interface MusicTrackInfo {
  id: number | string;
  title: string;
  prompt: string;
  audioUrl: string;
  track_url?: string;
  created_at: string;
  session_id: number;
  initiator_type: string | null;
  has_dialog: boolean | null;
  is_favorite: boolean; // 👈 [추가]
}
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
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

// 💡 3. [수정] 헬퍼 함수 (세션 ID 제거)
const getDynamicTitle = (track: MusicTrackInfo): string => {
  if (track.title && !track.title.includes("AI 생성 트랙")) {
    return track.title.split(' (')[0];
  }
  if (track.initiator_type === "therapist") {
    return `상담사 처방 음악`;
  } else if (track.initiator_type === "patient") {
    if (track.has_dialog) {
      return `AI 상담 기반 음악`;
    } else {
      return `작곡 체험 음악`;
    }
  }
  return track.title ? track.title.split(' (')[0] : `AI 트랙 #${track.id}`;
};

export default function PatientDashboardPage() {
  const router = useRouter();
  const { user, isAuthed, isLoading: isAuthLoading } = useAuth(); // 💡 [수정] user, isAuthLoading 가져오기

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [recentMusic, setRecentMusic] = useState<MusicTrackInfo[]>([]);
  // 💡 4. [추가] 즐겨찾기 목록 state
  const [favoriteMusic, setFavoriteMusic] = useState<MusicTrackInfo[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [chatLogs, setChatLogs] = useState<Record<number, ChatMessage[]>>({});
  const [logLoading, setLogLoading] = useState<number | null>(null);

  // 💡 5. [수정] useEffect (API 3개 호출, AuthContext 의존)
  useEffect(() => {
    // AuthContext가 로딩 중이면 API 호출 대기
    if (isAuthLoading) {
      setLoading(true);
      return;
    }
    // AuthContext 로딩 완료 + 로그아웃 상태
    if (!isAuthed) {
      setError("로그인이 필요합니다.");
      setLoading(false);
      router.push('/login?next=/dashboard/patient');
      return;
    }
    // AuthContext 로딩 완료 + 로그인 상태
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('accessToken');
      if (!token) { // (이중 확인)
        setError("로그인이 필요합니다.");
        setLoading(false);
        return;
      }

      try {
        // 💡 3개 API 병렬 호출 (즐겨찾기 API 추가)
        const [sessionsRes, musicRes, favRes] = await Promise.all([
          fetch(`${API_URL}/sessions/my?has_dialog=true`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch(`${API_URL}/music/my?limit=3`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch(`${API_URL}/music/my/favorites`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if (sessionsRes.status === 401 || musicRes.status === 401 || favRes.status === 401) throw new Error('인증 실패');

        if (!sessionsRes.ok) throw new Error('상담 기록 로딩 실패');
        setSessions(await sessionsRes.json());

        if (!musicRes.ok) throw new Error('최근 음악 로딩 실패');
        const musicData: MusicTrackInfo[] = await musicRes.json();
        setRecentMusic(musicData.map(track => ({ ...track, audioUrl: track.audioUrl || track.track_url || '' })));

        // 💡 [추가] 즐겨찾기 목록 set
        if (!favRes.ok) throw new Error('즐겨찾기 목록 로딩 실패');
        const favData: MusicTrackInfo[] = await favRes.json();
        setFavoriteMusic(favData.map(track => ({ ...track, audioUrl: track.audioUrl || track.track_url || '' })));

      } catch (err: unknown) {
        console.error("Dashboard data fetch error:", err);
        const errorMessage = err instanceof Error ? err.message : "데이터 로딩 중 오류 발생";
        setError(errorMessage);
        if (errorMessage.includes('인증 실패')) {
          localStorage.removeItem('accessToken');
          router.push('/login?next=/dashboard/patient');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isAuthed, isAuthLoading, router]); // 👈 [수정] 의존성

  

  // 💡 7. [수정] toggleChatLog (useCallback 추가)
  const toggleChatLog = useCallback(async (sessionId: number) => {
    if (chatLogs[sessionId]) {
      setChatLogs(prevLogs => {
        const newLogs = { ...prevLogs };
        delete newLogs[sessionId];
        return newLogs;
      });
      return;
    }
    setLogLoading(sessionId);
    setError(null);
    const token = localStorage.getItem('accessToken');
    if (!token) { setError("인증 토큰이 없습니다."); setLogLoading(null); return; }

    try {
      const response = await fetch(`${API_URL}/chat/history/${sessionId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401) throw new Error('인증 실패');
      if (response.status === 403) throw new Error('이 기록에 접근할 권한이 없습니다.');
      if (!response.ok) throw new Error("채팅 기록 로딩 실패");

      const data = await response.json();
      setChatLogs(prevLogs => ({
        ...prevLogs,
        [sessionId]: data.history.length > 0 ? data.history : [{ id: 'empty', role: 'assistant', content: '저장된 대화 기록이 없습니다.' }]
      }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
      if (err instanceof Error && (err.message.includes('인증 실패') || err.message.includes('401'))) {
        localStorage.removeItem('accessToken');
        router.push('/login?next=/dashboard/patient');
      }
    } finally {
      setLogLoading(null);
    }
  }, [chatLogs, router]); // 👈 의존성 추가


  if (loading || isAuthLoading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-100px)]">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="ml-3 text-lg text-gray-600">대시보드 로딩 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center h-screen text-center p-4">
        <AlertTriangle className="w-12 h-12 text-red-600 mb-4" />
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

  // 💡 [수정] user가 null일 때를 대비한 최종 가드
  if (!user) {
    return (
      <div className="flex flex-col justify-center items-center h-screen text-center">
        <h1 className="text-2xl font-bold mb-4 text-gray-700">사용자 정보를 불러올 수 없습니다.</h1>
        <p className="text-gray-600 mb-6">다시 로그인하거나 새로고침해주세요.</p>
      </div>
    );
  }

  // 💡 8. [핵심 수정] JSX (UI) - "즐겨찾는 음악" 섹션 추가
  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-8 bg-gray-50 min-h-screen">

      {/* --- 1. 헤더 --- */}
      <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {/* 💡 [오류 수정] user? (Optional Chaining) 사용 */}
            {user?.name || user?.email || '사용자'}님, 안녕하세요!
          </h1>
          <p className="text-lg text-gray-600 mt-1">오늘의 상태를 요약해 드립니다.</p>
        </div>
        <button
          onClick={() => router.push(`/intake/patient`)}
          className="flex-shrink-0 w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 text-white text-md font-semibold rounded-lg shadow-lg hover:bg-indigo-700 transition-transform transform hover:scale-105"
        >
          <Plus className="w-5 h-5" />
          새로운 상담 시작
        </button>
      </header>

      {/* --- 2. 메인 컨텐츠 (그리드) --- */}
      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 2-1. 메인 컬럼 (최근 + 즐겨찾기) */}
        <div className="lg:col-span-2 space-y-8">

          {/* 💡 "즐겨찾는 음악" 섹션 (새로 추가) */}
          <section className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                <Heart className="w-5 h-5 mr-3 text-pink-500 fill-pink-500" />
                즐겨찾는 음악
              </h2>
              <button
                onClick={() => router.push('/music')}
                className="flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                전체 목록 <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            </div>
            {favoriteMusic.length === 0 ? (
              <div className="p-6 text-center bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-500">아직 즐겨찾기한 음악이 없습니다.</p>
                <p className="text-sm text-gray-400 mt-1">내 음악 페이지에서 하트(❤️)를 눌러 추가해보세요.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {favoriteMusic.map(track => (
                  <div
                    key={track.id}
                    className="p-4 bg-white border rounded-lg shadow-sm flex items-center justify-between transition hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/music?track=${track.id}`)} // 👈 클릭 시 음악 페이지로 이동
                  >
                    <div className="flex items-center min-w-0">
                      <div className="p-2 bg-pink-100 rounded-full mr-4">
                        <Heart className="w-5 h-5 text-pink-600 fill-pink-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{getDynamicTitle(track)}</p>
                        <p className="text-sm text-gray-500 mt-1">
                          {new Date(track.created_at).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <a
                      href={track.audioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-4 text-sm text-indigo-600 hover:underline flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      재생하기
                    </a>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* "최근 생성된 음악" 섹션 (변경 없음) */}
          <section className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800 flex items-center mb-4">
              <Music className="w-5 h-5 mr-3 text-green-500" />
              최근 생성된 음악
            </h2>
            {recentMusic.length === 0 ? (
              <div className="p-6 text-center bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-500">아직 생성된 음악이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentMusic.map(track => (
                  <div
                    key={track.id}
                    className="p-4 bg-white border rounded-lg shadow-sm flex items-center justify-between transition hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/music?track=${track.id}`)}
                  >
                    <div className="flex items-center min-w-0">
                      <div className="p-2 bg-green-100 rounded-full mr-4">
                        <Music className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{getDynamicTitle(track)}</p>
                        <p className="text-sm text-gray-500 mt-1">
                          {new Date(track.created_at).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <a
                      href={track.audioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-4 text-sm text-indigo-600 hover:underline flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      재생하기
                    </a>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* 2-2. 사이드바 (과거 상담 기록) */}
        <section className="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2 mb-6">
            <MessageSquare className="w-5 h-5 text-indigo-500" />
            상담 기록
          </h2>

          {sessions.length === 0 ? (
            <div className="p-10 text-center bg-gray-50 rounded-xl border border-gray-100">
              <MessageSquare className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              {/* 💡 [수정] 텍스트 변경 */}
              <p className="text-gray-500">아직 완료된 AI 상담이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
              {[...sessions]
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map((session, index) => (
                  <Fragment key={session.id}>
                    <div
                      className="border border-gray-200 bg-white hover:bg-gray-50 rounded-xl p-4 transition cursor-pointer"
                      onClick={() => toggleChatLog(session.id)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-gray-700">
                            {new Date(session.created_at).toLocaleString('ko-KR', {
                              year: 'numeric', month: 'long', day: 'numeric'
                            })}
                          </p>
                          <p className="text-xs text-gray-500">
                            {/* 💡 [수정] 이제 항상 'AI 상담'만 표시됨 */}
                            AI 상담
                          </p>
                        </div>
                        <ChevronDown
                          className={`w-5 h-5 text-gray-400 transition-transform ${chatLogs[session.id] ? 'rotate-180' : ''
                            }`}
                        />
                      </div>

                      {/* 미리보기 대화 */}
                      {logLoading === session.id && (
                        <div className="flex justify-center items-center pt-4 mt-4 border-t">
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        </div>
                      )}
                      {chatLogs[session.id] && (
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-2 max-h-40 overflow-y-auto">
                          {chatLogs[session.id].map((msg) => (
                            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div
                                className={`p-2.5 rounded-lg text-xs leading-relaxed ${msg.role === 'user'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-200 text-gray-700'
                                  }`}
                              >
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 💡 [핵심 수정] 버튼 영역 */}
                      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // 💡 [수정] 이 목록의 세션은 항상 has_dialog: true 이므로 /counsel로 이동
                            router.push(`/counsel?session=${session.id}`);
                          }}
                          disabled={deletingId === session.id}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white text-indigo-600 text-xs font-medium rounded-md border border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          <MessageSquare className="w-4 h-4" />
                          {/* 💡 [수정] 버튼 텍스트 '이어하기'로 고정 */}
                          이어하기
                        </button>
                        
                      </div>
                    </div>
                  </Fragment>
                ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}