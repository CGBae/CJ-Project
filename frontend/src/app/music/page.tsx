'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getPlaylist, MusicTrack, clearPlaylist } from '@/lib/utils/music';
// 1. Gamepad2 대신 Palette 아이콘을 import 합니다.
import { Play, Music, Trash2, ArrowLeft, Volume2, Loader2, Palette } from 'lucide-react';

export default function MusicPlaylistPage() {
    const router = useRouter();
    const [playlist, setPlaylist] = useState<MusicTrack[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentTrack, setCurrentTrack] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    
    useEffect(() => {
        if (typeof window !== "undefined" && !audioRef.current) {
            audioRef.current = new Audio();
        }
        setPlaylist(getPlaylist());
        setLoading(false);
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    // (handlePlay와 handleClear 함수는 변경 없음)
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
            audio.play().catch(error => console.error("Audio playback failed", error));
            setCurrentTrack(track.id);
            audio.onended = () => setCurrentTrack(null);
        }
    };
    const handleClear = () => {
        if (confirm('플레이리스트의 모든 음악을 삭제하시겠습니까?')) {
            if (audioRef.current) {
                audioRef.current.pause();
            }
            setCurrentTrack(null);
            setPlaylist(clearPlaylist());
        }
    };

    if (loading) {
        return ( <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div> );
    }

    return (
        <div className="max-w-2xl mx-auto p-4 sm:p-6 bg-gray-50 min-h-screen">
            {/* (헤더 및 '전체 삭제' 버튼 등은 그대로) */}
            <header className="flex justify-between items-center pb-4 border-b border-gray-200 mb-6">
                 <button 
                    onClick={() => router.push('/counsel')}
                    className="text-indigo-600 hover:text-indigo-800 flex items-center transition-colors text-sm"
                >
                    <ArrowLeft className="h-4 w-4 mr-1" /> 상담으로 돌아가기
                </button>
                <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                    <Volume2 className="h-6 w-6 mr-2 text-indigo-600" /> 나의 AI 음악
                </h1>
            </header>
            <div className="flex justify-between items-center mb-6 px-1">
                <p className="text-sm text-gray-600">총 {playlist.length} 곡</p>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push('/counsel')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-md text-xs hover:bg-blue-600 transition-colors shadow-sm font-medium"
                    >
                        <Music className="w-4 h-4" />
                        추가 생성하기
                    </button>
                    <button
                        onClick={handleClear}
                        disabled={playlist.length === 0}
                        className="text-xs text-red-500 hover:text-red-700 transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Trash2 className="h-3 w-3 mr-1"/> 전체 삭제
                    </button>
                </div>
            </div>
            
            <section>
                {playlist.length === 0 ? (
                    <div className="text-center p-10 border-2 border-dashed border-gray-300 rounded-xl mt-8 bg-white">
                        <Music className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-500">아직 생성된 음악이 없습니다.</p>
                        <p className="text-sm text-gray-400 mt-1">상담을 통해 나만의 음악을 만들어보세요!</p>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {playlist.map((track, index) => (
                            <li
                                key={track.id}
                                className={`p-4 border rounded-lg transition-all flex items-center justify-between shadow-sm ${
                                    currentTrack === track.id ? 'bg-indigo-50 border-indigo-300' : 'bg-white hover:bg-gray-50 border-gray-200'
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
                                <div className="flex-shrink-0 flex items-center gap-2">
                                    
                                    {/* --- 2. [핵심] "컬러테라피" 버튼으로 수정 --- */}
                                    <button
                                        onClick={() => router.push(`/game/color-therapy?songUrl=${encodeURIComponent(track.audioUrl)}`)}
                                        className="p-3 rounded-full transition-colors shadow-sm bg-teal-500 hover:bg-teal-600 text-white"
                                        aria-label="Color Therapy"
                                    >
                                        <Palette className="h-5 w-5" />
                                    </button>
                                    {/* ---------------------------------- */}
                                    
                                    <button
                                        onClick={() => handlePlay(track)}
                                        className={`p-3 rounded-full transition-colors shadow-sm ${
                                            currentTrack === track.id ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-500 hover:bg-indigo-600'
                                        } text-white`}
                                        aria-label={currentTrack === track.id ? 'Pause' : 'Play'}
                                    >
                                        {currentTrack === track.id ? <Volume2 className="h-5 w-5" /> : <Play className="h-5 w-5 fill-white pl-0.5" />}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}