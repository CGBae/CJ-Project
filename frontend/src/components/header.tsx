// src/components/header.tsx
'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Header() {
  const [isAuthed, setIsAuthed] = useState(false);
  const isBypass = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';

  useEffect(() => {
    if (isBypass) {
      setIsAuthed(true);
      return;
    }

    // 쿠키만으로는 클라이언트 판별이 어려울 수 있으니 간단히 /api/health나 /auth/me 핑
    fetch('/api/health', { credentials: 'include' })
      .then(r => setIsAuthed(r.ok))
      .catch(() => setIsAuthed(false));
  }, [isBypass]);

  return (
    <header className="border-b bg-white">
      <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-4">
        <Link href="/" className="font-semibold">TheraMusic</Link>
        <nav className="flex items-center gap-3">
          {isAuthed ? (
            <>
              <Link href="/dashboard" className="hover:underline">대시보드</Link>
              {isBypass && (
                // ⬇️ 테스트 모드일 때만 노출되는 Protected 페이지 링크 버튼들
                <>
                  <Link href="/intake" className="px-2 py-1 border rounded text-sm hover:bg-gray-100">Intake</Link>
                  <Link href="/counsel" className="px-2 py-1 border rounded text-sm hover:bg-gray-100">Counsel</Link>
                  <Link href="/music" className="px-2 py-1 border rounded text-sm hover:bg-gray-100">Music</Link>
                  <Link href="/post" className="px-2 py-1 border rounded text-sm hover:bg-gray-100">Post</Link>
                  <Link href="/summary/test-session" className="px-2 py-1 border rounded text-sm hover:bg-gray-100">Summary</Link>
                  <Link href="/admin" className="px-2 py-1 border rounded text-sm hover:bg-gray-100">Admin</Link>
                </>
              )}
              <a href="http://localhost:8000/auth/logout" className="text-red-600 hover:underline">로그아웃</a>
            </>
          ) : (
            <Link href="/login" className="hover:underline">로그인</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
