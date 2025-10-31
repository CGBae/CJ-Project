'use client';

import { useAuth } from '@/lib/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation'; // 💡 usePathname 추가
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthed, isLoading, role } = useAuth();
  const router = useRouter();
  const pathname = usePathname(); // 💡 현재 경로 가져오기

  useEffect(() => {
    if (isLoading) return; // 로딩 중에는 대기

    if (!isAuthed) {
      // 로그인이 안 되어 있으면 로그인 페이지로
      router.push(`/login?next=${pathname}`); // 💡 현재 경로를 next로 전달
      return;
    }

    if (role !== 'patient') {
      // (혹시 모를) 상담사가 환자 페이지 접근 시
      router.push('/dashboard/counselor'); // 상담사 대시보드로
    }
  }, [isLoading, isAuthed, role, router, pathname]); // 💡 pathname 추가

  // --- 렌더링 로직 ---

  // 1. 로딩 중일 때
  if (isLoading) {
    return (
        <div className="flex justify-center items-center h-64">
             <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
             <p className="ml-2">권한 확인 중...</p>
        </div>
    );
  }

  // 💡 2. [핵심 수정] 로딩이 끝났는데 인증이 안 됐을 때 (로그아웃 포함)
  //    "접근 권한 없음" 대신, 리다이렉트가 완료될 때까지 로딩 표시
  if (!isAuthed) {
     return (
        <div className="flex justify-center items-center h-64">
             <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
             <p className="ml-2">로그인 페이지로 이동 중...</p>
        </div>
    );
  }
  
  // 3. (선택 사항) 환자가 아닌 경우
  if (role !== 'patient') {
       return (
        <div className="flex justify-center items-center h-64">
             <p className="text-red-600">환자 전용 페이지입니다. 대시보드로 이동합니다...</p>
        </div>
    );
  }

  // 4. 모든 조건 통과 (환자 맞음)
  return <>{children}</>;
}