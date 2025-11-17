// lib/api.ts
import axios from 'axios';

// 백엔드 API의 기본 URL
const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "http://210.104.76.200:8000";

export const api = axios.create({
  baseURL: baseURL,
});

// ⬇️ [핵심!] ⬇️
// 3단계: 토큰을 자동으로 헤더에 삽입하는 "인터셉터"
// (로그인 성공 후 실행되도록 설정 필요)
export const setAuthToken = (token: string | null) => {
  if (token) {
    // 토큰이 있으면, 앞으로 모든 요청의 헤더에 'Authorization'을 추가
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    // 토큰이 없으면 (로그아웃 시) 헤더 삭제
    delete api.defaults.headers.common['Authorization'];
  }
};