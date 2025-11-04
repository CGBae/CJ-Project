'use client';

export const dynamic = 'force-dynamic';

import React, { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, LogIn } from 'lucide-react';

// 💡 환경 변수 로딩 함수
const getKakaoEnv = () => {
    // .env.local의 NEXT_PUBLIC_... 환경 변수를 정확히 읽습니다.
    const KAKAO_REDIRECT_URI = process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI || 'http://localhost:3000/auth/kakao/callback';
    const KAKAO_CLIENT_ID = process.env.NEXT_PUBLIC_KAKAO_REST_KEY; 

    return { KAKAO_REDIRECT_URI, KAKAO_CLIENT_ID };
};

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const nextUrl = searchParams.get('next') || '/dashboard/patient'; // 로그인 후 이동할 경로

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { KAKAO_CLIENT_ID, KAKAO_REDIRECT_URI } = getKakaoEnv();


    // --- 💡 카카오 로그인 URL 생성 및 이동 핸들러 ---
    const getKakaoLoginUrl = () => {
        if (!KAKAO_CLIENT_ID) {
            return '#'; 
        }
        return `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_CLIENT_ID}&redirect_uri=${KAKAO_REDIRECT_URI}&response_type=code`;
    };
    
    const handleKakaoLogin = () => {
        const kakaoUrl = getKakaoLoginUrl();
        if (kakaoUrl === '#') {
            setError('카카오 클라이언트 ID가 설정되지 않았습니다. (.env.local 확인)');
            return;
        }
        router.push(kakaoUrl);
    };


    // --- 💡 이메일 로그인 핸들러 ---
    const handleEmailLogin = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        // FastAPI의 /auth/login은 application/x-www-form-urlencoded 형식을 기대합니다.
        const formData = new URLSearchParams();
        formData.append('username', email); // FastAPI OAuth2는 username 필드를 사용
        formData.append('password', password);

        try {
            // 이메일 로그인 API 호출
            const response = await fetch('http://localhost:8000/auth/login', {
                method: 'POST',
                // Content-Type 헤더를 명시적으로 설정하여 FastAPI의 OAuth2Form 요구사항을 충족
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, 
                body: formData,
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ detail: '로그인 실패: 서버 응답 오류' }));
                throw new Error(errData.detail || '이메일 또는 비밀번호가 올바르지 않습니다.');
            }

            const data = await response.json(); // { access_token: "...", token_type: "bearer" }
            const token = data.access_token;

            // 1. 토큰 저장
            localStorage.setItem('accessToken', token);

            // 2. 헤더 업데이트를 위한 이벤트 발생 (헤더에 로그인 상태 즉시 반영)
            window.dispatchEvent(new Event('storageChanged'));

            // 3. 다음 경로로 이동
            router.push('/');

        } catch (err) {
            console.error("Login error:", err);
            setError(err instanceof Error ? err.message : '알 수 없는 오류 발생');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex justify-center items-center min-h-screen bg-gray-100">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-2xl">
                <h2 className="text-3xl font-extrabold text-center text-gray-900">로그인</h2>

                <form onSubmit={handleEmailLogin} className="space-y-4">
                    {/* 이메일 입력 */}
                    <input
                        id="email"
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        disabled={loading}
                    />
                    {/* 비밀번호 입력 */}
                    <input
                        id="password"
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        disabled={loading}
                    />

                    {error && (
                        <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg text-center font-medium">{error}</div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center items-center px-4 py-3 text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 transition-colors"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <LogIn className="w-5 h-5 mr-2" />}
                        이메일로 로그인
                    </button>
                </form>

                <div className="relative flex justify-center py-2">
                    <span className="bg-white px-2 text-sm text-gray-500">또는</span>
                </div>

                {/* 카카오 로그인 버튼 (URL로 리다이렉트) */}
                <button
                    type="button"
                    onClick={handleKakaoLogin}
                    className="w-full flex justify-center items-center px-4 py-3 text-sm font-medium rounded-lg shadow-md text-gray-900 bg-yellow-400 hover:bg-yellow-500 transition-colors"
                >
                    카카오로 로그인
                </button>

                {/* 회원가입 링크 */}
                <div className="text-center text-sm mt-4">
                    <p className="text-gray-600">
                        계정이 없으신가요?
                        <Link href="/register" className="font-medium text-green-600 hover:text-green-500 ml-1">
                            회원가입
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}