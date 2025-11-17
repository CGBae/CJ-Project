'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// 💡 1. [수정] 사용자 정보 타입 정의 (백엔드 UserPublic 스키마와 일치)
interface UserProfile {
  id: number | string;
  name: string | null;
  email: string | null;
  role: string;
  // (필요시 dob, kakao_id 등 백엔드에서 오는 다른 정보도 추가)
}

// 💡 2. [수정] Context 타입 변경 (role -> user)
interface AuthContextType {
  user: UserProfile | null; // 👈 role 대신 user 객체
  isAuthed: boolean;
  isLoading: boolean;
  logout: () => void;
  checkAuth: () => Promise<void>; // 👈 Promise<void>로 변경
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

export function AuthProvider({ children }: { children: ReactNode }) {
  // 💡 3. [수정] role 상태 -> user 상태
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const BACKEND_URL = getApiUrl();
  const isBypass = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';

  // 💡 4. [수정] checkAuth 함수 (user 객체를 저장하도록)
  const checkAuth = useCallback(async () => {
    setIsLoading(true);
    if (isBypass) {
      // (Bypass 시 임시 User 객체 생성)
      setUser({ id: 'bypass', name: 'Bypass User', email: 'bypass@test.com', role: 'patient' });
      setIsAuthed(true);
      setIsLoading(false);
      return;
    }
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setUser(null);
      setIsAuthed(false);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const userData: UserProfile = await response.json();
        setUser(userData); // 👈 data.role 대신 userData 객체 전체 저장
        setIsAuthed(true);
      } else {
        setUser(null);
        setIsAuthed(false);
        localStorage.removeItem('accessToken');
      }
    } catch (error) {
      console.error("Authentication check failed:", error);
      setUser(null);
      setIsAuthed(false);
    } finally {
      setIsLoading(false);
    }
  }, [isBypass, BACKEND_URL]); // 👈 의존성 수정

  // 💡 5. [수정] logout 함수 (user 상태 초기화)
  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    setUser(null); // 👈 user 상태 초기화
    setIsAuthed(false);
    window.dispatchEvent(new Event('storageChanged')); // 이벤트는 그대로
    router.push('/login');
  }, [router]);

  // 💡 6. [수정] Context Provider에 user 객체 전달
  const value = { user, isAuthed, isLoading, logout, checkAuth };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}