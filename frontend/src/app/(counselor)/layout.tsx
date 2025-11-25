'use client';

import React from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function CounselorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 💡 1. [수정] role 대신 user객체를 가져옵니다.
  const { user, isAuthed, isLoading } = useAuth();
  const router = useRouter();

  // 💡 2. [수정] AuthContext가 로딩 중일 때
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-80px)]">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="ml-3 text-lg text-gray-600">인증 정보 확인 중...</p>
      </div>
    );
  }

  // 💡 3. [수정] 로딩이 끝났는데, 로그인이 안 되어 있을 때
  if (!isLoading && !isAuthed) {
    // 💡 [수정] window.location.pathname 사용 (더 안전함)
    router.replace('/login?next=' + (typeof window !== 'undefined' ? window.location.pathname : '/dashboard/counselor')); // 👈 로그인 페이지로 튕겨냄
    return null; // 렌더링 중단
  }

  // 💡 4. [수정] 로그인은 됐는데, 역할이 '상담사(therapist)'가 아닐 때
  if (user && user.role !== 'therapist') {
    router.replace('/dashboard/patient'); // 👈 환자 대시보드로 튕겨냄
    return null; // 렌더링 중단
  }

  // 💡 5. 모든 검사를 통과한 경우 (로그인된 상담사)
  return <>{children}</>;
}