// 파일 경로: /src/app/dashboard/_components/PatientDashboard.tsx

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Music, ArrowRight } from 'lucide-react';
// 최근 음악 표시를 위해 플레이리스트 관련 함수를 가져옵니다.
import { getPlaylist, MusicTrack } from '@/lib/utils/music';

export default function PatientDashboard() {
  const router = useRouter();
  // 예시로 최근 2곡만 가져옵니다.
  const recentMusic = getPlaylist().slice(-2).reverse();
  // 예시 사용자 이름 (실제로는 사용자 정보에서 가져와야 함)
  const patientName = "사용자";

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* 환영 메시지 */}
      <section>
        <h1 className="text-3xl font-bold text-gray-900">
          {patientName}님, 안녕하세요! 👋
        </h1>
        <p className="mt-2 text-lg text-gray-600">
          오늘 기분은 어떠신가요? AI 상담을 통해 마음을 돌보고 음악으로 위로받으세요.
        </p>
      </section>

      {/* 주요 액션 버튼 */}
      <section className="text-center">
        <button
          onClick={() => router.push('/counsel')}
          className="inline-flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white text-lg font-semibold rounded-lg shadow-lg hover:bg-indigo-700 transition duration-300 transform hover:scale-105"
        >
          <MessageSquare className="w-6 h-6" />
          AI 상담 시작하기
        </button>
      </section>

      {/* 최근 생성된 음악 */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">최근 생성된 음악</h2>
          <button
            onClick={() => router.push('/music')}
            className="flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            내 플레이리스트 가기 <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </div>
        {recentMusic.length === 0 ? (
          <div className="p-6 text-center bg-gray-100 rounded-lg border border-gray-200">
            <p className="text-gray-500">아직 생성된 음악이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {recentMusic.map(track => (
              <div key={track.id} className="p-4 bg-white border rounded-lg shadow-sm flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 truncate">{track.title}</p>
                  <p className="text-xs text-gray-500">{track.artist}</p>
                </div>
                {/* 간단한 재생 버튼 (실제 재생 기능 없음) */}
                <button className="p-2 text-indigo-500 hover:text-indigo-700">
                  <Music className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}