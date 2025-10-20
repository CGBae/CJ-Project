// 파일 경로: /src/app/music/page.tsx

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getPlaylist, MusicTrack, clearPlaylist } from '@/lib/utils/music'; // 경로 수정 ('@/' 사용 권장)
// 💡 MessageSquare 아이콘 추가
import { Play, Music, Trash2, ArrowLeft, Volume2, Loader2, MessageSquare } from 'lucide-react';

export default function MusicPlaylistPage() {
    const router = useRouter();
    const [playlist, setPlaylist] = useState<MusicTrack[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentTrack, setCurrentTrack] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // 오디오 객체 초기화
        if (typeof window !== "undefined" && !audioRef.current) {
            audioRef.current = new Audio();
        }
        // 플레이리스트 데이터 로드
        setPlaylist(getPlaylist());
        setLoading(false);

        // 컴포넌트 언마운트 시 오디오 정리
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    // 오디오 재생 로직
    const handlePlay = (track: MusicTrack) => {
        const audio = audioRef.current;
        if (!audio) return;
        if (currentTrack === track.id) {
            audio.pause();
            setCurrentTrack(null);
        } else {
            audio.pause();
            audio.src = track.audioUrl;
            audio.load();
            audio.play().catch(error => {
                console.error("Audio playback failed", error);
                alert("오디오 재생 실패. 파일 경로를 확인하거나 브라우저 설정을 확인하세요.");
            });
            setCurrentTrack(track.id);
            audio.onended = () => setCurrentTrack(null);
        }
    };

    // 전체 삭제 로직
    const handleClear = () => {
        if (confirm('플레이리스트의 모든 음악을 삭제하시겠습니까?')) {
            if (audioRef.current) {
                audioRef.current.pause();
            }
            setCurrentTrack(null);
            setPlaylist(clearPlaylist());
        }
    };

    // 로딩 상태
    if (loading) {
        return ( <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div> );
    }

    return (
        <div className="max-w-2xl mx-auto p-4 sm:p-6 bg-gray-50 min-h-screen">
            {/* 페이지 헤더 */}
            <header className="flex justify-between items-center pb-4 border-b border-gray-200 mb-6">
                <button
                    onClick={() => router.push('/counsel')} // 상담 페이지로 돌아가기
                    className="text-indigo-600 hover:text-indigo-800 flex items-center transition-colors text-sm" // 글자 크기 조정
                >
                    <ArrowLeft className="h-4 w-4 mr-1" /> 상담으로 돌아가기
                </button>
                <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                    <Volume2 className="h-6 w-6 mr-2 text-indigo-600" /> 나의 AI 음악
                </h1>
            </header>

            {/* 플레이리스트 정보 및 버튼 영역 */}
            <div className="flex justify-between items-center mb-6 px-1">
                <p className="text-sm text-gray-600">총 {playlist.length} 곡</p>
                <div className="flex items-center gap-3">
                     {/* --- 💡 추가 음악 생성 버튼 --- */}
                    <button
                        onClick={() => router.push('/counsel')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-md text-xs hover:bg-blue-600 transition-colors shadow-sm font-medium"
                    >
                        <MessageSquare className="w-4 h-4" />
                        추가 생성하기
                    </button>
                     {/* --------------------------- */}
                    <button
                        onClick={handleClear}
                        disabled={playlist.length === 0}
                        className="text-xs text-red-500 hover:text-red-700 transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Trash2 className="h-3 w-3 mr-1"/> 전체 삭제
                    </button>
                </div>
            </div>

            {/* 음악 목록 */}
            <section>
                {playlist.length === 0 ? (
                    <div className="text-center p-10 border-2 border-dashed border-gray-300 rounded-xl mt-8 bg-white">
                        <Music className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-500">아직 생성된 음악이 없습니다.</p>
                        <p className="text-sm text-gray-400 mt-1">상담을 통해 나만의 음악을 만들어보세요!</p>
                         {/* --- 💡 추가 음악 생성 버튼 (목록 없을 때) --- */}
                        <div className="mt-6">
                            <button
                                onClick={() => router.push('/counsel')}
                                className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                            >
                                <MessageSquare className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
                                AI 상담 시작하기
                            </button>
                        </div>
                         {/* ------------------------------------- */}
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {playlist.map((track, index) => (
                            <li
                                key={track.id}
                                className={`p-4 border rounded-lg transition-all flex items-center justify-between shadow-sm ${
                                    currentTrack === track.id ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200' : 'bg-white hover:bg-gray-50 border-gray-200'
                                }`}
                            >
                                <div className="flex-1 min-w-0 mr-4">
                                    <p className={`font-medium truncate ${currentTrack === track.id ? 'text-indigo-700' : 'text-gray-900'}`}>
                                        {index + 1}. {track.title}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1 truncate">
                                        아티스트: {track.artist} (Prompt: {track.prompt || 'N/A'})
                                    </p>
                                </div>
                                <button
                                    onClick={() => handlePlay(track)}
                                    className={`flex-shrink-0 p-3 rounded-full transition-colors shadow-sm ${
                                        currentTrack === track.id ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-500 hover:bg-indigo-600'
                                    } text-white`}
                                    aria-label={currentTrack === track.id ? 'Pause' : 'Play'}
                                >
                                    {currentTrack === track.id ? <Volume2 className="h-5 w-5" /> : <Play className="h-5 w-5 fill-white pl-0.5" />}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}