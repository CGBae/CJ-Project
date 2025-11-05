import React, { Suspense } from 'react';
import KakaoCallbackClient from './KakaoCallbackClient'; // 👈 1. 방금 만든 컴포넌트 import
import { Loader2 } from 'lucide-react';

// 💡 2. 이 컴포넌트는 'use client'가 아닌, 서버 컴포넌트(기본값)가 됩니다.
export default function KakaoCallbackPage() {
    
    // 💡 3. Suspense의 fallback UI (초기 로딩)
    const FallbackUI = (
        <div className="flex flex-col justify-center items-center min-h-screen text-center p-4">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
            <p className="mt-4 text-lg font-medium text-gray-700">인증 정보 확인 중...</p>
        </div>
    );

    return (
        // 💡 4. [핵심] useSearchParams를 사용하는 컴포넌트를 <Suspense>로 감쌉니다.
        <Suspense fallback={FallbackUI}>
            <KakaoCallbackClient />
        </Suspense>
    );
}