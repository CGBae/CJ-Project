// /frontend/src/app/intake/counselor/page.tsx

'use client';

import React, { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
    CounselorIntakeData,
    initialCounselorIntakeData,
    MUSIC_GENRE_OPTIONS
} from '@/types/intake';
import { addPatient, addMusicToPatient } from '@/lib/utils/patients';
import { MusicTrack } from '@/lib/utils/music';
import { CheckCircle, Info, Loader2 } from 'lucide-react'; // Loader2 추가

export default function CounselorIntakePage() {
    const [formData, setFormData] = useState<CounselorIntakeData>(initialCounselorIntakeData);
    const [patientName, setPatientName] = useState('');
    const [patientAge, setPatientAge] = useState<number | ''>('');
    const [loading, setLoading] = useState(false); // 폼 제출 로딩
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const [submissionComplete, setSubmissionComplete] = useState<{ patientId: string; patientName: string } | null>(null);
    const [musicGenLoading, setMusicGenLoading] = useState(false); // 음악 생성 로딩 상태 추가

    // Input/Select/Range 처리 핸들러
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;

        if (name === 'targetBPM' && value === 'Neutral') {
            setFormData(prev => ({ ...prev, [name]: 'Neutral' }));
        }
        else if (type === 'range' || type === 'number') {
            const numValue = value === '' ? '' : Number(value);
            setFormData(prev => ({ ...prev, [name]: numValue }));
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
                const oppositeFieldName = type === 'preferred' ? 'dislikedMusicGenres' : 'preferredMusicGenres';
                const updatedOppositeGenres = prev[oppositeFieldName].filter(g => g !== genre);
                return {
                    ...prev,
                    [fieldName]: [...currentGenres, genre],
                    [oppositeFieldName]: updatedOppositeGenres
                 };
            }
        });
    };

    // 폼 제출 핸들러 (환자 등록만 수행)
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (!patientName.trim() || patientAge === '' || Number(patientAge) < 0) {
          setError('유효한 환자 이름과 나이를 입력해주세요.');
          setLoading(false);
          return;
        }

        const intersection = formData.preferredMusicGenres.filter(genre =>
            formData.dislikedMusicGenres.includes(genre)
        );
        if (intersection.length > 0) {
            setError(`선호/비선호 장르를 동시에 선택할 수 없습니다: ${intersection.join(', ')}`);
            setLoading(false);
            return;
        }

        // 1. 새 환자 등록
        const newPatient = addPatient(patientName, Number(patientAge));

        // 2. 잠시 후 '제출 완료' 상태로 전환
        setTimeout(() => {
            setLoading(false);
            setSubmissionComplete({ patientId: newPatient.id, patientName: newPatient.name });
        }, 500); // 짧은 딜레이
    };

    // "환자 상세 정보 보기" 버튼 클릭 핸들러 (음악 생성 + 이동)
    const handleViewDetailsAndGenerateMusic = () => {
        if (!submissionComplete) return;
        setMusicGenLoading(true); // 음악 생성 로딩 시작

        console.log(`환자(${submissionComplete.patientId}) 상세 보기 선택. 초기 음악 생성을 시작합니다...`);

        // (가짜) 음악 생성 로직
        const musicParams = {
            prompt: `환자 ${submissionComplete.patientName}를 위한 첫 맞춤 음악`,
            targetBPM: formData.targetBPM,
            duration: formData.musicDuration,
            key: formData.musicKeyPreference,
            dissonance: formData.harmonicDissonance,
            rhythm: formData.rhythmComplexity,
            contour: formData.melodyContour,
            density: formData.textureDensity,
            instrument: formData.mainInstrument,
            notes: formData.compositionalNotes,
            preferredGenres: formData.preferredMusicGenres,
            dislikedGenres: formData.dislikedMusicGenres
        };
        console.log("음악 생성 파라미터:", musicParams);

        const placeholderTrack: MusicTrack = {
            id: `track_init_${submissionComplete.patientId}_${Date.now()}`,
            title: `${submissionComplete.patientName}님을 위한 첫 AI 음악`,
            artist: 'AI Composer',
            prompt: musicParams.prompt,
            audioUrl: '/placeholder.mp3'
        };
        addMusicToPatient(submissionComplete.patientId, placeholderTrack);

        // 잠시 후 페이지 이동
        setTimeout(() => {
            setMusicGenLoading(false);
            router.push(`/counselor/${submissionComplete.patientId}`);
        }, 1500); // 음악 생성 시간 시뮬레이션
    };

    // VAS 라벨 헬퍼 함수
    const getAnxietyLabel = (value: number) => value <= 2 ? "전혀 안심" : value <= 4 ? "약간 안심" : value <= 6 ? "보통" : value <= 8 ? "불안함" : "극심한 불안";
    const getMoodLabel = (value: number) => value <= 2 ? "매우 긍정적/행복함" : value <= 4 ? "쾌활함" : value <= 6 ? "보통" : value <= 8 ? "다소 우울함" : "매우 부정적/우울함";
    const getPainLabel = (value: number) => value === 0 ? "통증 없음" : value <= 4 ? "약한 통증" : value <= 7 ? "중간 통증" : "심한 통증";

    // 장르 선택 버튼 스타일링 헬퍼 함수
    const getButtonClass = (genre: string, type: 'preferred' | 'disliked') => {
        const isSelected = formData[type === 'preferred' ? 'preferredMusicGenres' : 'dislikedMusicGenres'].includes(genre);
        const baseClass = "px-4 py-2 rounded-full transition duration-150 text-sm font-medium border";
        return isSelected
            ? `${baseClass} ${type === 'preferred' ? 'bg-yellow-500 border-yellow-500 text-white shadow-md hover:bg-yellow-600' : 'bg-gray-700 border-gray-700 text-white shadow-md hover:bg-gray-800'}`
            : `${baseClass} bg-white text-gray-700 border-gray-300 ${type === 'preferred' ? 'hover:bg-yellow-50 hover:border-yellow-300' : 'hover:bg-gray-100 hover:border-gray-400'}`;
    };

    return (
        <div className="intake-container p-6 md:p-8 max-w-5xl mx-auto bg-white shadow-xl rounded-lg my-10">

            {submissionComplete ? (
                // --- 제출 완료 UI ---
                <div className="text-center py-12 px-6">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-5 animate-pulse" />
                    <h1 className="text-3xl font-bold text-gray-800 mb-3">
                        {submissionComplete.patientName} 환자 등록 완료!
                    </h1>
                    <p className="text-gray-600 mb-8 max-w-md mx-auto">
                        다음 단계를 선택하세요. 상세 정보 보기를 선택하면 환자를 위한 초기 음악 생성이 시작됩니다.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <button
                            onClick={handleViewDetailsAndGenerateMusic}
                            disabled={musicGenLoading} // 음악 생성 중 비활성화
                            className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow hover:bg-indigo-700 transition duration-200 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {musicGenLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                            {musicGenLoading ? '초기 음악 생성 중...' : '환자 상세 정보 보기'}
                        </button>
                        <button
                            onClick={() => router.push(`/counsel?patientId=${submissionComplete.patientId}`)}
                            disabled={musicGenLoading} // 음악 생성 중 비활성화
                            className="px-6 py-3 bg-white text-gray-800 font-semibold border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            AI 상담 시작하기
                        </button>
                    </div>
                </div>
            ) : (
                // --- 기존 폼 UI ---
                <>
                    <h1 className="text-3xl font-extrabold text-gray-800 mb-4 text-center">신규 환자 접수 및 음악 처방</h1>
                    <p className="text-center text-gray-500 mb-8">새로운 환자 정보를 등록하고, AI 작곡을 위한 초기 파라미터를 설정합니다.</p>
                    <form onSubmit={handleSubmit} className="space-y-8">

                        {/* 환자 기본 정보 섹션 */}
                        <section className="p-6 border rounded-lg shadow-sm bg-gray-50">
                            <h2 className="text-xl font-bold mb-4 text-indigo-700 border-b pb-2">환자 기본 정보</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="patientName" className="block text-md font-medium text-gray-700 mb-1">환자 이름</label>
                                    <input
                                        type="text" id="patientName" value={patientName} onChange={(e) => setPatientName(e.target.value)}
                                        className="w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500" placeholder="홍길동" required
                                    />
                                </div>
                                <div>
                                    <label htmlFor="patientAge" className="block text-md font-medium text-gray-700 mb-1">나이</label>
                                    <input
                                        type="number" id="patientAge" value={patientAge} onChange={(e) => setPatientAge(e.target.value === '' ? '' : Number(e.target.value))}
                                        className="w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500" placeholder="30" min="0" required
                                    />
                                </div>
                            </div>
                        </section>

                        {/* 환자 상태 척도 섹션 */}
                        <section className="p-6 border rounded-lg shadow-sm">
                            <h2 className="text-xl font-bold mb-5 text-indigo-700 border-b pb-2">환자 상태 척도 기록 (참고용)</h2>
                            <div className="mb-6">
                                <label htmlFor="currentAnxietyLevel" className="block text-md font-medium text-gray-700 mb-2 text-center">
                                    현재 **불안** 수준: <span className="font-bold text-lg text-red-600">{formData.currentAnxietyLevel}점 ({getAnxietyLabel(formData.currentAnxietyLevel)})</span>
                                </label>
                                <input type="range" id="currentAnxietyLevel" name="currentAnxietyLevel" value={formData.currentAnxietyLevel} onChange={handleChange} min="0" max="10" step="1" className="w-full h-2 bg-red-100 rounded-lg appearance-none cursor-pointer accent-red-500" />
                                <div className="flex justify-between text-xs text-gray-500 mt-1"><span>0: 전혀 불안하지 않음</span><span>10: 극심한 불안</span></div>
                            </div>
                            <div className="mb-6">
                                <label htmlFor="currentMoodLevel" className="block text-md font-medium text-gray-700 mb-2 text-center">
                                    현재 **기분** 수준: <span className="font-bold text-lg text-blue-600">{formData.currentMoodLevel}점 ({getMoodLabel(formData.currentMoodLevel)})</span>
                                </label>
                                <input type="range" id="currentMoodLevel" name="currentMoodLevel" value={formData.currentMoodLevel} onChange={handleChange} min="0" max="10" step="1" className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                <div className="flex justify-between text-xs text-gray-500 mt-1"><span>0: 매우 긍정적/행복함</span><span>10: 매우 부정적/우울함</span></div>
                            </div>
                            <div>
                                <label htmlFor="currentPainLevel" className="block text-md font-medium text-gray-700 mb-2 text-center">
                                    현재 **통증** 수준: <span className="font-bold text-lg text-green-600">{formData.currentPainLevel}점 ({getPainLabel(formData.currentPainLevel)})</span>
                                </label>
                                <input type="range" id="currentPainLevel" name="currentPainLevel" value={formData.currentPainLevel} onChange={handleChange} min="0" max="10" step="1" className="w-full h-2 bg-green-100 rounded-lg appearance-none cursor-pointer accent-green-500" />
                                <div className="flex justify-between text-xs text-gray-500 mt-1"><span>0: 통증 없음</span><span>10: 상상할 수 없는 최악의 통증</span></div>
                            </div>
                        </section>

                        {/* 전문 작곡 파라미터 섹션 */}
                        <section className="p-6 border rounded-lg bg-yellow-50 shadow-md">
                            <h2 className="text-xl font-bold mb-4 text-yellow-800 border-b border-yellow-200 pb-2">🎼 전문 작곡 파라미터 설정</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label htmlFor="targetBPM_input" className="block text-sm font-medium text-gray-700 mb-1">목표 BPM (40~160)</label>
                                    <input type="number" id="targetBPM_input" name="targetBPM" value={formData.targetBPM === 'Neutral' ? '' : formData.targetBPM} onChange={handleChange} min="40" max="160" step="5" className="w-full p-2 border rounded-md" placeholder="숫자 입력 또는 Neutral 선택" disabled={formData.targetBPM === 'Neutral'}/>
                                    <select id="targetBPM_select" name="targetBPM" value={formData.targetBPM} onChange={handleChange} className="w-full p-2 border rounded-md mt-2 text-sm">
                                        <option value="" disabled>--- BPM 값 직접 입력 시 ---</option>
                                        <option value="Neutral">Neutral (AI가 결정)</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="musicDuration" className="block text-sm font-medium text-gray-700 mb-1">음악 길이 (초, 60~600)</label>
                                    <input type="number" id="musicDuration" name="musicDuration" value={formData.musicDuration} onChange={handleChange} min="60" max="600" step="30" className="w-full p-2 border rounded-md" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div>
                                    <label htmlFor="musicKeyPreference" className="block text-sm font-medium text-gray-700 mb-1">음계/조성</label>
                                    <select id="musicKeyPreference" name="musicKeyPreference" value={formData.musicKeyPreference} onChange={handleChange} className="w-full p-2 border rounded-md text-sm">
                                        <option value="Neutral">Neutral (AI가 결정)</option>
                                        <option value="Major">Major (밝음)</option>
                                        <option value="Minor">Minor (차분함)</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="harmonicDissonance" className="block text-sm font-medium text-gray-700 mb-1">불협화음 수준</label>
                                    <select id="harmonicDissonance" name="harmonicDissonance" value={formData.harmonicDissonance} onChange={handleChange} className="w-full p-2 border rounded-md text-sm">
                                        <option value="Neutral">Neutral (AI가 결정)</option>
                                        <option value="None">없음</option>
                                        <option value="Low">낮음</option>
                                        <option value="Medium">중간</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="rhythmComplexity" className="block text-sm font-medium text-gray-700 mb-1">리듬 복잡도</label>
                                    <select id="rhythmComplexity" name="rhythmComplexity" value={formData.rhythmComplexity} onChange={handleChange} className="w-full p-2 border rounded-md text-sm">
                                        <option value="Neutral">Neutral (AI가 결정)</option>
                                        <option value="Simple">단순</option>
                                        <option value="Medium">보통</option>
                                        <option value="Complex">복잡</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label htmlFor="melodyContour" className="block text-sm font-medium text-gray-700 mb-1">선율 윤곽</label>
                                    <select id="melodyContour" name="melodyContour" value={formData.melodyContour} onChange={handleChange} className="w-full p-2 border rounded-md text-sm">
                                        <option value="Neutral">Neutral (AI가 결정)</option>
                                        <option value="Descending">하행 (이완)</option>
                                        <option value="Ascending">상행 (활력)</option>
                                        <option value="Wavy">파형</option>
                                        <option value="Flat">평탄</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="textureDensity" className="block text-sm font-medium text-gray-700 mb-1">음악적 밀도</label>
                                    <select id="textureDensity" name="textureDensity" value={formData.textureDensity} onChange={handleChange} className="w-full p-2 border rounded-md text-sm">
                                        <option value="Neutral">Neutral (AI가 결정)</option>
                                        <option value="Sparse">성김 (단순)</option>
                                        <option value="Medium">보통</option>
                                        <option value="Dense">조밀 (복잡)</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="mainInstrument" className="block text-sm font-medium text-gray-700 mb-1">주요 악기 지정</label>
                                    <select id="mainInstrument" name="mainInstrument" value={formData.mainInstrument} onChange={handleChange} className="w-full p-2 border rounded-md text-sm">
                                        <option value="Piano">Piano</option>
                                        <option value="Synthesizer">Synthesizer</option>
                                        <option value="Acoustic Guitar">Acoustic Guitar</option>
                                        <option value="Strings">Strings</option>
                                        {/* 필요시 악기 옵션 추가 */}
                                    </select>
                                </div>
                            </div>
                            <div className="mt-4">
                                <label htmlFor="compositionalNotes" className="block text-sm font-medium text-gray-700 mb-1">AI 작곡 엔진 구체적 지침 (선택)</label>
                                <textarea id="compositionalNotes" name="compositionalNotes" value={formData.compositionalNotes} onChange={handleChange} rows={3} placeholder="예: 잔잔한 피아노 아르페지오 위주로, 타악기 배제" className="w-full p-2 border rounded-md text-sm" />
                            </div>
                        </section>

                        {/* 음악 선호도 섹션 */}
                        <section className="p-6 border rounded-lg bg-gray-50 shadow-sm">
                            <h2 className="text-xl font-bold mb-4 text-indigo-700 border-b pb-2">환자 음악 선호도</h2>
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-3">✅ **선호** 음악 장르 (AI 참고용)</label>
                                <div className="flex flex-wrap gap-2">
                                    {MUSIC_GENRE_OPTIONS.map((genre) => (
                                        <button key={`pref-${genre}`} type="button" onClick={() => handleGenreToggle(genre, 'preferred')} className={getButtonClass(genre, 'preferred')}>{genre}</button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-3">❌ **비선호** 음악 장르 (AI 참고용)</label>
                                <div className="flex flex-wrap gap-2">
                                    {MUSIC_GENRE_OPTIONS.map((genre) => (
                                        <button key={`dislike-${genre}`} type="button" onClick={() => handleGenreToggle(genre, 'disliked')} className={getButtonClass(genre, 'disliked')}>{genre}</button>
                                    ))}
                                </div>
                                {formData.preferredMusicGenres.some(g => formData.dislikedMusicGenres.includes(g)) && (
                                     <p className="text-xs text-red-500 mt-2 font-medium">※ 경고: 선호와 비선호 장르에 겹치는 항목이 있습니다.</p>
                                )}
                            </div>
                        </section>

                        {/* 에러 메시지 */}
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
                            {loading ? '환자 정보 저장 중...' : '환자 접수 완료하기'}
                        </button>
                    </form>
                </>
            )}
        </div>
    );
}