// src/app/login/page.tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const r = useRouter();
  const next = useSearchParams().get('next') || '/dashboard';
  const [email,setEmail]=useState(''); const [pw,setPw]=useState(''); const [err,setErr]=useState('');

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr('');
    const res = await fetch('http://localhost:8000/auth/login', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, password: pw }),
      credentials: 'include',
    });
    if (res.ok) r.push(next);
    else setErr('로그인 실패');
  };

  return (
    <form onSubmit={onSubmit} className="max-w-sm mx-auto p-6 bg-white rounded-xl shadow mt-10">
      <h1 className="text-xl font-bold">로그인</h1>
      <input className="mt-4 w-full border rounded px-3 py-2" placeholder="Email" onChange={e=>setEmail(e.target.value)}/>
      <input className="mt-2 w-full border rounded px-3 py-2" type="password" placeholder="Password" onChange={e=>setPw(e.target.value)}/>
      <button className="mt-4 w-full border rounded px-3 py-2">로그인</button>
      {err && <p className="mt-2 text-red-600">{err}</p>}
    </form>
  );
}
