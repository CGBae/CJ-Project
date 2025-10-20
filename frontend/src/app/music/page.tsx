'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getPlaylist, MusicTrack, clearPlaylist } from '@/lib/utils/music';
import { Play, Music, Trash2, ArrowLeft, Volume2, Loader2 } from 'lucide-react';

export default function MusicPlaylistPage() {
  const router = useRouter();
  const [playlist, setPlaylist] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTrack, setCurrentTrack] = useState<string | null>(null);
  
  // 💡 useRef를 사용하여 HTMLAudioElement 객체를 참조합니다.
  const audioRef = useRef<HTMLAudioElement | null>(null); 
  
  useEffect(() => {
    // 1. 오디오 객체 초기화
    if (typeof window !== "undefined" && !audioRef.current) {
        audioRef.current = new Audio();
    }
    
    // 2. 플레이리스트 데이터 로드
    setPlaylist(getPlaylist());
    setLoading(false);
    
    // 컴포넌트 언마운트 시 오디오 객체 정리
    return () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null; // 참조 해제
        }
    };
  }, []);

  const handlePlay = (track: MusicTrack) => {
    const audio = audioRef.current;
    if (!audio) return; // 오디오 객체가 없으면 실행 중단

    if (currentTrack === track.id) {
      // 이미 재생 중이면 정지
      audio.pause();
      setCurrentTrack(null);
    } else {
      // 다른 트랙을 재생하거나 새로 재생
      audio.pause();
      audio.src = track.audioUrl;
      audio.load();
      audio.play().catch(error => {
        console.error("Audio playback failed", error);
        alert("오디오 재생을 시작할 수 없습니다. (브라우저 정책 문제일 수 있습니다.)");
      });
      setCurrentTrack(track.id);
      
      // 재생이 끝나면 상태 초기화
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
    return (
        <div className="flex justify-center items-center h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-4 sm:p-6 bg-white shadow-2xl min-h-screen">
      <header className="flex justify-between items-center pb-4 border-b border-gray-200 mb-6">
        <button 
          onClick={() => router.push('/counsel')}
          className="text-indigo-600 hover:text-indigo-800 transition-colors flex items-center"
        >
          <ArrowLeft className="h-5 w-5 mr-1" /> 상담으로 돌아가기
        </button>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center">
          <Volume2 className="h-6 w-6 mr-2 text-indigo-600" /> 생성된 음악 플레이리스트
        </h1>
      </header>
      
      <div className="flex justify-between items-center mb-4">
        <p className="text-gray-600">총 **{playlist.length}** 곡이 저장되어 있습니다.</p>
        <button 
          onClick={handleClear} 
          disabled={playlist.length === 0}
          className="text-sm text-red-500 hover:text-red-700 transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="h-4 w-4 mr-1"/> 전체 삭제
        </button>
      </div>

      {playlist.length === 0 ? (
        <div className="text-center p-10 border-2 border-dashed border-gray-300 rounded-xl mt-10">
          <Music className="h-10 w-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">아직 생성된 음악이 없습니다. 상담 챗봇에서 음악을 생성해 보세요!</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {playlist.map((track, index) => (
            <li 
              key={track.id} 
              className={`p-4 border rounded-xl shadow-sm transition-all ${
                currentTrack === track.id ? 'bg-indigo-50 border-indigo-400' : 'bg-white hover:bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${currentTrack === track.id ? 'text-indigo-700' : 'text-gray-800'}`}>
                    **{index + 1}. {track.title}**
                  </p>
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    Prompt: {track.prompt}
                  </p>
                </div>
                <button
                  onClick={() => handlePlay(track)}
                  className={`ml-4 p-3 rounded-full transition-colors shadow-md ${
                    currentTrack === track.id ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-500 hover:bg-indigo-600'
                  } text-white`}
                  aria-label={currentTrack === track.id ? 'Pause' : 'Play'}
                >
                  {currentTrack === track.id ? (
                    <Volume2 className="h-5 w-5 animate-pulse" /> // 재생 중: 일시정지 아이콘 대신 Volume2로 재생 표시
                  ) : (
                    <Play className="h-5 w-5 fill-white" /> // 정지: 재생 아이콘
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}