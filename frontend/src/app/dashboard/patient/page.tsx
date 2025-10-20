'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Music, ArrowRight, ListMusic } from 'lucide-react';
// 최근 음악 표시를 위해 플레이리스트 관련 함수를 가져옵니다.
import { getPlaylist, MusicTrack } from '@/lib/utils/music';

export default function PatientDashboardPage() {
  const router = useRouter();
  // 예시로 최근 3곡만 가져옵니다.
  const recentMusic = getPlaylist().slice(-3).reverse();
  // 예시 사용자 이름 (실제로는 로그인 시 받아온 사용자 정보 사용)
  const patientName = "김환자";

  return (
    <div className="max-w-4xl mx-auto p-6 sm:p-8 space-y-10">
      {/* 1. 환영 메시지 섹션 */}
      <section>
        <h1 className="text-4xl font-bold text-gray-900">
          {patientName}님, 안녕하세요! 👋
        </h1>
        <p className="mt-2 text-lg text-gray-600">
          오늘의 마음 상태에 맞는 음악을 처방받아보세요.
        </p>
      </section>

      {/* 2. 주요 액션 버튼 섹션 */}
      <section className="text-center p-8 bg-indigo-600 text-white rounded-xl shadow-lg">
        <h2 className="text-2xl font-semibold mb-4">AI 상담을 통해 마음 돌보기</h2>
        <p className="mb-6 max-w-lg mx-auto">AI 상담사와 대화를 나누고 현재 감정에 맞는 음악을 즉시 생성해 보세요.</p>
        <button
          onClick={() => router.push('/counsel')}
          className="inline-flex items-center gap-2 px-8 py-4 bg-white text-indigo-600 text-lg font-semibold rounded-lg shadow-md hover:bg-gray-100 transition duration-300 transform hover:scale-105"
        >
          <MessageSquare className="w-6 h-6" />
          AI 상담 시작하기
        </button>
      </section>

      {/* 3. 최근 생성된 음악 섹션 */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-gray-800">최근 생성된 음악</h2>
          <button
            onClick={() => router.push('/music')}
            className="flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            전체 플레이리스트 보기 <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </div>
        {recentMusic.length === 0 ? (
          <div className="p-8 text-center bg-gray-100 rounded-lg border border-gray-200">
             <ListMusic className="w-10 h-10 mx-auto text-gray-400 mb-2"/>
            <p className="text-gray-500 font-medium">아직 생성된 음악이 없습니다.</p>
            <p className="text-sm text-gray-400 mt-1">상담을 시작해 첫 음악을 만들어보세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentMusic.map(track => (
              <div key={track.id} className="p-4 bg-white border rounded-lg shadow-sm flex items-center justify-between gap-3">
                <div className="flex-shrink-0 text-indigo-500">
                    <Music className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{track.title}</p>
                  <p className="text-xs text-gray-500">{track.artist}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
