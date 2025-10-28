'use client';

// 💡 1. .env.local에서 정의한 '정확한' 변수 이름을 읽어옵니다.
const KAKAO_CLIENT_ID = process.env.NEXT_PUBLIC_KAKAO_REST_KEY;
const KAKAO_REDIRECT_URI = process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI;

export default function LoginPage() {
  
  // 💡 2. 변수가 제대로 로드되었는지 확인하는 방어 코드를 추가했습니다.
  if (!KAKAO_CLIENT_ID || !KAKAO_REDIRECT_URI) {
    return (
      <div className="flex flex-col justify-center items-center h-screen text-center p-4">
         <h1 className="text-xl font-bold text-red-600">환경 변수 오류 (Error)</h1>
         <p className="text-gray-700 mt-2">.env.local 파일에 NEXT_PUBLIC_KAKAO_REST_KEY와</p>
         <p className="text-gray-700">NEXT_PUBLIC_KAKAO_REDIRECT_URI가 올바르게 설정되었는지 확인하세요.</p>
         <p className="text-sm text-gray-500 mt-4">(파일 수정 후에는 프론트엔드 서버를 재시작해야 합니다)</p>
      </div>
    )
  }
  
  // 💡 3. 올바른 변수를 사용하여 로그인 URL을 생성합니다.
  const kakaoLoginUrl = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${KAKAO_CLIENT_ID}&redirect_uri=${KAKAO_REDIRECT_URI}`;

  return (
    <div className="flex justify-center items-center h-screen">
      <a 
        href={kakaoLoginUrl} 
        className="px-6 py-3 bg-yellow-400 text-black font-bold rounded-lg shadow"
      >
        카카오로 1초만에 시작하기
      </a>
    </div>
  );
}