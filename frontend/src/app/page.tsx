// src/app/page.tsx
import Link from 'next/link';

export default function Landing() {
  return (
    <section className="py-10">
      <h1 className="text-3xl font-bold">음악치료를 더 가깝게</h1>
      <p className="mt-2 text-gray-600">사전지표 → 상담/프롬프트 → 생성 음악 재생 → 사후평가 → 보고서</p>
      <div className="mt-6 flex gap-3">
        <Link href="/login" className="px-4 py-2 border rounded-lg">로그인하고 시작</Link>
        <Link href="/demo" className="px-4 py-2 border rounded-lg">데모 체험</Link>
      </div>
    </section>
  );
}
