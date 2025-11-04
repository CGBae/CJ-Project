'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function KakaoCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  // .env 파일 또는 이전 코드와 동일한 리다이렉트 URI
  const KAKAO_REDIRECT_URI = process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI || 'http://localhost:3000/auth/kakao/callback'; 

  useEffect(() => {
    const code = searchParams.get('code');

    if (code) {
      // sendCodeToBackend는 useEffect 외부에서 정의되었으므로
      // router 객체를 직접 사용할 수 있습니다. (의존성 배열에 router 불필요)
      sendCodeToBackend(code);
    } else {
      setError('카카오 인증 코드를 받지 못했습니다.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]); // 👈 router는 sendCodeToBackend 함수가 클로저로 접근하므로 의존성 불필요

  const sendCodeToBackend = async (code: string) => {
    try {
      const response = await fetch('http://localhost:8000/auth/kakao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code,
          redirect_uri: KAKAO_REDIRECT_URI,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: '카카오 로그인 실패' }));
        throw new Error(errData.detail || '카카오 로그인 실패');
      }

      // 💡 [핵심 수정] 백엔드 응답 분기 처리
      const data = await response.json(); // { status, access_token?, temp_token? }

      if (data.status === 'success' && data.access_token) {
        // --- 1. 기존 사용자: 로그인 처리 ---
        localStorage.setItem('accessToken', data.access_token);
        window.dispatchEvent(new Event('storageChanged')); // 헤더 업데이트 신호
        router.push('/'); // 홈으로 이동 (헤더가 역할에 맞게 리다이렉트)
      
      } else if (data.status === 'register_required' && data.temp_token) {
        // --- 2. 신규 사용자: 회원가입 페이지로 이동 ---
        localStorage.setItem('temp_register_token', data.temp_token); // 임시 토큰 저장
        router.push('/register'); // 회원가입 페이지로
      
      } else {
        // --- 3. 예외 상황 ---
        throw new Error('알 수 없는 서버 응답입니다.');
      }

    } catch (err: unknown) {
      if (typeof err === 'string') {
        setError(err);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('알 수 없는 오류');
      }
    }
  };

  // 렌더링(JSX) 부분은 변경 없음
  return (
    <div className="flex items-center justify-center min-h-screen">
      {error ? (
        <div className="text-red-600">
          <p>로그인 실패:</p>
          <p>{error}</p>
        </div>
      ) : (
        <p>카카오 로그인 중입니다...</p>
      )}
    </div>
  );
}
