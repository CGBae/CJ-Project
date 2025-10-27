'use client'; 

import React, { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    CounselorIntakeData,
    initialCounselorIntakeData,
    MUSIC_GENRE_OPTIONS
} from '@/types/intake';
// 'getPatients'와 'Patient' 타입을 import 합니다.
import { getPatients, addPatient, linkSessionToPatient, addMusicToPatient, Patient } from '@/lib/utils/patients';
import { MusicTrack } from '@/lib/utils/music';
import { Info, Loader2 } from 'lucide-react';

export default function CounselorIntakePage() {
    const [formData, setFormData] = useState<CounselorIntakeData>(initialCounselorIntakeData);
    
    // 폼 모드 (기존/신규) 및 환자 정보 상태
    const [intakeMode, setIntakeMode] = useState<'existing' | 'new'>('existing');
    
    // '기존' 환자 선택용
    const [allPatients, setAllPatients] = useState<Patient[]>([]);
    const [selectedPatientId, setSelectedPatientId] = useState<string>('');

    // '신규' 환자 입력용
    const [newPatientId, setNewPatientId] = useState('');
    const [newPatientName, setNewPatientName] = useState('');
    const [newPatientAge, setNewPatientAge] = useState<number | ''>('');
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const [vocalsAllowed, setVocalsAllowed] = useState(false);
    
    // 페이지 로드 시 '가짜 DB'에서 환자 목록을 불러옵니다.
    useEffect(() => {
        const patients = getPatients();
        setAllPatients(patients);
        // 목록의 첫 번째 환자를 기본값으로 선택
        if (patients.length > 0) {
            setSelectedPatientId(patients[0].id);
        }
    }, []);

    // Input/Select/Range/Checkbox 처리 핸들러
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

    // 장르 선택/해제 (버튼 토글) 핸들러
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

    // 폼 제출 로직 (두 가지 모드 분기 처리)
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        let patientIdToUse: string;
        let patientNameForTrack: string;

        // --- 환자 ID 결정 ---
        if (intakeMode === 'existing') {
            // "기존 환자" 모드
            if (!selectedPatientId) {
                setError('음악을 처방할 기존 환자를 선택해주세요.');
                setLoading(false);
                return;
            }
            patientIdToUse = selectedPatientId;
            const patient = allPatients.find(p => p.id === selectedPatientId);
            patientNameForTrack = patient ? patient.name : '환자';
        } else {
            // "신규 환자" 모드
            if (!newPatientId.trim() || !newPatientName.trim() || newPatientAge === '') {
                 setError('새 환자의 ID, 이름, 나이를 모두 입력해주세요.');
                 setLoading(false);
                 return;
            }
            // '가짜 DB'에 새 환자 추가 시도
            const result = addPatient(newPatientId.trim(), newPatientName, Number(newPatientAge));
            
            if (!result.success) { // ID 중복 등 에러 처리
                setError(result.error || '환자 생성 실패');
                setLoading(false);
                return;
            }
            patientIdToUse = result.patient!.id;
            patientNameForTrack = result.patient!.name;
        }
        // ------------------

        // 장르 겹침 유효성 검사
        const intersection = formData.preferredMusicGenres.filter(genre => formData.dislikedMusicGenres.includes(genre));
        if (intersection.length > 0) {
            setError(`선호/비선호 장르에 동시에 선택된 항목(${intersection.join(', ')})이 있습니다.`);
            setLoading(false);
            return;
        }

        let finalPrompt = ''; 
        let newSessionId = 0;

        try {
            console.log(`환자(${patientIdToUse})의 새 세션 및 음악 생성을 시작합니다...`);
            
            // 1단계: 새 상담 세션 생성
            const sessionResponse = await fetch('http://localhost:8000/therapist/new', { method: 'POST' });
            if (!sessionResponse.ok) throw new Error('세션 생성에 실패했습니다.');
            const sessionData = await sessionResponse.json();
            newSessionId = sessionData.session_id;
            
            // 2단계: 생성된 환자와 세션 ID를 연결
            linkSessionToPatient(patientIdToUse, newSessionId);

            // 3단계: 프롬프트 생성
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
                    exclude_instruments: null, // 필요시 이 부분도 폼에 추가
                    duration_sec: formData.musicDuration,
                    notes: formData.compositionalNotes,
                }
            };
            const generateResponse = await fetch('http://localhost:8000/therapist/manual-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(manualPayload)
            });
            if (!generateResponse.ok) throw new Error('음악 프롬프트 생성에 실패했습니다.');
            const promptData = await generateResponse.json();
            finalPrompt = promptData.prompt_text;

            // 4단계: 음악 생성
            const musicResponse = await fetch('http://localhost:8000/music/compose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: newSessionId,
                    music_length_ms: formData.musicDuration * 1000,
                    force_instrumental: !vocalsAllowed,
                }),
            });
            if (!musicResponse.ok) {
                 const errorData = await musicResponse.json();
                 throw new Error(errorData.detail || 'ElevenLabs 음악 생성 API 호출에 실패했습니다.');
            }
            const result = await musicResponse.json();
            if (!result.track_url) throw new Error("음악 생성 결과가 올바르지 않습니다.");

            // 5단계: 트랙 정보 저장
            const newTrack: MusicTrack = {
                id: `track_init_${patientIdToUse}_${Date.now()}`,
                title: `${patientNameForTrack}님을 위한 처방 음악`,
                artist: 'AI Composer',
                prompt: finalPrompt,
                audioUrl: `http://localhost:8000${result.track_url}`
            };
            addMusicToPatient(patientIdToUse, newTrack);

            // 6단계: 환자 상세 페이지로 바로 이동
            router.push(`/counselor/${patientIdToUse}`);

        } catch (err) {
            console.error('Intake music generation failed:', err);
            setError(err instanceof Error ? err.message : '알 수 없는 오류 발생');
            setLoading(false);
        }
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
            <h1 className="text-3xl font-extrabold text-gray-800 mb-4 text-center">음악 처방 전문 입력</h1>
            <p className="text-center text-gray-500 mb-8">기존 환자를 선택하거나, 새 환자를 등록하여 AI 작곡을 위한 파라미터를 설정합니다.</p>
            <form onSubmit={handleSubmit} className="space-y-8">
                
                {/* 환자 선택/등록 UI */}
                <section className="p-6 border rounded-lg shadow-sm bg-gray-50">
                    <h2 className="text-xl font-bold mb-4 text-indigo-700 border-b pb-2">환자 선택</h2>
                    
                    {/* 모드 선택 라디오 버튼 */}
                    <div className="flex gap-6 mb-4">
                        <label className="flex items-center">
                            <input
                                type="radio"
                                name="intakeMode"
                                value="existing"
                                checked={intakeMode === 'existing'}
                                onChange={() => setIntakeMode('existing')}
                                className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                            />
                            <span className="ml-2 text-md font-medium text-gray-700">기존 환자 선택</span>
                        </label>
                        <label className="flex items-center">
                            <input
                                type="radio"
                                name="intakeMode"
                                value="new"
                                checked={intakeMode === 'new'}
                                onChange={() => setIntakeMode('new')}
                                className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                            />
                            <span className="ml-2 text-md font-medium text-gray-700">신규 환자 등록</span>
                        </label>
                    </div>

                    {/* "기존 환자" 선택 시 UI */}
                    {intakeMode === 'existing' && (
                        <div>
                            <label htmlFor="patientSelect" className="block text-md font-medium text-gray-700 mb-1">대상 환자</label>
                            <select
                                id="patientSelect"
                                value={selectedPatientId}
                                onChange={(e) => setSelectedPatientId(e.target.value)}
                                className="w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                required={intakeMode === 'existing'}
                            >
                                <option value="" disabled>-- 환자를 선택하세요 --</option>
                                {allPatients.map(patient => (
                                    <option key={patient.id} value={patient.id}>
                                        {patient.name} (ID: {patient.id})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* "신규 환자" 선택 시 UI */}
                    {intakeMode === 'new' && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600">새로운 환자의 정보를 입력하세요. 이 정보로 새 환자 레코드가 생성됩니다.</p>
                             <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <label htmlFor="newPatientId" className="block text-md font-medium text-gray-700 mb-1">환자 ID (필수)</label>
                                    <input
                                        type="text" id="newPatientId" value={newPatientId} onChange={(e) => setNewPatientId(e.target.value)}
                                        className="w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500" placeholder="예: patient123" required={intakeMode === 'new'}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="newPatientName" className="block text-md font-medium text-gray-700 mb-1">환자 이름</label>
                                    <input
                                        type="text" id="newPatientName" value={newPatientName} onChange={(e) => setNewPatientName(e.target.value)}
                                        className="w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500" placeholder="홍길동" required={intakeMode === 'new'}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="newPatientAge" className="block text-md font-medium text-gray-700 mb-1">나이</label>
                                    <input
                                        type="number" id="newPatientAge" value={newPatientAge} onChange={(e) => setNewPatientAge(e.target.value === '' ? '' : Number(e.target.value))}
                                        className="w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500" placeholder="30" min="0" required={intakeMode === 'new'}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                {/* 섹션 1: 환자 주관적 상태 (VAS, 0-10점 척도) */}
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

                {/* 섹션 2: 전문 작곡 파라미터 (심화 요소) */}
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

                {/* 섹션 3: 음악 선호도 (버튼 선택형) */}
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
                    disabled={loading}
                    className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition duration-200 disabled:opacity-70 disabled:cursor-not-allowed mt-6 text-lg flex items-center justify-center gap-2"
                >
                    {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                    {loading ? '음악 생성 중...' : '처방 제출 및 음악 생성 →'}
                </button>
            </form>
        </div>
    );
}