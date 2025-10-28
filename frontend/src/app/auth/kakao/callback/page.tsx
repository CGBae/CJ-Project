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
}