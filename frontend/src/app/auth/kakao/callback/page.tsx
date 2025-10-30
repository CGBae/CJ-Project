// src/app/api/auth/kakao/callback/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function KakaoCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const KAKAO_REDIRECT_URI = 'http://localhost:3000/auth/kakao/callback'; 

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      sendCodeToBackend(code);
    } else {
      setError('카카오 인증 코드를 받지 못했습니다.');
    }
  }, [searchParams, router]); // 의존성 배열 유지

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
        const errData = await response.json();
        throw new Error(errData.detail || '카카오 로그인 실패');
      }

      const data = await response.json();
      const token = data.access_token;

      // 토큰 저장
      localStorage.setItem('accessToken', token);
      
      // 💡 [핵심 추가] 로그인 성공 이벤트를 발생시켜 Header에게 알립니다.
      window.dispatchEvent(new Event('storageChanged'));

      // 메인 페이지로 이동
      router.push('/'); 

    } catch (err: unknown) {
      // ... (에러 처리 로직은 그대로)
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