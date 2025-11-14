'use client';

import React, { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Music, Info, Sparkles } from 'lucide-react';

// MusicTrack 타입 정의 (변경 없음)
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

export default function ComposePage() {
    // --- 상태 관리 (변경 없음) ---
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

    // 페이지 로드 시 로그인 확인 (변경 없음)
    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            setError('음악 작곡을 하려면 로그인이 필요합니다.');
            // router.push('/login?next=/compose');
        }
    }, [router]);

    // --- 핸들러 함수들 (변경 없음) ---
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

    /**
     * 폼 제출 시, 백엔드 API를 호출하여 음악을 생성합니다.
     */
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setLoadingStatus('');
        setError(null);

        // [수정] localStorage에서 토큰 가져오기
        const token = localStorage.getItem('accessToken');
        if (!token) {
            setError('로그인이 필요합니다.');
            setLoading(false);
            return;
        }

        let finalPrompt = '';
        let newSessionId = 0;

        try {
            // --- 💡 1단계: 새 세션 생성 (/patient/intake 사용) ---
            setLoadingStatus('새 세션 준비 중...');
            const intakePayload = {
                // 💡 vas, prefs는 null 또는 빈 객체로 보냅니다 (백엔드 스키마 확인 필요).
                vas: null,
                prefs: null,
                goal: { text: "작곡 체험 세션" },
                dialog: []
            };
            const sessionResponse = await fetch(`${API_URL}/patient/intake`, { // ✅ API 경로 확인
                 method: 'POST',
                 headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}` // ✅ 인증 헤더 추가
                 },
                 body: JSON.stringify(intakePayload)
            });
            if (sessionResponse.status === 401) throw new Error('인증 실패(세션 생성)');
            if (!sessionResponse.ok) { // 422 오류 등 처리
                 const errData = await sessionResponse.json().catch(()=>({ detail: '세션 생성 실패 응답 파싱 불가' }));
                 throw new Error(errData.detail || `세션 생성 실패 (${sessionResponse.status})`);
            }
            const sessionData = await sessionResponse.json();
            newSessionId = sessionData.session_id;

            // --- 2단계: 프롬프트 생성 (/therapist/manual-generate 사용 유지) ---
            // 🚨 [주의] 이 API가 인증을 요구하는지, session 소유권을 확인하는지 백엔드 확인 권장!
            setLoadingStatus('AI 작곡 아이디어 구상 중...');
            let bpmRange = { min: 70, max: 90 };
            if (tempo === 'slow') bpmRange = { min: 50, max: 70 };
            if (tempo === 'fast') bpmRange = { min: 100, max: 120 };

            const manualPayload = {
                 session_id: newSessionId, guideline_json: "{}",
                 manual: { mood, bpm_min: bpmRange.min, bpm_max: bpmRange.max, key_signature: musicKey,
                           vocals_allowed: vocalsAllowed, include_instruments: [instrument],
                           exclude_instruments: excludedInstruments, duration_sec: duration, notes }
            };
            const generateResponse = await fetch(`${API_URL}/therapist/manual-generate`, { // ✅ API 경로 확인
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, // ✅ 인증 헤더 추가
                body: JSON.stringify(manualPayload)
            });
            if (generateResponse.status === 401) throw new Error('인증 실패(프롬프트)');
            if (!generateResponse.ok) {
                const errData = await generateResponse.json().catch(() => ({ detail: '프롬프트 생성 실패 응답 파싱 불가' }));
                throw new Error(errData.detail || `프롬프트 생성 실패 (${generateResponse.status})`);
            }
            const promptData = await generateResponse.json();
            // 백엔드 응답이 { prompt_text: "..." } 형태인지 확인
            if (typeof promptData.prompt_text !== 'string') {
                 console.error("Unexpected prompt data format:", promptData);
                 throw new Error("잘못된 프롬프트 데이터 형식");
            }
            finalPrompt = promptData.prompt_text;

            // --- 3단계: 음악 생성 (/music/compose 사용 유지) ---
            // 🚨 [주의] 이 API가 인증 및 세션 소유권 확인을 하는지 백엔드 확인 권장!
            setLoadingStatus('ElevenLabs에서 음악 생성 중...');
            const musicResponse = await fetch(`${API_URL}/music/compose`, { // ✅ API 경로 확인
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, // ✅ 인증 헤더 추가
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

            // --- 💡 4단계: '가짜 DB' 저장 로직 *삭제* ---
            // const newTrack: MusicTrack = { ... };
            // addTrackToPlaylist(newTrack);
            // addMusicToPatient(...);

            // --- 5단계: 음악 목록 페이지로 이동 ---
            alert("음악 생성이 완료되었습니다! 플레이리스트에서 확인하세요.");
            router.push('/music'); // ✅ /music 페이지로 이동

        } catch (err) {
            console.error('Compose music failed:', err);
            const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류 발생';
            setError(errorMessage);
            // 인증 실패 시 localStorage 비우고 로그인 페이지로 이동
            if (errorMessage.includes('인증 실패')) {
                 localStorage.removeItem('accessToken');
                 router.push('/login?next=/compose');
            }
        } finally {
            setLoading(false);
            setLoadingStatus('');
        }
    };

    // --- 헬퍼 함수 및 JSX (변경 없음) ---
    const getButtonClass = (isActive: boolean) => {
        const baseClass = "px-4 py-2 rounded-full transition duration-150 text-sm font-medium border";
        return isActive
            ? `${baseClass} bg-indigo-600 border-indigo-600 text-white shadow-md`
            : `${baseClass} bg-white text-gray-700 border-gray-300 hover:bg-indigo-50 hover:border-indigo-300`;
    };

    return (
        <div className="compose-container p-6 md:p-8 max-w-2xl mx-auto bg-white shadow-xl rounded-lg my-10 relative">
            {/* 로딩 오버레이 */}
            {loading && (
                <div className="absolute inset-0 bg-white bg-opacity-80 flex flex-col justify-center items-center z-10 text-center px-4 rounded-lg">
                    <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
                    <p className="mt-4 text-lg font-semibold text-gray-700">{loadingStatus || '생성 중...'}</p>
                    <p className="text-sm text-gray-500">잠시만 기다려주세요.</p>
                </div>
            )}

            <h1 className="text-3xl font-extrabold text-gray-800 mb-4 text-center">나만의 AI 음악 만들기 🎶</h1>
            <p className="text-center text-gray-500 mb-8">원하는 음악의 요소를 선택하고 AI에게 작곡을 요청해보세요.</p>

            <form onSubmit={handleSubmit} className="space-y-8">
                {/* 분위기 */}
                <section>
                    <label className="block text-lg font-semibold text-gray-700 mb-3">1. 분위기</label>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setMood('calming')} className={getButtonClass(mood === 'calming')}>😌 차분하게</button>
                        <button type="button" onClick={() => setMood('uplifting')} className={getButtonClass(mood === 'uplifting')}>😄 긍정적이게</button>
                        <button type="button" onClick={() => setMood('energetic')} className={getButtonClass(mood === 'energetic')}>⚡️ 활기차게</button>
                        <button type="button" onClick={() => setMood('reflective')} className={getButtonClass(mood === 'reflective')}>🤔 사색적이게</button>
                    </div>
                </section>
                {/* 악기 */}
                <section>
                     <label htmlFor="instrument" className="block text-lg font-semibold text-gray-700 mb-2">2. 주요 악기</label>
                     <select id="instrument" name="instrument" value={instrument} onChange={handleChange} className="w-full p-2 border rounded-md">
                         <option value="Piano">피아노</option> <option value="Acoustic Guitar">어쿠스틱 기타</option> <option value="Strings">현악기</option> <option value="Synthesizer">신디사이저</option>
                     </select>
                     <div className="mt-4">
                         <label className="block text-sm font-medium text-gray-600 mb-2">이 악기 소리는 빼주세요 (선택):</label>
                         <div className="flex flex-wrap gap-x-4 gap-y-2">
                             {['Drums', 'Bass', 'Synth Pad', 'Electric Guitar'].map((inst) => (
                                 <label key={inst} className="flex items-center space-x-2">
                                     <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={excludedInstruments.includes(inst)} onChange={() => handleExcludeToggle(inst)} />
                                     <span className="text-sm text-gray-700">{inst}</span>
                                 </label>
                             ))}
                         </div>
                     </div>
                </section>
                 {/* 빠르기 */}
                <section>
                    <label className="block text-lg font-semibold text-gray-700 mb-3">3. 빠르기 (템포)</label>
                     <div className="flex flex-wrap gap-2">
                         <button type="button" onClick={() => setTempo('slow')} className={getButtonClass(tempo === 'slow')}>🐢 느리게</button>
                         <button type="button" onClick={() => setTempo('medium')} className={getButtonClass(tempo === 'medium')}>🏃‍♂️ 보통</button>
                         <button type="button" onClick={() => setTempo('fast')} className={getButtonClass(tempo === 'fast')}>🚀 빠르게</button>
                     </div>
                </section>
                {/* 조성 */}
                <section>
                    <label className="block text-lg font-semibold text-gray-700 mb-3">4. 음악의 느낌 (조성)</label>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setMusicKey('Major')} className={getButtonClass(musicKey === 'Major')}>☀️ 밝게 (Major)</button>
                        <button type="button" onClick={() => setMusicKey('Minor')} className={getButtonClass(musicKey === 'Minor')}>🌙 차분하게 (Minor)</button>
                        <button type="button" onClick={() => setMusicKey('Neutral')} className={getButtonClass(musicKey === 'Neutral')}>🤖 AI가 결정</button>
                    </div>
                </section>
                {/* 보컬 */}
                <section>
                    <label className="block text-lg font-semibold text-gray-700 mb-2">5. 보컬 (가사) 여부</label>
                     <div className="flex items-center">
                         <span className={`text-sm font-medium ${!vocalsAllowed ? 'text-indigo-600' : 'text-gray-500'}`}>연주곡만</span>
                         <label htmlFor="vocalsAllowed" className="relative inline-flex items-center cursor-pointer mx-4">
                             <input type="checkbox" id="vocalsAllowed" name="vocalsAllowed" className="sr-only peer" checked={vocalsAllowed} onChange={(e) => setVocalsAllowed(e.target.checked)} />
                             <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                         </label>
                         <span className={`text-sm font-medium ${vocalsAllowed ? 'text-indigo-600' : 'text-gray-500'}`}>보컬 포함</span>
                     </div>
                </section>
                {/* 길이 */}
                <section>
                    <label htmlFor="duration" className="block text-lg font-semibold text-gray-700 mb-2">6. 음악 길이: <span className="font-bold text-indigo-600">{duration}초</span></label>
                    <input type="range" id="duration" name="duration" value={duration} onChange={handleChange} min="30" max="180" step="30" className="w-full h-2 bg-gray-200 rounded-lg cursor-pointer accent-indigo-600" />
                    <div className="flex justify-between text-xs text-gray-500 mt-1"><span>30초</span><span>3분 (180초)</span></div>
                </section>
                {/* 요청사항 */}
                <section>
                    <label htmlFor="notes" className="block text-lg font-semibold text-gray-700 mb-2">7. AI에게 직접 요청하기 (선택)</label>
                    <textarea id="notes" name="notes" value={notes} onChange={handleChange} rows={3} className="w-full p-2 border rounded-md text-sm" placeholder="예: 조용하게 시작해서 점점 고조되는 느낌으로 만들어줘 / 빗소리를 약하게 넣어줘" />
                </section>

                {/* 에러 메시지 */}
                {error && (
                    <div className="flex items-center justify-center p-3 bg-red-100 text-red-700 rounded-md text-sm">
                        <Info className="w-5 h-5 mr-2 flex-shrink-0" />
                        <p className="font-medium">{error}</p>
                    </div>
                )}

                {/* 제출 버튼 */}
                <button type="submit" disabled={loading} className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition duration-200 disabled:opacity-70 disabled:cursor-not-allowed mt-6 text-lg flex items-center justify-center gap-2">
                     {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                     {loading ? '음악 생성 중...' : '나만의 음악 생성하기 →'}
                </button>
            </form>
        </div>
    );
}