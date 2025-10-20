// // src/components/ProgressIndicator.tsx

// import React from 'react';

// interface ProgressIndicatorProps {
//   current: number;
//   total: number;
//   className?: string;
// }

// export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ current, total, className = '' }) => {
//   const progressPercentage = (current / total) * 100;

//   return (
//     <div className={`w-full ${className}`}>
//       <div className="text-sm font-medium text-gray-700 mb-2 text-center">
//         단계 {current} / {total}
//       </div>
//       <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
//         <div 
//           className="h-full bg-blue-500 transition-all duration-500 ease-out"
//           style={{ width: `${progressPercentage}%` }}
//           role="progressbar"
//           aria-valuenow={current}
//           aria-valuemin={1}
//           aria-valuemax={total}
//         />
//       </div>
//     </div>
//   );
// };

// // Next.js 환경에서 사용하기 위해 default export 대신 named export를 선호합니다.
// // 하지만 다른 파일에서 default export로 가져올 수도 있으므로 필요하다면 아래를 추가합니다.
// // export default ProgressIndicator;