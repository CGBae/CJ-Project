// src/components/header.tsx
'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Header() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [role, setRole] = useState<'patient' | 'counselor' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isBypass = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';
  const BACKEND_URL = 'http://localhost:8000';
  const router = useRouter();

  const checkAuth = () => {
    setIsLoading(true);
    if (isBypass) {
      setIsAuthed(true);
      setRole('patient');
      setIsLoading(false);
      return;
    }

    const token = localStorage.getItem('accessToken');

    if (!token) {
      setIsAuthed(false);
      setRole(null);
      setIsLoading(false);
      return;
    }

    fetch(`${BACKEND_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          setIsAuthed(true);
          setRole(data.role || 'patient');
        } else {
          setIsAuthed(false);
          setRole(null);
          localStorage.removeItem('accessToken');
        }
      })
      .catch((e) => {
        console.error("Authentication check failed:", e);
        setIsAuthed(false);
        setRole(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  // 💡 [수정] useEffect가 이벤트를 리스닝하도록 변경
  useEffect(() => {
    // 페이지 로드 시 즉시 1회 실행
    checkAuth();

    // 'storageChanged' 이벤트(로그인/로그아웃 신호)를 리스닝
    window.addEventListener('storageChanged', checkAuth);

    // 컴포넌트 언마운트 시 리스너 정리 (메모리 누수 방지)
    return () => {
      window.removeEventListener('storageChanged', checkAuth);
    };
  }, [isBypass]); // 의존성 배열에서 loggedInStatus 제거

  const handleRoleToggle = () => {
    setRole((prev) => (prev === 'patient' ? 'counselor' : 'patient'));
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    setIsAuthed(false);
    setRole(null);
    // 💡 [수정] 로그아웃 시에도 이벤트를 발생시킴
    window.dispatchEvent(new Event('storageChanged'));
    router.push('/login');
  };
  return (
    <header className="border-b bg-white">
      <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-4">
        <Link href="/" className="font-semibold text-lg">
          TheraMusic
        </Link>


        <nav className="flex items-center gap-3">
          {isLoading ? ( // ⬅️ [4. 로딩 중일 때 로딩 표시]
            <div className="w-20 h-4 bg-gray-200 animate-pulse rounded"></div>
          ) : isAuthed ? (
            <>
              {/* 역할별 메뉴 */}
              {role === 'patient' && (
                <>
                  <Link href="/dashboard/patient" className="hover:underline">환자대시보드</Link>
                  <Link href="/intake/patient" className="hover:underline">접수</Link>
                  <Link href="/counsel" className="hover:underline">상담</Link>
                  <Link href="/compose" className="hover:underline">작곡체험</Link>
                  <Link href="/music" className="hover:underline">음악</Link>
                </>
              )}

              {role === 'counselor' && (
                <>
                  <Link href="/dashboard/counselor" className="hover:underline">상담가대시보드</Link>
                  <Link href="/intake/counselor" className="hover:underline">환자 접수</Link>
                  <Link href="/counselor" className="hover:underline">환자 관리</Link>
                </>
              )}

              {/* 역할 전환 버튼 */}
              <button
                onClick={handleRoleToggle}
                className="ml-2 px-3 py-1 text-sm border rounded hover:bg-gray-100"
              >
                {role === 'patient' ? '상담가 ver' : '환자 ver'}
              </button>

              {/* 로그아웃 */}
              <button
                type="button" // <a> 태그 대신 <button> 사용
                onClick={handleLogout} // onClick 핸들러 연결
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