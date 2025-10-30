// import { NextResponse } from 'next/server';
// import type { NextRequest } from 'next/server';

// const PROTECTED = ['/dashboard','/intake','/counsel','/music','/post','/summary','/settings','/admin'];

// export function middleware(req: NextRequest) {
// //   const path = req.nextUrl.pathname;
// //   const access = req.cookies.get('access_token')?.value;
// //   const isProtected = PROTECTED.some(p => path.startsWith(p));

// //   if (isProtected && !access) {
// //     const url = req.nextUrl.clone();
// //     url.pathname = '/login';
// //     url.searchParams.set('next', path);
// //     return NextResponse.redirect(url);
// //   }

// //   return NextResponse.next();
//     const BYPASS = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true'; // ★
//     if (BYPASS) return NextResponse.next();                        // ★ 우회 ON이면 모두 통과

//     const path = req.nextUrl.pathname;
//     const isProtected = PROTECTED.some(p => path.startsWith(p));
//     const access = req.cookies.get('access_token')?.value;

//     if (isProtected && !access) {
//         const url = req.nextUrl.clone();
//         url.pathname = '/login';
//         url.searchParams.set('next', path);
//         return NextResponse.redirect(url);
//     }
//     return NextResponse.next();
// }
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// const PROTECTED = [...]; // (더 이상 필요 없음)

export function middleware(req: NextRequest) {
    // 💡 [핵심] 모든 인증 로직을 주석 처리하고, 모든 요청을 통과시킵니다.
    //    인증 확인은 각 페이지/레이아웃의 클라이언트 측에서 처리해야 합니다.
    
    // const BYPASS = ...
    // if (BYPASS) ...

    // const path = ...
    // const isProtected = ...
    // const access = ...

    // if (isProtected && !access) {
    //     ... (redirect 로직) ...
    // }
    
    // 💡 모든 요청을 그대로 다음 단계로 넘깁니다.
    return NextResponse.next(); 
}

// (선택사항) 특정 경로에만 미들웨어가 실행되도록 matcher를 설정할 수도 있지만,
// 지금은 인증 로직 자체가 문제이므로 위처럼 비활성화하는 것이 맞습니다.
// export const config = {
//   matcher: ['/dashboard/:path*', '/intake/:path*', /* ... */],
// };