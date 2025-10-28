'use client';

import { useEffect, useState, useRef } from 'react'; // 💡 1. useRef를 import 합니다.
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function KakaoCallbackPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [error, setError] = useState<string | null>(null);
    
    // 💡 2. 중복 실행을 방지하기 위한 '잠금 장치(flag)'를 만듭니다.
    const isProcessingRef = useRef(false);

    useEffect(() => {
        // 3. URL에서 카카오가 보내준 '인가 코드'를 추출합니다.
        const code = searchParams.get('code');

        // 💡 4. [핵심 수정] 
        //    (1) 코드가 있고, (2) 아직 처리 중(잠금 상태)이 아닐 때만 실행합니다.
        if (code && !isProcessingRef.current) {
            
            // (3) 즉시 '잠금' 상태로 만듭니다. (Strict Mode의 두 번째 실행 방지)
            isProcessingRef.current = true;

            const processLogin = async (authCode: string) => {
                try {
                    // (4) 백엔드에 이 코드를 보내서 실제 로그인(토큰 교환)을 요청합니다.
                    const response = await fetch('http://localhost:8000/auth/kakao/callback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code: authCode }),
                    });

                    if (!response.ok) {
                        const errData = await response.json();
                        // (KOE320 에러는 여기서 잡힙니다)
                        throw new Error(errData.detail || '로그인에 실패했습니다.');
                    }

                    const { access_token, user_role } = await response.json();

                    // (5) 받은 JWT 토큰을 localStorage에 저장합니다.
                    localStorage.setItem('accessToken', access_token);
                    
                    // (6) 역할에 따라 적절한 대시보드로 이동시킵니다.
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
        
    }, [searchParams, router]); // 의존성 배열은 그대로 둡니다.

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
}