// src/lib/auth.ts
import { cookies } from 'next/headers';

export async function requireAuth() {
  const cookieStore = await cookies();
  const access = cookieStore.get('access_token')?.value;
  if (!access) return null;
  const r = await fetch('http://localhost:8000/auth/me', {
    headers: { cookie: `access_token=${access}` },
    cache: 'no-store',
  });
  if (!r.ok) return null;
  return r.json(); // {email, role,...}
}
