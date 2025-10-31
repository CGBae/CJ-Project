'use client';

import { useAuth } from '@/lib/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation'; // 💡 usePathname 추가
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function CounselorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthed, isLoading, role } = useAuth();
  const router = useRouter();
  const pathname = usePathname(); // 💡 현재 경로 가져오기

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthed) {
      router.push(`/login?next=${pathname}`); // 💡 현재 경로를 next로 전달
      return;
    }

    if (role !== 'therapist') {
      // 환자가 상담사 페이지 접근 시
      router.push('/dashboard/patient'); // 환자 대시보드로
    }
  }, [isLoading, isAuthed, role, router, pathname]); // 💡 pathname 추가

  // --- 렌더링 로직 ---

  if (isLoading) {
    return (
        <div className="flex justify-center items-center h-64">
             <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
             <p className="ml-2">권한 확인 중...</p>
        </div>
    );
  }

  // 💡 [핵심 수정] 로딩 끝났는데 인증 안 됐을 때 (로그아웃 포함)
  if (!isAuthed) {
     return (
        <div className="flex justify-center items-center h-64">
             <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
             <p className="ml-2">로그인 페이지로 이동 중...</p>
        </div>
    );
  }

  // (선택 사항) 상담사가 아닌 경우
  if (role !== 'therapist') {
       return (
        <div className="flex justify-center items-center h-64">
             <p className="text-red-600">상담사 전용 페이지입니다. 대시보드로 이동합니다...</p>
        </div>
    );
  }

  // 모든 조건 통과 (상담사 맞음)
  return <>{children}</>;
}