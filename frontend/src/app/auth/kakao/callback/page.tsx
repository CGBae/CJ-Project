<<<<<<< HEAD
'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function KakaoCallbackPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [error, setError] = useState<string | null>(null);
    const isProcessingRef = useRef(false);

    useEffect(() => {
        const code = searchParams.get('code');

        if (code && !isProcessingRef.current) {
            isProcessingRef.current = true;

            const processLogin = async (authCode: string) => {
                try {
                    // 💡 1. [핵심 수정] 
                    // 백엔드의 auth.py에 정의된 올바른 주소('/auth/kakao/callback')로 수정합니다.
                    const response = await fetch('http://localhost:8000/auth/kakao/callback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        // 💡 2. [핵심 수정]
                        // 이 API는 'code'만 받도록 되어있으므로, 'redirect_uri'를 제거합니다.
                        body: JSON.stringify({ 
                            code: authCode 
                        }),
                    });

                    if (!response.ok) {
                        const errData = await response.json();
                        throw new Error(errData.detail || '로그인에 실패했습니다.');
                    }

                    const { access_token, user_role, user_name } = await response.json();
                    
                    // 3. 받은 JWT 토큰과 사용자 이름을 localStorage에 저장합니다.
                    localStorage.setItem('accessToken', access_token);
                    localStorage.setItem('userName', user_name); // 👈 환영 메시지에 사용
                    
                    // 4. 역할에 따라 적절한 대시보드로 이동시킵니다.
                    if (user_role === 'counselor') {
                        router.push('/dashboard/counselor');
                    } else {
                        router.push('/dashboard/patient');
                    }

                } catch (err) {
                    setError(err instanceof Error ? err.message : '알 수 없는 오류 발생');
                }
            };
            
            processLogin(code);
        } else if (!code) {
             setError('카카오 인증 코드를 받지 못했습니다.');
        }
        
    }, [searchParams, router]);

    // (로딩 및 에러 UI 렌더링)
    return (
        <div className="flex flex-col justify-center items-center h-screen">
            {error ? (
                <>
                    <h1 className="text-xl font-semibold text-red-600">로그인 오류</h1>
                    <p className="text-gray-600 mt-2 max-w-sm text-center">{error}</p>
                    <button onClick={() => router.push('/login')} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md">
                        로그인 페이지로 돌아가기
                    </button>
                </>
            ) : (
                <>
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                    <p className="mt-4 text-gray-700">로그인 처리 중입니다...</p>
                </>
            )}
        </div>
    );
=======
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
>>>>>>> 68fe083da59e999d74535b1a3c7b3461cc1d88ef
}