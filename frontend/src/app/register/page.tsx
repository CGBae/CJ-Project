'use client';
import React, { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus, Mail, KeyRound, CheckSquare, User } from 'lucide-react';

export default function RegisterPage() {
    const router = useRouter();
    
    // 이름, 이메일, 비밀번호 상태
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    
    // 역할 선택 상태
    const [role, setRole] = useState<'patient' | 'therapist'>('patient');
    
    // 소셜 가입 모드 상태
    const [isSocialRegister, setIsSocialRegister] = useState(false);
    const [tempToken, setTempToken] = useState<string | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const API_URL = process.env.NEXT_PUBLIC_API_URL;

    // 페이지 로드 시 임시 토큰 확인
    useEffect(() => {
        const token = localStorage.getItem('temp_register_token');
        if (token) {
            setIsSocialRegister(true); // 소셜 가입 모드 활성화
            setTempToken(token);
            localStorage.removeItem('temp_register_token'); // 사용 후 즉시 제거
            
            // (선택적) 토큰에서 이름/이메일 미리 채우기
            try {
                // JWT의 payload(두 번째 부분)를 디코딩
                const payloadBase64 = token.split('.')[1];
                const payload = JSON.parse(atob(payloadBase64));
                
                // if (payload.name) setName(payload.name); // 카카오 닉네임으로 이름 미리 채우기
                if (payload.email) setEmail(payload.email); // 카카오 이메일 미리 채우기
            } catch (e) {
                console.error("임시 토큰 페일로드 파싱 실패", e);
                // 실패해도 계속 진행
            }
        }
    }, []); // 페이지 로드 시 한 번만 실행

    // 폼 제출 시 모드에 따라 분기
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        // 이름 공통 검증
        if (!name.trim()) { 
            setError('이름을 입력해주세요.'); 
            return; 
        }
        
        if (isSocialRegister) {
            await handleSocialRegister();
        } else {
            await handleEmailRegister();
        }
    };

    // 이메일 회원가입 처리
    const handleEmailRegister = async () => {
        setError(null);
        // 이메일 모드일 때만 비밀번호 검증
        if (password.length < 8) { 
            setError('비밀번호는 최소 8자 이상이어야 합니다.'); 
            return; 
        }
        if (password !== confirmPassword) { 
            setError('비밀번호와 비밀번호 확인이 일치하지 않습니다.'); 
            return; 
        }
        setLoading(true);
        
        try {
            const response = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email, 
                    password, 
                    role, 
                    name // 이름 추가
                }),
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({ detail: '회원가입 실패' }));
                throw new Error(errData.detail || '회원가입 실패');
            }
            alert('회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.');
            router.push('/login');
        } catch (err) { 
            setError(err instanceof Error ? err.message : '알 수 없는 오류');
        } 
        finally { setLoading(false); }
    };

    // 소셜(카카오) 회원가입 처리
    const handleSocialRegister = async () => {
        if (!tempToken) { 
            setError('유효하지 않은 접근입니다. 카카오 로그인부터 다시 시도해주세요.'); 
            return; 
        }
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${API_URL}/auth/register/social`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    temp_token: tempToken, 
                    role, 
                    name // 이름 추가
                }),
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({ detail: '소셜 회원가입 실패' }));
                throw new Error(errData.detail || '소셜 회원가입 실패');
            }
            // 소셜 가입은 성공 시 바로 로그인됨
            const data = await response.json(); 
            localStorage.setItem('accessToken', data.access_token);
            window.dispatchEvent(new Event('storageChanged')); // 헤더 업데이트
            router.push('/'); // 홈으로 이동 (헤더가 역할에 맞게 리다이렉트)
        } catch (err) { 
            setError(err instanceof Error ? err.message : '알 수 없는 오류');
        } 
        finally { setLoading(false); }
    };

    return (
        <div className="flex justify-center items-center min-h-screen bg-gray-100">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-2xl">
                <h2 className="text-3xl font-extrabold text-center text-gray-900 flex items-center justify-center">
                    {isSocialRegister 
                        ? <CheckSquare className="w-7 h-7 mr-2 text-green-600" /> 
                        : <UserPlus className="w-7 h-7 mr-2 text-indigo-600" />
                    }
                    {isSocialRegister ? '추가 정보 입력' : '회원가입'}
                </h2>
                
                {isSocialRegister && (
                    <p className="text-center text-gray-600">
                        카카오 계정으로 가입합니다. <br/> 이름과 역할을 선택해주세요.
                    </p>
                )}

                {/* 역할 선택 UI (공통) */}
                <div className="flex rounded-md shadow-sm">
                    <button
                        type="button"
                        onClick={() => setRole('patient')}
                        className={`flex-1 py-3 px-4 text-sm font-medium rounded-l-lg border ${
                            role === 'patient' ? 'bg-indigo-600 text-white border-indigo-600 z-10' : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                        disabled={loading}
                    >
                        환자로 가입
                    </button>
                    <button
                        type="button"
                        onClick={() => setRole('therapist')}
                        className={`flex-1 py-3 px-4 text-sm font-medium rounded-r-lg border -ml-px ${
                            role === 'therapist' ? 'bg-indigo-600 text-white border-indigo-600 z-10' : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                        disabled={loading}
                    >
                        상담사로 가입
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    
                    {/* 이름 입력 (공통) */}
                    <div>
                        <label htmlFor="name" className="sr-only">이름</label>
                        <div className="relative">
                            <User className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input 
                                id="name" type="text" autoComplete="name" required
                                placeholder="이름 (예: 홍길동)"
                                value={name} onChange={(e) => setName(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                disabled={loading}
                            />
                        </div>
                    </div>

                    {/* 이메일/비밀번호 (이메일 가입 시에만 표시) */}
                    {!isSocialRegister && (
                        <>
                            {/* 이메일 입력 */}
                            <div>
                                <label htmlFor="email" className="sr-only">이메일 주소</label>
                                <div className="relative">
                                    <Mail className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input 
                                        id="email" type="email" autoComplete="email" required
                                        placeholder="이메일 주소"
                                        value={email} onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                        disabled={loading}
                                    />
                                </div>
                            </div>
                            {/* 비밀번호 입력 */}
                            <div>
                                <label htmlFor="password" className="sr-only">비밀번호</label>
                                <div className="relative">
                                    <KeyRound className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input 
                                        id="password" type="password" autoComplete="new-password" required
                                        placeholder="비밀번호 (최소 8자)"
                                        value={password} onChange={(e) => setPassword(e.target.value)}
                                        maxLength={72}
                                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                        disabled={loading}
                                    />
                                </div>
                            </div>
                            {/* 비밀번호 확인 */}
                            <div>
                                <label htmlFor="confirmPassword" className="sr-only">비밀번호 확인</label>
                                <div className="relative">
                                    <KeyRound className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input 
                                        id="confirmPassword" type="password" required
                                        placeholder="비밀번호 확인"
                                        value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                        maxLength={72}
                                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                        disabled={loading}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* 에러 메시지 */}
                    {error && (
                        <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg text-center font-medium">{error}</div>
                    )}
                    
                    {/* 제출 버튼 */}
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full flex justify-center items-center px-4 py-3 text-sm font-medium rounded-lg shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                        {isSocialRegister ? '가입 완료 및 로그인' : '회원가입 완료'}
                    </button>
                </form>

                {/* 로그인 링크 (이메일 가입 시에만 표시) */}
                {!isSocialRegister && (
                    <div className="text-center text-sm">
                        <p className="text-gray-600">
                            이미 계정이 있으신가요?
                            <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500 ml-1">
                                로그인
                            </Link>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

