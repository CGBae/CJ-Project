'use client'; 

import React, { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PatientIntakeData, initialPatientIntakeData, MUSIC_GENRE_OPTIONS } from '@/types/intake'; 
import { Info, Loader2 } from 'lucide-react';

export default function PatientIntakePage() {
    const [formData, setFormData] = useState<PatientIntakeData>(initialPatientIntakeData);
    const [sessionGoal, setSessionGoal] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    // VAS Input 및 Textarea 핸들러
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (type === 'range') {
            setFormData(prev => ({ ...prev, [name]: Number(value) }));
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

    // 폼 제출 핸들러 (실제 API 호출)
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (!sessionGoal.trim()) {
            setError('오늘의 상담 목표를 입력해주세요.');
            setLoading(false);
            return;
        }
        
        // 백엔드 스키마에 맞게 데이터 구조를 변경합니다.
        const payload = {
            vas: {
                anxiety: formData.currentAnxietyLevel,
                mood: formData.currentMoodLevel,
                pain: formData.currentPainLevel,
            },
            prefs: {
                preferred: formData.preferredMusicGenres,
                disliked: formData.dislikedMusicGenres,
            },
            goal: {
                text: sessionGoal
            },
            dialog: null, // 초기 Intake에서는 대화 내용 없음
        };

        try {
            // 백엔드 API 호출
            const response = await fetch('http://localhost:8000/patient/intake', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = typeof errorData.detail === 'string' 
                    ? errorData.detail 
                    : JSON.stringify(errorData.detail);
                throw new Error(errorMessage || `서버 에러: ${response.status}`);
            }

            // 응답에서 session_id를 받아 다음 페이지로 이동
            const data = await response.json();
            console.log('Session created:', data);
            router.push(`/counsel?session=${data.session_id}`);

        } catch (err) {
            console.error('Intake submission failed:', err);
            setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
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

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">❌ **비선호**하는 음악 장르</label>
                        <div className="flex flex-wrap gap-2">
                            {MUSIC_GENRE_OPTIONS.map((genre) => (
                                <button key={`dislike-${genre}`} type="button" onClick={() => handleGenreToggle(genre, 'disliked')} className={getButtonClass(genre, 'disliked')}>{genre}</button>
                            ))}
                        </div>
                    </div>
                </section>
                
                {/* 에러 메시지 출력 */}
                {error && (
                    <div className="flex items-center justify-center p-3 bg-red-100 text-red-700 rounded-md text-sm">
                        <Info className="w-5 h-5 mr-2 flex-shrink-0" />
                        <p className="font-medium">{error}</p>
                    </div>
                )}

                {/* 제출 버튼 */}
                <button 
                    type="submit" 
                    disabled={loading} 
                    className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition duration-200 disabled:opacity-70 disabled:cursor-not-allowed mt-6 text-lg flex items-center justify-center gap-2"
                >
                    {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                    {loading ? '세션 생성 중...' : 'AI 채팅 시작하기 →'}
                </button>
            </form>
        </div>
    );
}
