import React, { Suspense } from 'react';
import LoginClient from './LoginClient'; // 👈 1. 방금 만든 컴포넌트 import
import { Loader2 } from 'lucide-react';

// 💡 2. 이 컴포넌트는 'use client'가 아닙니다.
export default function LoginPage() {
    
    // 💡 3. Suspense의 fallback UI
    const FallbackUI = (
        <div className="flex justify-center items-center min-h-screen bg-gray-100">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        </div>
    );

    return (
        // 💡 4. [핵심] useSearchParams를 사용하는 LoginClient를 <Suspense>로 감쌉니다.
        <Suspense fallback={FallbackUI}>
            <LoginClient />
        </Suspense>
    );
}