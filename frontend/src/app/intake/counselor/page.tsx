'use client';

import React, { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
    CounselorIntakeData,
    initialCounselorIntakeData,
    MUSIC_GENRE_OPTIONS
} from '@/types/intake';
import { CheckCircle, Info, Loader2 } from 'lucide-react';

export default function CounselorIntakePage() {
    const [formData, setFormData] = useState<CounselorIntakeData>(initialCounselorIntakeData);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const [submissionComplete, setSubmissionComplete] = useState<{ prompt: string } | null>(null);

    // Input/Select/Range 처리 핸들러
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (name === 'targetBPM' && value === 'Neutral') {
            setFormData(prev => ({ ...prev, [name]: 'Neutral' }));
        } else if (type === 'range' || type === 'number') {
            setFormData(prev => ({ ...prev, [name]: value === '' ? '' : Number(value) }));
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
    
    // VAS 라벨 헬퍼 함수
    const getAnxietyLabel = (value: number) => value <= 2 ? "전혀 안심" : value <= 4 ? "약간 안심" : value <= 6 ? "보통" : value <= 8 ? "불안함" : "극심한 불안";
    const getMoodLabel = (value: number) => value <= 2 ? "매우 긍정적/행복함" : value <= 4 ? "쾌활함" : value <= 6 ? "보통" : value <= 8 ? "다소 우울함" : "매우 부정적/우울함";
    const getPainLabel = (value: number) => value === 0 ? "통증 없음" : value <= 4 ? "약한 통증" : value <= 7 ? "중간 통증" : "심한 통증";

    // 장르 선택 버튼 스타일링 헬퍼 함수
    const getButtonClass = (genre: string, type: 'preferred' | 'disliked') => {
        const isSelected = formData[type === 'preferred' ? 'preferredMusicGenres' : 'dislikedMusicGenres'].includes(genre);
        const baseClass = "px-4 py-2 rounded-full transition duration-150 text-sm font-medium border";
        if (type === 'preferred') {
            return isSelected 
                ? `${baseClass} bg-yellow-500 border-yellow-500 text-white shadow-md hover:bg-yellow-600`
                : `${baseClass} bg-white text-gray-700 border-gray-300 hover:bg-yellow-50 hover:border-yellow-400`;
        } else {
            return isSelected 
                ? `${baseClass} bg-gray-700 border-gray-700 text-white shadow-md hover:bg-gray-800`
                : `${baseClass} bg-white text-gray-700 border-gray-300 hover:bg-gray-100 hover:border-gray-400`;
        }
    };

    // 폼 제출 핸들러 (therapist API 연동 로직)
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const intersection = formData.preferredMusicGenres.filter(genre => formData.dislikedMusicGenres.includes(genre));
        if (intersection.length > 0) {
            setError(`선호/비선호 장르에 동시에 선택된 항목(${intersection.join(', ')})이 있습니다.`);
            setLoading(false);
            return;
        }

        try {
            // 1단계: 새 세션 생성 (/therapist/new 호출)
            const sessionResponse = await fetch('http://localhost:8000/therapist/new', {
                method: 'POST',
            });
            if (!sessionResponse.ok) throw new Error('세션 생성에 실패했습니다.');
            const sessionData = await sessionResponse.json();
            const sessionId = sessionData.session_id;
            console.log('New therapist session created:', sessionId);

            // 2단계: 음악 파라미터 전송 (/therapist/manual-generate 호출)
            const manualPayload = {
                session_id: sessionId,
                guideline_json: "{}", // 실제 가이드라인 데이터를 문자열로 전달해야 합니다.
                manual: {
                    genre: formData.preferredMusicGenres.join(', ') || null,
                    mood: null,
                    bpm_min: formData.targetBPM !== 'Neutral' ? Number(formData.targetBPM) - 5 : null,
                    bpm_max: formData.targetBPM !== 'Neutral' ? Number(formData.targetBPM) + 5 : null,
                    key_signature: formData.musicKeyPreference,
                    vocals_allowed: false,
                    include_instruments: [formData.mainInstrument],
                    exclude_instruments: null,
                    duration_sec: formData.musicDuration,
                    notes: formData.compositionalNotes,
                }
            };

            const generateResponse = await fetch('http://localhost:8000/therapist/manual-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(manualPayload)
            });

            if (!generateResponse.ok) {
                const errorData = await generateResponse.json();
                throw new Error(errorData.detail || '음악 프롬프트 생성에 실패했습니다.');
            }

            const promptData = await generateResponse.json();
            console.log('Generated prompt:', promptData.prompt_text);

            setSubmissionComplete({ prompt: promptData.prompt_text });

        } catch (err) {
            console.error('Submission failed:', err);
            setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="intake-container p-6 md:p-8 max-w-5xl mx-auto bg-white shadow-xl rounded-lg my-10">
            {submissionComplete ? (
                <div className="text-center py-12 px-6">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-5" />
                    <h1 className="text-3xl font-bold text-gray-800 mb-3">음악 처방 제출 완료!</h1>
                    <p className="text-gray-600 mb-6">AI가 아래 프롬프트를 기반으로 음악 생성을 시작합니다.</p>
                    <div className="p-4 bg-gray-100 rounded-md text-left text-sm text-gray-700 max-w-2xl mx-auto">
                        <pre className="whitespace-pre-wrap font-mono">{submissionComplete.prompt}</pre>
                    </div>
                    <div className="mt-8 flex justify-center gap-4">
                        <button onClick={() => router.push('/dashboard/counselor')} className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow hover:bg-indigo-700 transition">
                            상담가 대시보드로 이동
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <h1 className="text-3xl font-extrabold text-gray-800 mb-4 text-center">음악 처방 전문 입력</h1>
                    <p className="text-center text-gray-500 mb-8">환자의 상태를 기반으로 AI 작곡 엔진에 전달할 파라미터를 설정합니다.</p>
                    <form onSubmit={handleSubmit} className="space-y-8">
                        
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
                                    </select>
                                </div>
                            </div>
                            <div className="mt-4">
                                <label htmlFor="compositionalNotes" className="block text-sm font-medium text-gray-700 mb-1">AI 작곡 엔진 구체적 지침 (선택)</label>
                                <textarea id="compositionalNotes" name="compositionalNotes" value={formData.compositionalNotes} onChange={handleChange} rows={3} placeholder="예: 잔잔한 피아노 아르페지오 위주로, 타악기 배제" className="w-full p-2 border rounded-md text-sm" />
                            </div>
                        </section>

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
                            </div>
                        </section>

                        {error && (
                            <div className="flex items-center justify-center p-3 bg-red-100 text-red-700 rounded-md text-sm">
                                <Info className="w-5 h-5 mr-2 flex-shrink-0" />
                                <p className="font-medium">{error}</p>
                            </div>
                        )}

                        <button type="submit" disabled={loading} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition duration-200 disabled:opacity-70 disabled:cursor-not-allowed mt-6 text-lg flex items-center justify-center gap-2">
                            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                            {loading ? '처리 중...' : '작곡 파라미터 제출 →'}
                        </button>
                    </form>
                </>
            )}
        </div>
    );
}