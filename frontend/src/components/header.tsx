'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
// 💡 1. [추가] 전문적인 UI를 위한 아이콘 임포트
import { User, LogOut, Settings, ChevronDown, Music, BarChart3,Sparkles,Volume2, LayoutDashboard, FilePen,MessageSquare } from 'lucide-react';

export default function Header() {
  // 💡 2. [수정] role 대신 user 객체를 가져옴
  const { user, isAuthed, isLoading, logout, checkAuth } = useAuth();
  const role = user?.role; // 👈 user 객체에서 role 추출
  const router = useRouter();
  const pathname = usePathname();

  // 💡 3. 'storageChanged' 이벤트 리스닝 (로그인/로그아웃 즉시 반영)
  useEffect(() => {
    checkAuth(); // 페이지 로드 시 첫 인증 실행
    
    const handleStorageChange = () => checkAuth();
    window.addEventListener('storageChanged', handleStorageChange);
    return () => {
      window.removeEventListener('storageChanged', handleStorageChange);
    };
  }, [checkAuth]); 

  // 💡 4. 역할 기반 리다이렉트 (교통정리)
  useEffect(() => {
    if (isLoading || !isAuthed || !user) return;
    // (루트 페이지('/') 접근 시 역할별 대시보드로 자동 이동)
    if (pathname === '/') {
      if (role === 'therapist') {
        router.push('/dashboard/counselor');
      } else if (role === 'patient') {
        router.push('/dashboard/patient');
      }
    }
  }, [isLoading, isAuthed, user, role, pathname, router]); // 👈 user 추가
  
  // 💡 5. 로그아웃 핸들러 (Context 함수 호출)
  const handleLogout = () => {
    logout();
  };

  // 💡 6. [핵심 수정] JSX (UI) 전면 수정
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white shadow-sm">
      <div className="max-w-6xl mx-auto flex items-center justify-between h-16 px-4">
        
        {/* 1. 로고 */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-indigo-600">
          <Music className="w-6 h-6" />
          <span className="font-semibold">TheraMusic</span>
        </Link>

        {/* 2. 네비게이션 (로그인 시) */}
        <div className="flex items-center gap-4">
          {isLoading ? (
            // 로딩 중 스켈레톤
            <div className="w-20 h-5 bg-gray-200 animate-pulse rounded-md"></div>
          ) : isAuthed && user ? (
            <>
              {/* --- 2A. 역할별 메뉴 --- */}
              <nav className="hidden md:flex items-center gap-4">
                {role === 'patient' && (
                  <>
                    <NavLink href="/dashboard/patient" pathname={pathname}><LayoutDashboard className="w-4 h-4 mr-1.5"/>대시보드</NavLink>
                    <NavLink href="/intake/patient" pathname={pathname}><FilePen className="w-4 h-4 mr-1.5"/>상담접수</NavLink>
                    <NavLink href="/counsel" pathname={pathname}><MessageSquare className="w-4 h-4 mr-1.5"/>AI상담</NavLink>
                    <NavLink href="/compose" pathname={pathname}><Sparkles className="w-4 h-4 mr-1.5"/>작곡체험</NavLink>
                    <NavLink href="/music" pathname={pathname}><Volume2 className="w-4 h-4 mr-1.5"/>내 음악</NavLink>
                  </>
                )}
                {role === 'therapist' && (
                  <>
                    <NavLink href="/dashboard/counselor" pathname={pathname}><BarChart3 className="w-4 h-4 mr-1.5"/>대시보드</NavLink>
                    <NavLink href="/counselor" pathname={pathname}><User className="w-4 h-4 mr-1.5"/>환자 관리</NavLink>
                    <NavLink href="/intake/counselor" pathname={pathname}><FilePen className="w-4 h-4 mr-1.5"/>음악 처방</NavLink>
                  </>
                )}
              </nav>

              <span className="border-l border-gray-200 h-6 mx-2 hidden md:block"></span>

              {/* --- 2B. 프로필 드롭다운 --- */}
              <details className="relative">
                {/* 프로필 요약 (클릭 영역) */}
                <summary className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-100 transition-colors list-none">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-semibold border border-indigo-200">
                    {/* 이름 첫 글자 또는 아이콘 */}
                    {user.name ? user.name.charAt(0).toUpperCase() : <User className="w-5 h-5"/>}
                  </div>
                  <div className="text-left hidden sm:block">
                    {/* 💡 요청사항 1: 이름 표시 */}
                    <p className="text-sm font-semibold text-gray-800">{user.name || user.email}</p>
                    {/* 💡 요청사항 2: 환자일 때 고유 ID 표시 */}
                    {role === 'patient' && (
                      <p className="text-xs text-gray-500">환자 ID: {user.id}</p>
                    )}
                    {role === 'therapist' && (
                      <p className="text-xs text-gray-500">상담사</p>
                    )}
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                </summary>

                {/* 드롭다운 메뉴 */}
                <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-10">
                  <div className="p-2">
                    {/* (모바일용 이름/ID) */}
                    <div className="px-3 py-2 border-b sm:hidden">
                      <p className="text-sm font-semibold text-gray-800">{user.name || user.email}</p>
                      {role === 'patient' && (
                        <p className="text-xs text-gray-500">환자 ID: {user.id}</p>
                      )}
                    </div>
                    {/* 설정 페이지 링크 */}
                    <Link 
                      href={role === 'patient' ? "/patientoption" : "/counseloroption"} 
                      className="block w-full text-left px-3 py-2 text-sm text-gray-700 rounded-md hover:bg-gray-100"
                    >
                      <Settings className="w-4 h-4 mr-2 inline-block opacity-70" />
                      설정
                    </Link>
                    {/* 로그아웃 버튼 */}
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="block w-full text-left px-3 py-2 text-sm text-red-600 rounded-md hover:bg-red-50"
                    >
                      <LogOut className="w-4 h-4 mr-2 inline-block opacity-70" />
                      로그아웃
                    </button>
                  </div>
                </div>
              </details>
            </>
          ) : (
            // --- 3. 로그아웃 상태 버튼 ---
            <Link 
              href="/login" 
              className="flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

// 💡 7. [추가] 네비게이션 링크용 보조 컴포넌트
const NavLink = ({ href, pathname, children }: { href: string, pathname: string, children: React.ReactNode }) => {
  const isActive = pathname.startsWith(href) && (href !== '/' || pathname === '/');
  return (
    <Link 
      href={href} 
      className={`flex items-center text-sm font-medium transition-colors ${
        isActive ? 'text-indigo-600' : 'text-gray-600 hover:text-indigo-600'
      }`}
    >
      {children}
    </Link>
  );
};