'use client';

import React, { useState, FormEvent, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
// 💡 1. [수정] 전문적인 UI를 위한 아이콘 추가
import { Loader2, Music, Info, Sparkles, SlidersHorizontal, FileText, AlertTriangle, } from 'lucide-react';

// 💡 3. [추가] UI 옵션과 백엔드 값을 매핑하는 상수
const MOOD_OPTIONS = [
    { label: '잔잔한', value: 'calming' },
    { label: '따뜻한', value: 'warm' },
    { label: '차분한', value: 'soothing' },
    { label: '기분 좋아지는', value: 'uplifting' },
    { label: '밝은', value: 'bright' },
    { label: '경쾌한', value: 'energetic' },
    { label: '집중 잘 되는', value: 'focusing' },
    { label: '몽환적인', value: 'dreamy' },
    { label: '희망찬', value: 'hopeful' },
];

const INSTRUMENT_OPTIONS = [
    { label: '피아노', value: 'Piano' },
    { label: '기타(통기타)', value: 'Acoustic Guitar' },
    { label: '바이올린', value: 'Violin' },
    { label: '오르골', value: 'Music Box' },
    { label: '플룻', value: 'Flute' },
    { label: '자연 소리', value: 'Nature Sounds' },
];

const EXCLUDE_SOUND_OPTIONS = [
    { label: '갑자기 큰 소리', value: 'without sudden dynamics' },
    { label: '쿵쿵 울리는 소리 (저음)', value: 'without heavy bass' },
    { label: '날카로운 고음', value: 'without sharp high frequencies' },
    { label: '금속 긁는 듯한 소리', value: 'without metallic sounds' },
    { label: '전자음/기계음', value: 'without electronic sounds' },
    { label: '빠르고 강한 비트', value: 'without fast or strong beats' },
];

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
export default function ComposePage() {
    // --- (기존 state 로직 - 변경 없음) ---
    const [mood, setMood] = useState('calming');
    const [instrument, setInstrument] = useState('Piano');
    const [tempo, setTempo] = useState('medium');
    const [vocalsAllowed, setVocalsAllowed] = useState(false);
    const [duration, setDuration] = useState(120);
    const [musicKey, setMusicKey] = useState('Neutral');
    const [excludedInstruments, setExcludedInstruments] = useState<string[]>([]);
    const [notes, setNotes] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadingStatus, setLoadingStatus] = useState('');
    const router = useRouter();

    // --- (기존 useEffect 로직 - 변경 없음) ---
    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            setError('음악 작곡을 하려면 로그인이 필요합니다.');
            // router.push('/login?next=/compose');
        }
    }, [router]);

    // --- (기존 핸들러 함수들 - 변경 없음) ---
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (name === 'instrument') setInstrument(value);
        else if (name === 'duration') setDuration(Number(value));
        else if (name === 'notes') setNotes(value);
        else if (type === 'checkbox') setVocalsAllowed((e.target as HTMLInputElement).checked);
    };
    const handleExcludeToggle = (instrument: string) => {
        setExcludedInstruments(prev =>
            prev.includes(instrument)
                ? prev.filter(item => item !== instrument)
                : [...prev, instrument]
        );
    };

    // --- (기존 handleSubmit 로직 - 변경 없음) ---
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setLoadingStatus('');
        setError(null);

        const token = localStorage.getItem('accessToken');
        if (!token) {
            setError('로그인이 필요합니다.');
            setLoading(false);
            return;
        }

        let finalPrompt = '';
        let newSessionId = 0;

        try {
            // --- 1단계: 새 세션 생성 (/patient/intake 사용) ---
            setLoadingStatus('새 세션 준비 중...');
            const intakePayload = {
                vas: null,
                prefs: null,
                goal: { text: "작곡 체험 세션" },
                dialog: []
            };
            const sessionResponse = await fetch(`${API_URL}/patient/intake`, { // ✅ API 경로 확인
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(intakePayload)
            });
            if (sessionResponse.status === 401) throw new Error('인증 실패(세션 생성)');
            if (!sessionResponse.ok) {
                const errData = await sessionResponse.json().catch(() => ({ detail: '세션 생성 실패 응답 파싱 불가' }));
                throw new Error(errData.detail || `세션 생성 실패 (${sessionResponse.status})`);
            }
            const sessionData = await sessionResponse.json();
            newSessionId = sessionData.session_id;

            // --- 2단계: 프롬프트 생성 (/therapist/manual-generate 사용) ---
            setLoadingStatus('AI 작곡 아이디어 구상 중...');
            let bpmRange = { min: 70, max: 90 };
            if (tempo === 'slow') bpmRange = { min: 50, max: 70 };
            if (tempo === 'fast') bpmRange = { min: 100, max: 120 };

            const manualPayload = {
                session_id: newSessionId, guideline_json: "{}",
                manual: {
                    mood, bpm_min: bpmRange.min, bpm_max: bpmRange.max, key_signature: musicKey,
                    vocals_allowed: vocalsAllowed,
                    include_instruments: [instrument], // 👈 state의 영어 값
                    exclude_instruments: excludedInstruments, // 👈 state의 영어 값
                    duration_sec: duration, notes
                }
            };
            const generateResponse = await fetch(`${API_URL}/therapist/manual-generate`, { // ✅ API 경로 확인
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(manualPayload)
            });
            if (generateResponse.status === 401) throw new Error('인증 실패(프롬프트)');
            if (!generateResponse.ok) {
                const errData = await generateResponse.json().catch(() => ({ detail: '프롬프트 생성 실패 응답 파싱 불가' }));
                throw new Error(errData.detail || `프롬프트 생성 실패 (${generateResponse.status})`);
            }
            const promptData = await generateResponse.json();
            if (typeof promptData.prompt_text !== 'string') {
                console.error("Unexpected prompt data format:", promptData);
                throw new Error("잘못된 프롬프트 데이터 형식");
            }
            finalPrompt = promptData.prompt_text; // (참고용)

            // --- 3단계: 음악 생성 (/music/compose 사용) ---
            setLoadingStatus('ElevenLabs에서 음악 생성 중...');
            const musicResponse = await fetch(`${API_URL}/music/compose`, { // ✅ API 경로 확인
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    session_id: newSessionId,
                    music_length_ms: duration * 1000,
                    force_instrumental: !vocalsAllowed,
                }),
            });
            if (musicResponse.status === 401) throw new Error('인증 실패(음악생성)');
            if (!musicResponse.ok) {
                const errorData = await musicResponse.json();
                throw new Error(errorData.detail || `음악 생성 실패 (${musicResponse.status})`);
            }
            const result = await musicResponse.json();
            if (!result.track_url) throw new Error("음악 생성 결과 URL 없음");

            // --- 4단계: '가짜 DB' 저장 로직 *삭제* ---

            // --- 5단계: 음악 목록 페이지로 이동 ---
            alert("음악 생성이 완료되었습니다! 플레이리스트에서 확인하세요.");
            router.push('/music');

        } catch (err) {
            console.error('Compose music failed:', err);
            const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류 발생';
            setError(errorMessage);
            if (errorMessage.includes('인증 실패')) {
                localStorage.removeItem('accessToken');
                router.push('/login?next=/compose');
            }
        } finally {
            setLoading(false);
            setLoadingStatus('');
        }
    };

    // 💡 2. [수정] 장르 버튼 스타일링 (병원/설문조사 스타일)
    const getButtonClass = (isActive: boolean) => {
        const baseClass = "px-4 py-2 rounded-lg transition duration-150 text-sm font-medium border-2"; // 👈 [수정] rounded-full -> rounded-lg, border-2
        return isActive
            ? `${baseClass} bg-indigo-600 border-indigo-600 text-white shadow-md`
            : `${baseClass} bg-white text-gray-700 border-gray-300 hover:bg-indigo-50 hover:border-indigo-400`;
    };

    // 💡 3. [핵심 수정] JSX (UI) 전체 변경
    return (
        <div className="max-w-3xl mx-auto p-6 md:p-10 bg-white shadow-lg border border-gray-200 rounded-xl my-10 relative">

            {/* 로딩 오버레이 */}
            {loading && (
                <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col justify-center items-center z-10 text-center px-4 rounded-lg">
                    <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
                    <p className="mt-4 text-lg font-semibold text-gray-700">{loadingStatus || '생성 중...'}</p>
                    <p className="text-sm text-gray-500">잠시만 기다려주세요 (최대 1분 소요)</p>
                </div>
            )}

            {/* 헤더 */}
            <div className="text-center mb-10">
                <Sparkles className="w-12 h-12 text-indigo-600 mx-auto mb-4" />
                <h1 className="text-3xl font-bold text-gray-900">AI 작곡 체험</h1>
                <p className="text-gray-600 mt-3">원하는 음악의 요소를 직접 선택하고 AI에게 작곡을 요청해보세요.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-10">

                {/* --- 섹션 1: 필수 요소 --- */}
                <fieldset className="p-6 border border-gray-200 rounded-lg shadow-sm">
                    <legend className="text-xl font-semibold mb-6 text-gray-800 flex items-center">
                        <Music className="w-5 h-5 mr-3 text-indigo-600" />
                        1. 필수 요소
                    </legend>

                    {/* 💡 [수정] 분위기 버튼 (MAPPING 사용) */}
                    <div className="mb-6">
                        <label className="block text-md font-medium text-gray-700 mb-3">분위기</label>
                        <div className="flex flex-wrap gap-2">
                            {MOOD_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setMood(option.value)} // 👈 영어(value)를 state에 저장
                                    className={getButtonClass(mood === option.value)}
                                >
                                    {option.label} {/* 👈 한글(label)을 표시 */}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 💡 [수정] 주요 악기 드롭다운 (MAPPING 사용) */}
                    <div className="mb-6">
                        <label htmlFor="instrument" className="block text-md font-medium text-gray-700 mb-2">주요 악기</label>
                        <select
                            id="instrument"
                            name="instrument"
                            value={instrument}
                            onChange={handleChange} // (handleChange는 value(영어)를 state에 저장)
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            {INSTRUMENT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label} {/* 👈 한글(label)을 표시 */}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-md font-medium text-gray-700 mb-3">빠르기 (템포)</label>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => setTempo('slow')} className={getButtonClass(tempo === 'slow')}>느리게</button>
                            <button type="button" onClick={() => setTempo('medium')} className={getButtonClass(tempo === 'medium')}>보통</button>
                            <button type="button" onClick={() => setTempo('fast')} className={getButtonClass(tempo === 'fast')}>빠르게</button>
                        </div>
                    </div>
                </fieldset>

                {/* --- 섹션 2: 상세 설정 (선택) --- */}
                <fieldset className="p-6 border border-gray-200 rounded-lg shadow-sm">
                    <legend className="text-xl font-semibold mb-6 text-gray-800 flex items-center">
                        <SlidersHorizontal className="w-5 h-5 mr-3 text-indigo-600" />
                        2. 상세 설정 (선택)
                    </legend>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                        <div>
                            <label htmlFor="duration" className="block text-md font-medium text-gray-700 mb-2">음악 길이: <span className="font-bold text-indigo-600">{duration}초</span></label>
                            <input type="range" id="duration" name="duration" value={duration} onChange={handleChange} min="30" max="180" step="30"
                                className="w-full h-2 bg-gray-200 rounded-lg cursor-pointer accent-indigo-600" />
                            <div className="flex justify-between text-xs text-gray-500 mt-1"><span>30초</span><span>3분 (180초)</span></div>
                        </div>
                        <div>
                            <label className="block text-md font-medium text-gray-700 mb-2">보컬 (가사) 여부</label>
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

                    <div className="mb-6">
                        <label htmlFor="musicKey" className="block text-md font-medium text-gray-700 mb-2">음악의 느낌 (조성)</label>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => setMusicKey('Major')} className={getButtonClass(musicKey === 'Major')}>밝게 (Major)</button>
                            <button type="button" onClick={() => setMusicKey('Minor')} className={getButtonClass(musicKey === 'Minor')}>차분하게 (Minor)</button>
                            <button type="button" onClick={() => setMusicKey('Neutral')} className={getButtonClass(musicKey === 'Neutral')}>AI가 결정</button>
                        </div>
                    </div>

                    {/* 💡 [수정] 제외할 소리 (MAPPING 사용) */}
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-2">이런 소리는 빼주세요 (예민한 소리):</label>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            {EXCLUDE_SOUND_OPTIONS.map((option) => (
                                <label key={option.value} className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={excludedInstruments.includes(option.value)}
                                        onChange={() => handleExcludeToggle(option.value)} // 👈 영어(value)를 state에 저장
                                    />
                                    <span className="text-sm text-gray-700">{option.label}</span> {/* 👈 한글(label)을 표시 */}
                                </label>
                            ))}
                        </div>
                    </div>
                </fieldset>

                {/* --- 섹션 3: 추가 요청사항 --- */}
                <fieldset className="p-6 border border-gray-200 rounded-lg shadow-sm">
                    <legend className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
                        <FileText className="w-5 h-5 mr-3 text-indigo-600" />
                        3. AI에게 직접 요청하기 (선택)
                    </legend>
                    <textarea id="notes" name="notes" value={notes} onChange={handleChange} rows={3}
                        className="w-full p-3 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="예: 조용하게 시작해서 점점 고조되는 느낌으로 만들어줘 / 빗소리를 약하게 넣어줘" />
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
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                    {loading ? '음악 생성 중...' : '나만의 음악 생성하기 →'}
                </button>
            </form>
        </div>
    );
}