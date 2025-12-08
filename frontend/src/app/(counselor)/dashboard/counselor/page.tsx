'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Loader2, AlertTriangle, Users, Music, UserPlus, ArrowRight, Clock } from 'lucide-react';
import Link from 'next/link';

// 1. 백엔드 API 응답 타입 정의
// (schemas.py의 CounselorStats와 일치)
interface CounselorStats {
  total_patients: number;
  total_music_tracks: number;
}

// (schemas.py의 RecentMusicTrack과 일치)
interface RecentMusicTrack {
    music_id: number | string;
    music_title: string;
    patient_id: number | string;
    patient_name: string | null;
    
    session_id: number;
    initiator_type: string | null;
    has_dialog: boolean | null;
    created_at: string; // 👈 생성 날짜 (중요)
}

// 💡 시간 차이 계산 헬퍼 함수
function formatTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000; // 1년
    if (interval > 1) return Math.floor(interval) + "년 전";
    interval = seconds / 2592000; // 1달
    if (interval > 1) return Math.floor(interval) + "달 전";
    interval = seconds / 86400; // 1일
    if (interval > 1) return Math.floor(interval) + "일 전";
    interval = seconds / 3600; // 1시간
    if (interval > 1) return Math.floor(interval) + "시간 전";
    interval = seconds / 60; // 1분
    if (interval > 1) return Math.floor(interval) + "분 전";
    return Math.floor(seconds) + "초 전";
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

export default function CounselorDashboardPage() {
  const router = useRouter();
  const { isAuthed } = useAuth(); // (인증은 (counselor)/layout.tsx가 처리)

  const [stats, setStats] = useState<CounselorStats | null>(null);
  const [recentMusic, setRecentMusic] = useState<RecentMusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 2. [수정] API 호출 로직 (Bypass 제거)
  useEffect(() => {
    // isAuthed가 false면 (counselor)/layout.tsx가 튕겨내므로,
    // 이 컴포넌트에 도달했다면 isAuthed는 true임 (또는 로딩 중)
    
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setError('인증 토큰이 없습니다. 다시 로그인해 주세요.');
        setLoading(false);
        router.push('/login?next=/dashboard/counselor');
        return;
      }

      try {
        // 2개 API 병렬 호출
        const [statsRes, musicRes] = await Promise.all([
                              fetch(`${API_URL}/therapist/stats`, { // 👈 1. 통계 API
            headers: { 'Authorization': `Bearer ${token}` }
          }),
                              fetch(`${API_URL}/therapist/recent-music?limit=3`, { // 👈 2. 최근 음악 API
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);

        if (statsRes.status === 401 || musicRes.status === 401) throw new Error('인증 실패');
        
        if (!statsRes.ok) throw new Error('통계 정보 로딩 실패');
        setStats(await statsRes.json());
        
        if (!musicRes.ok) throw new Error('최근 음악 로딩 실패');
        setRecentMusic(await musicRes.json());

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "데이터 로딩 중 오류 발생";
        setError(errorMessage);
        if (errorMessage.includes('인증 실패')) {
            localStorage.removeItem('accessToken');
            router.push('/login?next=/dashboard/counselor');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);


  if (loading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-100px)]">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-4">
        <AlertTriangle className="w-12 h-12 text-red-600 mb-4" />
        <h1 className="text-xl font-bold mb-4 text-red-600">데이터 로딩 오류</h1>
        <p className="text-gray-600 mb-6">{error}</p>
      </div>
    );
  }

  // 💡 3. [핵심 수정] JSX (UI) 레이아웃 변경
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-8">
      
      {/* 1. 페이지 헤더 (CTA 버튼 우측으로 이동) */}
      <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">상담가 대시보드</h1>
          <p className="text-lg text-gray-600 mt-1">배정된 환자 현황을 확인하세요.</p>
        </div>
        <button
            onClick={() => router.push('/mypage')} // 👈 설정(옵션) 페이지로
            className="flex-shrink-0 w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 text-white text-md font-semibold rounded-lg shadow-lg hover:bg-indigo-700 transition-transform transform hover:scale-105"
        >
            <UserPlus className="w-5 h-5" />
            신규 환자 검색 및 연결
        </button>
      </header>

      {/* 2. 메인 컨텐츠 (2단 그리드) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 2-1. 메인 컬럼 (최근 음악 목록) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center mb-5">
            <Music className="w-5 h-5 mr-3 text-indigo-500"/>
            환자들의 최근 생성 음악
          </h2>
          
          {recentMusic.length === 0 ? (
            <div className="p-6 text-center bg-gray-50 rounded-lg border border-gray-200">
              <Music className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">아직 생성된 음악이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentMusic.map(track => (
                <div key={track.music_id} className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition hover:border-indigo-300 hover:shadow-md">
                  
                  {/* 음악 정보 (제목, 환자명, 생성 시간) */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-indigo-700 truncate">{track.music_title}</p>
                    <p className="text-sm font-medium text-gray-800 mt-1">
                      환자: {track.patient_name || '이름 없음'} (ID: {track.patient_id})
                    </p>
                    <p className="text-xs text-gray-500 mt-1 flex items-center">
                      <Clock className="w-3 h-3 mr-1.5" />
                      {formatTimeAgo(track.created_at)}
                    </p>
                  </div>
                  
                  {/* 액션 버튼 */}
                  <Link
                    href={`/counselor/${track.patient_id}`}
                    className="flex-shrink-0 w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-white text-indigo-600 text-sm font-medium rounded-md border border-indigo-300 hover:bg-indigo-50 transition-colors"
                  >
                    상세 차트 보기 <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2-2. 사이드바 (통계) */}
        <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center mb-4">
                    <Users className="w-5 h-5 mr-3 text-indigo-500"/>
                    담당 환자 수
                </h3>
                <p className="text-4xl font-bold text-gray-900">
                    {stats?.total_patients ?? 0} <span className="text-xl font-medium text-gray-500">명</span>
                </p>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center mb-4">
                    <Music className="w-5 h-5 mr-3 text-indigo-500"/>
                    총 생성된 음악
                </h3>
                <p className="text-4xl font-bold text-gray-900">
                    {stats?.total_music_tracks ?? 0} <span className="text-xl font-medium text-gray-500">곡</span>
                </p>
            </div>
            
            {/* (기존 "+ 신규 환자" 버튼은 상단으로 이동) */}
        </div>

      </div>
    </div>
  );
}