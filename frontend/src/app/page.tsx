"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [api, setApi] = useState<string>("(아직 호출 안 함)");
  const router = useRouter();

  const callHealth = async () => {
    try {
      const res = await fetch("http://localhost:8000/health");
      const data = await res.json();
      setApi(JSON.stringify(data));
    } catch (e: unknown) {
      if (e instanceof Error) {
        setApi("백엔드 연결 실패: " + e.message);
      } else {
        setApi("백엔드 연결 실패: 알 수 없는 오류");
      }
    }
  };

  const goToReport = () => {
    router.push("/report");
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="mx-auto w-full max-w-xl p-8 rounded-2xl shadow bg-white">
        <h1 className="text-2xl font-bold">TheraMusic Starter</h1>
        <p className="mt-2 text-gray-600">
          Next.js + Tailwind 기본 페이지입니다. 아래 버튼으로 FastAPI 연결을 테스트하세요.
        </p>

        <button
          onClick={callHealth}
          className="mt-6 px-4 py-2 rounded-lg border hover:bg-gray-50"
        >
          백엔드 헬스체크 호출
        </button>

        <button
          onClick={goToReport}
          className="mt-4 ml-4 px-4 py-2 rounded-lg border bg-blue-500 text-white hover:bg-blue-600"
        >
          리포트 페이지로 이동
        </button>

        <pre className="mt-3 p-3 bg-gray-100 rounded text-sm overflow-auto">
          {api}
        </pre>
      </div>
    </main>
  );
}
