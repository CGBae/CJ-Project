'use client'; // 👈 'use client'는 여기에 있어야 합니다.

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react'; // 💡 로딩 아이콘 추가

function getApiUrl() {
  // 1순위: 내부 통신용 (docker 네트워크 안에서 backend 이름으로 호출)
  if (process.env.INTERNAL_API_URL) {
    return process.env.INTERNAL_API_URL;
  }

  // 2순위: 공개용 API URL (빌드 시점에라도 이건 거의 항상 들어있음)
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // 3순위: 최후 fallback - 도커 네트워크 기준으로 backend 서비스 직접 호출
  return 'http://backend:8000';
}

const API_URL = getApiUrl();
export default function KakaoCallbackClient() {
    const router = useRouter();
    const searchParams = useSearchParams(); // 👈 훅 사용
    const [error, setError] = useState<string | null>(null);

    // .env 파일 또는 이전 코드와 동일한 리다이렉트 URI
    const KAKAO_REDIRECT_URI = process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI || 'http://localhost:3000/auth/kakao/callback'; 

    useEffect(() => {
        const code = searchParams.get('code');
        if (code) {
            sendCodeToBackend(code);
        } else {
            setError('카카오 인증 코드를 받지 못했습니다.');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]); // 👈 sendCodeToBackend는 useCallback으로 감싸지 않았으므로 의존성 배열에서 빼는 것이 좋습니다.

    const sendCodeToBackend = async (code: string) => {
        try {
                        const response = await fetch(`${API_URL}/auth/kakao`, {
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

            // 💡 [핵심 수정] 백엔드 응답 분기 처리 (정석적인 방법)
            const data = await response.json(); // { status, access_token?, temp_token? }

            if (data.status === 'success' && data.access_token) {
                // --- 1. 기존 사용자: 로그인 처리 ---
                localStorage.setItem('accessToken', data.access_token);
                window.dispatchEvent(new Event('storageChanged')); // 헤더 업데이트 신호
                router.push('/'); // 홈으로 이동
            
            } else if (data.status === 'register_required' && data.temp_token) {
                // --- 2. 신규 사용자: 회원가입 페이지로 이동 ---
                localStorage.setItem('temp_register_token', data.temp_token); // 임시 토큰 저장
                router.push('/register'); // 회원가입 페이지로
            
            } else {
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
        <div className="flex flex-col justify-center items-center min-h-screen text-center p-4">
            {error ? (
                <div className="text-red-600">
                    <p className="font-bold text-lg mb-2">로그인 실패:</p>
                    <p>{error}</p>
                    <a href="/login" className="mt-4 inline-block px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                        로그인 페이지로 돌아가기
                    </a>
                </div>
            ) : (
                <div className="flex flex-col items-center">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                    <p className="mt-4 text-lg font-medium text-gray-700">카카오 로그인 중입니다...</p>
                    <p className="text-sm text-gray-500">잠시만 기다려주세요.</p>
                </div>
            )}
        </div>
    );
}