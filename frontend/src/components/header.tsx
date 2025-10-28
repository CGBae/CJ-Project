// src/components/header.tsx
'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Header() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [role, setRole] = useState<'patient' | 'counselor' | null>(null);
  const isBypass = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';

  useEffect(() => {
    if (isBypass) {
      setIsAuthed(true);
      setRole('patient'); // 기본 환자 모드
      return;
    }

    // 인증 상태 확인
    fetch('/api/health', { credentials: 'include' })
      .then(async (r) => {
        if (r.ok) {
          setIsAuthed(true);
          // 실제 서비스라면 /auth/me 등의 엔드포인트에서 role 받아오기
          const res = await fetch('/auth/me', { credentials: 'include' }).catch(() => null);
          if (res?.ok) {
            const data = await res.json();
            setRole(data.role); // role: 'patient' | 'counselor'
          } else {
            setRole('patient');
          }
        } else {
          setIsAuthed(false);
        }
      })
      .catch(() => setIsAuthed(false));
  }, [isBypass]);

  const handleRoleToggle = () => {
    setRole((prev) => (prev === 'patient' ? 'counselor' : 'patient'));
  };

  return (
    <header className="border-b bg-white">
      <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-4">
        <Link href="/" className="font-semibold text-lg">
          TheraMusic
        </Link>
          

        <nav className="flex items-center gap-3">
          {isAuthed ? (
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
              <a
                href="http://localhost:8000/auth/logout"
                className="text-red-600 hover:underline ml-2"
              >
                로그아웃
              </a>
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
