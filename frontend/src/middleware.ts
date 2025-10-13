import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED = ['/dashboard','/intake','/counsel','/music','/post','/summary','/settings','/admin'];

export function middleware(req: NextRequest) {
//   const path = req.nextUrl.pathname;
//   const access = req.cookies.get('access_token')?.value;
//   const isProtected = PROTECTED.some(p => path.startsWith(p));

//   if (isProtected && !access) {
//     const url = req.nextUrl.clone();
//     url.pathname = '/login';
//     url.searchParams.set('next', path);
//     return NextResponse.redirect(url);
//   }

//   return NextResponse.next();
    const BYPASS = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true'; // ★
    if (BYPASS) return NextResponse.next();                        // ★ 우회 ON이면 모두 통과

    const path = req.nextUrl.pathname;
    const isProtected = PROTECTED.some(p => path.startsWith(p));
    const access = req.cookies.get('access_token')?.value;

    if (isProtected && !access) {
        const url = req.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('next', path);
        return NextResponse.redirect(url);
    }
    return NextResponse.next();
}
