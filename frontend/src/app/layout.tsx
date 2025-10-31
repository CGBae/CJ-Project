import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from '@/lib/contexts/AuthContext'; // 💡 1. AuthProvider 임포트
import Header from "../components/header";
import KakaoScriptLoader from '@/components/KakaoScriptLoader';

export const metadata: Metadata = {
  title: 'TheraMusic',
  description: 'AI Music Therapy Tool',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isBypass = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';
  return (
    <html lang="ko">

      <body className="min-h-screen bg-gray-50 text-gray-900">
        <AuthProvider>
          <Header />
          {isBypass && (
            <div className="w-full bg-yellow-400 text-black text-center py-2">
              [TEST MODE] 인증 우회가 활성화되어 있습니다. 운영에서 반드시 끄세요.
            </div>
          )}
          <main className="max-w-6xl mx-auto p-4">{children}</main>

          <KakaoScriptLoader />
        </AuthProvider>
      </body>

    </html>
  );
}
