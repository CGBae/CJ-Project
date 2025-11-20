'use client';

// 💡 1. [핵심 수정] 필요한 모든 React 훅과 아이콘을 import
import React, { useState, useEffect, useRef, FormEvent, useCallback, Fragment } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
    Play, Pause, CheckCircle,
    ArrowLeft, Loader2, User, MessageSquare, Music,
    AlertTriangle, ChevronDown, Plus, ClipboardList, Send, Trash2, XCircle, Info,
    FileText, // 👈 [추가]
    Brain,
    HeartPulse,
    Activity
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

const TRANSLATIONS: Record<string, string> = {
    // 분위기
    calming: '차분한', uplifting: '기분 좋아지는', energetic: '활기찬',
    reflective: '사색적인', warm: '따뜻한', soothing: '위로하는',
    bright: '밝은', focusing: '집중 잘 되는', dreamy: '몽환적인', hopeful: '희망찬',

    // 악기
    Piano: '피아노', 'Acoustic Guitar': '통기타', Violin: '바이올린',
    'Music Box': '오르골', Flute: '플룻', 'Nature Sounds': '자연의 소리',
    Drums: '드럼', Bass: '베이스', 'Synth Pad': '신디사이저', 'Electric Guitar': '일렉기타',

    // 조성
    Major: '밝음 (Major)', Minor: '차분함 (Minor)', Neutral: 'AI 추천',

    // 복잡도 등
    Simple: '단순함', Medium: '보통', Complex: '복잡함',
    Low: '낮음', High: '높음', None: '없음',
    Ascending: '상승하는', Descending: '하강하는', Wavy: '물결치는', Flat: '평탄한',
    Sparse: '여유로운', Dense: '꽉 찬',
};

// 영어 -> 한글 변환 헬퍼 함수
const t = (key: string | null | undefined) => {
    if (!key) return '-';
    return TRANSLATIONS[key] || key; // 매핑 없으면 원본 출력
};

// 💡 2. 백엔드 API 응답 타입 정의
interface ChatMessage {
    id: string | number;
    role: 'user' | 'assistant';
    content: string;
}
// interface SessionInfo {
//     id: number;
//     created_at: string;
//     initiator_type: string | null;
//     has_dialog: boolean | null;
// }

interface PatientIntakeVas {
    anxiety: number;
    depression: number;
    pain: number;
}
interface PatientIntakePrefs {
    genres: string[];
    contraindications: string[];
    lyrics_allowed: boolean;
}

// 1. 환자 접수(Intake) 상세 정보 타입
interface SimpleIntakeData {
    goal_text: string | null;
    vas: PatientIntakeVas | null;
    prefs: PatientIntakePrefs | null;
}
// 2. 상담사/작곡가 처방(Intake) 상세 정보 타입
interface CounselorIntakeData {
    genre?: string | null;
    mood?: string | null;
    bpm_min?: number | null;
    bpm_max?: number | null;
    key_signature?: string | null;
    vocals_allowed?: boolean | null;
    include_instruments?: string[] | null;
    exclude_instruments?: string[] | null;
    duration_sec?: number | null;
    notes?: string | null;

    // (snake_case로 일치, camelCase 아님)
    harmonic_dissonance?: string | null;
    rhythm_complexity?: string | null;
    melody_contour?: string | null;
    texture_density?: string | null;

    // 💡 [추가] 누락되었던 필드
    mainInstrument?: string | null;
    targetBPM?: number | 'Neutral' | null;

    anxiety?: number | null;
    depression?: number | null;
    pain?: number | null;
}
interface MusicTrackDetail {
    id: number | string;
    title: string;
    prompt: string;
    audioUrl: string;
    track_url?: string;
    created_at: string;
    session_id: number;
    initiator_type: string | null;
    has_dialog: boolean | null;
    is_favorite: boolean;
    // (상세 정보)
    lyrics: string | null;
    intake_data: SimpleIntakeData | null; // 👈 1번 타입 사용
    therapist_manual: CounselorIntakeData | null; // 👈 4번 타입 사용
    chat_history: ChatMessage[];
}
interface PatientProfile {
    id: number | string;
    name: string | null;
    age: number | null;
    email: string | null;
    role: string;
    social_provider: string | null;
}
interface CounselorNote {
    id: number;
    patient_id: number;
    therapist_id: number;
    content: string;
    created_at: string;
    updated_at: string;
    therapist_name: string | null;
}
// 💡 3. 헬퍼 함수: 동적 제목 (세션 ID/번호 제거)
const getDynamicTitle = (track: MusicTrackDetail): string => {
    if (track.title && !track.title.includes("AI 생성 트랙")) {
        return track.title.split(' (')[0];
    }
    if (track.initiator_type === "therapist") {
        return `상담사 처방 음악`;
    } else if (track.initiator_type === "patient") {
        if (track.has_dialog) {
            return `AI 상담 기반 음악`;
        } else {
            return `작곡 체험 음악`;
        }
    }
    return track.title ? track.title.split(' (')[0] : `AI 트랙 #${track.id}`;
};

// 💡 7. 헬퍼 함수: 메모 시간 포맷
const formatMemoTime = (dateString: string): string => {
    return new Date(dateString).toLocaleString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

// 💡 8. 헬퍼 함수: 환자 식별자 (카카오/이메일)
const getPatientIdentifier = (patient: PatientProfile | null) => {
    if (!patient) return '';
    if (patient.email) {
        return patient.email;
    }
    if (patient.social_provider === 'kakao') {
        return <span className="italic text-yellow-600">카카오 로그인 환자</span>;
    }
    return '정보 없음';
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

export default function PatientDetailPage() {
    const router = useRouter();
    const params = useParams();
    const patientId = params.patientId as string;
    const { isAuthed, user } = useAuth();

    // --- State 정의 ---
    const [patient, setPatient] = useState<PatientProfile | null>(null);
    // 💡 [수정] 'logs' 탭이 사라지므로, 'sessions' state는 카운트용

    const [music, setMusic] = useState<MusicTrackDetail[]>([]); // 👈 [수정] MusicTrackDetail[]
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [currentTrackId, setCurrentTrackId] = useState<string | number | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const [activeTab, setActiveTab] = useState<'music' | 'memos'>('music');

    const [expandedTrackId, setExpandedTrackId] = useState<string | number | null>(null);
    const [detailLoadingId, setDetailLoadingId] = useState<string | number | null>(null);
    const [trackDetail, setTrackDetail] = useState<MusicTrackDetail | null>(null);

    const [memos, setMemos] = useState<CounselorNote[]>([]);
    const [newMemoContent, setNewMemoContent] = useState("");
    const [isMemoLoading, setIsMemoLoading] = useState(false);
    const [memoError, setMemoError] = useState<string | null>(null);
    const [isSubmittingMemo, setIsSubmittingMemo] = useState(false);
    const [isDeletingMemoId, setIsDeletingMemoId] = useState<number | null>(null);



    // 💡 8. [수정] useEffect (API 3개 호출)
    useEffect(() => {
        if (typeof window !== "undefined" && !audioRef.current) {
            const audio = new Audio();
            // 💡 [수정] 재생 종료 시 (루프가 아닐 때)
            audio.onended = () => {
                if (audioRef.current && !audioRef.current.loop) {
                    setCurrentTrackId(null);
                }
            };
            audioRef.current = audio;
        }

        if (!isAuthed) {
            if (!localStorage.getItem('accessToken')) {
                router.push('/login?next=/counselor');
            }
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            const token = localStorage.getItem('accessToken');
            if (!token) {
                setError("인증 토큰이 없습니다.");
                setLoading(false);
                return;
            }

            try {
                // 💡 [수정] 'sessions' API는 'music' API가 반환하므로 제거
                const [profileRes, musicRes] = await Promise.all([
                    fetch(`${API_URL}/therapist/patient/${patientId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
                    // 💡 [수정] /music API가 상세정보까지 모두 가져옴
                    fetch(`${API_URL}/therapist/patient/${patientId}/music`, { headers: { 'Authorization': `Bearer ${token}` } })
                ]);

                // (에러 처리 - 변경 없음)
                if (profileRes.status === 401 || musicRes.status === 401) throw new Error('인증 실패. 다시 로그인해주세요.');
                if (profileRes.status === 403 || musicRes.status === 403) throw new Error('이 환자에 대한 접근 권한이 없습니다.');

                // (데이터 set)
                if (!profileRes.ok) throw new Error(`환자 정보 로딩 실패 (${profileRes.status})`);
                setPatient(await profileRes.json());



                if (!musicRes.ok) throw new Error(`음악 목록 로딩 실패 (${musicRes.status})`);
                // 💡 [수정] music state가 이제 MusicTrackDetail[] 타입을 가짐
                const musicData: MusicTrackDetail[] = await musicRes.json();
                setMusic(musicData.map(t => ({
                    ...t,
                    audioUrl: t.audioUrl || t.track_url || '',
                })));



            } catch (err: unknown) {
                // (catch 블록 - 변경 없음)
                const errorMessage = err instanceof Error ? err.message : '데이터 로딩 오류';
                setError(errorMessage);
                if (errorMessage.includes('인증 실패')) {
                    localStorage.removeItem('accessToken');
                    router.push('/login?next=/counselor');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        // (cleanup 함수 - 변경 없음)
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.onended = null;
                audioRef.current = null;
            }
        };
    }, [patientId, isAuthed, router]);

    // 💡 9. [수정] handlePlay (async/await 적용)
    const handlePlay = async (e: React.MouseEvent, track: MusicTrackDetail) => {
        e.stopPropagation(); // 👈 [추가] 상세정보 펼치기 방지
        const audio = audioRef.current;
        if (!audio) return;
        if (currentTrackId === track.id) {
            audio.pause();
            setCurrentTrackId(null);
            return;
        }
        try {
            audio.pause();
            audio.src = track.audioUrl;
            setCurrentTrackId(track.id);

            await new Promise<void>((resolve, reject) => {
                audio.oncanplaythrough = () => resolve();
                audio.onerror = (err) => reject(new Error("오디오 로드 실패: " + String(err)));
                audio.load();
            });

            await audio.play();
        } catch (error: unknown) {
            console.error("Audio playback failed", error);
            setError(error instanceof Error ? error.message : `음악 재생/로드 실패: ${track.title}`);
            setCurrentTrackId(null);
        }
    };

    const handleToggleDetails = async (trackId: number | string) => {
        if (expandedTrackId === trackId) {
            setExpandedTrackId(null); setTrackDetail(null); return;
        }
        
        setExpandedTrackId(trackId); // 패널 열기
        setDetailLoadingId(String(trackId)); // 로딩 표시
        setTrackDetail(null); 
        setError(null);

        const token = localStorage.getItem('accessToken');
        if (!token) { setError("인증 토큰이 없습니다."); setDetailLoadingId(null); return; }

        try {
            const res = await fetch(`${API_URL}/music/track/${trackId}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!res.ok) throw new Error("상세 정보 로딩 실패");
            const data = await res.json();
            setTrackDetail(data); // 데이터 설정
        } catch (e) {
            console.error(e);
        } finally {
            setDetailLoadingId(null);
        }
    };



    // 💡 10. [핵심 추가] 메모 탭 관련 함수들

    // 메모 목록 불러오기
    const loadMemos = useCallback(async () => {
        if (!patientId) return;
        setIsMemoLoading(true);
        setMemoError(null);
        const token = localStorage.getItem('accessToken');
        if (!token) { setMemoError("인증 토큰이 없습니다."); setIsMemoLoading(false); return; }

        try {
            const response = await fetch(`${API_URL}/therapist/patient/${patientId}/notes`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('메모 목록 로딩 실패');
            const data: CounselorNote[] = await response.json();
            setMemos(data);
        } catch (err: unknown) {
            setMemoError(err instanceof Error ? err.message : "메모 로딩 오류");
        } finally {
            setIsMemoLoading(false);
        }
    }, [patientId]);

    // 메모 탭을 클릭할 때만 API 호출
    useEffect(() => {
        if (activeTab === 'memos') {
            loadMemos();
        }
    }, [activeTab, loadMemos]);

    // 새 메모 생성
    const handleCreateMemo = async (e: FormEvent) => {
        e.preventDefault();
        const content = newMemoContent.trim();
        if (!content || !patientId) return;

        setIsSubmittingMemo(true);
        setMemoError(null);
        const token = localStorage.getItem('accessToken');
        if (!token) { setMemoError("인증 토큰이 없습니다."); setIsMemoLoading(false); return; }

        try {
            const response = await fetch(`${API_URL}/therapist/patient/${patientId}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: content })
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "메모 생성 실패");
            }
            setNewMemoContent("");
            await loadMemos();
        } catch (err: unknown) {
            setMemoError(err instanceof Error ? err.message : "메모 생성 오류");
        } finally {
            setIsSubmittingMemo(false);
        }
    };

    // 메모 삭제
    const handleDeleteMemo = async (noteId: number) => {
        if (!window.confirm("이 메모를 정말 삭제하시겠습니까?")) return;

        setIsDeletingMemoId(noteId);
        setMemoError(null);
        const token = localStorage.getItem('accessToken');
        if (!token) { setMemoError("인증 토큰이 없습니다."); setIsMemoLoading(false); return; }

        try {
            const response = await fetch(`${API_URL}/therapist/notes/${noteId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.status === 403) throw new Error('삭제 권한이 없습니다.');
            if (response.status === 404) throw new Error('메모를 찾을 수 없습니다.');
            if (!response.ok) throw new Error('메모 삭제 실패');

            setMemos(memos.filter(m => m.id !== noteId)); //;
        } catch (err: unknown) {
            setMemoError(err instanceof Error ? err.message : "메모 삭제 오류");
        } finally {
            setIsDeletingMemoId(null);
        }
    };

    // --- 렌더링 로직 (생략 없음) ---

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col justify-center items-center h-screen text-center p-4">
                <AlertTriangle className="w-12 h-12 text-red-600 mb-4" />
                <h1 className="text-2xl font-bold mb-4 text-red-600">오류 발생</h1>
                <p className="text-gray-600 mb-6">{error}</p>
                <button onClick={() => router.push('/counselor')} className="text-indigo-600 hover:underline">
                    환자 목록으로 돌아가기
                </button>
            </div>
        );
    }

    if (!patient) {
        return (
            <div className="flex flex-col justify-center items-center h-screen text-center">
                <h1 className="text-2xl font-bold mb-4 text-gray-600">데이터 없음</h1>
                <p className="text-gray-600 mb-6">환자 정보를 찾을 수 없습니다. (ID: {patientId})</p>
                <button onClick={() => router.push('/counselor')} className="text-indigo-600 hover:underline">
                    환자 목록으로 돌아가기
                </button>
            </div>
        );
    }

    // 💡 11. [핵심 수정] JSX 렌더링 (탭 수정, 상세정보 뷰 추가)
    return (
        <div className="max-w-5xl mx-auto p-6 bg-gray-50 min-h-screen">
            <header className="flex items-center mb-8">
                <button onClick={() => router.push('/counselor')} className="text-gray-500 hover:text-indigo-600 transition-colors flex items-center">
                    <ArrowLeft className="h-5 w-5 mr-1" /> 목록으로
                </button>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* 좌측: 환자 프로필 */}
                <section className="lg:col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
                        <div className="w-24 h-24 rounded-full bg-indigo-50 mx-auto flex items-center justify-center mb-4">
                            <User className="w-10 h-10 text-indigo-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-800">{patient.name || '이름 없음'}</h1>
                        <p className="text-gray-500 text-sm mt-1">{patient.age ? `만 ${patient.age}세` : '나이 정보 없음'}</p>
                        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-2 text-sm text-gray-600">
                             <span className="flex items-center justify-center gap-2">
                                 📧 {getPatientIdentifier(patient)}
                             </span>
                        </div>
                    </div>
                    
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="font-semibold text-gray-800 mb-4 flex items-center"><Activity className="w-4 h-4 mr-2 text-green-500"/> 활동 요약</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                                <span className="text-sm text-gray-600">총 상담</span>
                                <span className="font-bold text-indigo-600">{music.filter(m => m.has_dialog).length}회</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                                <span className="text-sm text-gray-600">생성된 음악</span>
                                <span className="font-bold text-green-600">{music.length}곡</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 우측: 탭 컨텐츠 */}
                <section className="lg:col-span-2">
                    <div className="flex space-x-1 bg-gray-200 p-1 rounded-xl mb-6 w-fit">
                        <button onClick={() => setActiveTab('music')} className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'music' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            음악 치료 기록
                        </button>
                        <button onClick={() => setActiveTab('memos')} className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'memos' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            상담사 메모
                        </button>
                    </div>

                    {activeTab === 'music' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="text-lg font-bold text-gray-800">치료 세션 목록</h2>
                                <button onClick={() => router.push(`/intake/counselor?patientId=${patient.id}`)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition shadow-sm font-medium">
                                    <Plus className="w-4 h-4" /> 새 처방
                                </button>
                            </div>
                            
                            {music.length === 0 ? (
                                <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
                                    <Music className="w-10 h-10 text-gray-300 mx-auto mb-3"/>
                                    <p className="text-gray-500">아직 생성된 음악이 없습니다.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {music.map((track) => (
                                        <div key={track.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm transition hover:shadow-md">
                                            {/* 트랙 헤더 */}
                                            <div onClick={() => handleToggleDetails(track.id)} className="p-5 flex items-center justify-between cursor-pointer bg-white hover:bg-gray-50 transition-colors">
                                                <div className="flex items-center gap-4 overflow-hidden">
                                                    <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${currentTrackId === track.id ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
                                                        <Music className="w-6 h-6" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className={`font-bold text-lg truncate ${currentTrackId === track.id ? 'text-indigo-700' : 'text-gray-800'}`}>
                                                            {getDynamicTitle(track)}
                                                        </h3>
                                                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                                                            <span>{new Date(track.created_at).toLocaleDateString()}</span>
                                                            <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                                            <span>{track.initiator_type === 'therapist' ? '처방됨' : '자가진행'}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <button 
                                                        onClick={(e) => handlePlay(e, track)}
                                                        className={`p-2.5 rounded-full transition-all ${currentTrackId === track.id ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                                    >
                                                        {currentTrackId === track.id ? <Pause className="w-5 h-5 fill-current"/> : <Play className="w-5 h-5 fill-current ml-0.5"/>}
                                                    </button>
                                                    <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${expandedTrackId === track.id ? 'rotate-180' : ''}`} />
                                                </div>
                                            </div>

                                            {/* 상세 정보 패널 */}
                                            {expandedTrackId === track.id && (
                                                <div className="border-t border-gray-100 bg-gray-50/50 p-5 animate-in slide-in-from-top-2 duration-200">
                                                    {detailLoadingId === String(track.id) ? (
                                                        <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-indigo-400"/></div>
                                                    ) : !trackDetail ? (
                                                        <div className="text-center text-red-500 text-sm">정보를 불러오지 못했습니다.</div>
                                                    ) : (
                                                        <div className="space-y-6">
                                                            {/* AI 상담 데이터 */}
                                                            {trackDetail.intake_data && <PatientIntakeView intake={trackDetail.intake_data} />}
                                                            
                                                            {/* 💡 상담사 처방 데이터 (VAS 시각화 적용) */}
                                                            {trackDetail.therapist_manual && <CounselorIntakeView intake={trackDetail.therapist_manual} />}

                                                            {/* 가사 */}
                                                            {trackDetail.lyrics && (
                                                                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                                                    <h4 className="font-semibold text-gray-800 text-sm mb-3 flex items-center"><FileText className="w-4 h-4 mr-2 text-indigo-500"/>생성된 가사</h4>
                                                                    <pre className="text-sm text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">{trackDetail.lyrics}</pre>
                                                                </div>
                                                            )}

                                                            {/* 채팅 내역 */}
                                                            {trackDetail.chat_history && trackDetail.chat_history.length > 0 && (
                                                                <ChatHistoryView chatHistory={trackDetail.chat_history} />
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* (메모 탭은 그대로 유지) */}
                    {activeTab === 'memos' && (
                        <div className="space-y-6">
                            {/* ... 메모 리스트 ... */}
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center"><Plus className="w-5 h-5 mr-2 text-indigo-600"/>새 메모 작성</h3>
                                <form onSubmit={handleCreateMemo}>
                                    <textarea value={newMemoContent} onChange={(e) => setNewMemoContent(e.target.value)} rows={3} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all" placeholder="환자 특이사항이나 상담 내용을 기록하세요..." disabled={isSubmittingMemo}/>
                                    <div className="flex justify-end mt-3">
                                        <button type="submit" disabled={isSubmittingMemo || !newMemoContent.trim()} className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-sm flex items-center">
                                            {isSubmittingMemo ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4 mr-1.5"/>} 저장하기
                                        </button>
                                    </div>
                                </form>
                            </div>
                            <div className="space-y-4">
                                {memos.map(note => (
                                    <div key={note.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 relative group hover:shadow-md transition-all">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                                                    {note.therapist_name ? note.therapist_name[0] : 'T'}
                                                </div>
                                                <div>
                                                    <span className="text-sm font-bold text-gray-800">{note.therapist_name || '알 수 없음'}</span>
                                                    {user && note.therapist_id === user.id && <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">나</span>}
                                                </div>
                                            </div>
                                            <span className="text-xs text-gray-400">{formatMemoTime(note.created_at)}</span>
                                        </div>
                                        <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed pl-10">{note.content}</p>
                                        {user && note.therapist_id === user.id && (
                                            <button onClick={() => handleDeleteMemo(note.id)} disabled={isDeletingMemoId === note.id} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                                                {isDeletingMemoId === note.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4"/>}
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

// 💡 13. [추가] 상세정보 뷰 헬퍼 컴포넌트

// (1) 환자 접수(Intake) 상세 뷰
const PatientIntakeView: React.FC<{ intake: SimpleIntakeData }> = ({ intake }) => {
    const vas = intake?.vas;
    const prefs = intake?.prefs;

    // VAS 점수별 색상/라벨 헬퍼
    const getVasColor = (score: number) => {
        if (score <= 3) return 'bg-green-500';
        if (score <= 7) return 'bg-yellow-400';
        return 'bg-red-500';
    };

    

    return (
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <h4 className="font-bold text-gray-800 flex items-center mb-4">
                <Brain className="w-5 h-5 mr-2 text-indigo-500" />
                환자 자가 진단 (AI 상담)
            </h4>

            <div className="mb-6">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">상담 목표</span>
                <div className="mt-1.5 p-3 bg-indigo-50 rounded-lg text-sm text-indigo-900 font-medium">
                    {intake.goal_text || '기록 없음'}
                </div>
            </div>

            {vas && (
                <div className="mb-6">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">현재 상태 (VAS)</span>
                    <div className="grid grid-cols-3 gap-4 mt-2">
                        {[
                            { label: '불안', val: vas.anxiety },
                            { label: '우울', val: vas.depression },
                            { label: '통증', val: vas.pain }
                        ].map((item) => (
                            <div key={item.label} className="text-center">
                                <div className="text-xs text-gray-500 mb-1">{item.label}</div>
                                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                    <div className={`h-full ${getVasColor(item.val)}`} style={{ width: `${item.val * 10}%` }}></div>
                                </div>
                                <div className="text-sm font-bold text-gray-800 mt-1">{item.val}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {prefs && (
                <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">음악 선호도</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {prefs.genres?.map(g => <span key={g} className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded-md font-medium">👍 {t(g)}</span>)}
                        {prefs.contraindications?.map(g => <span key={g} className="px-2 py-1 bg-red-50 text-red-700 text-xs rounded-md font-medium">🚫 {t(g)}</span>)}
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">
                            🎤 {prefs.lyrics_allowed ? '보컬 포함' : '연주곡만'}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

// 2. 상담사 처방 내용 (작곡 체험)
const CounselorIntakeView: React.FC<{ intake: CounselorIntakeData }> = ({ intake }) => {
    // 유효한 필드만 렌더링하는 헬퍼
    const Field = ({ label, value, icon }: {
        label: string,
        value: string | number | boolean | null | undefined,
        icon?: React.ReactNode
    }) => {
        // 💡 [수정] any 캐스팅 제거 및 타입 안전하게 처리
        let displayVal: string | number | null = null;

        if (value === null || value === undefined) {
            displayVal = null;
        } else if (typeof value === 'boolean') {
            displayVal = value ? '예' : '아니오';
        } else {
            // string이나 number인 경우
            displayVal = t(String(value)); // t함수는 string을 받으므로 String()으로 변환
        }

        // 값이 없거나 Neutral/N /A면 렌더링 안 함
        if (!value && value !== false && value !== 0) return null; // false나 0은 유효한 값이므로 제외
        if (value === 'Neutral' || value === 'N/A') return null;

        return (
            <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-500 flex items-center gap-2">
                    {icon && <span>{icon}</span>}
                    {label}
                </span>
                <span className="text-sm font-medium text-gray-800 text-right">{displayVal}</span>
            </div>
        );
    };


    const getVasColor = (score: number | null | undefined) => {
        if (score === null || score === undefined) return 'bg-gray-200';
        if (score <= 3) return 'bg-green-500';
        if (score <= 7) return 'bg-yellow-400';
        return 'bg-red-500';
    };

    // VAS 데이터 존재 여부 확인
    const hasVas = (intake.anxiety !== undefined && intake.anxiety !== null) ||
                   (intake.depression !== undefined && intake.depression !== null) ||
                   (intake.pain !== undefined && intake.pain !== null);
    return (
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <h4 className="font-bold text-gray-800 flex items-center mb-4">
                <HeartPulse className="w-5 h-5 mr-2 text-rose-500" />
                음악 처방 상세 (Manual)
            </h4>

            {intake.notes && (
                <div className="mb-5 p-3 bg-rose-50 rounded-lg text-sm text-rose-900 border border-rose-100">
                    <span className="block text-xs font-bold text-rose-400 mb-1">📝 처방 노트</span>
                    {intake.notes}
                </div>
            )}

            {/* 💡 [수정] VAS 게이지 바 (데이터가 있는 경우에만 표시) */}
            {hasVas && (
                <div className="mb-6">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">환자 상태 기록 (VAS)</span>
                    <div className="grid grid-cols-3 gap-4 mt-2">
                        {[
                            { label: '불안', val: intake.anxiety },
                            { label: '우울', val: intake.depression },
                            { label: '통증', val: intake.pain }
                        ].map((item) => (
                            item.val !== null && item.val !== undefined ? (
                                <div key={item.label} className="text-center">
                                    <div className="text-xs text-gray-500 mb-1">{item.label}</div>
                                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full ${getVasColor(item.val)}`} style={{ width: `${item.val * 10}%` }}></div>
                                    </div>
                                    <div className="text-sm font-bold text-gray-800 mt-1">{item.val}</div>
                                </div>
                            ) : null
                        ))}
                    </div>
                </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                <Field label="분위기" value={intake.mood} icon="✨" />
                <Field
                    label="메인 악기"
                    value={Array.isArray(intake.include_instruments) && intake.include_instruments.length > 0
                        ? intake.include_instruments.join(', ')
                        : (intake.mainInstrument || 'N/A')}
                    icon="🎹"
                />
                <Field
                    label="템포 (BPM)"
                    value={intake.targetBPM && intake.targetBPM !== 'Neutral'
                        ? intake.targetBPM
                        : (intake.bpm_min ? `${intake.bpm_min}~${intake.bpm_max}` : null)}
                    icon="🥁"
                />
                <Field label="조성" value={intake.key_signature} icon="🎼" />
                <Field label="보컬" value={intake.vocals_allowed} icon="🎤" />

                {/* 고급 설정 */}
                <Field label="리듬" value={intake.rhythm_complexity} />
                <Field label="선율" value={intake.melody_contour} />
                <Field label="밀도" value={intake.texture_density} />
                <Field label="불협화음" value={intake.harmonic_dissonance} />
            </div>

            {Array.isArray(intake.exclude_instruments) && intake.exclude_instruments.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                    <span className="text-xs font-bold text-red-400 uppercase">제외된 소리</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                        {intake.exclude_instruments.map(inst => (
                            <span key={inst} className="px-2 py-1 bg-red-50 text-red-600 text-xs rounded-md border border-red-100">{t(inst)}</span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// 3. 채팅 내역
const ChatHistoryView: React.FC<{ chatHistory: ChatMessage[] }> = ({ chatHistory }) => {
    return (
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <h4 className="font-bold text-gray-800 flex items-center mb-4"><MessageSquare className="w-5 h-5 mr-2 text-blue-500" />상담 대화 기록</h4>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {chatHistory.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                                ? 'bg-indigo-600 text-white rounded-tr-none shadow-md'
                                : 'bg-gray-100 text-gray-800 rounded-tl-none'
                            }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};