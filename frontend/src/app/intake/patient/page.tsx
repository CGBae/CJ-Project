// /frontend/src/app/intake/patient/page.tsx

'use client'; 

import React, { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PatientIntakeData, initialPatientIntakeData, MUSIC_GENRE_OPTIONS } from '@/types/intake'; 

export default function PatientIntakePage() {
  const [formData, setFormData] = useState<PatientIntakeData>(initialPatientIntakeData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // VAS Input 핸들러
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    if (type === 'range') {
        setFormData(prev => ({ ...prev, [name]: Number(value) }));
    } 
  };

  // 장르 선택/해제 (버튼 토글) 핸들러
  const handleGenreToggle = (genre: string, type: 'preferred' | 'disliked') => {
    const fieldName = type === 'preferred' ? 'preferredMusicGenres' : 'dislikedMusicGenres';
    
    setFormData(prev => {
        const currentGenres = prev[fieldName];
        if (currentGenres.includes(genre)) {
            return { ...prev, [fieldName]: currentGenres.filter(g => g !== genre) };
        } else {
            return { ...prev, [fieldName]: [...currentGenres, genre] };
        }
    });
  };

  // 폼 제출 핸들러 (Mocking 처리)
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const intersection = formData.preferredMusicGenres.filter(genre => 
        formData.dislikedMusicGenres.includes(genre)
    );

    if (intersection.length > 0) {
        setError(`선호/비선호 장르에 동시에 선택된 항목(${intersection.join(', ')})이 있습니다.`);
        setLoading(false);
        return;
    }
    
    const MOCK_SESSION_ID = Date.now().toString(36); 
    console.log('Patient Intake Data:', formData); 

    setTimeout(() => {
        setLoading(false);
        router.push(`/counsel?session=${MOCK_SESSION_ID}`); 
    }, 2000);
  };

  // VAS 라벨 헬퍼 함수 (10점 척도 기준)
  const getAnxietyLabel = (value: number) => value <= 2 ? "전혀 안심" : value <= 4 ? "약간 안심" : value <= 6 ? "보통" : value <= 8 ? "불안함" : "극심한 불안";
 const getMoodLabel = (value: number) => value <= 2 ? "매우 긍정적/행복함" : value <= 4 ? "쾌활함" : value <= 6 ? "보통" : value <= 8 ? "다소 우울함" : "매우 부정적/우울함";
  const getPainLabel = (value: number) => value === 0 ? "통증 없음" : value <= 4 ? "약한 통증" : value <= 7 ? "중간 통증" : "심한 통증";

  // 장르 선택 버튼 스타일링 헬퍼 함수
  const getButtonClass = (genre: string, type: 'preferred' | 'disliked') => {
    const isSelected = formData[type === 'preferred' ? 'preferredMusicGenres' : 'dislikedMusicGenres'].includes(genre);
    const baseClass = "px-4 py-2 rounded-full transition duration-150 text-sm font-medium";
    
    if (type === 'preferred') {
        return isSelected 
            ? `${baseClass} bg-yellow-500 text-white shadow-md hover:bg-yellow-600`
            : `${baseClass} bg-white text-gray-700 border border-gray-300 hover:bg-yellow-50`;
    } else {
        return isSelected 
            ? `${baseClass} bg-gray-700 text-white shadow-md hover:bg-gray-800`
            : `${baseClass} bg-white text-gray-700 border border-gray-300 hover:bg-gray-100`;
    }
  };
    
  return (
    <div className="intake-container p-8 max-w-3xl mx-auto bg-white shadow-xl rounded-lg">
      <h1 className="text-3xl font-extrabold text-gray-800 mb-8 text-center">AI 심리 상담 준비</h1>
      <form onSubmit={handleSubmit} className="space-y-8">

        {/* 섹션 1: VAS (0-10점 척도) */}
        <section className="p-6 border rounded-lg shadow-sm">
            <h2 className="text-xl font-bold mb-5 text-blue-700 border-b pb-2">나의 현재 상태 척도 (0-10점)</h2>
            <p className="text-sm text-gray-600 mb-6">AI와 대화하기 전, 현재 느끼는 정도를 표시해주세요. (0점: 전혀 없음, 10점: 극심함)</p>
            
            {/* 1. 불안 수준 VAS */}
            <div className="mb-6">
                {/* 💡 1. 불안 수준 라벨에 text-center 추가 */}
                <label htmlFor="currentAnxietyLevel" className="block text-md font-medium text-gray-700 mb-2 text-center">
                    현재 **불안** 수준: <span className="font-bold text-lg text-red-600">{formData.currentAnxietyLevel}점 ({getAnxietyLabel(formData.currentAnxietyLevel)})</span>
                </label>
                <input type="range" id="currentAnxietyLevel" name="currentAnxietyLevel" value={formData.currentAnxietyLevel} onChange={handleChange} min="0" max="10" step="1" className="w-full h-2 bg-red-100 rounded-lg appearance-none cursor-pointer" />
                <div className="flex justify-between text-xs text-gray-500"><span>0: 전혀 불안하지 않음</span><span>10: 극심한 불안</span></div>
            </div>

            <div className="mb-6">
                {/* 💡 2. 기분 수준 라벨에 text-center 추가 */}
                <label htmlFor="currentMoodLevel" className="block text-md font-medium text-gray-700 mb-2 text-center">
                    현재 **기분** 수준: <span className="font-bold text-lg text-blue-600">{formData.currentMoodLevel}점 ({getMoodLabel(formData.currentMoodLevel)})</span>
                </label>
                <input type="range" id="currentMoodLevel" name="currentMoodLevel" value={formData.currentMoodLevel} onChange={handleChange} min="0" max="10" step="1" className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer" />
                <div className="flex justify-between text-xs text-gray-500"><span>0: 매우 긍정적/행복함</span><span>10: 매우 부정적/우울함</span></div>
            </div>

            <div>
                {/* 💡 3. 통증 수준 라벨에 text-center 추가 */}
                <label htmlFor="currentPainLevel" className="block text-md font-medium text-gray-700 mb-2 text-center">
                    현재 **통증** 수준: <span className="font-bold text-lg text-green-600">{formData.currentPainLevel}점 ({getPainLabel(formData.currentPainLevel)})</span>
                </label>
                <input type="range" id="currentPainLevel" name="currentPainLevel" value={formData.currentPainLevel} onChange={handleChange} min="0" max="10" step="1" className="w-full h-2 bg-green-100 rounded-lg appearance-none cursor-pointer" />
                <div className="flex justify-between text-xs text-gray-500"><span>0: 통증 없음</span><span>10: 상상할 수 없는 최악의 통증</span></div>
            </div>
        </section>
        
        {/* ... 이하 코드는 변경 없음 ... */}

        {/* 섹션 2: 음악 선호도 (버튼 선택형) */}
        <section className="p-6 border rounded-lg bg-gray-50 shadow-sm">
            <h2 className="text-xl font-bold mb-4 text-blue-700 border-b pb-2">음악 선호도</h2>
            
            {/* 선호 장르 버튼 그룹 */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">✅ **선호** 음악 장르</label>
                <div className="flex flex-wrap gap-2">
                    {MUSIC_GENRE_OPTIONS.map((genre) => (
                        <button key={`pref-${genre}`} type="button" onClick={() => handleGenreToggle(genre, 'preferred')} className={getButtonClass(genre, 'preferred')}>{genre}</button>
                    ))}
                </div>
            </div>

            {/* 비선호 장르 버튼 그룹 */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">❌ **비선호** 음악 장르</label>
                <div className="flex flex-wrap gap-2">
                    {MUSIC_GENRE_OPTIONS.map((genre) => (
                        <button key={`dislike-${genre}`} type="button" onClick={() => handleGenreToggle(genre, 'disliked')} className={getButtonClass(genre, 'disliked')}>{genre}</button>
                    ))}
                </div>
                <p className="text-xs text-red-500 mt-2">※ 선호와 비선호 장르를 동시에 선택할 수 없습니다.</p>
            </div>
        </section>
        
        {/* 에러 메시지 출력 */}
        {error && <p className="text-red-500 font-bold text-center mt-4">{error}</p>}

        {/* 제출 버튼 */}
        <button 
          type="submit" 
          disabled={loading} 
          className="w-full py-3 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition duration-200 disabled:opacity-50 mt-6 text-xl"
        >
          {loading ? '데이터 저장 중...' : 'AI 채팅 시작하기 →'}
        </button>
      </form>
    </div>
  );
}