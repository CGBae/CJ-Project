// /frontend/src/app/intake/counselor/page.tsx

'use client'; 

import React, { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { 
    CounselorIntakeData, 
    initialCounselorIntakeData, 
    MUSIC_GENRE_OPTIONS 
} from '@/types/intake'; 

export default function CounselorIntakePage() {
  const [formData, setFormData] = useState<CounselorIntakeData>(initialCounselorIntakeData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Input/Select/Range 처리 핸들러
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (name === 'targetBPM' && value === 'Neutral') {
        setFormData(prev => ({ ...prev, [name]: 'Neutral' }));
    }
    else if (type === 'range' || type === 'number') {
        setFormData(prev => ({ ...prev, [name]: Number(value) }));
    } else {
         setFormData(prev => ({ ...prev, [name]: value }));
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

    // 유효성 검사: 장르 겹침 방지
    const intersection = formData.preferredMusicGenres.filter(genre => 
        formData.dislikedMusicGenres.includes(genre)
    );

    if (intersection.length > 0) {
        setError(`선호/비선호 장르에 동시에 선택된 항목(${intersection.join(', ')})이 있습니다.`);
        setLoading(false);
        return;
    }
    
    const MOCK_SESSION_ID = Date.now().toString(36); 
    console.log('Counselor Music Prescription Data:', formData); 

    setTimeout(() => {
        setLoading(false);
        router.push(`/counsel?session=${MOCK_SESSION_ID}`); 
    }, 2000);
  };

  // VAS 라벨 헬퍼 함수 (10점 척도 기준)
  const getAnxietyLabel = (value: number) => value <= 2 ? "전혀 안심" : value <= 4 ? "약간 안심" : value <= 6 ? "보통" : value <= 8 ? "불안함" : "극심한 불안";
  const getMoodLabel = (value: number) => value <= 2 ? "매우 우울함" : value <= 4 ? "다소 우울함" : value <= 6 ? "보통" : value <= 8 ? "쾌활함" : "매우 행복함";
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
    <div className="intake-container p-8 max-w-5xl mx-auto bg-white shadow-xl rounded-lg">
      <h1 className="text-3xl font-extrabold text-gray-800 mb-4 text-center">음악 처방 전문 입력</h1>
      <p className="text-center text-gray-500 mb-8">환자의 상태를 기반으로 AI 작곡 엔진에 전달할 **음악적 파라미터**를 설정합니다.</p>
      <form onSubmit={handleSubmit} className="space-y-8">

        {/* 섹션 1: 환자 주관적 상태 (VAS, 0-10점 척도) */}
        <section className="p-6 border rounded-lg shadow-sm">
            <h2 className="text-xl font-bold mb-5 text-indigo-700 border-b pb-2">환자 상태 척도 기록 (참고용)</h2>
            
            {/* 1. 불안 수준 VAS */}
            <div className="mb-6">
                <label htmlFor="currentAnxietyLevel" className="block text-md font-medium text-gray-700 mb-2">
                    현재 **불안** 수준: <span className="font-bold text-lg text-red-600">{formData.currentAnxietyLevel}점 ({getAnxietyLabel(formData.currentAnxietyLevel)})</span>
                </label>
                <input type="range" id="currentAnxietyLevel" name="currentAnxietyLevel" value={formData.currentAnxietyLevel} onChange={handleChange} min="0" max="10" step="1" className="w-full h-2 bg-red-100 rounded-lg appearance-none cursor-pointer" />
                <div className="flex justify-between text-xs text-gray-500"><span>0: 전혀 불안하지 않음</span><span>10: 극심한 불안</span></div>
            </div>

            {/* 2. 기분 수준 VAS */}
            <div className="mb-6">
                <label htmlFor="currentMoodLevel" className="block text-md font-medium text-gray-700 mb-2">
                    현재 **기분** 수준: <span className="font-bold text-lg text-blue-600">{formData.currentMoodLevel}점 ({getMoodLabel(formData.currentMoodLevel)})</span>
                </label>
                <input type="range" id="currentMoodLevel" name="currentMoodLevel" value={formData.currentMoodLevel} onChange={handleChange} min="0" max="10" step="1" className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer" />
                <div className="flex justify-between text-xs text-gray-500"><span>0: 매우 부정적/우울함</span><span>10: 매우 긍정적/행복함</span></div>
            </div>

            {/* 3. 통증 수준 VAS */}
            <div>
                <label htmlFor="currentPainLevel" className="block text-md font-medium text-gray-700 mb-2">
                    현재 **통증** 수준: <span className="font-bold text-lg text-green-600">{formData.currentPainLevel}점 ({getPainLabel(formData.currentPainLevel)})</span>
                </label>
                <input type="range" id="currentPainLevel" name="currentPainLevel" value={formData.currentPainLevel} onChange={handleChange} min="0" max="10" step="1" className="w-full h-2 bg-green-100 rounded-lg appearance-none cursor-pointer" />
                <div className="flex justify-between text-xs text-gray-500"><span>0: 통증 없음</span><span>10: 상상할 수 없는 최악의 통증</span></div>
            </div>
        </section>

        {/* 섹션 2: 전문 작곡 파라미터 (심화 요소) */}
        <section className="p-6 border rounded-lg bg-yellow-50 shadow-md">
            <h2 className="text-xl font-bold mb-4 text-yellow-800 border-b pb-2">🎼 전문 작곡 파라미터 설정</h2>
            
            {/* BPM, 음악 길이 */}
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label htmlFor="targetBPM" className="block text-sm font-medium text-gray-700">목표 BPM (40~160)</label>
                    <input type="number" id="targetBPM" name="targetBPM" value={formData.targetBPM === 'Neutral' ? 80 : formData.targetBPM} onChange={handleChange} min="40" max="160" step="5" className="w-full p-2 border rounded-md" />
                    <select id="targetBPM_select" name="targetBPM" value={formData.targetBPM} onChange={handleChange} className="w-full p-2 border rounded-md mt-2">
                        <option value={80} disabled>--- BPM 값 직접 입력 ---</option>
                        <option value="Neutral">Neutral (상관없음)</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="musicDuration" className="block text-sm font-medium text-gray-700">음악 길이 (초)</label>
                    <input type="number" id="musicDuration" name="musicDuration" value={formData.musicDuration} onChange={handleChange} min="60" max="600" step="30" className="w-full p-2 border rounded-md" />
                </div>
            </div>

            {/* 음계, 불협화음, 리듬 복잡도 */}
            <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                    <label htmlFor="musicKeyPreference" className="block text-sm font-medium text-gray-700">음계/조성</label>
                    <select id="musicKeyPreference" name="musicKeyPreference" value={formData.musicKeyPreference} onChange={handleChange} className="w-full p-2 border rounded-md">
                        <option value="Neutral">Neutral (자유롭게)</option>
                        <option value="Major">Major (밝고 긍정적)</option>
                        <option value="Minor">Minor (차분하고 성찰적)</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="harmonicDissonance" className="block text-sm font-medium text-gray-700">불협화음 수준</label>
                    <select id="harmonicDissonance" name="harmonicDissonance" value={formData.harmonicDissonance} onChange={handleChange} className="w-full p-2 border rounded-md">
                        <option value="Neutral">Neutral (상관없음)</option>
                        <option value="None">None (없음)</option>
                        <option value="Low">Low (낮음)</option>
                        <option value="Medium">Medium (중간)</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="rhythmComplexity" className="block text-sm font-medium text-gray-700">리듬 복잡도</label>
                    <select id="rhythmComplexity" name="rhythmComplexity" value={formData.rhythmComplexity} onChange={handleChange} className="w-full p-2 border rounded-md">
                        <option value="Neutral">Neutral (상관없음)</option>
                        <option value="Simple">Simple (단순, 규칙적)</option>
                        <option value="Medium">Medium (보통)</option>
                        <option value="Complex">Complex (복잡)</option>
                    </select>
                </div>
            </div>

            {/* 선율 윤곽, 밀도, 주요 악기 */}
            <div className="grid grid-cols-3 gap-4">
                <div>
                    <label htmlFor="melodyContour" className="block text-sm font-medium text-gray-700">선율 윤곽</label>
                    <select id="melodyContour" name="melodyContour" value={formData.melodyContour} onChange={handleChange} className="w-full p-2 border rounded-md">
                        <option value="Neutral">Neutral (상관없음)</option>
                        <option value="Descending">Descending (하행: 이완 유도)</option>
                        <option value="Ascending">Ascending (상행: 활력 유도)</option>
                        <option value="Wavy">Wavy (파형)</option>
                        <option value="Flat">Flat (평탄)</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="textureDensity" className="block text-sm font-medium text-gray-700">음악적 밀도</label>
                    <select id="textureDensity" name="textureDensity" value={formData.textureDensity} onChange={handleChange} className="w-full p-2 border rounded-md">
                        <option value="Neutral">Neutral (상관없음)</option>
                        <option value="Sparse">Sparse (성김/단순)</option>
                        <option value="Medium">Medium (보통)</option>
                        <option value="Dense">Dense (조밀/복잡)</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="mainInstrument" className="block text-sm font-medium text-gray-700">주요 악기 지정</label>
                    <select id="mainInstrument" name="mainInstrument" value={formData.mainInstrument} onChange={handleChange} className="w-full p-2 border rounded-md">
                        <option value="Piano">Piano (피아노)</option>
                        <option value="Synthesizer">Synthesizer (신디사이저)</option>
                        <option value="Acoustic Guitar">Acoustic Guitar (어쿠스틱 기타)</option>
                        <option value="Strings">Strings (현악기)</option>
                    </select>
                </div>
            </div>

            {/* 작곡 지침 메모 */}
            <div className="mt-4">
                <label htmlFor="compositionalNotes" className="block text-sm font-medium text-gray-700">AI 작곡 엔진 구체적 지침 메모</label>
                <textarea id="compositionalNotes" name="compositionalNotes" value={formData.compositionalNotes} onChange={handleChange} rows={3} placeholder="예: 저음부만 규칙적인 아르페지오로 구성하고, 모든 타악기는 사용하지 마십시오." className="w-full p-2 border rounded-md" />
            </div>
        </section>


        {/* 섹션 3: 음악 선호도 (버튼 선택형) */}
        <section className="p-6 border rounded-lg bg-gray-50 shadow-sm">
            <h2 className="text-xl font-bold mb-4 text-indigo-700 border-b pb-2">환자 음악 선호도</h2>
            
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
          className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition duration-200 disabled:opacity-50 mt-6 text-xl"
        >
          {loading ? '데이터 저장 중...' : '작곡 파라미터 제출 →'}
        </button>
      </form>
    </div>
  );
}