// src/app/admin/page.tsx
import { cookies } from 'next/headers';

const API_URL = process.env.INTERNAL_API_URL;

export default async function AdminPage() {
    if (process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true') {
    return <div className="p-6 bg-yellow-50 rounded">[TEST MODE] 관리자 페이지(우회)</div>;
  }
  const cookieStore = await cookies();
  const access = cookieStore.get('access_token')?.value;
  if (!access) {
    // 이 경우도 middleware가 먼저 막지만, 서버에서도 한 번 더 방어
    return <div>접근 불가</div>;
  }

  // 역할 재검증 (프록시 경로 사용 권장)
  const meRes = await fetch(`${API_URL}/auth/me`, {
    headers: { cookie: `access_token=${access}` },
    cache: 'no-store',
  });
  if (!meRes.ok) return <div>접근 불가</div>;
  const me = await meRes.json();
  if (me.role !== 'admin') return <div>관리자만 접근 가능합니다.</div>;

  return <div className="bg-white p-6 rounded-xl shadow">관리자 대시보드</div>;
}
