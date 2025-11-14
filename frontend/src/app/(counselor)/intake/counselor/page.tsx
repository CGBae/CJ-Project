'use client'; 

import React, { useState, FormEvent, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    CounselorIntakeData,
    initialCounselorIntakeData,
    MUSIC_GENRE_OPTIONS
} from '@/types/intake'; 
import { Info, Loader2, Link, User, ChevronRight, Plus, MessageSquare } from 'lucide-react';

// 1. 실제 환자 타입 정의
interface Patient {
  id: string | number;
  name: string | null;
  email?: string | null;
  // (가짜 DB의 age, lastSession 등은 User 모델에 없으므로 제거)
}

// 2. MusicTrack 타입 정의 (필요시)
interface MusicTrack {
  id: string | number;
  title: string;
  artist: string;
  prompt: string;
  audioUrl: string;
}

// 3. ConnectionRequest 컴포넌트 (기능이 /option으로 이동됨)
const ConnectionRequest: React.FC = () => {
     return (
        <div className="text-sm text-gray-500 p-4 bg-indigo-50 rounded-md border border-indigo-200">
            <Info className="w-4 h-4 inline mr-1 text-indigo-600" />
            새로운 환자를 연결하려면 <Link href="/option" className="font-medium text-indigo-600 hover:underline">설정</Link> 페이지의 일반 설정 탭을 이용해 주세요.
        </div>
     );
};

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
    const [formData, setFormData] = useState<CounselorIntakeData>(initialCounselorIntakeData);
    
    // [수정] 'request_connection' 모드를 제거 (기능 이전)
    const [intakeMode, setIntakeMode] = useState<'existing'>('existing'); 
    
    const [allPatients, setAllPatients] = useState<Patient[]>([]);
    const [selectedPatientId, setSelectedPatientId] = useState<string>('');
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPatientListLoading, setIsPatientListLoading] = useState(true); 
    const [patientListError, setPatientListError] = useState<string | null>(null);
    const router = useRouter();
    const [vocalsAllowed, setVocalsAllowed] = useState(false);

    // 4. loadPatients 함수 (useCallback 및 API 호출)
    const loadPatients = useCallback(async () => {
        setIsPatientListLoading(true);
        setPatientListError(null);

        try {
            const token = localStorage.getItem('accessToken');
            if (!token) {
                throw new Error('로그인 정보(토큰)를 찾을 수 없습니다.');
            }
            
            // therapist.py의 /my-patients API 호출
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
                setSelectedPatientId(String(patients[0].id) || ''); // ID를 string으로 변환
            }

        } catch (err: unknown) { 
            console.error(err);
            setPatientListError(err instanceof Error ? err.message : '알 수 없는 오류');
        } finally {
            setIsPatientListLoading(false);
        }
    }, [selectedPatientId]); // 의존성 배열 수정
    
    useEffect(() => {
        loadPatients();
    }, [loadPatients]);

    // --- (handleChange, handleGenreToggle 핸들러 - 변경 없음) ---
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

    // 💡 5. [핵심 수정] 폼 제출 핸들러
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // 💡 6. 토큰 가져오기
        const token = localStorage.getItem('accessToken');
        if (!token) {
            setError('인증 토큰이 없습니다. 다시 로그인해주세요.');
            setLoading(false);
            return;
        }

        let patientIdToUse: string = '';
        let patientNameForTrack: string = '환자';

        // --- 환자 ID 결정 (intakeMode 검사 제거) ---
        if (!selectedPatientId) {
            setError('음악을 처방할 기존 환자를 선택해주세요.');
            setLoading(false);
            return;
        }
        patientIdToUse = selectedPatientId;
        const patient = allPatients.find(p => String(p.id) === selectedPatientId);
        patientNameForTrack = patient ? (patient.name || '환자') : '환자';
        // ------------------

        // ... (장르 겹침 유효성 검사) ...
        const intersection = formData.preferredMusicGenres.filter(genre => formData.dislikedMusicGenres.includes(genre));
        if (intersection.length > 0) {
            setError(`선호/비선호 장르에 겹치는 항목(${intersection.join(', ')})이 있습니다.`);
            setLoading(false);
            return;
        }

        let finalPrompt = ''; 
        let newSessionId = 0;

        try {
            console.log(`환자(${patientIdToUse})의 새 세션 및 음악 생성을 시작합니다...`);
            
            // 💡 7. [수정] 1단계: 새 상담 세션 생성 (patient_id 전송 및 헤더 추가)
            const sessionResponse = await fetch(`${API_URL}/therapist/new`, { 
                method: 'POST', // 👈 [추가]
                headers: { 
                    'Authorization': `Bearer ${token}`, // 👈 [추가]
                    'Content-Type': 'application/json' // 👈 [추가]
                },
                body: JSON.stringify({ patient_id: Number(patientIdToUse) }) // 👈 [추가] 환자 ID 전송
            });
            if (sessionResponse.status === 401) throw new Error('인증 실패(세션 생성)');
            if (sessionResponse.status === 403) throw new Error('이 환자에게 처방할 권한이 없습니다.');
            if (!sessionResponse.ok) throw new Error(`세션 생성 실패 (${sessionResponse.status})`);
            const sessionData = await sessionResponse.json();
            newSessionId = sessionData.session_id;
            
            // 💡 8. [수정] '가짜 DB' (linkSessionToPatient) 제거
            // linkSessionToPatient(patientIdToUse, newSessionId);

            // 💡 9. [수정] 3단계: 프롬프트 생성 (Authorization 헤더 추가)
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
                }
            };
            const generateResponse = await fetch(`${API_URL}/therapist/manual-generate`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` // 👈 헤더 추가
                },
                body: JSON.stringify(manualPayload)
            });
            if (generateResponse.status === 401) throw new Error('인증 실패(프롬프트 생성)');
            if (generateResponse.status === 403) throw new Error('이 세션에 접근할 권한이 없습니다.');
            if (!generateResponse.ok) throw new Error('음악 프롬프트 생성에 실패했습니다.');
            const promptData = await generateResponse.json();
            finalPrompt = promptData.prompt_text;

            // 💡 10. [수정] 4단계: 음악 생성 (Authorization 헤더 추가)
            const musicResponse = await fetch(`${API_URL}/music/compose`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` // 👈 헤더 추가
                },
                body: JSON.stringify({
                    session_id: newSessionId,
                    music_length_ms: formData.musicDuration * 1000,
                    force_instrumental: !vocalsAllowed,
                }),
            });
            if (musicResponse.status === 401) throw new Error('인증 실패(음악 생성)');
            if (musicResponse.status === 403) throw new Error('이 세션에 접근할 권한이 없습니다.'); // 👈 music.py에도 세션 권한 확인 필요
            if (!musicResponse.ok) {
                 const errorData = await musicResponse.json();
                 throw new Error(errorData.detail || 'ElevenLabs 음악 생성 API 호출에 실패했습니다.');
            }
            const result = await musicResponse.json();
            if (!result.track_url) throw new Error("음악 생성 결과가 올바르지 않습니다.");

            // 💡 11. [수정] '가짜 DB' (addMusicToPatient) 제거
            
            // 6단계: 환자 상세 페이지로 바로 이동
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
    
    // --- (헬퍼 함수들 - 변경 없음) ---
    const getAnxietyLabel = (value: number) => value <= 2 ? "전혀 안심" : value <= 4 ? "약간 안심" : value <= 6 ? "보통" : value <= 8 ? "불안함" : "극심한 불안";
    const getMoodLabel = (value: number) => value <= 2 ? "매우 긍정적/행복함" : value <= 4 ? "쾌활함" : value <= 6 ? "보통" : value <= 8 ? "다소 우울함" : "매우 부정적/우울함";
    const getPainLabel = (value: number) => value === 0 ? "통증 없음" : value <= 4 ? "약한 통증" : value <= 7 ? "중간 통증" : "심한 통증";
    const getButtonClass = (genre: string, type: 'preferred' | 'disliked') => {
        const isSelected = formData[type === 'preferred' ? 'preferredMusicGenres' : 'dislikedMusicGenres'].includes(genre);
        const baseClass = "px-4 py-2 rounded-full transition duration-150 text-sm font-medium border";
        return isSelected 
            ? `${baseClass} ${type === 'preferred' ? 'bg-yellow-500 border-yellow-500 text-white shadow-md hover:bg-yellow-600' : 'bg-gray-700 border-gray-700 text-white shadow-md hover:bg-gray-800'}`
            : `${baseClass} bg-white text-gray-700 border-gray-300 ${type === 'preferred' ? 'hover:bg-yellow-50 hover:border-yellow-300' : 'hover:bg-gray-100 hover:border-gray-400'}`;
    };
    
    return (
        <div className="intake-container p-6 md:p-8 max-w-5xl mx-auto bg-white shadow-xl rounded-lg my-10">
            <h1 className="text-3xl font-extrabold text-gray-800 mb-4 text-center">음악 처방 전문 입력</h1>
            <p className="text-center text-gray-500 mb-8">기존 환자를 선택하여 AI 작곡을 위한 파라미터를 설정합니다.</p>
            <form onSubmit={handleSubmit} className="space-y-8">
                
                {/* 환자 선택/등록 UI */}
                <section className="p-6 border rounded-lg shadow-sm bg-gray-50">
                    <h2 className="text-xl font-bold mb-4 text-indigo-700 border-b pb-2">환자 선택</h2>
                    
                    {/* "기존 환자" 선택 UI */}
                    <div>
                        <label htmlFor="patientSelect" className="block text-md font-medium text-gray-700 mb-1">대상 환자</label>
                        <select
                            id="patientSelect"
                            value={selectedPatientId}
                            onChange={(e) => setSelectedPatientId(e.target.value)}
                            className="w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
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
                        <p className="text-sm text-gray-500 mt-2">선택된 환자에게 아래의 음악 처방이 제출됩니다. (연결 요청을 수락한 환자만 표시됩니다)</p>
                    </div>

                    {/* '설정' 페이지로 안내 */}
                    <div className="mt-4 text-sm text-gray-500 p-3 bg-indigo-50 rounded-md border border-indigo-200">
                        <Info className="w-4 h-4 inline mr-1 text-indigo-600" />
                        새로운 환자를 연결하려면 <Link href="/option" className="font-medium text-indigo-600 hover:underline">설정</Link> 페이지의 일반 설정 탭을 이용해 주세요.
                    </div>
                </section>

                {/* 폼 섹션 (VAS, 작곡 파라미터, 선호도) */}
                <>
                    {/* 섹션 1: 환자 주관적 상태 (VAS) */}
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

                    {/* 섹션 2: 전문 작곡 파라미터 */}
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
                                <label htmlFor="musicDuration" className="block text-sm font-medium text-gray-700 mb-1">음악 길이 (초, 60~300)</label>
                                <input type="number" id="musicDuration" name="musicDuration" value={formData.musicDuration} onChange={handleChange} min="60" max="300" step="30" className="w-full p-2 border rounded-md" />
                            </div>
                        </div>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">🎤 보컬(가사) 포함 여부</label>
                            <div className="flex items-center">
                                <span className={`text-sm font-medium ${!vocalsAllowed ? 'text-indigo-600' : 'text-gray-500'}`}>연주곡만</span>
                                <label htmlFor="vocalsAllowed" className="relative inline-flex items-center cursor-pointer mx-4">
                                    <input
                                        type="checkbox"
                                        id="vocalsAllowed"
                                        name="vocalsAllowed"
                                        className="sr-only peer"
                                        checked={vocalsAllowed}
                                        onChange={(e) => setVocalsAllowed(e.target.checked)}
                                    />
                                    <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-indigo-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                </label>
                                <span className={`text-sm font-medium ${vocalsAllowed ? 'text-indigo-600' : 'text-gray-500'}`}>보컬 포함</span>
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

                    {/* 섹션 3: 음악 선호도 */}
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
                    
                    {error && (
                        <div className="flex items-center justify-center p-3 bg-red-100 text-red-700 rounded-md text-sm">
                            <Info className="w-5 h-5 mr-2 flex-shrink-0" />
                            <p className="font-medium">{error}</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || (intakeMode === 'existing' && !selectedPatientId)}
                        className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition duration-200 disabled:opacity-70 disabled:cursor-not-allowed mt-6 text-lg flex items-center justify-center gap-2"
                    >
                        {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                        {loading ? '음악 생성 중...' : '처방 제출 및 음악 생성 →'}
                    </button>
                </>
            </form>
        </div>
    );
}