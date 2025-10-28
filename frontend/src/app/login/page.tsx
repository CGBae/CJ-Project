// src/app/login/page.tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const r = useRouter();
  const next = useSearchParams().get('next') || '/';
  const [email,setEmail]=useState(''); 
  const [pw,setPw]=useState(''); 
  const [err,setErr]=useState('');

  const KAKAO_REDIRECT_URI =
    process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI ||
    'http://localhost:3000/auth/kakao/callback';
  const KAKAO_CLIENT_ID =
    process.env.NEXT_PUBLIC_KAKAO_REST_KEY;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr('');

    const formData = new URLSearchParams();
    formData.append('username', email); // ⬅️ FastAPI는 이 필드를 'username'으로 기대합니다.
    formData.append('password', pw);

    try {
      const res = await fetch('http://localhost:8000/auth/login', {
        method: 'POST',
        headers: {
          // ⬅️ 'application/json'이 아닌 'x-www-form-urlencoded'로 설정
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
        // ⬅️ 'credentials' 옵션은 JWT 방식에선 불필요
      });

    if (res.ok) {
        // 1. 백엔드로부터 토큰을 받습니다.
        const data = await res.json(); // { "access_token": "...", "token_type": "bearer" }
        const token = data.access_token;

        // 2. (핵심) 토큰을 localStorage에 저장하여 로그인 상태를 유지합니다.
        localStorage.setItem('accessToken', token);

        // 3. (권장) 2단계에서 만든 axios 인스턴스에 토큰을 설정합니다.
        // setAuthToken(token);

        // 4. 다음 페이지로 이동합니다.
        r.push(next);
      } else {
        // 5. 백엔드에서 보낸 구체적인 에러 메시지를 표시합니다.
        const errorData = await res.json();
        setErr(errorData.detail || '로그인 실패');
      }
    } catch (error) {
      console.error('Login network error:', error);
      setErr('네트워크 오류가 발생했습니다.');
    }
  };

  const handleKakaoLogin = () => {
    if (!KAKAO_CLIENT_ID) {
      setErr(
        '카카오 클라이언트 ID가 설정되지 않았습니다. (.env.local 확인)',
      );
      return;
    }
    
    const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${KAKAO_CLIENT_ID}&redirect_uri=${KAKAO_REDIRECT_URI}`;

    window.location.href = kakaoAuthUrl;
  };

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-sm mx-auto p-6 bg-white rounded-xl shadow mt-10"
    >
      <h1 className="text-xl font-bold">로그인</h1>
      <input
        className="mt-4 w-full border rounded px-3 py-2"
        placeholder="Email"
        value={email} // ⬅️ value 속성 추가 (제어 컴포넌트)
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="mt-2 w-full border rounded px-3 py-2"
        type="password"
        placeholder="Password"
        value={pw} // ⬅️ value 속성 추가 (제어 컴포넌트)
        onChange={(e) => setPw(e.target.value)}
      />
      <button
        type="submit"
        className="mt-4 w-full border rounded px-3 py-2 bg-indigo-600 text-white"
      >
        이메일로 로그인
      </button>

      {/* --- [추가] 카카오 로그인 버튼 --- */}
      <button
        type="button" // ⬅️ 폼 제출(submit)을 막기 위해 'button' 타입 명시
        onClick={handleKakaoLogin}
        className="mt-2 w-full border rounded px-3 py-2 bg-yellow-300 text-black font-bold"
      >
        카카오로 로그인
      </button>
      {/* ------------------------------- */}

      {err && <p className="mt-2 text-red-600">{err}</p>}
    </form>
  );
}