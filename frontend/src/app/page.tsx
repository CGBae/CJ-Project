import Link from 'next/link';
// 💡 페이지를 꾸미기 위해 아이콘을 가져옵니다.
import { Music, Sparkles,  Mic, MessageCircle } from 'lucide-react';

export default function Landing() {
  return (
    // 💡 1. 전체 화면을 채우고 중앙 정렬을 위한 컨테이너
    <section className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] px-4 py-16 text-center sm:py-24">

      {/* 2. 상단 아이콘 (장식) */}
      <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100">
        <Music className="h-12 w-12 text-indigo-600" />
      </div>

      {/* 3. 메인 헤드라인 */}
      <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
        <span className="block xl:inline">AI가 만드는, </span>
        <span className="block text-indigo-600 xl:inline">당신만을 위한 치유의 멜로디</span>
      </h1>

      {/* 4. 서브 설명 */}
      <p className="mt-6 max-w-xl mx-auto text-lg text-gray-600 sm:text-xl">
        TheraMusic은 AI와의 대화를 통해 당신의 현재 감정 상태에 꼭 맞는 음악을 실시간으로 작곡해 드립니다.
      </p>

      {/* 5. 콜투액션(CTA) 버튼 (로그인 + 회원가입) */}
      <div className="mt-10 flex flex-wrap justify-center gap-4">
        <Link
          href="/login"
          className="inline-flex items-center justify-center px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          로그인하고 시작하기
        </Link>
        <Link
          href="/register"
          className="inline-flex items-center justify-center px-8 py-3 bg-white text-indigo-600 font-semibold rounded-lg border border-gray-300 shadow-sm hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
        >
          회원가입
        </Link>
      </div>

      {/* 6. 간단한 기능 요약 (기존 내용 활용) */}
      <div className="mt-16 max-w-3xl w-full">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          TheraMusic의 치유 과정
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-6 text-left sm:grid-cols-3">

          <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200">
            <Mic className="w-6 h-6 text-indigo-500 mb-2" />
            <h3 className="font-semibold text-gray-800">1. 상담 및 분석</h3>
            <p className="text-sm text-gray-600 mt-1">AI와의 대화를 통해 현재 감정 상태를 분석합니다.</p>
          </div>

          <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200">
            <Sparkles className="w-6 h-6 text-purple-500 mb-2" />
            <h3 className="font-semibold text-gray-800">2. AI 음악 생성</h3>
            <p className="text-sm text-gray-600 mt-1">대화 내용을 기반으로 맞춤형 음악을 생성합니다.</p>
          </div>

          <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200">
            <MessageCircle className="w-6 h-6 text-green-500 mb-2" />
            <h3 className="font-semibold text-gray-800">3. 감정 공유 커뮤니티</h3>
            <p className="text-sm text-gray-600 mt-1">
              사용자들이 음악 경험과 감정 변화를 서로 공유하며 치유 여정을 함께합니다.
            </p>
          </div>

        </div>
      </div>
    </section>
  );
}