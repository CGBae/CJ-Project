// // 파일 경로: /src/app/dashboard/page.tsx

// 'use client';

// import React, { useState, useEffect } from 'react';
// import { useRouter } from 'next/navigation';
// // 상담가 대시보드 컴포넌트 (아래에서 정의)
// import CounselorDashboard from './_components/CounselorDashboard';
// // 환자 대시보드 컴포넌트 (아래에서 정의)
// import PatientDashboard from './_components/PatientDashboard';
// import { Loader2 } from 'lucide-react'; // 로딩 아이콘

// // 가짜 사용자 역할 확인 함수 (실제로는 API 호출 등으로 대체)
// const getUserRole = async (): Promise<'patient' | 'counselor' | null> => {
//   // 예시: 1초 후 'patient' 역할을 반환 (또는 'counselor'로 바꿔서 테스트)
//   await new Promise(resolve => setTimeout(resolve, 1000));
//    return 'counselor'; // 상담가로 테스트 시
//    //return 'patient';   // 환자로 테스트 시
// };

// export default function DashboardPage() {
//   const [userRole, setUserRole] = useState<'patient' | 'counselor' | null>(null);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     // 페이지 로드 시 사용자 역할을 비동기적으로 가져옵니다.
//     const fetchUserRole = async () => {
//       const role = await getUserRole();
//       setUserRole(role);
//       setLoading(false);
//     };
//     fetchUserRole();
//   }, []);

//   // 로딩 중 표시
//   if (loading) {
//     return (
//       <div className="flex justify-center items-center h-[calc(100vh-100px)]">
//         <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
//         <p className="ml-3 text-gray-600">사용자 정보를 불러오는 중...</p>
//       </div>
//     );
//   }

//   // 역할에 따라 다른 대시보드 컴포넌트를 렌더링합니다.
//   return (
//     <div>
//       {userRole === 'patient' && <PatientDashboard />}
//       {userRole === 'counselor' && <CounselorDashboard />}
//       {userRole === null && ( // 역할 정보를 못 가져온 경우 (오류 처리)
//         <div className="text-center mt-20">
//           <h2 className="text-xl font-semibold text-red-600">오류</h2>
//           <p className="text-gray-500">사용자 역할을 확인할 수 없습니다. 다시 로그인해주세요.</p>
//         </div>
//       )}
//     </div>
//   );
// }