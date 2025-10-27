'use client';

import React, { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
// 💡 1. 'addTrackToPlaylist' (공용)와 'addMusicToPatient' (환자 계정용)를 모두 가져옵니다.
import { addTrackToPlaylist, MusicTrack } from '@/lib/utils/music';
import { addMusicToPatient } from '@/lib/utils/patients';
import { Loader2, Music, Info, Sparkles } from 'lucide-react';

export default function ComposePage() {
    // --- 상태 관리 ---
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

    // 💡 2. 현재 로그인한 환자의 ID를 시뮬레이션합니다. (대시보드와 동일하게)
    const SIMULATED_LOGGED_IN_PATIENT_ID = 'p_user_001';

    // 폼 입력값 변경 핸들러
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (name === 'instrument') setInstrument(value);
        else if (name === 'duration') setDuration(Number(value));
        else if (name === 'notes') setNotes(value);
        else if (type === 'checkbox') setVocalsAllowed((e.target as HTMLInputElement).checked);
    };

    // 제외할 악기 체크박스 핸들러
    const handleExcludeToggle = (instrument: string) => {
        setExcludedInstruments(prev => 
            prev.includes(instrument) 
            ? prev.filter(item => item !== instrument)
            : [...prev, instrument]
        );
    };

    /**
     * 폼 제출 시, 3단계에 걸쳐 백엔드 API를 호출합니다.
     */
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setLoadingStatus('');
        setError(null);

        let finalPrompt = ''; 
        let newSessionId = 0;

        try {
            // --- 1단계: 새 세션 생성 (/therapist/new) ---
            setLoadingStatus('새 세션 준비 중...');
            const sessionResponse = await fetch('http://localhost:8000/therapist/new', { method: 'POST' });
            if (!sessionResponse.ok) throw new Error('세션 생성에 실패했습니다.');
            const sessionData = await sessionResponse.json();
            newSessionId = sessionData.session_id;

            // --- 2단계: 폼 데이터로 프롬프트 생성 (/therapist/manual-generate) ---
            setLoadingStatus('AI가 작곡 아이디어 구상 중...');
            
            let bpmRange = { min: 70, max: 90 };
            if (tempo === 'slow') bpmRange = { min: 50, max: 70 };
            if (tempo === 'fast') bpmRange = { min: 100, max: 120 };

            const manualPayload = {
                session_id: newSessionId,
                guideline_json: "{}",
                manual: {
                    mood: mood,
                    bpm_min: bpmRange.min,
                    bpm_max: bpmRange.max,
                    key_signature: musicKey,
                    vocals_allowed: vocalsAllowed,
                    include_instruments: [instrument],
                    exclude_instruments: excludedInstruments,
                    duration_sec: duration,
                    notes: notes,
                }
            };
            const generateResponse = await fetch('http://localhost:8000/therapist/manual-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(manualPayload)
            });
            if (!generateResponse.ok) throw new Error('프롬프트 생성에 실패했습니다.');
            const promptData = await generateResponse.json();
            finalPrompt = promptData.prompt_text;
            console.log("최종 프롬프트 수신:", finalPrompt);

            // --- 3단계: 실제 음악 생성 요청 (/music/compose) ---
            setLoadingStatus('ElevenLabs에서 음악 생성 중...');
            const musicResponse = await fetch('http://localhost:8000/music/compose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: newSessionId,
                    music_length_ms: duration * 1000,
                    force_instrumental: !vocalsAllowed,
                }),
            });
            if (!musicResponse.ok) {
                 const errorData = await musicResponse.json();
                 throw new Error(errorData.detail || '음악 생성 API 호출에 실패했습니다.');
            }
            const result = await musicResponse.json();
            if (!result.track_url) throw new Error("음악 생성 결과가 올바르지 않습니다.");

            // --- 4단계: 두 곳의 플레이리스트에 모두 저장 ---
            const newTrack: MusicTrack = {
                id: `track_compose_${Date.now()}`,
                title: `(작곡 체험) ${mood} 분위기, ${instrument} 음악`,
                artist: 'TheraMusic AI (Me)',
                prompt: finalPrompt,
                audioUrl: `http://localhost:8000${result.track_url}`
            };
            
            // 💡 3. [핵심 수정] 
            // (1) 환자 본인용 공용 플레이리스트에 추가 (/music 페이지용)
            addTrackToPlaylist(newTrack); 
            // (2) '로그인한' 환자의 '가짜 DB' 계정에도 추가 (대시보드용)
            addMusicToPatient(SIMULATED_LOGGED_IN_PATIENT_ID, newTrack);

            // 💡 4. [수정] 대시보드로 이동하여 '최근 음악' 목록 갱신을 바로 확인
            router.push('/dashboard/patient');

        } catch (err) {
            console.error('Compose music failed:', err);
            setError(err instanceof Error ? err.message : '알 수 없는 오류 발생');
        } finally {
            setLoading(false);
            setLoadingStatus('');
        }
    };

    /**
     * 버튼 스타일을 동적으로 반환하는 헬퍼 함수
     */
    const getButtonClass = (isActive: boolean) => {
        const baseClass = "px-4 py-2 rounded-full transition duration-150 text-sm font-medium border";
        return isActive
            ? `${baseClass} bg-indigo-600 border-indigo-600 text-white shadow-md`
            : `${baseClass} bg-white text-gray-700 border-gray-300 hover:bg-indigo-50 hover:border-indigo-300`;
    };

    return (
        <div className="compose-container p-6 md:p-8 max-w-2xl mx-auto bg-white shadow-xl rounded-lg my-10 relative">
            
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

                <section>
                    <label className="block text-lg font-semibold text-gray-700 mb-3">1. 분위기</label>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setMood('calming')} className={getButtonClass(mood === 'calming')}>😌 차분하게</button>
                        <button type="button" onClick={() => setMood('uplifting')} className={getButtonClass(mood === 'uplifting')}>😄 긍정적이게</button>
                        <button type="button" onClick={() => setMood('energetic')} className={getButtonClass(mood === 'energetic')}>⚡️ 활기차게</button>
                        <button type="button" onClick={() => setMood('reflective')} className={getButtonClass(mood === 'reflective')}>🤔 사색적이게</button>
                    </div>
                </section>

                <section>
                    <label htmlFor="instrument" className="block text-lg font-semibold text-gray-700 mb-2">2. 주요 악기</label>
                    <select
                        id="instrument"
                        name="instrument"
                        value={instrument}
                        onChange={handleChange}
                        className="w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    >
                        <option value="Piano">피아노</option>
                        <option value="Acoustic Guitar">어쿠스틱 기타</option>
                        <option value="Strings">현악기</option>
                        <option value="Synthesizer">신디사이저</option>
                    </select>

                    <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-600 mb-2">이 악기 소리는 빼주세요 (선택):</label>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            {['Drums', 'Bass', 'Synth Pad', 'Electric Guitar'].map((inst) => (
                                <label key={inst} className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={excludedInstruments.includes(inst)}
                                        onChange={() => handleExcludeToggle(inst)}
                                    />
                                    <span className="text-sm text-gray-700">{inst}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </section>

                <section>
                    <label className="block text-lg font-semibold text-gray-700 mb-3">3. 빠르기 (템포)</label>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setTempo('slow')} className={getButtonClass(tempo === 'slow')}>🐢 느리게</button>
                        <button type="button" onClick={() => setTempo('medium')} className={getButtonClass(tempo === 'medium')}>🏃‍♂️ 보통</button>
                        <button type="button" onClick={() => setTempo('fast')} className={getButtonClass(tempo === 'fast')}>🚀 빠르게</button>
                    </div>
                </section>

                <section>
                    <label className="block text-lg font-semibold text-gray-700 mb-3">4. 음악의 느낌 (조성)</label>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setMusicKey('Major')} className={getButtonClass(musicKey === 'Major')}>☀️ 밝게 (Major)</button>
                        <button type="button" onClick={() => setMusicKey('Minor')} className={getButtonClass(musicKey === 'Minor')}>🌙 차분하게 (Minor)</button>
                        <button type="button" onClick={() => setMusicKey('Neutral')} className={getButtonClass(musicKey === 'Neutral')}>🤖 AI가 결정</button>
                    </div>
                </section>

                <section>
                    <label className="block text-lg font-semibold text-gray-700 mb-2">5. 보컬 (가사) 여부</label>
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
                </section>

                <section>
                    <label htmlFor="duration" className="block text-lg font-semibold text-gray-700 mb-2">
                        6. 음악 길이: <span className="font-bold text-indigo-600">{duration}초</span>
                    </label>
                    <input
                        type="range"
                        id="duration"
                        name="duration"
                        value={duration}
                        onChange={handleChange}
                        min="30"  // 30초
                        max="180" // 3분
                        step="30" // 30초 단위
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                     <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>30초</span>
                        <span>3분 (180초)</span>
                    </div>
                </section>

                <section>
                    <label htmlFor="notes" className="block text-lg font-semibold text-gray-700 mb-2">
                        7. AI에게 직접 요청하기 (선택)
                    </label>
                    <textarea
                        id="notes"
                        name="notes"
                        value={notes}
                        onChange={handleChange}
                        rows={3}
                        className="w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        placeholder="예: 조용하게 시작해서 점점 고조되는 느낌으로 만들어줘 / 빗소리를 약하게 넣어줘"
                    />
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
                    className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition duration-200 disabled:opacity-70 disabled:cursor-not-allowed mt-6 text-lg flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                    {loading ? '음악 생성 중...' : '나만의 음악 생성하기 →'}
                </button>
            </form>
        </div>
    );
}