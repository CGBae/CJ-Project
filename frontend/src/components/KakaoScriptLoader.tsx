'use client'; // ⬅️ [핵심] 이 파일을 클라이언트 컴포넌트로 지정

import Script from 'next/script';

export default function KakaoScriptLoader() {
  const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

  if (!KAKAO_JS_KEY) {
    // .env.local 파일에 키가 정의되지 않았을 경우 경고
    console.warn(
      'Kakao JS Key (NEXT_PUBLIC_KAKAO_JS_KEY) is not defined in .env.local',
    );
    return null;
  }

  return (
    <Script
      src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
      integrity="sha384-TiCUE00h649CAMonG018J2ujOgDKW/kVWlChEuu4jK2vxfAAD0eZxzCKakxg55G4"
      crossOrigin="anonymous"
      onLoad={() => {
        // 이 함수는 이제 클라이언트 컴포넌트 내에서 안전하게 실행됩니다.
        if (window.Kakao && !window.Kakao.isInitialized()) {
          window.Kakao.init(KAKAO_JS_KEY);
          console.log('Kakao SDK Initialized');
        }
      }}
    />
  );
}