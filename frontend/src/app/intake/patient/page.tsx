'use client'; 

import React, { useState, FormEvent, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, setAuthToken } from '@/lib/api';
import { PatientIntakeData, initialPatientIntakeData, MUSIC_GENRE_OPTIONS } from '@/types/intake'; 
import { Info, Loader2 } from 'lucide-react';
//import { addPatient, linkSessionToPatient } from '@/lib/utils/patients';

export default function PatientIntakePage() {
    const [formData, setFormData] = useState<PatientIntakeData>(initialPatientIntakeData);
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
             setFormData(prev => ({ ...prev, [name]: checked }));
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
        // if (!userId) {
        //     setError('환자 ID를 찾을 수 없습니다. 대시보드에서 다시 시도해주세요.');
        //     setLoading(false);
        //     return;
        // }
        
        const payload = {
            vas: {
                anxiety: formData.currentAnxietyLevel,
                depression: formData.currentMoodLevel,
                pain: formData.currentPainLevel,
            },
            prefs: {
                genres: formData.preferredMusicGenres,
                contraindications: formData.dislikedMusicGenres,
                lyrics_allowed: formData.vocalsAllowed,
            },
            goal: { text: sessionGoal },
            dialog: [],
        };

        try {
            const response = await api.post('/patient/intake', payload);

<<<<<<< HEAD
            // 2. [2단계] 백엔드 API를 호출하여 새 세션을 생성합니다.

            const token = localStorage.getItem('accessToken');
        if (!token) {
            throw new Error("로그인 정보가 없습니다. 다시 로그인해주세요.");
        }
            const response = await fetch('http://localhost:8000/patient/intake', {
                method: 'POST',
                headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // 👈 [핵심] JWT 토큰 전송
            },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || '서버 에러');
            }
            const data = await response.json(); // { session_id, status }
            
            // 3. [3단계] '가짜 DB'에 환자 ID와 세션 ID를 연결합니다.
            linkSessionToPatient(userId, data.session_id);
            
            console.log(`기존 환자(${userId})의 새 세션(${data.session_id}) 연결 완료.`);
            
            // 4. [4단계] 상담 페이지로 이동 (patientId도 함께 전달!)
            router.push(`/counsel?session=${data.session_id}&patientId=${userId}`);
=======
      // (기존 response.ok 체크는 axios에선 불필요. 2xx가 아니면 catch로 감)
>>>>>>> 68fe083da59e999d74535b1a3c7b3461cc1d88ef

      const data = response.data; // { session_id, status }

      // ⬇️ [수정] '가짜 DB' 로직(linkSessionToPatient) 제거

      console.log(`새 세션(${data.session_id}) 생성 완료.`);

      // 4. [4단계] 상담 페이지로 이동 (session_id만 전달)
      // (경로는 프로젝트에 맞게 수정)
      router.push(`/chat/${data.session_id}`);
    } catch (err: unknown) {
      console.error('Intake submission failed:', err);
      let errorMessage = '알 수 없는 오류가 발생했습니다.';

      const isObject = (v: unknown): v is Record<string, unknown> =>
        typeof v === 'object' && v !== null;

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
      } else if (isObject(err) && 'request' in err) {
        // 요청은 했으나 응답을 못 받음
        errorMessage = '서버에 연결할 수 없습니다.';
      } else if (isObject(err) && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
        // 일반 Error 객체 등
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
        const isSelected = formData[type === 'preferred' ? 'preferredMusicGenres' : 'dislikedMusicGenres'].includes(genre);
        const baseClass = "px-4 py-2 rounded-full transition duration-150 text-sm font-medium border";
        return isSelected 
            ? `${baseClass} ${type === 'preferred' ? 'bg-blue-500 border-blue-500 text-white shadow-md' : 'bg-gray-700 border-gray-700 text-white shadow-md'}`
            : `${baseClass} bg-white text-gray-700 border-gray-300 ${type === 'preferred' ? 'hover:bg-blue-50 hover:border-blue-300' : 'hover:bg-gray-100 hover:border-gray-400'}`;
    };
    
    return (
        <div className="intake-container p-6 md:p-8 max-w-3xl mx-auto bg-white shadow-xl rounded-lg my-10">
            {/* 이름/나이 입력란이 없는, 환자 본인용 폼 */}
            <h1 className="text-3xl font-extrabold text-gray-800 mb-8 text-center">AI 심리 상담 준비</h1>
            <form onSubmit={handleSubmit} className="space-y-8">
                
                {/* 섹션 1: VAS */}
                <section className="p-6 border rounded-lg shadow-sm">
                    <h2 className="text-xl font-bold mb-5 text-indigo-700 border-b pb-2">나의 현재 상태</h2>
                    <p className="text-sm text-gray-600 mb-6">AI와 대화하기 전, 현재 느끼는 정도를 솔직하게 표시해주세요.</p>
                    
                    <div className="mb-6">
                        <label htmlFor="currentAnxietyLevel" className="block text-md font-medium text-gray-700 mb-2 text-center">
                            현재 **불안** 수준: <span className="font-bold text-lg text-red-600">{formData.currentAnxietyLevel}점 ({getAnxietyLabel(formData.currentAnxietyLevel)})</span>
                        </label>
                        <input type="range" id="currentAnxietyLevel" name="currentAnxietyLevel" value={formData.currentAnxietyLevel} onChange={handleChange} min="0" max="10" step="1" className="w-full h-2 bg-red-100 rounded-lg appearance-none cursor-pointer accent-red-500" />
                        <div className="flex justify-between text-xs text-gray-500 mt-1"><span>0: 매우 안정</span><span>10: 극심한 불안</span></div>
                    </div>

                    <div className="mb-6">
                        <label htmlFor="currentMoodLevel" className="block text-md font-medium text-gray-700 mb-2 text-center">
                            현재 **기분** 수준: <span className="font-bold text-lg text-blue-600">{formData.currentMoodLevel}점 ({getMoodLabel(formData.currentMoodLevel)})</span>
                        </label>
                        <input type="range" id="currentMoodLevel" name="currentMoodLevel" value={formData.currentMoodLevel} onChange={handleChange} min="0" max="10" step="1" className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                        <div className="flex justify-between text-xs text-gray-500 mt-1"><span>0: 매우 긍정적</span><span>10: 매우 우울함</span></div>
                    </div>

                    <div>
                        <label htmlFor="currentPainLevel" className="block text-md font-medium text-gray-700 mb-2 text-center">
                            현재 **통증** 수준: <span className="font-bold text-lg text-green-600">{formData.currentPainLevel}점 ({getPainLabel(formData.currentPainLevel)})</span>
                        </label>
                        <input type="range" id="currentPainLevel" name="currentPainLevel" value={formData.currentPainLevel} onChange={handleChange} min="0" max="10" step="1" className="w-full h-2 bg-green-100 rounded-lg appearance-none cursor-pointer accent-green-500" />
                        <div className="flex justify-between text-xs text-gray-500 mt-1"><span>0: 통증 없음</span><span>10: 최악의 통증</span></div>
                    </div>
                </section>

                {/* 섹션 2: 상담 목표 */}
                <section className="p-6 border rounded-lg shadow-sm bg-gray-50">
                    <h2 className="text-xl font-bold mb-4 text-indigo-700 border-b pb-2">상담 목표</h2>
                    <label htmlFor="sessionGoal" className="block text-sm font-medium text-gray-700 mb-2">오늘 AI 상담을 통해 얻고 싶은 점은 무엇인가요?</label>
                    <textarea 
                        id="sessionGoal"
                        value={sessionGoal}
                        onChange={(e) => setSessionGoal(e.target.value)}
                        rows={3}
                        className="w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="예: 스트레스를 해소하고 싶어요. / 잠을 잘 자고 싶어요."
                        required
                    />
                </section>

                {/* 섹션 3: 음악 선호도 */}
                <section className="p-6 border rounded-lg shadow-sm">
                    <h2 className="text-xl font-bold mb-4 text-indigo-700 border-b pb-2">음악 선호도</h2>
                    
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-3">✅ **선호**하는 음악 장르</label>
                        <div className="flex flex-wrap gap-2">
                            {MUSIC_GENRE_OPTIONS.map((genre) => (
                                <button key={`pref-${genre}`} type="button" onClick={() => handleGenreToggle(genre, 'preferred')} className={getButtonClass(genre, 'preferred')}>{genre}</button>
                            ))}
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-3">❌ **비선호**하는 음악 장르</label>
                        <div className="flex flex-wrap gap-2">
                            {MUSIC_GENRE_OPTIONS.map((genre) => (
                                <button key={`dislike-${genre}`} type="button" onClick={() => handleGenreToggle(genre, 'disliked')} className={getButtonClass(genre, 'disliked')}>{genre}</button>

                            ))}
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">🎤 **보컬(가사)** 포함 여부</label>
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
                                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-indigo-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                            </label>
                            <span className={`text-sm font-medium ${formData.vocalsAllowed ? 'text-indigo-600' : 'text-gray-500'}`}>보컬 포함</span>
                        </div>
                    </div>
                </section>
                
                {error && (
                    <div className="flex items-center justify-center p-3 bg-red-100 text-red-700 rounded-md text-sm">
                        <Info className="w-5 h-5 mr-2 flex-shrink-0" />
                        <p className="font-medium">{error}</p>
                    </div>
                )}

                <button 
                    type="submit" 
                    disabled={loading} // userId가 없으면 제출 비활성화
                    className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition duration-200 disabled:opacity-70 disabled:cursor-not-allowed mt-6 text-lg flex items-center justify-center gap-2"
                >
                    {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                    {loading ? '상담 세션 생성 중...' : 'AI 채팅 시작하기 →'}
                </button>
            </form>
        </div>
    );
}