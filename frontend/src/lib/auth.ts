// src/lib/auth.ts
import { cookies } from 'next/headers';
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
export async function requireAuth() {
  const API_URL = getApiUrl();
  const cookieStore = await cookies();
  const access = cookieStore.get('access_token')?.value;
  if (!access) return null;
  const r = await fetch(`${API_URL}/auth/me`, {
    headers: { cookie: `access_token=${access}` },
    cache: 'no-store',
  });
  if (!r.ok) return null;
  return r.json(); // {email, role,...}
}
