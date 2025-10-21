'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { MusicTrack } from '@/lib/utils/music';
import { getPatientById, Patient } from '@/lib/utils/patients';
import { Play, ArrowLeft, Volume2, Loader2, User, MessageSquare } from 'lucide-react';

// --- UI 컴포넌트 분리 ---

/**
 * 환자의 프로필 정보를 표시하는 헤더 컴포넌트
 * @param patient - 표시할 환자 데이터 객체
 */
const PatientProfileHeader: React.FC<{ patient: Patient }> = ({ patient }) => (
    <section className="bg-white p-6 border rounded-xl shadow-md mb-8">
        <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border">
                {patient.avatarUrl ? (
                    <img src={patient.avatarUrl} alt={patient.name} className="w-full h-full object-cover" />
                ) : (
                    <User className="w-8 h-8 text-gray-400" />
                )}
            </div>
            <div>
                <h1 className="text-3xl font-bold text-gray-900">{patient.name}</h1>
                <p className="text-md text-gray-500">{patient.age}세</p>
            </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="text-gray-600">마지막 상담일:</div>
            <div className="font-medium text-gray-800">{patient.lastSession}</div>
            <div className="text-gray-600">총 상담 횟수:</div>
            <div className="font-medium text-indigo-600">{patient.totalSessions}회</div>
            <div className="text-gray-600">생성된 음악:</div>
            <div className="font-medium text-green-600">{patient.generatedMusic.length}곡</div>
        </div>
    </section>
);

/**
 * 단일 음악 트랙을 표시하는 리스트 아이템 컴포넌트
 * @param track - 표시할 음악 트랙 데이터
 * @param index - 리스트 내 순서
 * @param isPlaying - 현재 재생 중인지 여부
 * @param onPlay - 재생/일시정지 버튼 클릭 시 호출될 함수
 */
const MusicTrackItem: React.FC<{ track: MusicTrack; index: number; isPlaying: boolean; onPlay: (track: MusicTrack) => void; }> = ({ track, index, isPlaying, onPlay }) => (
    <li
        className={`p-4 border rounded-lg transition-all flex items-center justify-between shadow-sm ${
            isPlaying ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200' : 'bg-white hover:bg-gray-50 border-gray-200'
        }`}
    >
        <div className="flex-1 min-w-0 mr-4">
            <p className={`font-medium truncate ${isPlaying ? 'text-indigo-700' : 'text-gray-900'}`}>
                {index + 1}. {track.title}
            </p>
            <p className="text-xs text-gray-500 mt-1 truncate">
                아티스트: {track.artist} (Prompt: {track.prompt || 'N/A'})
            </p>
        </div>
        <button
            onClick={() => onPlay(track)}
            className={`flex-shrink-0 p-3 rounded-full transition-colors shadow-sm ${
                isPlaying ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-500 hover:bg-indigo-600'
            } text-white`}
            aria-label={isPlaying ? 'Pause' : 'Play'}
        >
            {isPlaying ? <Volume2 className="h-5 w-5" /> : <Play className="h-5 w-5 fill-white pl-0.5" />}
        </button>
    </li>
);


// --- 메인 페이지 컴포넌트 ---

/**
 * 특정 환자의 상세 정보 및 생성된 음악 목록을 보여주는 페이지
 */
export default function PatientDetailPage() {
    const router = useRouter();
    const params = useParams();

    // URL 경로에서 동적으로 변하는 환자 ID
    const patientId = params.patientId as string;

    // --- 상태 관리 ---
    const [patient, setPatient] = useState<Patient | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
    
    // 오디오 재생을 위한 HTMLAudioElement 참조
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // --- 데이터 로딩 및 초기화 ---
    useEffect(() => {
        // 브라우저 환경에서만 오디오 객체 생성
        if (typeof window !== "undefined" && !audioRef.current) {
            audioRef.current = new Audio();
        }

        // 중앙 '가짜 DB'에서 환자 정보를 가져옵니다.
        const foundPatient = getPatientById(patientId);
        setPatient(foundPatient);
        setLoading(false);

        // 페이지를 떠날 때 오디오 정리
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, [patientId]); // URL의 patientId가 바뀔 때마다 데이터를 다시 로드합니다.

    // --- 이벤트 핸들러 ---

    /**
     * 음악 트랙의 재생/일시정지를 처리하는 함수
     * @param track - 재생할 MusicTrack 객체
     */
    const handlePlay = (track: MusicTrack) => {
        const audio = audioRef.current;
        if (!audio) return;

        // 같은 트랙을 다시 누르면 일시정지
        if (currentTrackId === track.id) {
            audio.pause();
            setCurrentTrackId(null);
        } else {
            // 다른 트랙을 누르면 새로 재생
            audio.pause();
            audio.src = track.audioUrl;
            audio.load();
            audio.play().catch(error => {
                console.error("Audio playback failed:", error);
                alert("오디오 재생 실패. 콘솔을 확인하세요.");
            });
            setCurrentTrackId(track.id);
            // 재생이 끝나면 상태 초기화
            audio.onended = () => setCurrentTrackId(null);
        }
    };

    /**
     * AI 상담 페이지로 이동하는 함수
     */
    const navigateToCounsel = () => {
        if (patient) {
            router.push(`/counsel?patientId=${patient.id}`);
        }
    };

    // --- 렌더링 ---

    if (loading) {
        return ( <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div> );
    }

    if (!patient) {
        return (
            <div className="flex flex-col justify-center items-center h-screen text-center">
                <h1 className="text-2xl font-bold mb-4 text-red-600">환자 정보를 찾을 수 없습니다.</h1>
                <p className="text-gray-600 mb-6">ID ({patientId})에 해당하는 환자가 없습니다.</p>
                <button onClick={() => router.push('/counselor')} className="text-indigo-600 hover:underline">
                    대시보드로 돌아가기
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 bg-gray-50 min-h-screen">
            {/* 페이지 헤더 */}
            <header className="flex justify-between items-center pb-4 border-b border-gray-200 mb-6">
                <button onClick={() => router.push('/counselor')} className="text-indigo-600 hover:text-indigo-800 flex items-center transition-colors text-sm font-medium">
                    <ArrowLeft className="h-4 w-4 mr-1" /> 모든 환자 목록
                </button>
            </header>

            {/* 환자 정보 프로필 */}
            <PatientProfileHeader patient={patient} />

            {/* 생성된 음악 목록 섹션 */}
            <section>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-800">생성된 음악 플레이리스트</h2>
                    <button onClick={navigateToCounsel} className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 transition-colors shadow-sm font-medium">
                        <MessageSquare className="w-4 h-4" />
                        AI 상담으로 음악 생성
                    </button>
                </div>

                {patient.generatedMusic.length === 0 ? (
                    <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg bg-white mt-6">
                        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                           <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                        <h3 className="mt-2 text-sm font-semibold text-gray-900">생성된 음악 없음</h3>
                        <p className="mt-1 text-sm text-gray-500">아직 이 환자를 위해 생성된 음악이 없습니다.</p>
                        <div className="mt-6">
                            <button type="button" onClick={navigateToCounsel} className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
                                <MessageSquare className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
                                AI 상담 시작하기
                            </button>
                        </div>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {patient.generatedMusic.map((track, index) => (
                            <MusicTrackItem
                                key={track.id}
                                track={track}
                                index={index}
                                isPlaying={currentTrackId === track.id}
                                onPlay={handlePlay}
                            />
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
