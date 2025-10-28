// src/app/auth/kakao/callback/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
// (권장) 이전에 만든 api 클라이언트와 토큰 설정 함수
// import { api, setAuthToken } from '@/lib/api'; 

export default function KakaoCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  // 백엔드 .env의 KAKAO_REDIRECT_URI와 동일해야 함
  const KAKAO_REDIRECT_URI = 'http://localhost:3000/auth/kakao/callback'; 

  useEffect(() => {
    // 1. URL에서 '인가 코드'를 파싱
    const code = searchParams.get('code');

    if (code) {
      // 2. 백엔드로 '인가 코드' 전송
      sendCodeToBackend(code);
    } else {
      setError('카카오 인증 코드를 받지 못했습니다.');
      // (에러 시 로그인 페이지로)
      // router.push('/login');
    }
  }, [searchParams, router]);

  const sendCodeToBackend = async (code: string) => {
    try {
      // (권장: 'api.post' 사용)
      // const response = await api.post('/auth/kakao', {
      //   code: code,
      //   redirect_uri: KAKAO_REDIRECT_URI,
      // });
      
      // (대안: fetch 사용)
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

      // 3. 백엔드로부터 '내 서비스 JWT 토큰' 수신
      const data = await response.json(); // { "access_token": "...", "token_type": "bearer" }
      const token = data.access_token;

      // 4. 토큰 저장 (로그인 페이지와 동일한 로직)
      localStorage.setItem('accessToken', token);
      
      // (권장) axios 헤더에도 설정
      // setAuthToken(token);

      // 5. 로그인 성공 후 메인 페이지로 이동
      router.push('/'); // 또는 '/dashboard'

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