'use client';

import React, { useState, FormEvent, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, setAuthToken } from '@/lib/api';
import { 
    PatientIntake, // 👈 (API 전송용)
    PatientIntakeFormData, // 👈 (폼 상태용)
    initialPatientIntakeData, 
    MUSIC_GENRE_OPTIONS 
} from '@/types/intake';
import { Info, Loader2, FilePen, SlidersHorizontal, Music, Send, AlertTriangle } from 'lucide-react';
//import { addPatient, linkSessionToPatient } from '@/lib/utils/patients';

export default function PatientIntakePage() {
    const [formData, setFormData] = useState<PatientIntakeFormData>(initialPatientIntakeData);
    const [sessionGoal, setSessionGoal] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    //const searchParams = useSearchParams();

    // URL에서 'userId'를 가져옵니다. (로그인 시뮬레이션용)
    //const userId = searchParams.get('userId');

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            // 토큰이 없으면 로그인 페이지로 리디렉션
            setError('로그인이 필요합니다. 로그인 페이지로 이동합니다.');
            router.push('/login');
            return;
        }
        // (중요) api(axios) 인스턴스에 토큰을 설정
        setAuthToken(token);
    }, [router]);

    // VAS Input, Textarea, Checkbox 핸들러
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (type === 'range') {
            setFormData(prev => ({ ...prev, [name]: Number(value) }));
        }
        if (type === 'checkbox') {
             const { checked } = e.target as HTMLInputElement;
             // 💡 [수정] 'vocalsAllowed' 키를 사용하도록 name 확인
             if (name === 'vocalsAllowed') {
                setFormData(prev => ({ ...prev, vocalsAllowed: checked }));
             }
        }
    };

    // 장르 선택/해제 핸들러
    const handleGenreToggle = (genre: string, type: 'preferred' | 'disliked') => {
        const fieldName = type === 'preferred' ? 'preferredMusicGenres' : 'dislikedMusicGenres';
        setFormData(prev => {
            const currentGenres = prev[fieldName];
            const oppositeFieldName = type === 'preferred' ? 'dislikedMusicGenres' : 'preferredMusicGenres';
            const updatedOppositeGenres = prev[oppositeFieldName].filter(g => g !== genre);

            if (currentGenres.includes(genre)) {
                return { ...prev, [fieldName]: currentGenres.filter(g => g !== genre) };
            } else {
                return {
                    ...prev,
                    [fieldName]: [...currentGenres, genre],
                    [oppositeFieldName]: updatedOppositeGenres
                };
            }
        });
    };

    // 폼 제출 핸들러 (API 호출 및 환자 등록)
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (!sessionGoal.trim()) {
            setError('오늘의 상담 목표를 입력해주세요.');
            setLoading(false);
            return;
        }
        
        // 💡 [수정] 폼(PatientIntakeFormData) 상태를 API(PatientIntake) 스키마로 변환
        // 💡 백엔드(prompt_from_guideline.py)가 기대하는 키 이름으로 매핑
        const payload: PatientIntake = {
            vas: {
                anxiety: formData.currentAnxietyLevel,
                depression: formData.currentMoodLevel, // 👈 'depression' 키 사용
                pain: formData.currentPainLevel,
            },
            prefs: {
                genres: formData.preferredMusicGenres, // 👈 'genres' 키 사용
                contraindications: formData.dislikedMusicGenres, // 👈 'contraindications' 키 사용
                lyrics_allowed: formData.vocalsAllowed, // 👈 'lyrics_allowed' 키 사용
            },
            goal: { text: sessionGoal },
            dialog: [], // 👈 (intake 단계에선 항상 비어있음)
        };

        try {
            const response = await api.post('/patient/intake', payload);
            const data = response.data; // { session_id, status }
            console.log(`새 세션(${data.session_id}) 생성 완료.`);
            router.push(`/counsel?session=${data.session_id}`);

        } catch (err: unknown) {
            console.error('Intake submission failed:', err);
            let errorMessage = '알 수 없는 오류가 발생했습니다.';
            // (Axios 에러 처리)
            const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
            if (isObject(err) && 'response' in err) {
                const response = (err as { response?: { status?: number; data?: { detail?: string } } }).response;
                if (response?.status === 401) {
                    errorMessage = '인증이 만료되었습니다. 다시 로그인해주세요.';
                    localStorage.removeItem('accessToken');
                    setAuthToken(null);
                    router.push('/login');
                } else {
                    errorMessage = response?.data?.detail ?? '서버 에러가 발생했습니다.';
                }
            } else if (isObject(err) && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
                errorMessage = (err as { message?: string }).message!;
            }
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    // VAS 라벨 헬퍼 함수
    const getAnxietyLabel = (value: number) => value <= 2 ? "매우 안정" : value <= 4 ? "약간 안정" : value <= 6 ? "보통" : value <= 8 ? "불안함" : "극심한 불안";
    const getMoodLabel = (value: number) => value <= 2 ? "매우 긍정적" : value <= 4 ? "쾌활함" : value <= 6 ? "보통" : value <= 8 ? "다소 우울함" : "매우 우울함";
    const getPainLabel = (value: number) => value === 0 ? "통증 없음" : value <= 3 ? "약한 통증" : value <= 6 ? "중간 통증" : "심한 통증";

    // 장르 버튼 스타일링 헬퍼 함수
    const getButtonClass = (genre: string, type: 'preferred' | 'disliked') => {
        const isPreferred = formData.preferredMusicGenres.includes(genre);
        const isDisliked = formData.dislikedMusicGenres.includes(genre);
        const baseClass = "px-4 py-2 rounded-lg transition duration-150 text-sm font-medium border-2"; 

        if (type === 'preferred' && isPreferred) {
            return `${baseClass} bg-indigo-600 border-indigo-600 text-white shadow-md`;
        }
        if (type === 'disliked' && isDisliked) {
            return `${baseClass} bg-gray-700 border-gray-700 text-white shadow-md`;
        }
        return `${baseClass} bg-white text-gray-700 border-gray-300 hover:bg-gray-100 hover:border-gray-400`;
    };

    return (
        <div className="max-w-3xl mx-auto p-6 md:p-10 bg-white shadow-lg border border-gray-200 rounded-xl my-10 relative">
            
            {loading && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col justify-center items-center z-10 rounded-xl">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                    <p className="mt-4 text-lg font-semibold text-gray-700">상담 세션 생성 중...</p>
                </div>
            )}

            <div className="text-center mb-10">
                <FilePen className="w-12 h-12 text-indigo-600 mx-auto mb-4" />
                <h1 className="text-3xl font-bold text-gray-900">상담 전 자기 평가</h1>
                <p className="text-gray-600 mt-3">상담을 시작하기 전, 현재 상태를 알려주시면 AI가 더 정확한 도움을 드릴 수 있습니다.</p>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-10">
                
                {/* --- 섹션 1: 현재 상태 평가 (VAS) --- */}
                <fieldset className="p-6 border border-gray-200 rounded-lg shadow-sm">
                    <legend className="text-xl font-semibold mb-6 text-gray-800 flex items-center">
                        <SlidersHorizontal className="w-5 h-5 mr-3 text-indigo-600"/>
                        1. 나의 현재 상태
                    </legend>
                    
                    <div className="mb-8">
                        <label htmlFor="currentAnxietyLevel" className="block text-md font-medium text-gray-700 mb-2 text-center">
                            현재 **불안** 수준: <span className="font-bold text-lg text-indigo-700">{formData.currentAnxietyLevel}점</span>
                        </label>
                        <span className="block text-center text-sm text-gray-500 mb-3">({getAnxietyLabel(formData.currentAnxietyLevel)})</span>
                        <input type="range" id="currentAnxietyLevel" name="currentAnxietyLevel" value={formData.currentAnxietyLevel} onChange={handleChange} min="0" max="10" step="1" 
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                        <div className="flex justify-between text-xs text-gray-500 mt-1"><span>0: 매우 안정</span><span>10: 극심한 불안</span></div>
                    </div>

                    <div className="mb-8">
                        <label htmlFor="currentMoodLevel" className="block text-md font-medium text-gray-700 mb-2 text-center">
                            현재 **기분** 수준: <span className="font-bold text-lg text-indigo-700">{formData.currentMoodLevel}점</span>
                        </label>
                        <span className="block text-center text-sm text-gray-500 mb-3">({getMoodLabel(formData.currentMoodLevel)})</span>
                        <input type="range" id="currentMoodLevel" name="currentMoodLevel" value={formData.currentMoodLevel} onChange={handleChange} min="0" max="10" step="1" 
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                        <div className="flex justify-between text-xs text-gray-500 mt-1"><span>0: 매우 긍정적</span><span>10: 매우 우울함</span></div>
                    </div>

                    <div>
                        <label htmlFor="currentPainLevel" className="block text-md font-medium text-gray-700 mb-2 text-center">
                            현재 **통증** 수준: <span className="font-bold text-lg text-indigo-700">{formData.currentPainLevel}점</span>
                        </label>
                        <span className="block text-center text-sm text-gray-500 mb-3">({getPainLabel(formData.currentPainLevel)})</span>
                        <input type="range" id="currentPainLevel" name="currentPainLevel" value={formData.currentPainLevel} onChange={handleChange} min="0" max="10" step="1" 
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                        <div className="flex justify-between text-xs text-gray-500 mt-1"><span>0: 통증 없음</span><span>10: 최악의 통증</span></div>
                    </div>
                </fieldset>

                {/* --- 섹션 2: 음악 선호도 --- */}
                <fieldset className="p-6 border border-gray-200 rounded-lg shadow-sm">
                    <legend className="text-xl font-semibold mb-6 text-gray-800 flex items-center">
                        <Music className="w-5 h-5 mr-3 text-indigo-600"/>
                        2. 음악 선호도
                    </legend>
                    
                    <div className="mb-6">
                        <label className="block text-md font-medium text-gray-700 mb-3">✅ **선호**하는 음악 장르</label>
                        <div className="flex flex-wrap gap-2">
                            {MUSIC_GENRE_OPTIONS.map((genre) => (
                                <button key={`pref-${genre}`} type="button" onClick={() => handleGenreToggle(genre, 'preferred')} className={getButtonClass(genre, 'preferred')}>{genre}</button>
                            ))}
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="block text-md font-medium text-gray-700 mb-3">❌ **비선호**하는 음악 장르</label>
                        <div className="flex flex-wrap gap-2">
                            {MUSIC_GENRE_OPTIONS.map((genre) => (
                                <button key={`dislike-${genre}`} type="button" onClick={() => handleGenreToggle(genre, 'disliked')} className={getButtonClass(genre, 'disliked')}>{genre}</button>
                            ))}
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-md font-medium text-gray-700 mb-2">🎤 **보컬(가사)** 포함 여부</label>
                        <div className="flex items-center">
                            <span className={`text-sm font-medium ${!formData.vocalsAllowed ? 'text-indigo-600' : 'text-gray-500'}`}>연주곡만</span>
                            <label htmlFor="vocalsAllowed" className="relative inline-flex items-center cursor-pointer mx-4">
                                <input 
                                    type="checkbox" 
                                    id="vocalsAllowed" 
                                    name="vocalsAllowed" 
                                    className="sr-only peer" 
                                    checked={formData.vocalsAllowed} 
                                    onChange={handleChange} 
                                />
                                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-indigo-300 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                            </label>
                            <span className={`text-sm font-medium ${formData.vocalsAllowed ? 'text-indigo-600' : 'text-gray-500'}`}>보컬 포함</span>
                        </div>
                    </div>
                </fieldset>

                {/* --- 섹션 3: 상담 목표 --- */}
                <fieldset className="p-6 border border-gray-200 rounded-lg shadow-sm">
                    <legend className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
                        <Info className="w-5 h-5 mr-3 text-indigo-600"/>
                        3. 오늘의 상담 목표
                    </legend>
                    <textarea
                        value={sessionGoal}
                        onChange={(e) => setSessionGoal(e.target.value)}
                        rows={3}
                        className="w-full p-3 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500"
                        placeholder="예: 오늘은 불안한 마음을 진정시키고 싶어요."
                        required
                    />
                </fieldset>
                
                {/* --- 에러 메시지 --- */}
                {error && (
                    <div className="flex items-center justify-center p-3 bg-red-100 text-red-700 rounded-lg text-sm font-medium">
                        <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                {/* --- 제출 버튼 --- */}
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition duration-200 disabled:opacity-70 disabled:cursor-not-allowed mt-6 text-lg flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    {loading ? '세션 생성 중...' : '상담 시작하기'}
                </button>
            </form>
        </div>
    );
}