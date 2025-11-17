'use client'; 

import React, { useState, FormEvent, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    CounselorIntakeData,
    initialCounselorIntakeData,
    MUSIC_GENRE_OPTIONS
} from '@/types/intake'; 
// 💡 1. [수정] 전문적인 UI를 위한 아이콘 추가
import { Info, Loader2, Link, User, FilePen, SlidersHorizontal, Music, Send, AlertTriangle } from 'lucide-react';

// 1. 실제 환자 타입 정의 (변경 없음)
interface Patient {
  id: string | number;
  name: string | null;
  email?: string | null;
}

// 2. MusicTrack 타입 정의 (사용되지 않음, 제거해도 무방)
interface MusicTrack {
  id: string | number;
  title: string;
  artist: string;
  prompt: string;
  audioUrl: string;
}

function getApiUrl() {
  // 1순위: 내부 통신용 (docker 네트워크 안에서 backend 이름으로 호출)
  if (process.env.INTERNAL_API_URL) {
    return process.env.INTERNAL_API_URL;
  }

  // 2순위: 공개용 API URL (빌드 시점에라도 이건 거의 항상 들어있음)
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // 3순위: 최후 fallback - 도커 네트워크 기준으로 backend 서비스 직접 호출
  return 'http://backend:8000';
}

const API_URL = getApiUrl();

export default function CounselorIntakePage() {
    // --- (기존 state 로직 - 변경 없음) ---
    const [formData, setFormData] = useState<CounselorIntakeData>(initialCounselorIntakeData);
    // 💡 [수정] intakeMode는 'existing'만 사용
    const [intakeMode, setIntakeMode] = useState<'existing'>('existing'); 
    const [allPatients, setAllPatients] = useState<Patient[]>([]);
    const [selectedPatientId, setSelectedPatientId] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPatientListLoading, setIsPatientListLoading] = useState(true); 
    const [patientListError, setPatientListError] = useState<string | null>(null);
    const router = useRouter();
    const [vocalsAllowed, setVocalsAllowed] = useState(false);

    // --- (기존 loadPatients, useEffect 로직 - 변경 없음) ---
    const loadPatients = useCallback(async () => {
        setIsPatientListLoading(true);
        setPatientListError(null);
        try {
            const token = localStorage.getItem('accessToken');
            if (!token) {
                throw new Error('로그인 정보(토큰)를 찾을 수 없습니다.');
            }
                        const response = await fetch(`${API_URL}/therapist/my-patients`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                if (response.status === 401) throw new Error('인증에 실패했습니다.');
                throw new Error('환자 목록을 불러오는데 실패했습니다.');
            }
            const patients: Patient[] = await response.json(); 
            setAllPatients(patients); 
            if (patients.length > 0 && !selectedPatientId) {
                setSelectedPatientId(String(patients[0].id) || '');
            }
        } catch (err: unknown) { 
            console.error(err);
            setPatientListError(err instanceof Error ? err.message : '알 수 없는 오류');
        } finally {
            setIsPatientListLoading(false);
        }
    }, [selectedPatientId]);
    
    useEffect(() => {
        loadPatients();
    }, [loadPatients]);

    // --- (기존 handleChange, handleGenreToggle 로직 - 변경 없음) ---
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox' && name === 'vocalsAllowed') {
            setVocalsAllowed((e.target as HTMLInputElement).checked);
        } else if (name === 'targetBPM' && value === 'Neutral') {
            setFormData(prev => ({ ...prev, [name]: 'Neutral' }));
        } else if (type === 'range' || type === 'number') {
            setFormData(prev => ({ ...prev, [name]: value === '' ? '' : Number(value) }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };
    const handleGenreToggle = (genre: string, type: 'preferred' | 'disliked') => {
        const fieldName = type === 'preferred' ? 'preferredMusicGenres' : 'dislikedMusicGenres';
        setFormData(prev => {
            const currentGenres = prev[fieldName];
            const oppositeFieldName = type === 'preferred' ? 'dislikedMusicGenres' : 'preferredMusicGenres';
            const updatedOppositeGenres = prev[oppositeFieldName].filter(g => g !== genre);
            if (currentGenres.includes(genre)) {
                return { ...prev, [fieldName]: currentGenres.filter(g => g !== genre) };
            } else {
                return { ...prev, [fieldName]: [...currentGenres, genre], [oppositeFieldName]: updatedOppositeGenres };
            }
        });
    };

    // --- (기존 handleSubmit 로직 - 💡 manualPayload 수정) ---
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const token = localStorage.getItem('accessToken');
        if (!token) {
            setError('인증 토큰이 없습니다. 다시 로그인해주세요.');
            setLoading(false);
            return;
        }

        let patientIdToUse: string = '';
        if (intakeMode === 'existing') {
            if (!selectedPatientId) {
                setError('음악을 처방할 기존 환자를 선택해주세요.');
                setLoading(false);
                return;
            }
            patientIdToUse = selectedPatientId;
        }
        
        const intersection = formData.preferredMusicGenres.filter(genre => formData.dislikedMusicGenres.includes(genre));
        if (intersection.length > 0) {
            setError(`선호/비선호 장르에 겹치는 항목(${intersection.join(', ')})이 있습니다.`);
            setLoading(false);
            return;
        }

        let newSessionId = 0;
        try {
            console.log(`환자(${patientIdToUse})의 새 세션 및 음악 생성을 시작합니다...`);
            
                        const sessionResponse = await fetch(`${API_URL}/therapist/new`, { 
                method: 'POST', 
                headers: { 
                    'Authorization': `Bearer ${token}`, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ patient_id: Number(patientIdToUse) }) 
            });
            if (sessionResponse.status === 401) throw new Error('인증 실패(세션 생성)');
            if (sessionResponse.status === 403) throw new Error('이 환자에게 처방할 권한이 없습니다.');
            if (!sessionResponse.ok) throw new Error(`세션 생성 실패 (${sessionResponse.status})`);
            const sessionData = await sessionResponse.json();
            newSessionId = sessionData.session_id;
            
            // 💡 [핵심 수정] manualPayload에 모든 상세 옵션 포함
            const manualPayload = {
                session_id: newSessionId,
                guideline_json: "{}",
                manual: {
                    genre: formData.preferredMusicGenres.join(', ') || null,
                    bpm_min: formData.targetBPM !== 'Neutral' ? Number(formData.targetBPM) - 5 : null,
                    bpm_max: formData.targetBPM !== 'Neutral' ? Number(formData.targetBPM) + 5 : null,
                    key_signature: formData.musicKeyPreference,
                    vocals_allowed: vocalsAllowed,
                    include_instruments: [formData.mainInstrument],
                    exclude_instruments: null, 
                    duration_sec: formData.musicDuration,
                    notes: formData.compositionalNotes,
                    
                    // --- 💡 [수정] 누락되었던 상세 옵션들 추가 ---
                    harmonic_dissonance: formData.harmonicDissonance,
                    rhythm_complexity: formData.rhythmComplexity,
                    melody_contour: formData.melodyContour,
                    texture_density: formData.textureDensity
                }
            };
            
                        const generateResponse = await fetch(`${API_URL}/therapist/manual-generate`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(manualPayload)
            });
            if (generateResponse.status === 401) throw new Error('인증 실패(프롬프트 생성)');
            if (generateResponse.status === 403) throw new Error('이 세션에 접근할 권한이 없습니다.');
            if (!generateResponse.ok) throw new Error('음악 프롬프트 생성에 실패했습니다.');
            await generateResponse.json();

                        const musicResponse = await fetch(`${API_URL}/music/compose`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({
                    session_id: newSessionId,
                    music_length_ms: formData.musicDuration * 1000,
                    force_instrumental: !vocalsAllowed,
                }),
            });
            if (musicResponse.status === 401) throw new Error('인증 실패(음악 생성)');
            if (musicResponse.status === 403) throw new Error('이 세션에 접근할 권한이 없습니다.');
            if (!musicResponse.ok) {
                 const errorData = await musicResponse.json();
                 throw new Error(errorData.detail || 'ElevenLabs 음악 생성 API 호출에 실패했습니다.');
            }
            const result = await musicResponse.json();
            if (!result.track_url) throw new Error("음악 생성 결과가 올바르지 않습니다.");
            
            router.push(`/counselor/${patientIdToUse}`);

        } catch (err: unknown) {
            console.error('Intake music generation failed:', err);
            const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류 발생';
            setError(errorMessage);
            if (errorMessage.includes('인증 실패')) {
                 localStorage.removeItem('accessToken');
                 router.push('/login?next=/intake/counselor');
            }
            setLoading(false);
        }
    };
    
    // --- (기존 로직: VAS 라벨 헬퍼 함수 - 변경 없음) ---
    const getAnxietyLabel = (value: number) => value <= 2 ? "전혀 안심" : value <= 4 ? "약간 안심" : value <= 6 ? "보통" : value <= 8 ? "불안함" : "극심한 불안";
    const getMoodLabel = (value: number) => value <= 2 ? "매우 긍정적/행복함" : value <= 4 ? "쾌활함" : value <= 6 ? "보통" : value <= 8 ? "다소 우울함" : "매우 부정적/우울함";
    const getPainLabel = (value: number) => value === 0 ? "통증 없음" : value <= 4 ? "약한 통증" : value <= 7 ? "중간 통증" : "심한 통증";

    // 💡 [수정] 장르 버튼 스타일링 (병원/설문조사 스타일)
    const getButtonClass = (genre: string, type: 'preferred' | 'disliked') => {
        const isPreferred = formData.preferredMusicGenres.includes(genre);
        const isDisliked = formData.dislikedMusicGenres.includes(genre);
        const baseClass = "px-4 py-2 rounded-lg transition duration-150 text-sm font-medium border-2"; // 👈 [수정]

        if (type === 'preferred' && isPreferred) {
            // 선호 선택됨
            return `${baseClass} bg-indigo-600 border-indigo-600 text-white shadow-md`; // 👈 [수정]
        }
        if (type === 'disliked' && isDisliked) {
            // 비선호 선택됨
            return `${baseClass} bg-gray-700 border-gray-700 text-white shadow-md`; // 👈 [수정]
        }
        // 선택 안 됨
        return `${baseClass} bg-white text-gray-700 border-gray-300 hover:bg-gray-100 hover:border-gray-400`;
    };
    
    // 💡 [핵심 수정] JSX (UI) 전체 변경
    return (
        <div className="max-w-3xl mx-auto p-6 md:p-10 bg-white shadow-lg border border-gray-200 rounded-xl my-10 relative">
            
            {/* 로딩 오버레이 */}
            {loading && (
                <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col justify-center items-center z-10 text-center px-4 rounded-lg">
                    <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
                    <p className="mt-4 text-lg font-semibold text-gray-700">음악 생성 중...</p>
                    <p className="text-sm text-gray-500">잠시만 기다려주세요 (최대 1분 소요)</p>
                </div>
            )}
            
            {/* 헤더 */}
            <div className="text-center mb-10">
                <FilePen className="w-12 h-12 text-indigo-600 mx-auto mb-4" />
                <h1 className="text-3xl font-bold text-gray-900">음악 처방 입력 (상담사용)</h1>
                <p className="text-gray-600 mt-3">환자를 선택하고, AI 작곡을 위한 상세 파라미터를 설정합니다.</p>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-10">
                
                {/* --- 섹션 1: 환자 선택 --- */}
                <fieldset className="p-6 border border-gray-200 rounded-lg shadow-sm">
                    <legend className="text-xl font-semibold mb-6 text-gray-800 flex items-center">
                        <User className="w-5 h-5 mr-3 text-indigo-600"/>
                        1. 환자 선택
                    </legend>
                    
                    {/* (intakeMode 라디오 버튼 제거) */}

                    <div>
                        <label htmlFor="patientSelect" className="block text-md font-medium text-gray-700 mb-2">대상 환자</label>
                        <select
                            id="patientSelect"
                            value={selectedPatientId}
                            onChange={(e) => setSelectedPatientId(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            required
                        >
                            <option value="" disabled>
                                {isPatientListLoading ? '환자 목록 로딩 중...' : (allPatients.length === 0 ? '배정된 환자가 없습니다' : '-- 연결된 환자를 선택하세요 --')}
                            </option>

                            {!isPatientListLoading && !patientListError && allPatients.map(patient => (
                                <option key={patient.id} value={patient.id}>
                                    {patient.name || '이름 없음'} (ID: {patient.id} / Email: {patient.email || 'N/A'}) 
                                </option>
                            ))}
                        </select>

                        {patientListError && (
                            <p className="text-sm text-red-600 mt-2">{patientListError}</p>
                        )}
                    </div>
                    
                    
                </fieldset>

                {/* (intakeMode가 'request_connection'일 때의 UI 제거) */}
                
                {/* --- 섹션 2: 환자 상태 척도 (VAS) --- */}
                <fieldset className="p-6 border border-gray-200 rounded-lg shadow-sm">
                    <legend className="text-xl font-semibold mb-6 text-gray-800 flex items-center">
                        <SlidersHorizontal className="w-5 h-5 mr-3 text-indigo-600"/>
                        2. 환자 상태 (참고용)
                    </legend>
                    
                    <div className="mb-8">
                        <label htmlFor="currentAnxietyLevel" className="block text-md font-medium text-gray-700 mb-2 text-center">
                            환자 **불안** 수준: <span className="font-bold text-lg text-indigo-700">{formData.currentAnxietyLevel}점</span>
                        </label>
                        <span className="block text-center text-sm text-gray-500 mb-3">({getAnxietyLabel(formData.currentAnxietyLevel)})</span>
                        <input type="range" id="currentAnxietyLevel" name="currentAnxietyLevel" value={formData.currentAnxietyLevel} onChange={handleChange} min="0" max="10" step="1" 
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                        <div className="flex justify-between text-xs text-gray-500 mt-1"><span>0: 매우 안정</span><span>10: 극심한 불안</span></div>
                    </div>

                    <div className="mb-8">
                        <label htmlFor="currentMoodLevel" className="block text-md font-medium text-gray-700 mb-2 text-center">
                            환자 **기분** 수준: <span className="font-bold text-lg text-indigo-700">{formData.currentMoodLevel}점</span>
                        </label>
                        <span className="block text-center text-sm text-gray-500 mb-3">({getMoodLabel(formData.currentMoodLevel)})</span>
                        <input type="range" id="currentMoodLevel" name="currentMoodLevel" value={formData.currentMoodLevel} onChange={handleChange} min="0" max="10" step="1" 
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                        <div className="flex justify-between text-xs text-gray-500 mt-1"><span>0: 매우 긍정적</span><span>10: 매우 우울함</span></div>
                    </div>

                    <div>
                        <label htmlFor="currentPainLevel" className="block text-md font-medium text-gray-700 mb-2 text-center">
                            환자 **통증** 수준: <span className="font-bold text-lg text-indigo-700">{formData.currentPainLevel}점</span>
                        </label>
                        <span className="block text-center text-sm text-gray-500 mb-3">({getPainLabel(formData.currentPainLevel)})</span>
                        <input type="range" id="currentPainLevel" name="currentPainLevel" value={formData.currentPainLevel} onChange={handleChange} min="0" max="10" step="1" 
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                        <div className="flex justify-between text-xs text-gray-500 mt-1"><span>0: 통증 없음</span><span>10: 최악의 통증</span></div>
                    </div>
                </fieldset>

                {/* --- 섹션 3: 음악 처방 상세 --- */}
                <fieldset className="p-6 border border-gray-200 rounded-lg shadow-sm">
                    <legend className="text-xl font-semibold mb-6 text-gray-800 flex items-center">
                        <Music className="w-5 h-5 mr-3 text-indigo-600"/>
                        3. 음악 처방 상세
                    </legend>

                    {/* (전문 작곡 파라미터) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <label htmlFor="targetBPM_input" className="block text-sm font-medium text-gray-700 mb-2">목표 BPM (40~160)</label>
                            <input type="number" id="targetBPM_input" name="targetBPM" value={formData.targetBPM === 'Neutral' ? '' : formData.targetBPM} onChange={handleChange} min="40" max="160" step="5" className="w-full p-3 border border-gray-300 rounded-lg" placeholder="숫자 입력 또는 Neutral 선택" disabled={formData.targetBPM === 'Neutral'}/>
                            <select id="targetBPM_select" name="targetBPM" value={formData.targetBPM} onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg mt-2 text-sm">
                                <option value="" disabled>--- BPM 값 직접 입력 시 ---</option>
                                <option value="Neutral">Neutral (AI가 결정)</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="musicDuration" className="block text-sm font-medium text-gray-700 mb-2">음악 길이 (초, 60~300)</label>
                            <input type="number" id="musicDuration" name="musicDuration" value={formData.musicDuration} onChange={handleChange} min="60" max="300" step="30" className="w-full p-3 border border-gray-300 rounded-lg" />
                        </div>
                        <div className="md:col-span-2">
                             <label className="block text-sm font-medium text-gray-700 mb-2">🎤 보컬(가사) 포함 여부</label>
                             <div className="flex items-center h-10">
                                <span className={`text-sm font-medium ${!vocalsAllowed ? 'text-indigo-600' : 'text-gray-500'}`}>연주곡만</span>
                                <label htmlFor="vocalsAllowed" className="relative inline-flex items-center cursor-pointer mx-4">
                                    <input type="checkbox" id="vocalsAllowed" name="vocalsAllowed" className="sr-only peer" checked={vocalsAllowed} onChange={(e) => setVocalsAllowed(e.target.checked)} />
                                    <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-indigo-300 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                </label>
                                <span className={`text-sm font-medium ${vocalsAllowed ? 'text-indigo-600' : 'text-gray-500'}`}>보컬 포함</span>
                             </div>
                        </div>
                    </div>
                    
                    {/* 💡 [수정] 상세 파라미터 (선율, 밀도 등) 다시 추가 */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        <div>
                            <label htmlFor="musicKeyPreference" className="block text-sm font-medium text-gray-700 mb-2">음계/조성</label>
                            <select id="musicKeyPreference" name="musicKeyPreference" value={formData.musicKeyPreference} onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg text-sm">
                                <option value="Neutral">Neutral (AI가 결정)</option>
                                <option value="Major">Major (밝음)</option>
                                <option value="Minor">Minor (차분함)</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="harmonicDissonance" className="block text-sm font-medium text-gray-700 mb-2">불협화음 수준</label>
                            <select id="harmonicDissonance" name="harmonicDissonance" value={formData.harmonicDissonance} onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg text-sm">
                                <option value="Neutral">Neutral (AI가 결정)</option>
                                <option value="None">없음</option>
                                <option value="Low">낮음</option>
                                <option value="Medium">중간</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="rhythmComplexity" className="block text-sm font-medium text-gray-700 mb-2">리듬 복잡도</label>
                            <select id="rhythmComplexity" name="rhythmComplexity" value={formData.rhythmComplexity} onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg text-sm">
                                <option value="Neutral">Neutral (AI가 결정)</option>
                                <option value="Simple">단순</option>
                                <option value="Medium">보통</option>
                                <option value="Complex">복잡</option>
                            </select>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        <div>
                            <label htmlFor="melodyContour" className="block text-sm font-medium text-gray-700 mb-2">선율 윤곽</label>
                            <select id="melodyContour" name="melodyContour" value={formData.melodyContour} onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg text-sm">
                                <option value="Neutral">Neutral (AI가 결정)</option>
                                <option value="Descending">하행 (이완)</option>
                                <option value="Ascending">상행 (활력)</option>
                                <option value="Wavy">파형</option>
                                <option value="Flat">평탄</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="textureDensity" className="block text-sm font-medium text-gray-700 mb-2">음악적 밀도</label>
                            <select id="textureDensity" name="textureDensity" value={formData.textureDensity} onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg text-sm">
                                <option value="Neutral">Neutral (AI가 결정)</option>
                                <option value="Sparse">성김 (단순)</option>
                                <option value="Medium">보통</option>
                                <option value="Dense">조밀 (복잡)</option>
                            </select>
                        </div>
                         <div>
                            <label htmlFor="mainInstrument" className="block text-sm font-medium text-gray-700 mb-2">주요 악기 지정</label>
                            <select id="mainInstrument" name="mainInstrument" value={formData.mainInstrument} onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg text-sm">
                                <option value="Piano">Piano</option>
                                <option value="Synthesizer">Synthesizer</option>
                                <option value="Acoustic Guitar">Acoustic Guitar</option>
                                <option value="Strings">Strings</option>
                            </select>
                        </div>
                    </div>
                    
                    {/* (음악 선호도) */}
                    <div className="mb-6">
                        <label className="block text-md font-medium text-gray-700 mb-3">✅ **선호** 음악 장르 (AI 참고용)</label>
                        <div className="flex flex-wrap gap-2">
                            {MUSIC_GENRE_OPTIONS.map((genre) => (
                                <button key={`pref-${genre}`} type="button" onClick={() => handleGenreToggle(genre, 'preferred')} className={getButtonClass(genre, 'preferred')}>{genre}</button>
                            ))}
                        </div>
                    </div>
                    <div className="mb-6">
                        <label className="block text-md font-medium text-gray-700 mb-3">❌ **비선호** 음악 장르 (AI 참고용)</label>
                        <div className="flex flex-wrap gap-2">
                            {MUSIC_GENRE_OPTIONS.map((genre) => (
                                <button key={`dislike-${genre}`} type="button" onClick={() => handleGenreToggle(genre, 'disliked')} className={getButtonClass(genre, 'disliked')}>{genre}</button>
                            ))}
                        </div>
                    </div>

                    {/* (지침 사항) */}
                     <div>
                        <label htmlFor="compositionalNotes" className="block text-sm font-medium text-gray-700 mb-2">AI 작곡 엔진 구체적 지침 (선택)</label>
                        <textarea id="compositionalNotes" name="compositionalNotes" value={formData.compositionalNotes} onChange={handleChange} rows={3} 
                            className="w-full p-3 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500" 
                            placeholder="예: 잔잔한 피아노 아르페지오 위주로, 타악기 배제" />
                    </div>
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
                    disabled={loading || (intakeMode === 'existing' && !selectedPatientId)}
                    className="w-full py-4 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition duration-200 disabled:opacity-70 disabled:cursor-not-allowed mt-6 text-lg flex items-center justify-center gap-2"
                >
                    {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                    {loading ? '음악 생성 중...' : '처방 제출 및 음악 생성'}
                    <Send className="w-5 h-5 ml-1" />
                </button>
            </form>
        </div>
    );
}