'use client';

// 💡 1. useCallback을 import 합니다.
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// 1. Context가 제공할 값들의 타입 정의
interface AuthContextType {
  isAuthed: boolean;
  role: 'patient' | 'therapist' | null;
  isLoading: boolean;
  logout: () => void;
  checkAuth: () => void; // checkAuth도 내보내서 header가 호출하도록 함
}

// 2. Context 생성
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 3. Provider 컴포넌트 (모든 인증 로직 포함)
export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthed, setIsAuthed] = useState(false);
  const [role, setRole] = useState<'patient' | 'therapist' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const BACKEND_URL = process.env.INTERNAL_API_URL;
  const isBypass = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';

  // 💡 4. [핵심] checkAuth 함수를 useCallback으로 감싸서 고정합니다.
  const checkAuth = useCallback(() => {
    setIsLoading(true);
    if (isBypass) {
      setIsAuthed(true);
      setRole('patient');
      setIsLoading(false);
      return;
    }
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setIsAuthed(false);
      setRole(null);
      setIsLoading(false);
      return;
    }
    fetch(`${BACKEND_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          setIsAuthed(true);
          setRole(data.role || 'patient');
        } else {
          setIsAuthed(false);
          setRole(null);
          localStorage.removeItem('accessToken');
        }
      })
      .catch((e) => {
        console.error("Authentication check failed:", e);
        setIsAuthed(false);
        setRole(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  // 💡 5. 의존성 배열에 함수가 사용하는 외부 변수(isBypass, BACKEND_URL)를 추가합니다.
  }, [isBypass, BACKEND_URL]);

  // 💡 6. [핵심] logout 함수도 useCallback으로 감싸줍니다.
  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    setIsAuthed(false);
    setRole(null);
    window.dispatchEvent(new Event('storageChanged')); // 로그아웃 신호
    router.push('/login');
  // 💡 7. 의존성 배열에 router를 추가합니다.
  }, [router]);

  // 8. Context 값 제공
  const value = { isAuthed, role, isLoading, logout, checkAuth };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// 9. Context를 쉽게 사용하기 위한 Custom Hook
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

