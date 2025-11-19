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
    HeartPulse
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
        // 1. 이미 열려있는 거면 닫기
        if (expandedTrackId === trackId) {
            setExpandedTrackId(null);
            setTrackDetail(null); 
            return;
        }
        
        // 2. 로딩 시작
        setExpandedTrackId(trackId); // 패널을 먼저 열고
        setDetailLoadingId(String(trackId)); // 로딩 스피너 표시
        setTrackDetail(null); // 기존 데이터 비우기 (깜빡임 방지)
        setError(null);

        const token = localStorage.getItem('accessToken');
        if (!token) { 
            setError("인증 토큰이 없습니다."); 
            setDetailLoadingId(null); 
            return; 
        }

        try {
            // 3. 무조건 상세 API 호출 (목록에 있는 정보 무시)
            const response = await fetch(`${API_URL}/music/track/${trackId}`, { 
                 headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || "상세 정보 로딩 실패");
            }

            const data: MusicTrackDetail = await response.json();
            console.log("상세 정보 수신:", data); // 👈 디버깅용 로그
            setTrackDetail(data); // 4. 꽉 찬 데이터 저장
            
        } catch (e: unknown) {
            console.error(e);
            setError(e instanceof Error ? e.message : "상세 정보를 불러올 수 없습니다.");
            setExpandedTrackId(null); // 에러 나면 다시 닫기
        } finally {
            setDetailLoadingId(null); // 로딩 끝
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
        <div className="max-w-3xl mx-auto p-4 sm:p-6 bg-gray-50 min-h-screen">
            <header className="flex justify-between items-center pb-4 border-b border-gray-200 mb-6">
                <button onClick={() => router.push('/counselor')} className="text-indigo-600 hover:text-indigo-800 flex items-center transition-colors text-sm font-medium">
                    <ArrowLeft className="h-4 w-4 mr-1" /> 모든 환자 목록
                </button>
            </header>

            {/* 환자 정보 섹션 (age, 카카오ID 표시) */}
            <section className="bg-white p-6 border rounded-xl shadow-md mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border">
                        <User className="w-8 h-8 text-gray-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">
                            {patient.name || '이름 없음'}
                            {patient.age && (
                                <span className="text-2xl font-medium text-gray-500 ml-2">(만 {patient.age}세)</span>
                            )}
                        </h1>
                        <p className="text-md text-gray-500">
                            {getPatientIdentifier(patient)}
                        </p>
                    </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="text-gray-600">총 상담 횟수:</div>
                    {/* 💡 [수정] sessions.length -> music.filter(...) */}
                    <div className="font-medium text-indigo-600">{music.filter(m => m.has_dialog).length}회</div>
                    <div className="text-gray-600">생성된 음악:</div>
                    <div className="font-medium text-green-600">{music.length}곡</div>
                </div>
            </section>

            {/* 💡 [수정] 탭 메뉴 UI ('logs' 탭 제거) */}
            <div className="mb-6">
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab('music')}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'music' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            음악 목록 ({music.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('memos')}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'memos' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            상담사 메모
                        </button>
                    </nav>
                </div>
            </div>

            {/* --- 음악 목록 탭 (상세보기 기능 추가) --- */}
            {activeTab === 'music' && (
                <section>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-gray-800">생성된 음악</h2>
                        <button
                            onClick={() => router.push(`/intake/counselor?patientId=${patient.id}`)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 transition-colors shadow-sm font-medium"
                        >
                            <Plus className="w-4 h-4" /> 음악 처방하기
                        </button>
                    </div>
                    {music.length === 0 ? (
                        <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg bg-white mt-6">
                            <Music className="mx-auto h-12 w-12 text-gray-400" />
                            <h3 className="mt-2 text-sm font-semibold text-gray-900">생성된 음악 없음</h3>
                            <p className="mt-1 text-sm text-gray-500">아직 이 환자를 위해 생성된 음악이 없습니다.</p>
                        </div>
                    ) : (
                        <ul className="space-y-3">
                            {music.map((track) => (
                                <Fragment key={track.id}>
                                    <li
                                        onClick={() => handleToggleDetails(track.id)} // 👈 [추가]
                                        className={`p-4 bg-white border border-gray-200 rounded-lg shadow-sm transition-all flex items-center justify-between cursor-pointer ${expandedTrackId === track.id ? 'border-indigo-300 shadow-md rounded-b-none' : 'hover:bg-gray-50'
                                            }`}
                                    >
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className={`flex-shrink-0 p-3 rounded-full ${currentTrackId === track.id ? 'bg-indigo-600' : 'bg-indigo-100'}`}>
                                                <Music className={`w-5 h-5 ${currentTrackId === track.id ? 'text-white' : 'text-indigo-600'}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`font-semibold text-gray-900 truncate ${currentTrackId === track.id ? 'text-indigo-700' : ''}`}>
                                                    {getDynamicTitle(track)}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {new Date(track.created_at).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex-shrink-0 ml-4 flex items-center gap-2">
                                            <button
                                                onClick={(e) => handlePlay(e, track)}
                                                className={`p-3 rounded-full transition-colors shadow-sm ${currentTrackId === track.id ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-700'
                                                    } text-white`}
                                                aria-label={currentTrackId === track.id ? '일시정지' : '재생'}
                                            >
                                                {currentTrackId === track.id ? <Pause className="h-5 w-5 fill-white" /> : <Play className="h-5 w-5 fill-white pl-0.5" />}
                                            </button>
                                            {/* 💡 [추가] 펼치기 아이콘 */}
                                            <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${expandedTrackId === track.id ? 'rotate-180' : ''}`} />
                                        </div>
                                    </li>

                                    {/* 💡 [핵심 추가] 상세 정보 패널 */}
                                    {expandedTrackId === track.id && (
                                        <div className="border border-t-0 rounded-b-lg p-6 bg-white shadow-inner mb-3 -mt-2 animate-in fade-in duration-200">
                                            {detailLoadingId === track.id ? (
                                                <div className="flex justify-center items-center p-4">
                                                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                                                    <span className="ml-2 text-gray-500">상세 정보 로딩 중...</span>
                                                </div>
                                            ) : !trackDetail ? (
                                                <Alert type="error" message="상세 정보를 불러오는데 실패했습니다." />
                                            ) : (
                                                <div className="space-y-6">

                                                    {/* 1. [AI 상담] 환자 접수 내용이 있으면 표시 */}
                                                    {trackDetail.intake_data && (
                                                        <div className="border-b pb-4">
                                                            <PatientIntakeView intake={trackDetail.intake_data} />
                                                        </div>
                                                    )}

                                                    {/* 2. [작곡/처방] 수동 설정 내용이 있으면 표시 */}
                                                    {trackDetail.therapist_manual && (
                                                        <div className="border-b pb-4">
                                                            <CounselorIntakeView intake={trackDetail.therapist_manual} />
                                                        </div>
                                                    )}

                                                    {/* 3. [가사] 가사가 있으면 표시 */}
                                                    {trackDetail.lyrics && (
                                                        <div className="border-b pb-4">
                                                            <h4 className="font-semibold text-gray-800 flex items-center mb-2">
                                                                <FileText className="w-4 h-4 mr-2 text-indigo-600" />생성된 가사
                                                            </h4>
                                                            <pre className="p-3 bg-gray-50 rounded-md text-sm text-gray-600 whitespace-pre-wrap font-sans overflow-y-auto max-h-60 border">
                                                                {trackDetail.lyrics}
                                                            </pre>
                                                        </div>
                                                    )}

                                                    {/* 4. [채팅] 대화 기록이 있으면 표시 */}
                                                    {trackDetail.chat_history && trackDetail.chat_history.length > 0 && (
                                                        <div>
                                                            <ChatHistoryView chatHistory={trackDetail.chat_history} />
                                                        </div>
                                                    )}

                                                    {/* 5. 데이터가 하나도 없는 경우 */}
                                                    {!trackDetail.intake_data && !trackDetail.therapist_manual && !trackDetail.lyrics && (!trackDetail.chat_history || trackDetail.chat_history.length === 0) && (
                                                        <div className="text-center py-4 text-gray-500 text-sm">
                                                            표시할 상세 정보가 없습니다.
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </Fragment>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {/* --- 상담사 메모 탭 (UI 수정됨) --- */}
            {activeTab === 'memos' && (
                <section className="space-y-6">
                    {/* 1. 새 메모 작성 폼 */}
                    <form onSubmit={handleCreateMemo} className="bg-white p-6 border rounded-xl shadow-md">
                        <h2 className="text-xl font-semibold text-gray-800 flex items-center mb-4">
                            <Plus className="w-5 h-5 mr-3 text-indigo-600" />
                            새 메모 추가
                        </h2>
                        <textarea
                            value={newMemoContent}
                            onChange={(e) => setNewMemoContent(e.target.value)}
                            rows={4}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                            placeholder={patient ? `${patient.name || '환자'}님에 대한 소견이나 다음 상담 계획을 기록하세요...` : '메모 작성...'}
                            disabled={isSubmittingMemo}
                        />
                        {memoError && !isSubmittingMemo && (
                            <p className="text-sm text-red-600 mt-2">{memoError}</p>
                        )}
                        <div className="flex justify-end mt-4">
                            <button
                                type="submit"
                                disabled={isSubmittingMemo || !newMemoContent.trim()}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg shadow hover:bg-indigo-700 transition-colors disabled:bg-gray-400"
                            >
                                {isSubmittingMemo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                {isSubmittingMemo ? '저장 중...' : '메모 저장'}
                            </button>
                        </div>
                    </form>

                    {/* 2. 메모 목록 (작성자 표시) */}
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                        <h2 className="text-xl font-semibold text-gray-800 flex items-center mb-5">
                            <ClipboardList className="w-5 h-5 mr-3 text-indigo-500" />
                            메모 기록 (모든 상담사)
                        </h2>
                        {isMemoLoading && memos.length === 0 ? (
                            <div className="flex justify-center items-center p-4">
                                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                                <span className="ml-2 text-gray-500">메모 로딩 중...</span>
                            </div>
                        ) : !isMemoLoading && memoError && memos.length === 0 ? (
                            <Alert type="error" message={memoError} />
                        ) : memos.length === 0 ? (
                            <div className="p-6 text-center bg-gray-50 rounded-lg border border-gray-200">
                                <p className="text-gray-500">아직 작성된 메모가 없습니다.</p>
                            </div>
                        ) : (
                            <ul className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                                {memos.map(note => (
                                    <li key={note.id} className="p-4 bg-gray-50 border border-gray-200 rounded-lg shadow-sm">
                                        <p className="text-gray-700 whitespace-pre-wrap text-sm">
                                            {note.content}
                                        </p>
                                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-200">
                                            <p className="text-xs text-gray-500">
                                                <span className="font-medium text-gray-700">
                                                    {note.therapist_name || '알 수 없음'}
                                                    {user && note.therapist_id === user.id && ' (나)'}
                                                </span>
                                                <span className="mx-1.5">|</span>
                                                {formatMemoTime(note.created_at)}
                                                {note.created_at !== note.updated_at && ' (수정됨)'}
                                            </p>
                                            {user && note.therapist_id === user.id && (
                                                <button
                                                    onClick={() => handleDeleteMemo(note.id)}
                                                    disabled={isDeletingMemoId === note.id}
                                                    className="p-1 text-red-500 hover:bg-red-100 rounded-md disabled:opacity-50"
                                                    aria-label="메모 삭제"
                                                >
                                                    {isDeletingMemoId === note.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </button>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </section>
            )}

        </div>
    );
}

// 💡 12. [추가] Alert 컴포넌트
interface AlertProps {
    type: 'error' | 'info' | 'success';
    message: string | null;
    onClose?: () => void;
}
const Alert: React.FC<AlertProps> = ({ type, message, onClose }) => {
    if (!message) return null;
    let bgColor, Icon;
    switch (type) {
        case 'error':
            bgColor = 'bg-red-100 border-red-400 text-red-700'; Icon = AlertTriangle; break;
        case 'success':
            bgColor = 'bg-green-100 border-green-400 text-green-700'; Icon = CheckCircle; break;
        case 'info':
        default:
            bgColor = 'bg-blue-100 border-blue-400 text-blue-700'; Icon = Info; break;
    }
    return (
        <div className={`p-4 border rounded-xl flex items-start ${bgColor} relative mb-6`} role="alert">
            <Icon className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
                <p className="text-sm">{message}</p>
            </div>
            {onClose && (
                <button onClick={onClose} className="absolute top-2 right-2 p-1 rounded-full hover:bg-black hover:bg-opacity-10">
                    <XCircle className="w-4 h-4" />
                </button>
            )}
        </div>
    );
};

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
                <Brain className="w-5 h-5 mr-2 text-indigo-500"/>
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

        // 값이 없거나 Neutral/N/A면 렌더링 안 함
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

    return (
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <h4 className="font-bold text-gray-800 flex items-center mb-4">
                <HeartPulse className="w-5 h-5 mr-2 text-rose-500"/>
                음악 처방 상세 (Manual)
            </h4>

            {intake.notes && (
                 <div className="mb-5 p-3 bg-rose-50 rounded-lg text-sm text-rose-900 border border-rose-100">
                    <span className="block text-xs font-bold text-rose-400 mb-1">📝 처방 노트</span>
                    {intake.notes}
                </div>
            )}
            
            {/* VAS (상담사가 기록한 경우) */}
            {(intake.anxiety !== undefined || intake.depression !== undefined) && (
                <div className="mb-5 p-3 bg-gray-50 rounded-lg">
                     <span className="text-xs font-semibold text-gray-500 uppercase block mb-2">환자 상태 기록</span>
                     <div className="flex gap-4 text-sm">
                         {intake.anxiety !== undefined && <span>😰 불안: <strong>{intake.anxiety}</strong></span>}
                         {intake.depression !== undefined && <span>💧 우울: <strong>{intake.depression}</strong></span>}
                         {intake.pain !== undefined && <span>⚡ 통증: <strong>{intake.pain}</strong></span>}
                     </div>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                <Field label="분위기" value={intake.mood} icon="✨"/>
                <Field label="메인 악기" value={Array.isArray(intake.include_instruments) ? intake.include_instruments.join(', ') : intake.mainInstrument} icon="🎹"/>
                <Field label="템포 (BPM)" value={intake.targetBPM && intake.targetBPM !== 'Neutral' ? intake.targetBPM : (intake.bpm_min ? `${intake.bpm_min}~${intake.bpm_max}` : null)} icon="🥁"/>
                <Field label="조성" value={intake.key_signature} icon="🎼"/>
                <Field label="보컬" value={intake.vocals_allowed ? '포함' : '미포함'} icon="🎤"/>
                
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
            <h4 className="font-bold text-gray-800 flex items-center mb-4"><MessageSquare className="w-5 h-5 mr-2 text-blue-500"/>상담 대화 기록</h4>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {chatHistory.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${
                            msg.role === 'user' 
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