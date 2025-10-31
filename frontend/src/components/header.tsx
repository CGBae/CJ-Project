'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext'; // 💡 1. useAuth 훅 임포트

export default function Header() {
  // 💡 2. Context에서 상태와 함수를 가져옴 (모든 로직 삭제)
  const { isAuthed, role, isLoading, logout, checkAuth } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // 💡 3. 'storageChanged' 이벤트 리스닝 (로그인/로그아웃 즉시 반영)
  useEffect(() => {
    checkAuth(); // 페이지 로드 시 첫 인증 실행
    
    const handleStorageChange = () => checkAuth();
    window.addEventListener('storageChanged', handleStorageChange);
    return () => {
      window.removeEventListener('storageChanged', handleStorageChange);
    };
  }, [checkAuth]); // 💡 checkAuth를 의존성에 추가

  // 💡 4. 역할 기반 리다이렉트 (교통정리)
  useEffect(() => {
    if (isLoading || !isAuthed) return;
    if (pathname === '/') {
      if (role === 'therapist') {
        router.push('/dashboard/counselor');
      } else if (role === 'patient') {
        router.push('/dashboard/patient');
      }
    }
  }, [isLoading, isAuthed, role, pathname, router]);
  
  // 💡 5. 로그아웃 핸들러 (Context 함수 호출)
  const handleLogout = () => {
    logout();
  };

  return (
    <header className="border-b bg-white">
      <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-4">
        <Link href="/" className="font-semibold text-lg">
          TheraMusic
        </Link>
        <nav className="flex items-center gap-3">
          {isLoading ? (
            <div className="w-20 h-4 bg-gray-200 animate-pulse rounded"></div>
          ) : isAuthed ? (
            <>
              {/* 역할별 메뉴 (Context의 role 사용) */}
              {role === 'patient' && (
                <>
                  <Link href="/dashboard/patient" className="hover:underline">환자대시보드</Link>
                  <Link href="/intake/patient" className="hover:underline">접수</Link>
                  <Link href="/counsel" className="hover:underline">상담</Link>
                  <Link href="/compose" className="hover:underline">작곡체험</Link>
                  <Link href="/music" className="hover:underline">음악</Link>
                  <Link href="/patientoption" className="hover:underline">설정</Link>
                </>
              )}
              {role === 'therapist' && (
                <>
                  <Link href="/dashboard/counselor" className="hover:underline">상담가대시보드</Link>
                  <Link href="/intake/counselor" className="hover:underline">환자 접수</Link>
                  <Link href="/counselor" className="hover:underline">환자 관리</Link>
                  <Link href="/counseloroption" className="hover:underline">설정</Link>
                </>
              )}
              {/* 역할 전환 버튼 삭제됨 */}
              <button
                type="button"
                onClick={handleLogout}
                className="text-red-600 hover:underline ml-2 cursor-pointer"
              >
                로그아웃
              </button>
            </>
          ) : (
            <Link href="/login" className="hover:underline">
              로그인
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}