'use client';
import React, { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus } from 'lucide-react';

export default function RegisterPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

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
            const response = await fetch('http://localhost:8000/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            if (response.status === 400) {
                // 백엔드에서 "Email already registered." 오류가 났을 때
                const errData = await response.json();
                setError(errData.detail || '이미 등록된 이메일입니다.');
                return;
            }

            if (!response.ok) {
                throw new Error('회원가입 요청 처리 중 서버 오류가 발생했습니다.');
            }

            // 성공 시
            alert('회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.');
            router.push('/login');

        } catch (err) {
            console.error("Registration error:", err);
            setError(err instanceof Error ? err.message : '알 수 없는 오류 발생');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex justify-center items-center min-h-screen bg-gray-100">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-2xl">
                <h2 className="text-3xl font-extrabold text-center text-gray-900 flex items-center justify-center">
                    <UserPlus className="w-7 h-7 mr-2 text-indigo-600" /> 회원가입
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="email" className="sr-only">이메일 주소</label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            placeholder="이메일 주소"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            disabled={loading}
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="sr-only">비밀번호</label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="new-password"
                            required
                            placeholder="비밀번호 (최소 8자)"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            disabled={loading}
                        />
                    </div>
                    <div>
                        <label htmlFor="confirmPassword" className="sr-only">비밀번호 확인</label>
                        <input
                            id="confirmPassword"
                            name="confirmPassword"
                            type="password"
                            required
                            placeholder="비밀번호 확인"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            disabled={loading}
                        />
                    </div>

                    {error && (
                        <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg text-center font-medium">{error}</div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center items-center px-4 py-3 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                        회원가입 완료
                    </button>
                </form>

                <div className="text-center text-sm">
                    <p className="text-gray-600">
                        이미 계정이 있으신가요?
                        <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500 ml-1">
                            로그인
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}