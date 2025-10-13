// src/app/dashboard/page.tsx
export default function DashboardPage() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="bg-white p-4 rounded-xl shadow">새 세션 시작</div>
      <div className="bg-white p-4 rounded-xl shadow">최근 세션</div>
      <div className="bg-white p-4 rounded-xl shadow">연결 상태</div>
    </div>
  );
}
